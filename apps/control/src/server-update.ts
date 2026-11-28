import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
	ServerUpdateAccepted,
	ServerUpdateCommit,
	ServerUpdateJobState,
	ServerUpdateKind,
	ServerUpdateLogEntry,
	ServerUpdateRefDetails,
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
/**
 * Anonymous GitHub API calls are limited to 60/hour per IP and the page polls,
 * so ref lists are cached for 5 minutes (an admin can force a refresh), and
 * failures for 30 seconds so a rate-limited page doesn't keep hammering.
 */
const REFS_CACHE_MS = 5 * 60_000;
const ERROR_CACHE_MS = 30_000;
const DETAILS_CACHE_MS = 10 * 60_000;
const MIN_FORCED_REFRESH_MS = 15_000;
const MAX_COMPARE_COMMITS = 30;
const MAX_NOTES_CHARS = 20_000;
const MAX_REFS = 200;
/** A just-written job may not have its helper container yet; don't call it lost. */
const HELPER_STARTUP_GRACE_MS = 30_000;
export const UPDATER_NAME_PREFIX = "coderunner-updater-";
/** Set by scripts/image.ts on local builds; release images built from a tag lack it. */
export const BRANCH_LABEL = "coderunner.git.branch";

export type ServerUpdateActivity = {
	activeWorkspaces: number;
	activeBuilds: number;
};

export type ServerUpdateDeps = {
	config: ControlConfig;
	dockerRunner: DockerRunner;
	selfContainerId: string;
	/** Who an update would interrupt; omitted in unit tests. */
	activity?: (() => ServerUpdateActivity) | undefined;
	fetch?: ((url: string, init?: RequestInit) => Promise<Response>) | undefined;
	now?: (() => Date) | undefined;
};

type JobFile = {
	id: string | null;
	kind: ServerUpdateKind | null;
	ref: string | null;
	commit: string | null;
	state: ServerUpdateJobState;
	startedAt: string | null;
	finishedAt: string | null;
	message: string | null;
	requestedBy: string | null;
	steps: ServerUpdateStep[];
	log: ServerUpdateLogEntry[];
	image: string | null;
};

type ImageInfo = {
	image: string | null;
	url: string | null;
	commit: string | null;
	version: string | null;
	branch: string | null;
	imageId: string | null;
	/** Container labels (OCI provenance from the image, plus Compose's own). */
	labels: Record<string, string>;
	/** Local git/.env metadata is for display only; only container metadata can drive an update. */
	fromLocalCheckout: boolean;
};

type RefsResult = {
	tags: string[];
	branches: string[];
	/** Keyed by `tag:<name>` / `branch:<name>` so the updater can report a commit. */
	commits: Record<string, string>;
	error: string | null;
	checkedAt: string | null;
};

type Cached<T> = { at: number; ttl: number; value: T };
const refsCache = new Map<string, Cached<RefsResult>>();
const githubCache = new Map<string, Cached<unknown>>();
let lastForcedRefresh = 0;

const STEPS: Array<{ label: string; detail: string }> = [
	{ label: "Prepare checkout", detail: "Fetch the selected ref on the host" },
	{
		label: "Build or pull images",
		detail: "Control plane and workspace images",
	},
	{
		label: "Recreate Compose services",
		detail: "docker compose up -d, then prune replaced images",
	},
];

const EMPTY_JOB: JobFile = {
	id: null,
	kind: null,
	ref: null,
	commit: null,
	state: "idle",
	startedAt: null,
	finishedAt: null,
	message: null,
	requestedBy: null,
	steps: [],
	log: [],
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
		versionPinnedInEnv: false,
		branch: null,
		commitInfo: {
			sha: "demo0000000000000000000000000000000000000",
			title: "Demo build",
			author: "CodeRunner",
			date: "2026-11-20T00:00:00.000Z",
			url: null,
		},
	},
	refs: {
		tags: ["v2.5.0", "v2.4.0", "v2.3.0"],
		branches: ["main", "dev"],
		commits: {
			"tag:v2.5.0": "demo0000000000000000000000000000000000000",
			"branch:dev": "demo0000000000000000000000000000000000000",
		},
		error: null,
		checkedAt: null,
	},
	job: {
		id: null,
		state: "idle",
		kind: null,
		ref: null,
		commit: "demo0000000000000000000000000000000000000",
		startedAt: null,
		finishedAt: null,
		message: null,
		requestedBy: null,
		steps: initialSteps(),
		log: [
			{
				at: "2026-11-27T00:00:00.000Z",
				kind: "command",
				text: "$ git fetch --prune --tags origin",
			},
		],
	},
	restartExpected: false,
	activity: { activeWorkspaces: 0, activeBuilds: 0 },
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
			commit: typeof parsed.commit === "string" ? parsed.commit : null,
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
			requestedBy:
				typeof parsed.requestedBy === "string" ? parsed.requestedBy : null,
			steps: Array.isArray(parsed.steps) ? normalizeSteps(parsed.steps) : [],
			log: Array.isArray(parsed.log) ? normalizeLog(parsed.log) : [],
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

