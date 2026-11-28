#!/usr/bin/env bun
/**
 * Server self-update helper (decision 052). Runs as a one-off root container
 * with the host Docker socket, the host's repo checkout, and the data dir
 * mounted at their host paths. It does what an operator does by hand:
 *
 *   git fetch --tags && git checkout <ref>
 *   docker pull …:<tag>             # release: prebuilt images
 *   bun run docker:build:*          # branch: build on this server
 *   docker tag …:<tag> …:latest     # "latest" = what this server runs
 *   docker compose up -d
 *
 * then waits for the control service to report healthy and removes the images
 * it replaced. If anything fails after the checkout moved, the checkout is
 * restored; if the new control container never becomes healthy, the previous
 * images are re-tagged and Compose is run again so the previous version comes
 * back.
 *
 * Nothing version-related is written to .env. The compose files run the local
 * `:latest` images (their default tag), and the helper points `:latest` at the
 * images it just pulled or built, so a later plain `docker compose up -d`
 * redeploys exactly what is running. Legacy deployments that pin
 * CODERUNNER_TAG in .env keep that line, updated in place; Compose then runs
 * the versioned tag directly and nothing is re-tagged.
 *
 * Progress and a tail of every command's output are written to
 * CODERUNNER_UPDATE_JOB_FILE so the replacement control plane can report the
 * result after the container swap.
 */

import { readFile, rename, writeFile } from "node:fs/promises";
import {
	createBuildProgressTracker,
	stripAnsi,
} from "../apps/control/src/server-update-progress";

const dockerPath = Bun.env.FRC_DOCKER_PATH ?? "docker";

type UpdateState = "idle" | "starting" | "running" | "succeeded" | "failed";
type UpdateStep = {
	label: string;
	state: "pending" | "running" | "done" | "failed";
	detail: string | null;
};
type UpdateLogKind = "command" | "output" | "error";
type UpdateLogEntry = { at: string; kind: UpdateLogKind; text: string };
type ImageRefs = { control: string; workspace: string };

type Job = {
	id: string;
	kind: "tag" | "branch" | null;
	ref: string | null;
	commit: string | null;
	state: UpdateState;
	startedAt: string | null;
	finishedAt: string | null;
	message: string | null;
	requestedBy: string | null;
	steps: UpdateStep[];
	log: UpdateLogEntry[];
	image: string | null;
};

const STEP_LABELS = [
	"Prepare checkout",
	"Build or pull images",
	"Recreate Compose services",
] as const;

const MAX_LOG_ENTRIES = 300;
const MAX_LOG_LINE = 1000;
/** Compose's healthcheck is start_period 20s + 5 × 15s retries; leave room. */
const HEALTH_TIMEOUT_MS = 240_000;
const HEALTH_POLL_MS = 3_000;
const LEGACY_TAG_LINE = /^\s*(?:export\s+)?CODERUNNER_TAG\s*=/u;

function required(name: string): string {
	const value = Bun.env[name]?.trim();
	if (!value) throw new Error(`${name} is required`);
	return value;
}

const repo = required("CODERUNNER_UPDATE_REPO");
const ref = required("CODERUNNER_UPDATE_REF");
const kind = required("CODERUNNER_UPDATE_KIND");
const jobFile = required("CODERUNNER_UPDATE_JOB_FILE");
const tag = required("CODERUNNER_UPDATE_TAG");
const expectedCommit = Bun.env.CODERUNNER_UPDATE_COMMIT?.trim() || null;
/** Image ID the running control container was started from, if known. */
const previousControlId =
	Bun.env.CODERUNNER_UPDATE_PREVIOUS_IMAGE_ID?.trim() || null;
const controlService = Bun.env.CODERUNNER_UPDATE_SERVICE?.trim() || "control";

if (kind !== "tag" && kind !== "branch") {
	throw new Error("CODERUNNER_UPDATE_KIND must be 'tag' or 'branch'");
}

