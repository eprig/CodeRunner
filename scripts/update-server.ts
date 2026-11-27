#!/usr/bin/env bun
/**
 * Server self-update helper (decision 052). Runs as a one-off root container
 * with the host Docker socket, the host's repo checkout, and the data dir
 * mounted at their host paths. Adapted from the local deployment script:
 * fetch/switch the requested ref, pull or build both images, update .env,
 * recycle workspace containers, then let `docker compose up -d` recreate the
 * control container.
 *
 * Progress is written to CODERUNNER_UPDATE_JOB_FILE so the replacement
 * control plane can report the result after the container swap.
 */

import { readFile, rename, writeFile } from "node:fs/promises";
import { runDockerCli } from "../apps/control/src/containers/docker-client";

const dockerPath = Bun.env.FRC_DOCKER_PATH ?? "docker";

type UpdateState = "idle" | "starting" | "running" | "succeeded" | "failed";
type UpdateStep = {
	label: string;
	state: "pending" | "running" | "done" | "failed";
	detail: string | null;
};

type Job = {
	id: string;
	kind: "tag" | "branch" | null;
	ref: string | null;
	state: UpdateState;
	startedAt: string | null;
	finishedAt: string | null;
	message: string | null;
	steps: UpdateStep[];
	image: string | null;
};

const STEP_LABELS = [
	"Prepare checkout",
	"Build or pull images",
	"Restart services",
] as const;

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
const dbPath = required("FRC_DB_PATH");

if (kind !== "tag" && kind !== "branch") {
	throw new Error("CODERUNNER_UPDATE_KIND must be 'tag' or 'branch'");
}

let job: Job = {
	id: "unknown",
	kind,
	ref,
	state: "starting",
	startedAt: new Date().toISOString(),
	finishedAt: null,
	message: "Starting update…",
	steps: STEP_LABELS.map((label) => ({
		label,
		state: "pending",
		detail: null,
	})),
	image: controlImage,
};

async function loadJob(): Promise<void> {
	try {
		const existing = JSON.parse(
			await readFile(jobFile, "utf8"),
		) as Partial<Job>;
		job = {
			...job,
			id: typeof existing.id === "string" ? existing.id : job.id,
			startedAt:
				typeof existing.startedAt === "string"
					? existing.startedAt
					: job.startedAt,
			steps:
				Array.isArray(existing.steps) && existing.steps.length > 0
					? (existing.steps as UpdateStep[])
					: job.steps,
		};
	} catch {
		// The control plane normally writes the job first; keep our defaults.
	}
}

async function saveJob(): Promise<void> {
	const temp = `${jobFile}.${process.pid}.tmp`;
	await writeFile(temp, `${JSON.stringify(job, null, 2)}\n`, "utf8");
	await rename(temp, jobFile);
}

function step(index: number, state: UpdateStep["state"], detail?: string) {
	job.steps[index] = { ...job.steps[index]!, state, detail: detail ?? null };
	job.state = state === "failed" ? "failed" : "running";
	if (detail) job.message = detail;
}

async function run(
	command: string,
	args: string[],
	env: Record<string, string> = {},
	cwd?: string,
): Promise<string> {
	const subprocess = Bun.spawn([command, ...args], {
		...(cwd ? { cwd } : {}),
		env: { ...(Bun.env as Record<string, string>), ...env },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(subprocess.stdout).text(),
		new Response(subprocess.stderr).text(),
		subprocess.exited,
	]);
	if (exitCode !== 0) {
		const detail = stderr.trim() || stdout.trim() || `exit ${exitCode}`;
		throw new Error(
			`${command} ${args.join(" ")} failed: ${detail.slice(-2000)}`,
		);
	}
	return stdout.trim();
}

async function docker(args: string[]): Promise<void> {
	const result = await runDockerCli(dockerPath, args);
	if (result.exitCode !== 0) {
		throw new Error(
			`docker ${args.join(" ")} failed: ${(result.stderr.trim() || result.stdout.trim()).slice(-2000)}`,
		);
	}
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
	step(0, "done", `Checked out ${kind} ${ref}`);
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
	const subprocess = Bun.spawn([command, ...args], {
		cwd,
		env: env as Record<string, string>,
		stdout: "inherit",
		stderr: "inherit",
	});
	const exitCode = await subprocess.exited;
	if (exitCode !== 0) {
		throw new Error(
			`${command} ${args.join(" ")} failed with exit ${exitCode}`,
		);
	}
}

async function updateDotEnv(): Promise<void> {
	let content = "";
	try {
		content = await readFile(`${repo}/.env`, "utf8");
	} catch {
		// A fresh checkout may not have one yet.
	}
	const lines = content.split(/\r?\n/u).filter((line) => line.length > 0);
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
}

async function restartServices(): Promise<void> {
	step(2, "running", "Recreating workspaces, then docker compose up -d");
	await saveJob();
	await updateDotEnv();
	await run(
		"bun",
		["scripts/rebuild-workspaces.ts"],
		{ FRC_DB_PATH: dbPath },
		repo,
	);
	// The helper runs with the host repo (including the updated .env) mounted
	// and the Docker socket available, so Compose recreates the control
	// container exactly as an operator's `docker compose up -d` would.
	await run(dockerPath, ["compose", "up", "-d"], {}, repo);
	step(2, "done", `Running ${tag}`);
	job.state = "succeeded";
	job.finishedAt = new Date().toISOString();
	job.message = `Now running ${kind} ${ref} (${tag}).`;
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
	await saveJob();
	console.error(job.message);
	process.exit(1);
}
