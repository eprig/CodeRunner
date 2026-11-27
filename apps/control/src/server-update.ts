import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
	ServerUpdateAccepted,
	ServerUpdateJobState,
	ServerUpdateKind,
	ServerUpdateRequest,
	ServerUpdateStatusResponse,
	ServerUpdateStep,
} from "@frc-coderunner/contracts";
import { serverUpdateRequestSchema } from "@frc-coderunner/contracts";
import type { ControlConfig } from "./config";
import { inspectContainer, runDocker } from "./containers/docker-client";
import type { DockerRunner } from "./containers/types";
import { getLogger } from "./logging";

const log = getLogger("updates");

/** Job state lives in the bind-mounted data dir so the *new* control container
 * can report the outcome of an update that swapped its predecessor. */
export const UPDATE_JOB_FILE = "server-update.json";
const REFS_CACHE_MS = 60_000;
const MAX_REFS = 200;

export type ServerUpdateDeps = {
	config: ControlConfig;
	dockerRunner: DockerRunner;
	selfContainerId: string;
	fetch?: ((url: string, init?: RequestInit) => Promise<Response>) | undefined;
	now?: (() => Date) | undefined;
};

type JobFile = {
	id: string | null;
	kind: ServerUpdateKind | null;
	ref: string | null;
	state: ServerUpdateJobState;
	startedAt: string | null;
	finishedAt: string | null;
	message: string | null;
	steps: ServerUpdateStep[];
	image: string | null;
};

type ImageInfo = {
	image: string | null;
	url: string | null;
	commit: string | null;
	version: string | null;
	labels: Record<string, string>;
	/** Local git/.env metadata is for display only; only container metadata can drive an update. */
	fromLocalCheckout: boolean;
};

type RefsResult = { tags: string[]; branches: string[]; error: string | null };

type RefsCache = { at: number; result: RefsResult };
let refsCache: RefsCache | null = null;

const STEPS: Array<{ label: string; detail: string }> = [
	{ label: "Prepare checkout", detail: "Fetch the selected ref on the host" },
	{
		label: "Build or pull images",
		detail: "Control plane and workspace images",
	},
	{
		label: "Restart services",
		detail: "Recreate workspaces, then docker compose up -d",
	},
];

const EMPTY_JOB: JobFile = {
	id: null,
	kind: null,
	ref: null,
	state: "idle",
	startedAt: null,
	finishedAt: null,
	message: null,
	steps: [],
	image: null,
};

/** Demo mode is auth-bypassed and has no real deployment to inspect. Show a
 * populated page for exploration, but never let it start a helper container. */
const DEMO_STATUS: ServerUpdateStatusResponse = {
	ok: true,
	demo: true,
	repo: {
		url: "https://github.com/eprig/CodeRunner",
		slug: "eprig/CodeRunner",
		commit: "demo0000000000000000000000000000000000000",
		version: "demo",
		image: "ghcr.io/eprig/coderunner-control:demo",
		imageNamespace: "ghcr.io/eprig",
		mode: "prebuilt",
		source: "local",
		hostDir: "/demo/coderunner",
		updatable: false,
	},
	refs: {
		tags: ["v2.5.0", "v2.4.0", "v2.3.0"],
		branches: ["main", "dev"],
		error: null,
	},
	job: {
		id: null,
		state: "idle",
		kind: null,
		ref: null,
		startedAt: null,
		finishedAt: null,
		message: null,
		steps: initialSteps(),
	},
	restartExpected: false,
};

function jobPath(config: ControlConfig): string {
	return resolve(config.dataDir, UPDATE_JOB_FILE);
}

export function hostJobPath(config: ControlConfig): string {
	return resolve(config.hostDataDir ?? config.dataDir, UPDATE_JOB_FILE);
}

async function readJob(config: ControlConfig): Promise<JobFile> {
	try {
		const parsed = JSON.parse(
			await readFile(jobPath(config), "utf8"),
		) as Partial<JobFile>;
		return {
			id: typeof parsed.id === "string" ? parsed.id : null,
			kind:
				parsed.kind === "tag" || parsed.kind === "branch" ? parsed.kind : null,
			ref: typeof parsed.ref === "string" ? parsed.ref : null,
			state:
				parsed.state === "starting" ||
				parsed.state === "running" ||
				parsed.state === "succeeded" ||
				parsed.state === "failed"
					? parsed.state
					: "idle",
			startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : null,
			finishedAt:
				typeof parsed.finishedAt === "string" ? parsed.finishedAt : null,
			message: typeof parsed.message === "string" ? parsed.message : null,
			steps: Array.isArray(parsed.steps) ? normalizeSteps(parsed.steps) : [],
			image: typeof parsed.image === "string" ? parsed.image : null,
		};
	} catch {
		return { ...EMPTY_JOB };
	}
}