/** Where the checkout was before this update, for rollback. */
type CheckoutState = { commit: string; branch: string | null };
let previousCheckout: CheckoutState | null = null;
/** .env content before this update; null when the file did not exist. */
let previousDotEnv: string | null = null;
/** Whether .env pins CODERUNNER_TAG (legacy deployments). */
let legacyPin = false;
let checkoutMoved = false;
let dotEnvChanged = false;
/** The versioned images this update pulls or builds (`…:v2.5.0`, `…:branch-dev`). */
let targetImages: ImageRefs | null = null;
/** The names Compose runs (`…:latest`, or the legacy .env tag). */
let deployImages: ImageRefs | null = null;
/** Image IDs those names pointed at before this update, for rollback/cleanup. */
let previousIds: { control: string | null; workspace: string | null } = {
	control: null,
	workspace: null,
};
let retagged = false;

let job: Job = {
	id: "unknown",
	kind,
	ref,
	commit: expectedCommit,
	state: "starting",
	startedAt: new Date().toISOString(),
	finishedAt: null,
	message: "Starting update…",
	requestedBy: null,
	steps: STEP_LABELS.map((label) => ({
		label,
		state: "pending",
		detail: null,
	})),
	log: [],
	image: null,
};

let saveSeq = 0;
let lastFlushAt = 0;

async function loadJob(): Promise<void> {
	try {
		const existing = JSON.parse(
			await readFile(jobFile, "utf8"),
		) as Partial<Job>;
		job = {
			...job,
			id: typeof existing.id === "string" ? existing.id : job.id,
			commit:
				typeof existing.commit === "string" ? existing.commit : job.commit,
			startedAt:
				typeof existing.startedAt === "string"
					? existing.startedAt
					: job.startedAt,
			requestedBy:
				typeof existing.requestedBy === "string" ? existing.requestedBy : null,
			image: typeof existing.image === "string" ? existing.image : null,
			steps:
				Array.isArray(existing.steps) && existing.steps.length > 0
					? (existing.steps as UpdateStep[])
					: job.steps,
			log: Array.isArray(existing.log)
				? (existing.log as UpdateLogEntry[]).slice(-MAX_LOG_ENTRIES)
				: job.log,
		};
	} catch {
		// The control plane normally writes the job first; keep our defaults.
	}
}

async function saveJob(): Promise<void> {
	const temp = `${jobFile}.${process.pid}.${saveSeq++}.tmp`;
	await writeFile(temp, `${JSON.stringify(job, null, 2)}\n`, "utf8");
	await rename(temp, jobFile);
	lastFlushAt = Date.now();
}

async function flushJob(force = false): Promise<void> {
	if (!force && Date.now() - lastFlushAt < 1000) return;
	await saveJob();
}

/** Keep the job file small enough to poll every few seconds. */
async function appendLog(kind: UpdateLogKind, text: string): Promise<void> {
	const clean = stripAnsi(text)
		.split(String.fromCharCode(0))
		.join("")
		.slice(0, MAX_LOG_LINE)
		.trim();
	if (!clean) return;
	job.log.push({ at: new Date().toISOString(), kind, text: clean });
	if (job.log.length > MAX_LOG_ENTRIES) {
		job.log.splice(0, job.log.length - MAX_LOG_ENTRIES);
	}
	await flushJob();
}

function formatCommand(
	command: string,
	args: string[],
	env: Record<string, string> = {},
): string {
	const quote = (value: string) =>
		/[\s"']/u.test(value) ? JSON.stringify(value) : value;
	const prefix = Object.entries(env)
		.map(([key, value]) => `${key}=${quote(value)} `)
		.join("");
	return `$ ${prefix}${[command, ...args.map(quote)].join(" ")}`;
}

function step(index: number, state: UpdateStep["state"], detail?: string) {
	job.steps[index] = { ...job.steps[index]!, state, detail: detail ?? null };
	job.state = state === "failed" ? "failed" : "running";
	if (detail) job.message = detail;
}

async function consumeStream(
	stream: ReadableStream<Uint8Array>,
	onLine: (line: string) => Promise<void> | void,
): Promise<void> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	const handle = async (line: string) => {
		if (!line.trim()) return;
		await onLine(line);
	};
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split(/[\r\n]+/u);
		buffer = lines.pop() ?? "";
		for (const line of lines) await handle(line);
	}
	const tail = `${buffer}${decoder.decode()}`.trim();
	if (tail) await handle(tail);
	reader.releaseLock();
}