function normalizeLog(entries: unknown[]): ServerUpdateLogEntry[] {
	return entries.flatMap((entry) => {
		if (!entry || typeof entry !== "object") return [];
		const candidate = entry as Partial<ServerUpdateLogEntry>;
		if (
			typeof candidate.text !== "string" ||
			typeof candidate.at !== "string"
		) {
			return [];
		}
		const kind =
			candidate.kind === "command" ||
			candidate.kind === "error" ||
			candidate.kind === "output"
				? candidate.kind
				: "output";
		return [{ at: candidate.at, kind, text: candidate.text }];
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
			branch: labels[BRANCH_LABEL]?.trim() || null,
			imageId: container.Image ?? null,
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
		branch: null,
		imageId: null,
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
		branch: branch && branch !== "HEAD" ? branch : null,
		imageId: null,
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

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

class GitHubError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

function githubHeaders(): Record<string, string> {
	const token = Bun.env.GITHUB_TOKEN?.trim() || Bun.env.GH_TOKEN?.trim() || "";
	const headers: Record<string, string> = {
		accept: "application/vnd.github+json",
		"x-github-api-version": "2022-11-28",
		"user-agent": "coderunner-admin-updater",
	};
	if (token) headers.authorization = `Bearer ${token}`;
	return headers;
}

/**
 * GET a GitHub API path, translating rate limits into an actionable message.
 * `fresh` is for an admin's explicit "Check for updates": GitHub marks API
 * responses cacheable for 60 s, so ask intermediaries not to serve a cached
 * copy and vary the URL so none can.
 */
async function githubResponse(
	fetchImpl: FetchImpl,
	path: string,
	options: { fresh?: boolean; accept?: string } = {},
): Promise<Response> {
	const headers = githubHeaders();
	if (options.accept) headers.accept = options.accept;
	let url = `https://api.github.com${path}`;
	if (options.fresh) {
		headers["cache-control"] = "no-cache";
		url += `${path.includes("?") ? "&" : "?"}_=${Date.now()}`;
	}
	const response = await fetchImpl(url, {
		headers,
		...(options.fresh ? { cache: "no-store" as RequestCache } : {}),
	});
	if (!response.ok) {
		const limited =
			(response.status === 403 || response.status === 429) &&
			response.headers?.get?.("x-ratelimit-remaining") === "0";
		if (limited) {
			const reset = Number(response.headers.get("x-ratelimit-reset"));
			const when = Number.isFinite(reset)
				? ` until ${new Date(reset * 1000).toISOString().slice(11, 16)} UTC`
				: "";
			throw new GitHubError(
				`GitHub's API rate limit is used up${when}. Set GITHUB_TOKEN in .env to raise it.`,
				response.status,
			);
		}
		throw new GitHubError(
			`GitHub returned ${response.status}`,
			response.status,
		);
	}
	return response;
}

async function githubJson<T>(
	fetchImpl: FetchImpl,
	path: string,
	options: { fresh?: boolean } = {},
): Promise<T> {
	return (await (await githubResponse(fetchImpl, path, options)).json()) as T;
}

/** Cache GitHub reads; 404s are cached as null like any other answer. */
async function cachedGithub<T>(
	fetchImpl: FetchImpl,
	path: string,
	ttl: number,
): Promise<T | null> {
	const hit = githubCache.get(path);
	if (hit && Date.now() - hit.at < hit.ttl) {
		if (hit.value instanceof Error) throw hit.value;
		return hit.value as T | null;
	}
	try {
		const value = await githubJson<T>(fetchImpl, path);
		githubCache.set(path, { at: Date.now(), ttl, value });
		return value;
	} catch (error) {
		if (error instanceof GitHubError && error.status === 404) {
			githubCache.set(path, { at: Date.now(), ttl, value: null });
			return null;
		}
		githubCache.set(path, {
			at: Date.now(),
			ttl: ERROR_CACHE_MS,
			value: error,
		});
		throw error;
	}
}

type GithubCommit = {
	sha?: string;
	html_url?: string;
	commit?: {
		message?: string;
		author?: { name?: string; date?: string };
		committer?: { date?: string };
	};
	author?: { login?: string } | null;
};

function toCommit(raw: GithubCommit): ServerUpdateCommit | null {
	if (!raw.sha) return null;
	return {
		sha: raw.sha,
		title: (raw.commit?.message ?? "").split("\n")[0]?.trim() ?? "",
		author: raw.author?.login ?? raw.commit?.author?.name ?? null,
		date: raw.commit?.committer?.date ?? raw.commit?.author?.date ?? null,
		url: raw.html_url ?? null,
	};
}

async function commitInfo(
	fetchImpl: FetchImpl,
	slug: string,
	sha: string,
): Promise<ServerUpdateCommit | null> {
	// A commit never changes, so its lookup can live as long as the process.
	const raw = await cachedGithub<GithubCommit>(
		fetchImpl,
		`/repos/${slug}/commits/${encodeURIComponent(sha)}`,
		24 * 60 * 60_000,
	);
	return raw ? toCommit(raw) : null;
}

export async function listRemoteRefs(
	url: string | null,
	fetchImpl: FetchImpl,
	options: { force?: boolean } = {},
): Promise<RefsResult> {
	const slug = githubSlug(url);
	if (!slug) {
		return {
			tags: [],
			branches: [],
			commits: {},
			error: url
				? "Available refs are listed for GitHub repository URLs only."
				: null,
			checkedAt: null,
		};
	}

	const now = Date.now();
	const cached = refsCache.get(slug);
	const forced =
		options.force === true && now - lastForcedRefresh >= MIN_FORCED_REFRESH_MS;
	if (cached && !forced && now - cached.at < cached.ttl) return cached.value;
	if (forced) {
		lastForcedRefresh = now;
		// Releases and comparisons may have changed too; a commit never does.
		for (const key of githubCache.keys()) {
			if (!key.includes("/commits/") && !key.includes("/contents/")) {
				githubCache.delete(key);
			}
		}
	}

	try {
		const [tags, branches] = await Promise.all([
			githubJson<Array<{ name?: string; commit?: { sha?: string } }>>(
				fetchImpl,
				`/repos/${slug}/tags?per_page=100`,
				{ fresh: forced },
			),
			githubJson<Array<{ name?: string; commit?: { sha?: string } }>>(
				fetchImpl,
				`/repos/${slug}/branches?per_page=100`,
				{ fresh: forced },
			),
		]);
		const commits: Record<string, string> = {};
		for (const tag of tags) {
			if (tag.name && tag.commit?.sha)
				commits[`tag:${tag.name}`] = tag.commit.sha;
		}
		for (const branch of branches) {
			if (branch.name && branch.commit?.sha) {
				commits[`branch:${branch.name}`] = branch.commit.sha;
			}
		}
		const result: RefsResult = {
			tags: sortTagsNewestFirst(
				tags.map((tag) => tag.name ?? "").filter(Boolean),
			).slice(0, MAX_REFS),
			branches: branches
				.map((branch) => branch.name ?? "")
				.filter(Boolean)
				.slice(0, MAX_REFS),
			commits,
			error: null,
			checkedAt: new Date(now).toISOString(),
		};
		refsCache.set(slug, { at: now, ttl: REFS_CACHE_MS, value: result });
		return result;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const result: RefsResult = {
			// Keep showing the last good list when a refresh fails.
			tags: cached?.value.tags ?? [],
			branches: cached?.value.branches ?? [],
			commits: cached?.value.commits ?? {},
			error: `Couldn't list refs from GitHub: ${message}`,
			checkedAt: cached?.value.checkedAt ?? null,
		};
		refsCache.set(slug, { at: now, ttl: ERROR_CACHE_MS, value: result });
		return result;
	}
}

/**
 * GitHub's tags endpoint is not ordered by version, but the UI preselects the
 * first tag as "newest". Release tags (vMAJOR.MINOR.PATCH[-pre]) sort by
 * version, a prerelease below its release; anything else keeps API order after.
 */
export function sortTagsNewestFirst(tags: string[]): string[] {
	const parse = (tag: string) => {
		const match = /^v(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/u.exec(tag);
		return match
			? {
					parts: [Number(match[1]), Number(match[2]), Number(match[3])],
					pre: match[4] ?? null,
				}
			: null;
	};
	return tags
		.map((tag, index) => ({ tag, index, version: parse(tag) }))
		.sort((a, b) => {
			if (!a.version || !b.version) {
				if (a.version) return -1;
				if (b.version) return 1;
				return a.index - b.index;
			}
			for (let i = 0; i < 3; i += 1) {
				const diff = b.version.parts[i]! - a.version.parts[i]!;
				if (diff !== 0) return diff;
			}
			if (a.version.pre === b.version.pre) return 0;
			if (a.version.pre === null) return -1;
			if (b.version.pre === null) return 1;
			return b.version.pre.localeCompare(a.version.pre, "en", {
				numeric: true,
			});
		})
		.map((entry) => entry.tag);
}

/** Test hook: avoids a 60s wait between remote-ref changes in tests. */
export function clearRefsCache(): void {
	refsCache.clear();
	githubCache.clear();
	lastForcedRefresh = 0;
}

export async function getServerUpdateStatus(
	deps: ServerUpdateDeps,
	options: { refresh?: boolean } = {},
): Promise<ServerUpdateStatusResponse> {
	if (deps.config.demo) return structuredClone(DEMO_STATUS);
	const fetchImpl = deps.fetch ?? globalThis.fetch;
	const [image, job] = await Promise.all([
		readImageInfo(deps),
		readJob(deps.config).then((current) => reconcileLostJob(deps, current)),
	]);
	const slug = githubSlug(image.url);
	const [refs, runningCommit] = await Promise.all([
		listRemoteRefs(image.url, fetchImpl, { force: options.refresh === true }),
		slug && image.commit
			? commitInfo(fetchImpl, slug, image.commit).catch(() => null)
			: Promise.resolve(null),
	]);
	const ns = imageNamespace(image.image);
	const version = image.version;
	const mode =
		version && /^v\d+\.\d+\.\d+/u.test(version)
			? "prebuilt"
			: version?.startsWith("branch-") || image.branch
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
			// Compose passes .env into the control container (env_file), so a
			// legacy CODERUNNER_TAG line shows up in this process's environment.
			versionPinnedInEnv: Boolean(Bun.env.CODERUNNER_TAG?.trim()),
			branch: image.branch,
			commitInfo: runningCommit,
		},
		refs,
		job: {
			id: job.id,
			state: job.state,
			kind: job.kind,
			ref: job.ref,
			commit: job.commit,
			startedAt: job.startedAt,
			finishedAt: job.finishedAt,
			message: job.message,
			requestedBy: job.requestedBy,
			steps: job.steps.length > 0 ? job.steps : initialSteps(),
			log: job.log,
		},
		restartExpected: job.state === "starting" || job.state === "running",
		activity: deps.activity?.() ?? { activeWorkspaces: 0, activeBuilds: 0 },
	};
}

/**
 * What picking a ref would deploy: its commit, its GitHub release notes (for
 * tags), and how it compares with the running commit. Fetched on selection,
 * not on every poll, and cached, to stay inside GitHub's anonymous rate limit.
 */
export async function getRefDetails(
	deps: ServerUpdateDeps,
	input: unknown,
): Promise<ServerUpdateRefDetails> {
	const parsed = serverUpdateRequestSchema.safeParse(input);
	if (!parsed.success) {
		throw new ServerUpdateError("Choose a valid tag or branch.", 400);
	}
	const { kind, ref } = parsed.data;
	const empty: ServerUpdateRefDetails = {
		ok: true,
		kind,
		ref,
		commit: null,
		release: null,
		compare: null,
		error: null,
	};
	if (deps.config.demo) {
		return {
			...empty,
			release:
				kind === "tag"
					? {
							name: `CodeRunner ${ref}`,
							notes: "Sample release notes shown in demo mode.",
							publishedAt: "2026-11-20T00:00:00.000Z",
							prerelease: false,
							url: "https://github.com/eprig/CodeRunner/releases",
						}
					: null,
		};
	}
	const fetchImpl = deps.fetch ?? globalThis.fetch;
	const image = await readImageInfo(deps);
	const slug = githubSlug(image.url);
	if (!slug) {
		return {
			...empty,
			error: "Details are available for GitHub repositories only.",
		};
	}
	const refs = await listRemoteRefs(image.url, fetchImpl);
	const target = refs.commits[`${kind}:${ref}`] ?? null;
	try {
		const [commit, release, compare] = await Promise.all([
			target ? commitInfo(fetchImpl, slug, target) : Promise.resolve(null),
			kind === "tag"
				? cachedGithub<{
						name?: string | null;
						body?: string | null;
						published_at?: string | null;
						prerelease?: boolean;
						html_url?: string;
					}>(
						fetchImpl,
						`/repos/${slug}/releases/tags/${encodeURIComponent(ref)}`,
						DETAILS_CACHE_MS,
					)
				: Promise.resolve(null),
			image.commit && target
				? cachedGithub<{
						status?: string;
						ahead_by?: number;
						behind_by?: number;
						html_url?: string;
						commits?: GithubCommit[];
					}>(
						fetchImpl,
						`/repos/${slug}/compare/${encodeURIComponent(image.commit)}...${encodeURIComponent(target)}`,
						DETAILS_CACHE_MS,
					)
				: Promise.resolve(null),
		]);
		const status = compare?.status;
		return {
			...empty,
			commit,
			release: release
				? {
						name: release.name?.trim() || ref,
						notes: (release.body ?? "").slice(0, MAX_NOTES_CHARS),
						publishedAt: release.published_at ?? null,
						prerelease: release.prerelease === true,
						url:
							release.html_url ??
							`https://github.com/${slug}/releases/tag/${encodeURIComponent(ref)}`,
					}
				: null,
			compare:
				compare &&
				(status === "ahead" ||
					status === "behind" ||
					status === "identical" ||
					status === "diverged")
					? {
							status,
							aheadBy: compare.ahead_by ?? 0,
							behindBy: compare.behind_by ?? 0,
							commits: (compare.commits ?? [])
								.map(toCommit)
								.filter((entry): entry is ServerUpdateCommit => entry !== null)
								.reverse()
								.slice(0, MAX_COMPARE_COMMITS),
							url: compare.html_url ?? null,
						}
					: null,
		};
	} catch (error) {
		return {
			...empty,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function isActive(job: JobFile): boolean {
	return job.state === "starting" || job.state === "running";
}

/**
 * The helper is `--rm` and writes a terminal state before it exits, so an
 * active job whose helper container no longer exists was interrupted (host
 * reboot, OOM kill, `docker kill`). Mark it failed so the tab doesn't stay
 * locked behind an update that will never finish.
 */
async function reconcileLostJob(
	deps: ServerUpdateDeps,
	job: JobFile,
): Promise<JobFile> {
	if (!isActive(job) || !job.id) return job;
	const now = (deps.now ?? (() => new Date()))();
	const startedAt = job.startedAt ? Date.parse(job.startedAt) : Number.NaN;
	if (
		Number.isFinite(startedAt) &&
		now.getTime() - startedAt < HELPER_STARTUP_GRACE_MS
	) {
		return job;
	}
	let helper: Awaited<ReturnType<typeof inspectContainer>>;
	try {
		helper = await inspectContainer(
			deps.dockerRunner,
			`${UPDATER_NAME_PREFIX}${job.id}`,
		);
	} catch {
		return job; // Docker didn't answer; don't guess.
	}
	if (helper) return job;
	const message =
		"The update helper stopped without reporting a result (it may have been killed or the host restarted). Check the command log, then try again.";
	const failed: JobFile = {
		...job,
		state: "failed",
		finishedAt: now.toISOString(),
		message,
		steps: job.steps.map((step) =>
			step.state === "running"
				? { ...step, state: "failed", detail: message }
				: step,
		),
		log: [...job.log, { at: now.toISOString(), kind: "error", text: message }],
	};
	try {
		await writeJob(deps.config, failed);
	} catch (error) {
		log.warn("couldn't record lost update job", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
	return failed;
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

/**
 * Compose labels the running control container with the exact project name,
 * config files (absolute host paths, comma-separated), and service name it
 * was created from. Handing those to the helper makes its `docker compose`
 * calls target the same stack however the operator started it (`-f` flags,
 * COMPOSE_FILE, or `-p`); COMPOSE_FILE from the env is only a fallback.
 */
export function composeEnv(
	labels: Record<string, string>,
): Array<[string, string]> {
	const pairs: Array<[string, string]> = [];
	const project = labels["com.docker.compose.project"]?.trim();
	if (project) pairs.push(["COMPOSE_PROJECT_NAME", project]);
	const configFiles = labels["com.docker.compose.project.config_files"]
		?.split(",")
		.map((file) => file.trim())
		.filter(Boolean);
	const envComposeFile = Bun.env.COMPOSE_FILE?.trim();
	if (configFiles && configFiles.length > 0) {
		pairs.push(["COMPOSE_FILE", configFiles.join(",")]);
		pairs.push(["COMPOSE_PATH_SEPARATOR", ","]);
	} else if (envComposeFile) {
		pairs.push(["COMPOSE_FILE", envComposeFile]);
	}
	const service = labels["com.docker.compose.service"]?.trim();
	pairs.push(["CODERUNNER_UPDATE_SERVICE", service || "control"]);
	return pairs;
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
	requestedBy: string | null = null,
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

	const current = await reconcileLostJob(deps, await readJob(config));
	if (isActive(current)) {
		throw new ServerUpdateError(
			`An update to ${current.kind ?? "ref"} ${current.ref ?? "unknown"} is already running. Wait for it to finish.`,
			409,
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
	// Display only: the helper resolves real image names from the checked-out
	// compose files, which may use a different namespace than this image.
	const controlImage = `${ns}/coderunner-control:${tag}`;
	const hostRepoDir = config.hostRepoDir;
	const hostDataDir = config.hostDataDir ?? config.dataDir;
	const commit = refs.commits[`${request.kind}:${request.ref}`] ?? null;
	const shortCommit = commit ? commit.slice(0, 12) : null;
	const job: JobFile = {
		id: jobId,
		kind: request.kind,
		ref: request.ref,
		commit,
		state: "starting",
		startedAt,
		finishedAt: null,
		message: shortCommit
			? `Starting update to ${shortCommit}…`
			: "Starting update…",
		requestedBy,
		steps: initialSteps(),
		log: [
			{
				at: startedAt,
				kind: "command",
				text: `$ coderunner update-server ${request.kind} ${request.ref}`,
			},
			...(commit
				? [
						{
							at: startedAt,
							kind: "output" as const,
							text: `Resolved ${request.kind} ${request.ref} to ${commit}`,
						},
					]
				: []),
		],
		image: controlImage,
	};
	await writeJob(config, job);

	const envPairs: Array<[string, string]> = [
		["CODERUNNER_UPDATE_REPO", hostRepoDir],
		["CODERUNNER_UPDATE_REF", request.ref],
		["CODERUNNER_UPDATE_KIND", request.kind],
		["CODERUNNER_UPDATE_JOB_FILE", hostJobPath(config)],
		// Versioned tag to pull or build (`v2.5.0`, `branch-dev`); the helper
		// then points the deployment's `:latest` at it.
		["CODERUNNER_UPDATE_TAG", tag],
		["CODERUNNER_UPDATE_COMMIT", commit ?? ""],
		// What is running now, so the helper prunes exactly these afterwards and
		// can tell a rollback what to return to.
		// The image this control container runs, by ID: `:latest` may already
		// point elsewhere (a manual pull), and rollback re-tags this exact image.
		["CODERUNNER_UPDATE_PREVIOUS_IMAGE_ID", imageInfo.imageId ?? ""],
		...composeEnv(imageInfo.labels),
	];
	const updaterName = `${UPDATER_NAME_PREFIX}${jobId}`;
	const args = [
		"run",
		"-d",
		"--rm",
		"--name",
		updaterName,
		"--user",
		"root",
		// Same SELinux exemption the Compose control service has (decision 040):
		// the helper mounts the Docker socket and the host checkout.
		"--security-opt",
		"label=disable",
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