function normalizeSteps(steps: unknown[]): ServerUpdateStep[] {
	return steps.flatMap((step) => {
		if (!step || typeof step !== "object") return [];
		const candidate = step as Partial<ServerUpdateStep>;
		if (typeof candidate.label !== "string") return [];
		const state =
			candidate.state === "pending" ||
			candidate.state === "running" ||
			candidate.state === "done" ||
			candidate.state === "failed"
				? candidate.state
				: "pending";
		return [
			{
				label: candidate.label,
				state,
				detail: typeof candidate.detail === "string" ? candidate.detail : null,
			},
		];
	});
}

export async function writeJob(
	config: ControlConfig,
	job: JobFile,
): Promise<void> {
	const dest = jobPath(config);
	const temp = `${dest}.${randomUUID().slice(0, 8)}.tmp`;
	await writeFile(temp, `${JSON.stringify(job, null, 2)}\n`, "utf8");
	await rename(temp, dest);
}

async function readImageInfo(deps: ServerUpdateDeps): Promise<ImageInfo> {
	const container = await inspectContainer(
		deps.dockerRunner,
		deps.selfContainerId,
	);
	if (container) {
		const labels = container.Config?.Labels ?? {};
		return {
			image: container.Config?.Image ?? null,
			url: labels["org.opencontainers.image.source"] ?? null,
			commit: labels["org.opencontainers.image.revision"] ?? null,
			version: labels["org.opencontainers.image.version"] ?? null,
			labels,
			fromLocalCheckout: false,
		};
	}
	// From-source dev has no container to inspect. Everything the page needs is
	// already in the checkout: git origin/HEAD and the same .env Bun loaded.
	if (deps.config.updateMetadataSource === "local" && deps.config.hostRepoDir) {
		return readLocalImageInfo(deps.config.hostRepoDir);
	}
	return {
		image: null,
		url: null,
		commit: null,
		version: null,
		labels: {},
		fromLocalCheckout: false,
	};
}

async function gitOutput(repo: string, args: string[]): Promise<string | null> {
	try {
		const subprocess = Bun.spawn(["git", "-C", repo, ...args], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, exitCode] = await Promise.all([
			new Response(subprocess.stdout).text(),
			subprocess.exited,
		]);
		return exitCode === 0 ? stdout.trim() : null;
	} catch {
		return null;
	}
}

/** Show HTTPS URLs even when the checkout uses an SSH remote. */
export function normalizeRepoUrl(remote: string | null): string | null {
	if (!remote) return null;
	const scp = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/u.exec(remote.trim());
	if (scp) return `https://github.com/${scp[1]}/${scp[2]}`;
	return remote.trim().replace(/\.git\/?$/u, "");
}

