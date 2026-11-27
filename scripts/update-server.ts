#!/usr/bin/env bun
/**
 * Server self-update helper (decision 052). Runs as a one-off root container
 * with the host Docker socket, the host's repo checkout, and the data dir
 * mounted at their host paths. Adapted from the local deployment script:
 * fetch/switch the requested ref, pull or build both images, update .env,
 * recreate the Compose services, then prune the images they replaced.
 *
 * Progress and a tail of every command's output are written to
 * CODERUNNER_UPDATE_JOB_FILE so the replacement control plane can report the
 * result after the container swap.
 */

import { readFile, rename, writeFile } from "node:fs/promises";
import {
	parseBuildProgressLine,
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

function required(name: string): string {
	const value = Bun.env[name]?.trim();
	if (!value) throw new Error(`${name} is required`);
	return value;
}

const repo = required("CODERUNNER_UPDATE_REPO");
const ref = required("CODERUNNER_UPDATE_REF");
const kind = required("CODERUNNER_UPDATE_KIND");
const jobFile = required("CODERUNNER_UPDATE_JOB_FILE");
const controlImage = required("CODERUNNER_UPDATE_IMAGE");
const workspaceImage = required("CODERUNNER_UPDATE_WORKSPACE_IMAGE");
const tag = required("CODERUNNER_UPDATE_TAG");
const imageNamespace = required("CODERUNNER_IMAGE_NS");
const expectedCommit = Bun.env.CODERUNNER_UPDATE_COMMIT?.trim() || null;

if (kind !== "tag" && kind !== "branch") {
	throw new Error("CODERUNNER_UPDATE_KIND must be 'tag' or 'branch'");
}

let job: Job = {
	id: "unknown",
	kind,
	ref,
	commit: expectedCommit,
	state: "starting",
	startedAt: new Date().toISOString(),
	finishedAt: null,
	message: "Starting update…",
	steps: STEP_LABELS.map((label) => ({
		label,
		state: "pending",
		detail: null,
	})),
	log: [],
	image: controlImage,
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

function formatCommand(command: string, args: string[]): string {
	const quote = (value: string) =>
		/[\s"']/u.test(value) ? JSON.stringify(value) : value;
	return `$ ${[command, ...args.map(quote)].join(" ")}`;
}

function step(index: number, state: UpdateStep["state"], detail?: string) {
	job.steps[index] = { ...job.steps[index]!, state, detail: detail ?? null };
	job.state = state === "failed" ? "failed" : "running";
	if (detail) job.message = detail;
}

async function publishBuildProgress(line: string): Promise<void> {
	step(1, "running", line);
	await saveJob();
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

async function run(
	command: string,
	args: string[],
	env: Record<string, string> = {},
	cwd?: string,
	options: { onLine?: (line: string) => Promise<void> | void } = {},
): Promise<string> {
	await appendLog("command", formatCommand(command, args));
	const subprocess = Bun.spawn([command, ...args], {
		...(cwd ? { cwd } : {}),
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

async function docker(args: string[]): Promise<void> {
	await run(dockerPath, args);
}

async function resolveCommit(): Promise<string> {
	const rev = kind === "tag" ? `refs/tags/${ref}^{commit}` : "HEAD";
	const commit = await run("git", [
		"-c",
		"safe.directory=*",
		"-C",
		repo,
		"rev-parse",
		rev,
	]);
	if (!/^[0-9a-f]{7,64}$/iu.test(commit)) {
		throw new Error(`Could not resolve ${kind} ${ref} to a commit hash`);
	}
	return commit;
}

async function prepareCheckout(): Promise<void> {
	step(0, "running", "Fetching refs from origin");
	await saveJob();
	await run("git", [
		"-c",
		"safe.directory=*",
		"-C",
		repo,
		"fetch",
		"--prune",
		"--tags",
		"origin",
	]);
	if (kind === "branch") {
		// `-B` covers both a locally tracked branch and a branch that only exists
		// on the remote; --force discards local edits, matching the documented
		// "switching ref intentionally discards the checkout" behavior.
		await run("git", [
			"-c",
			"safe.directory=*",
			"-C",
			repo,
			"checkout",
			"--force",
			"-B",
			ref,
			`origin/${ref}`,
		]);
	}
	const commit = await resolveCommit();
	job.commit = commit;
	if (expectedCommit && expectedCommit !== commit) {
		await appendLog(
			"error",
			`${kind} ${ref} resolved to ${commit}, but GitHub reported ${expectedCommit}`,
		);
	}
	await appendLog("output", `Updating to commit ${commit}`);
	const short = commit.slice(0, 12);
	step(
		0,
		"done",
		`${kind === "tag" ? "Resolved tag" : "Checked out branch"} ${ref} at ${short}`,
	);
	await saveJob();
}

async function updateImages(): Promise<void> {
	step(
		1,
		"running",
		kind === "tag"
			? `Pulling images for ${ref}`
			: `Building images from ${ref}`,
	);
	await saveJob();
	if (kind === "tag") {
		await docker(["pull", controlImage]);
		await docker(["pull", workspaceImage]);
	} else {
		const env: Record<string, string> = {
			...(Bun.env as Record<string, string>),
			CODERUNNER_TAG: tag,
			CODERUNNER_IMAGE_NS: imageNamespace,
		};
		delete env.CODE_IMAGE;
		await runBuild("bun", ["run", "docker:build:control"], env, repo);
		await runBuild("bun", ["run", "docker:build:workspace"], env, repo);
	}
	step(1, "done", `Images ready at ${tag}`);
	await saveJob();
}

async function runBuild(
	command: string,
	args: string[],
	env: Record<string, string>,
	cwd: string,
): Promise<void> {
	await run(command, args, env, cwd, {
		onLine: async (line) => {
			const progress = parseBuildProgressLine(line);
			if (progress) await publishBuildProgress(progress);
		},
	});
}

/** Rewrite the sticky deployment env, returning the image tags it replaced. */
async function updateDotEnv(): Promise<{ old: ImageRefs | null }> {
	let content = "";
	try {
		content = await readFile(`${repo}/.env`, "utf8");
	} catch {
		// A fresh checkout may not have one yet.
	}
	const lines = content.split(/\r?\n/u).filter((line) => line.length > 0);
	const envValue = (key: string): string | null => {
		const line = lines.find((entry) => entry.startsWith(`${key}=`));
		return line ? line.slice(key.length + 1) : null;
	};
	const oldTag = envValue("CODERUNNER_TAG");
	const oldNamespace = envValue("CODERUNNER_IMAGE_NS");
	const old =
		oldTag && oldNamespace
			? {
					control: `${oldNamespace}/coderunner-control:${oldTag}`,
					workspace: `${oldNamespace}/coderunner-workspace:${oldTag}`,
				}
			: null;
	for (const [key, value] of [
		["CODERUNNER_TAG", tag],
		["CODERUNNER_IMAGE_NS", imageNamespace],
		["CODERUNNER_UPDATE_REPO_DIR", repo],
	] as const) {
		const index = lines.findIndex((line) => line.startsWith(`${key}=`));
		const replacement = `${key}=${value}`;
		if (index >= 0) lines[index] = replacement;
		else lines.push(replacement);
	}
	await writeFile(`${repo}/.env`, `${lines.join("\n")}\n`, "utf8");
	await appendLog(
		"command",
		`$ .env → CODERUNNER_TAG=${tag} CODERUNNER_IMAGE_NS=${imageNamespace}`,
	);
	return { old };
}

/** Remove only the two images this deployment replaced, then clean dangling layers. */
async function pruneImages(old: ImageRefs | null): Promise<void> {
	const stale = [...new Set([old?.control, old?.workspace])].filter(
		(image): image is string =>
			Boolean(image) && image !== controlImage && image !== workspaceImage,
	);
	for (const image of stale) {
		try {
			await docker(["image", "rm", image]);
		} catch {
			await appendLog(
				"output",
				`${image} is still in use or no longer exists; left in place.`,
			);
			await flushJob(true);
		}
	}
	await docker(["image", "prune", "-f"]);
}

async function restartServices(): Promise<void> {
	step(2, "running", "Recreating Compose services");
	await saveJob();
	const { old } = await updateDotEnv();
	// The helper runs with the host repo (including the updated .env) mounted
	// and the Docker socket available, so Compose recreates the control
	// container exactly as an operator's `docker compose up -d` would. Student
	// workspace containers are managed by the control plane and roll lazily.
	await run(dockerPath, ["compose", "up", "-d"], {}, repo);
	await pruneImages(old);
	step(2, "done", `Running ${tag}`);
	job.state = "succeeded";
	job.finishedAt = new Date().toISOString();
	job.message = `Now running ${kind} ${ref} at ${job.commit?.slice(0, 12) ?? "unknown commit"} (${tag}).`;
	await appendLog("output", job.message);
	await saveJob();
}

await loadJob();
try {
	await prepareCheckout();
	await updateImages();
	await restartServices();
} catch (error) {
	job.state = "failed";
	job.finishedAt = new Date().toISOString();
	job.message = error instanceof Error ? error.message : String(error);
	const runningIndex = job.steps.findIndex((s) => s.state === "running");
	if (runningIndex >= 0) step(runningIndex, "failed", job.message);
	await appendLog("error", job.message);
	await saveJob();
	console.error(job.message);
	process.exit(1);
}