/**
 * Run a logged command. `env` is shown in the log line (only the overrides
 * that matter to a reader, such as CODERUNNER_TAG), then merged over Bun.env.
 */
async function run(
	command: string,
	args: string[],
	env: Record<string, string> = {},
	options: {
		cwd?: string;
		onLine?: (line: string) => Promise<void> | void;
	} = {},
): Promise<string> {
	await appendLog("command", formatCommand(command, args, env));
	const subprocess = Bun.spawn([command, ...args], {
		...(options.cwd ? { cwd: options.cwd } : {}),
		env: { ...(Bun.env as Record<string, string>), ...env },
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdoutLines: string[] = [];
	const stderrLines: string[] = [];
	const [, , exitCode] = await Promise.all([
		consumeStream(subprocess.stdout, async (line) => {
			stdoutLines.push(line);
			await appendLog("output", line);
			await options.onLine?.(line);
		}),
		consumeStream(subprocess.stderr, async (line) => {
			stderrLines.push(line);
			await appendLog("output", line);
			await options.onLine?.(line);
		}),
		subprocess.exited,
	]);
	const stdout = stdoutLines.join("\n").trim();
	if (exitCode !== 0) {
		const detail =
			stderrLines.join("\n").trim() || stdout || `exit ${exitCode}`;
		await appendLog(
			"error",
			`${formatCommand(command, args)} failed with exit ${exitCode}`,
		);
		await flushJob(true);
		throw new Error(
			`${command} ${args.join(" ")} failed: ${detail.slice(-2000)}`,
		);
	}
	await flushJob(true);
	return stdout;
}

/** Run without logging; for polling and probes whose output isn't news. */
async function capture(
	command: string,
	args: string[],
	env: Record<string, string> = {},
	cwd?: string,
): Promise<{ stdout: string; exitCode: number }> {
	const subprocess = Bun.spawn([command, ...args], {
		...(cwd ? { cwd } : {}),
		env: { ...(Bun.env as Record<string, string>), ...env },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, exitCode] = await Promise.all([
		new Response(subprocess.stdout).text(),
		subprocess.exited,
	]);
	return { stdout: stdout.trim(), exitCode };
}

const git = (args: string[]) =>
	run("git", ["-c", "safe.directory=*", "-C", repo, ...args]);
const gitQuiet = (args: string[]) =>
	capture("git", ["-c", "safe.directory=*", "-C", repo, ...args]);

/** `repo:tag` → `repo:<newTag>`. */
function withTag(image: string, newTag: string): string {
	const slash = image.lastIndexOf("/");
	const colon = image.lastIndexOf(":");
	return `${colon > slash ? image.slice(0, colon) : image}:${newTag}`;
}

const compose = (args: string[]) =>
	run(dockerPath, ["compose", ...args], {}, { cwd: repo });

async function imageId(image: string): Promise<string | null> {
	const result = await capture(dockerPath, [
		"image",
		"inspect",
		"--format",
		"{{.Id}}",
		image,
	]);
	return result.exitCode === 0 && result.stdout ? result.stdout : null;
}

async function prepareCheckout(): Promise<void> {
	step(0, "running", "Fetching refs from origin");
	await saveJob();
	const inside = await gitQuiet(["rev-parse", "--is-inside-work-tree"]);
	if (inside.exitCode !== 0 || inside.stdout !== "true") {
		throw new Error(
			`${repo} is not a git checkout, so it can't be switched to ${ref}. Clone the CodeRunner repository there, or update with your deployment's own tooling.`,
		);
	}
	const head = await gitQuiet(["rev-parse", "HEAD"]);
	const branch = await gitQuiet(["symbolic-ref", "-q", "--short", "HEAD"]);
	if (head.exitCode === 0 && head.stdout) {
		previousCheckout = {
			commit: head.stdout,
			branch: branch.exitCode === 0 && branch.stdout ? branch.stdout : null,
		};
	}
	await git(["fetch", "--prune", "--tags", "--force", "origin"]);
	checkoutMoved = true;
	if (kind === "branch") {
		// `-B` covers both a locally tracked branch and a branch that only exists
		// on the remote; --force discards local edits, matching the documented
		// "switching ref intentionally discards the checkout" behavior.
		await git(["checkout", "--force", "-B", ref, `origin/${ref}`]);
		// The control image build compiles vendor/AdvantageScope at the pin this
		// branch records; a stale submodule checkout would build the wrong one.
		await git(["submodule", "update", "--init", "--recursive", "--force"]);
	} else {
		// Keep the checkout's compose files in step with the release deployed.
		await git(["checkout", "--force", "--detach", `refs/tags/${ref}^{commit}`]);
	}
	const commit = await git(["rev-parse", "HEAD"]);
	if (!/^[0-9a-f]{7,64}$/iu.test(commit)) {
		throw new Error(`Could not resolve ${kind} ${ref} to a commit hash`);
	}
	job.commit = commit;
	if (expectedCommit && expectedCommit !== commit) {
		await appendLog(
			"error",
			`${kind} ${ref} resolved to ${commit}, but GitHub reported ${expectedCommit}`,
		);
	}
	await appendLog("output", `Updating to commit ${commit}`);
	step(
		0,
		"done",
		`${kind === "tag" ? "Checked out release" : "Checked out branch"} ${ref} at ${commit.slice(0, 12)}`,
	);
	await saveJob();
}

/** The control image and CODE_IMAGE the checked-out stack runs. */
async function composeImages(env: Record<string, string>): Promise<ImageRefs> {
	const config = await capture(
		dockerPath,
		["compose", "config", "--format", "json"],
		env,
		repo,
	);
	if (config.exitCode !== 0) {
		throw new Error(
			"docker compose config failed for the checked-out compose files.",
		);
	}
	const parsed = JSON.parse(config.stdout) as {
		services?: Record<
			string,
			{ image?: string; environment?: Record<string, string | null> }
		>;
	};
	const service = parsed.services?.[controlService];
	const control = service?.image;
	const workspace =
		service?.environment?.CODE_IMAGE ??
		Object.values(parsed.services ?? {}).find((entry) =>
			entry.image?.includes("coderunner-workspace"),
		)?.image;
	if (!control || !workspace) {
		throw new Error(
			`The checked-out compose files have no ${controlService} service image and CODE_IMAGE.`,
		);
	}
	return { control, workspace };
}

async function updateImages(): Promise<void> {
	step(
		1,
		"running",
		kind === "tag"
			? `Pulling prebuilt images for ${ref}`
			: `Building images from ${ref}`,
	);
	await saveJob();
	// What Compose runs now (normally `…:latest`), and the versioned names for
	// this update in the same repositories.
	deployImages = await composeImages({});
	targetImages = {
		control: withTag(deployImages.control, tag),
		workspace: withTag(deployImages.workspace, tag),
	};
	job.image = targetImages.control;
	previousIds = {
		control: previousControlId ?? (await imageId(deployImages.control)),
		workspace: await imageId(deployImages.workspace),
	};
	if (kind === "tag") {
		try {
			await run(dockerPath, ["pull", targetImages.control]);
			await run(dockerPath, ["pull", targetImages.workspace]);
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			throw new Error(
				`Couldn't download the prebuilt images for ${ref}; the release may not be published yet, or the registry is unreachable. (${detail.split(": ").slice(1).join(": ").trim() || detail})`,
			);
		}
	} else {
		// BuildKit shares the daemon's build cache with every earlier build on
		// this host, so an unchanged AdvantageScope stage is reused instead of
		// recompiled. The legacy builder can't build this Dockerfile at all
		// (it leaves TARGETARCH empty), so refuse up front rather than fail late.
		const buildx = await capture(dockerPath, ["buildx", "version"]);
		if (buildx.exitCode !== 0) {
			throw new Error(
				"This control image has no Docker buildx plugin, which branch builds need. Update to a release first (or build once by hand), then build the branch.",
			);
		}
		Bun.env.DOCKER_BUILDKIT = "1";
		Bun.env.BUILDKIT_PROGRESS = "plain";
		const slash = targetImages.control.lastIndexOf("/");
		const env: Record<string, string> = {
			CODERUNNER_TAG: tag,
			CODERUNNER_IMAGE_NS: targetImages.control.slice(0, slash),
			CODE_IMAGE: targetImages.workspace,
		};
		await runBuild(["run", "docker:build:control"], env);
		await runBuild(["run", "docker:build:workspace"], env);
	}
	step(1, "done", `Images ready at ${tag}`);
	await saveJob();
}

async function runBuild(
	args: string[],
	env: Record<string, string>,
): Promise<void> {
	const track = createBuildProgressTracker();
	await run("bun", args, env, {
		cwd: repo,
		onLine: async (line) => {
			const progress = track(line);
			if (progress) {
				step(1, "running", progress);
				await saveJob();
			}
		},
	});
}

/**
 * Point the names Compose runs at the new images. Normally that moves
 * `:latest`; a legacy .env pin instead gets its CODERUNNER_TAG line rewritten,
 * so Compose runs the versioned tag directly.
 */
async function activateImages(): Promise<void> {
	if (!targetImages || !deployImages) return;
	if (legacyPin && previousDotEnv !== null) {
		const next = previousDotEnv
			.split(/\r?\n/u)
			.map((line) =>
				LEGACY_TAG_LINE.test(line) ? `CODERUNNER_TAG=${tag}` : line,
			)
			.join("\n");
		if (next !== previousDotEnv) {
			await writeFile(`${repo}/.env`, next, "utf8");
			dotEnvChanged = true;
			await appendLog("command", `$ .env (legacy pin) → CODERUNNER_TAG=${tag}`);
		}
		deployImages = await composeImages({});
		return;
	}
	for (const key of ["control", "workspace"] as const) {
		if (targetImages[key] !== deployImages[key]) {
			await run(dockerPath, ["tag", targetImages[key], deployImages[key]]);
		}
	}
	retagged = true;
}

async function readDotEnv(): Promise<void> {
	try {
		previousDotEnv = await readFile(`${repo}/.env`, "utf8");
	} catch {
		previousDotEnv = null;
	}
	legacyPin = Boolean(
		previousDotEnv?.split(/\r?\n/u).some((line) => LEGACY_TAG_LINE.test(line)),
	);
	if (legacyPin) {
		await appendLog(
			"output",
			"Legacy mode: .env pins CODERUNNER_TAG, so that line will be updated in place.",
		);
	}
}

/**
 * Remove the tags of the images this update replaced (e.g. `…:v2.4.0`), then
 * dangling layers. Tags the new deployment uses, and images still in use, stay.
 */
async function pruneImages(): Promise<void> {
	// Never remove a repository's `:latest`; only replaced versioned tags go.
	const keep = new Set([
		targetImages?.control,
		targetImages?.workspace,
		deployImages?.control,
		deployImages?.workspace,
		deployImages ? withTag(deployImages.control, "latest") : undefined,
		deployImages ? withTag(deployImages.workspace, "latest") : undefined,
	]);
	const current = new Set([
		deployImages ? await imageId(deployImages.control) : null,
		deployImages ? await imageId(deployImages.workspace) : null,
	]);
	for (const id of [previousIds.control, previousIds.workspace]) {
		if (!id || current.has(id)) continue;
		const tags = await capture(dockerPath, [
			"image",
			"inspect",
			"--format",
			"{{range .RepoTags}}{{.}}\n{{end}}",
			id,
		]);
		for (const name of tags.stdout.split("\n").map((entry) => entry.trim())) {
			if (!name || keep.has(name)) continue;
			try {
				await run(dockerPath, ["image", "rm", name]);
			} catch {
				await appendLog("output", `${name} is still in use; left in place.`);
				await flushJob(true);
			}
		}
	}
	await run(dockerPath, ["image", "prune", "-f"]);
}

/**
 * Wait for the recreated control container to pass its Compose healthcheck
 * (or, if a custom stack dropped the healthcheck, simply to be running).
 */
async function waitForHealthyControl(): Promise<void> {
	const deadline = Date.now() + HEALTH_TIMEOUT_MS;
	let last = "unknown";
	while (Date.now() < deadline) {
		const ps = await capture(
			dockerPath,
			["compose", "ps", "-q", controlService],
			{},
			repo,
		);
		const id = ps.stdout.split("\n")[0]?.trim();
		if (id) {
			const state = await capture(dockerPath, [
				"inspect",
				"--format",
				"{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}",
				id,
			]);
			const [status = "unknown", health = "none"] = state.stdout.split(" ");
			last = health === "none" ? status : `${status}/${health}`;
			if (status === "running" && (health === "healthy" || health === "none")) {
				await appendLog("output", `${controlService} is ${last}`);
				return;
			}
			if (health === "unhealthy" || status === "exited" || status === "dead") {
				break;
			}
		}
		step(
			2,
			"running",
			`Waiting for ${controlService} to become healthy (${last})`,
		);
		await flushJob();
		await Bun.sleep(HEALTH_POLL_MS);
	}
	throw new Error(
		`The new ${controlService} container did not become healthy (last state: ${last}).`,
	);
}

/** Put the checkout, .env, and the names Compose runs back as they were. */
async function restorePrevious(): Promise<void> {
	if (dotEnvChanged && previousDotEnv !== null) {
		await writeFile(`${repo}/.env`, previousDotEnv, "utf8");
		dotEnvChanged = false;
	}
	if (retagged && deployImages) {
		for (const key of ["control", "workspace"] as const) {
			const id = previousIds[key];
			if (id) await run(dockerPath, ["tag", id, deployImages[key]]);
		}
		retagged = false;
	}
	if (checkoutMoved && previousCheckout) {
		await git(
			previousCheckout.branch
				? [
						"checkout",
						"--force",
						"-B",
						previousCheckout.branch,
						previousCheckout.commit,
					]
				: ["checkout", "--force", "--detach", previousCheckout.commit],
		);
		checkoutMoved = false;
	}
}

/** Bring the previous version back after a failed start. */
async function rollback(reason: string): Promise<string> {
	await appendLog("error", reason);
	await appendLog("output", "Rolling back to the previous version");
	if (!previousIds.control && !legacyPin) {
		throw new Error("the previous control image is unknown");
	}
	await restorePrevious();
	await compose(["up", "-d"]);
	await waitForHealthyControl();
	return `${reason} Rolled back to the previous version.`;
}

async function restartServices(): Promise<void> {
	step(2, "running", "Recreating Compose services");
	await saveJob();
	// The same `docker compose up -d` an operator runs. Student workspace
	// containers are managed by the control plane and roll lazily (046).
	try {
		await activateImages();
		await compose(["up", "-d"]);
		await waitForHealthyControl();
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		let message: string;
		try {
			message = await rollback(reason);
		} catch (rollbackError) {
			message = `${reason} Rollback also failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}. Restore the server by hand (git checkout, then docker compose up -d).`;
		}
		throw new Error(message);
	}
	// Remove replaced images only after the new stack is healthy, so a
	// rollback still has them.
	await pruneImages();
	step(2, "done", `Running ${tag}`);
	job.state = "succeeded";
	job.finishedAt = new Date().toISOString();
	job.message = `Now running ${kind === "tag" ? "release" : "branch"} ${ref} at ${job.commit?.slice(0, 12) ?? "unknown commit"}.`;
	await appendLog("output", job.message);
	await saveJob();
}

await loadJob();
let composeStarted = false;
try {
	await readDotEnv();
	await prepareCheckout();
	await updateImages();
	composeStarted = true;
	await restartServices();
} catch (error) {
	let message = error instanceof Error ? error.message : String(error);
	// Failed before anything running was touched: only the checkout moved.
	if (!composeStarted) {
		try {
			await restorePrevious();
			message = `${message} The server was not changed.`;
		} catch (restoreError) {
			message = `${message} Restoring the checkout also failed: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}.`;
		}
	}
	job.state = "failed";
	job.finishedAt = new Date().toISOString();
	job.message = message;
	const runningIndex = job.steps.findIndex((s) => s.state === "running");
	if (runningIndex >= 0) step(runningIndex, "failed", job.message);
	job.state = "failed";
	await appendLog("error", job.message);
	await saveJob();
	console.error(job.message);
	process.exit(1);
}