async function readLocalImageInfo(repo: string): Promise<ImageInfo> {
	const remote = normalizeRepoUrl(
		await gitOutput(repo, ["remote", "get-url", "origin"]),
	);
	const commit = await gitOutput(repo, ["rev-parse", "HEAD"]);
	const branch = await gitOutput(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
	const tag =
		Bun.env.CODERUNNER_TAG?.trim() ||
		(await gitOutput(repo, ["describe", "--tags", "--exact-match"])) ||
		(branch && branch !== "HEAD" ? `branch-${slugifyRef(branch)}` : "latest");
	const slug = githubSlug(remote);
	const ns =
		Bun.env.CODERUNNER_IMAGE_NS?.trim() ||
		(slug ? `ghcr.io/${slug.split("/")[0]?.toLowerCase()}` : null);
	return {
		image: ns ? `${ns}/coderunner-control:${tag}` : null,
		url: remote,
		commit,
		version: tag,
		labels: {},
		fromLocalCheckout: true,
	};
}

/** `ghcr.io/owner/coderunner-control:tag` → `ghcr.io/owner`. */
export function imageNamespace(image: string | null): string | null {
	if (!image) return null;
	const lastSlash = image.lastIndexOf("/");
	const colon = image.lastIndexOf(":");
	if (lastSlash < 0) return null; // unqualified local image (e.g. `coderunner:dev`)
	const tagStart = colon > lastSlash ? colon : image.length;
	const repoPath = image.slice(0, tagStart);
	const repoSlash = repoPath.lastIndexOf("/");
	if (repoSlash < 0) return null;
	return repoPath.slice(0, repoSlash);
}

export function githubSlug(url: string | null): string | null {
	if (!url) return null;
	const trimmed = url.trim();
	const httpsMatch =
		/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/u.exec(trimmed);
	if (httpsMatch) return `${httpsMatch[1]}/${httpsMatch[2]}`;
	const sshMatch = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/u.exec(trimmed);
	if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;
	return null;
}

export async function listRemoteRefs(
	url: string | null,
	fetchImpl: (input: string, init?: RequestInit) => Promise<Response>,
): Promise<RefsResult> {
	const slug = githubSlug(url);
	if (!slug) {
		return {
			tags: [],
			branches: [],
			error: url
				? "Available refs are listed for GitHub repository URLs only."
				: null,
		};
	}

	const now = Date.now();
	if (refsCache && now - refsCache.at < REFS_CACHE_MS) return refsCache.result;

	const token = Bun.env.GITHUB_TOKEN?.trim() || Bun.env.GH_TOKEN?.trim() || "";
	const headers: Record<string, string> = {
		accept: "application/vnd.github+json",
		"x-github-api-version": "2022-11-28",
		"user-agent": "coderunner-admin-updater",
	};
	if (token) headers.authorization = `Bearer ${token}`;

	try {
		const [tagsResponse, branchesResponse] = await Promise.all([
			fetchImpl(`https://api.github.com/repos/${slug}/tags?per_page=100`, {
				headers,
			}),
			fetchImpl(`https://api.github.com/repos/${slug}/branches?per_page=100`, {
				headers,
			}),
		]);
		if (!tagsResponse.ok || !branchesResponse.ok) {
			throw new Error(
				`GitHub returned ${tagsResponse.status}/${branchesResponse.status}`,
			);
		}
		const tags = (await tagsResponse.json()) as Array<{ name?: string }>;
		const branches = (await branchesResponse.json()) as Array<{
			name?: string;
		}>;
		const result: RefsResult = {
			tags: tags
				.map((tag) => tag.name ?? "")
				.filter(Boolean)
				.slice(0, MAX_REFS),
			branches: branches
				.map((branch) => branch.name ?? "")
				.filter(Boolean)
				.slice(0, MAX_REFS),
			error: null,
		};
		refsCache = { at: now, result };
		return result;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			tags: [],
			branches: [],
			error: `Couldn't list refs from GitHub: ${message}`,
		};
	}
}

/** Test hook: avoids a 60s wait between remote-ref changes in tests. */
export function clearRefsCache(): void {
	refsCache = null;
}

export async function getServerUpdateStatus(
	deps: ServerUpdateDeps,
): Promise<ServerUpdateStatusResponse> {
	if (deps.config.demo) return structuredClone(DEMO_STATUS);
	const fetchImpl = deps.fetch ?? globalThis.fetch;
	const [image, job] = await Promise.all([
		readImageInfo(deps),
		readJob(deps.config),
	]);
	const refs = await listRemoteRefs(image.url, fetchImpl);
	const ns = imageNamespace(image.image);
	const version = image.version;
	const mode =
		version && /^v\d+\.\d+\.\d+/u.test(version)
			? "prebuilt"
			: version?.startsWith("branch-")
				? "source"
				: "unknown";

	return {
		ok: true,
		demo: false,
		repo: {
			url: image.url,
			slug: githubSlug(image.url),
			commit: image.commit,
			version,
			image: image.image,
			imageNamespace: ns,
			mode,
			source: image.fromLocalCheckout ? "local" : "container",
			hostDir: deps.config.hostRepoDir,
			updatable: Boolean(
				deps.config.hostRepoDir && image.image && !image.fromLocalCheckout,
			),
		},
		refs,
		job: {
			id: job.id,
			state: job.state,
			kind: job.kind,
			ref: job.ref,
			startedAt: job.startedAt,
			finishedAt: job.finishedAt,
			message: job.message,
			steps: job.steps.length > 0 ? job.steps : initialSteps(),
		},
		restartExpected: job.state === "starting" || job.state === "running",
	};
}

function initialSteps(): ServerUpdateStep[] {
	return STEPS.map((step) => ({
		label: step.label,
		state: "pending",
		detail: null,
	}));
}

export class ServerUpdateError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

function slugifyRef(ref: string): string {
	return ref
		.replace(/[^A-Za-z0-9._-]+/gu, "-")
		.replace(/^-+|-+$/gu, "")
		.slice(0, 60);
}

export async function startServerUpdate(
	deps: ServerUpdateDeps,
	input: unknown,
): Promise<ServerUpdateAccepted> {
	const parsed = serverUpdateRequestSchema.safeParse(input);
	if (!parsed.success) {
		throw new ServerUpdateError(
			"Choose a valid tag or branch (letters, digits, dots, underscores, and slashes only).",
			400,
		);
	}
	const request: ServerUpdateRequest = parsed.data;
	const config = deps.config;
	if (config.demo) {
		throw new ServerUpdateError(
			"Server updates are disabled in demo mode.",
			403,
		);
	}
	if (config.updateMetadataSource === "local") {
		throw new ServerUpdateError(
			"Server updates require the control plane to run as a Docker Compose container. This from-source dev server shows update data read-only.",
			403,
		);
	}
	if (!config.hostRepoDir) {
		throw new ServerUpdateError(
			"No host checkout was detected. Set CODERUNNER_UPDATE_REPO_DIR to the directory containing docker-compose.yml, then recreate the control container.",
			503,
		);
	}

	const imageInfo = await readImageInfo(deps);
	if (!imageInfo.image) {
		throw new ServerUpdateError(
			"Couldn't inspect this control container, so there is no image to update from.",
			503,
		);
	}
	const ns = imageNamespace(imageInfo.image) ?? "ghcr.io/mathewdunne";
	const refs = await listRemoteRefs(
		imageInfo.url,
		deps.fetch ?? globalThis.fetch,
	);
	const available = request.kind === "tag" ? refs.tags : refs.branches;
	if (refs.error) {
		throw new ServerUpdateError(refs.error, 503);
	}
	if (!available.includes(request.ref)) {
		throw new ServerUpdateError(
			`${request.ref} is not in the list of available ${request.kind === "tag" ? "tags" : "branches"}. Refresh and select one from the list.`,
			400,
		);
	}

	const now = deps.now ?? (() => new Date());
	const startedAt = now().toISOString();
	const jobId = randomUUID().slice(0, 8);
	const tag =
		request.kind === "tag" ? request.ref : `branch-${slugifyRef(request.ref)}`;
	const controlImage = `${ns}/coderunner-control:${tag}`;
	const workspaceImage = `${ns}/coderunner-workspace:${tag}`;
	const hostRepoDir = config.hostRepoDir;
	const hostDataDir = config.hostDataDir ?? config.dataDir;
	const job: JobFile = {
		id: jobId,
		kind: request.kind,
		ref: request.ref,
		state: "starting",
		startedAt,
		finishedAt: null,
		message: "Starting update…",
		steps: initialSteps(),
		image: controlImage,
	};
	await writeJob(config, job);

	const envPairs: Array<[string, string]> = [
		["CODERUNNER_UPDATE_REPO", hostRepoDir],
		["CODERUNNER_UPDATE_REF", request.ref],
		["CODERUNNER_UPDATE_KIND", request.kind],
		["CODERUNNER_UPDATE_JOB_FILE", hostJobPath(config)],
		["CODERUNNER_UPDATE_IMAGE", controlImage],
		["CODERUNNER_UPDATE_WORKSPACE_IMAGE", workspaceImage],
		["CODERUNNER_UPDATE_TAG", tag],
		["CODERUNNER_IMAGE_NS", ns],
		["FRC_DB_PATH", resolve(hostDataDir, "app.db")],
	];
	// `docker compose up -d` in the helper must see the same COMPOSE_FILE the
	// operator's deployment uses (prod adds Caddy/Alloy via a second file).
	const composeFile = Bun.env.COMPOSE_FILE?.trim();
	if (composeFile) envPairs.push(["COMPOSE_FILE", composeFile]);
	const updaterName = `coderunner-updater-${jobId}`;
	const args = [
		"run",
		"-d",
		"--rm",
		"--name",
		updaterName,
		"--user",
		"root",
		"-v",
		"/var/run/docker.sock:/var/run/docker.sock",
		"-v",
		`${hostRepoDir}:${hostRepoDir}`,
		"-v",
		`${hostDataDir}:${hostDataDir}`,
		...envPairs.flatMap(([key, value]) => ["-e", `${key}=${value}`]),
		"--entrypoint",
		"coderunner",
		imageInfo.image,
		"update-server",
	];

	try {
		await runDocker(deps.dockerRunner, args);
	} catch (error) {
		await writeJob(config, {
			...job,
			state: "failed",
			finishedAt: now().toISOString(),
			message: error instanceof Error ? error.message : String(error),
		});
		throw new ServerUpdateError(
			`Couldn't start the updater helper: ${error instanceof Error ? error.message : String(error)}`,
			500,
		);
	}
	log.info("server update started", {
		jobId,
		kind: request.kind,
		ref: request.ref,
		image: controlImage,
	});
	return {
		ok: true,
		jobId,
		ref: request.ref,
		kind: request.kind,
		image: controlImage,
		message:
			"Update started. This page will reconnect when the control plane restarts.",
	};
}
