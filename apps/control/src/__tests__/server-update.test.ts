import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadControlConfig } from "../config";
import type { DockerCommandResult, DockerRunner } from "../containers/types";
import {
	clearRefsCache,
	getServerUpdateStatus,
	githubSlug,
	imageNamespace,
	listRemoteRefs,
	normalizeRepoUrl,
	type ServerUpdateDeps,
	ServerUpdateError,
	startServerUpdate,
	UPDATE_JOB_FILE,
} from "../server-update";

const ok = (stdout = ""): DockerCommandResult => ({
	stdout,
	stderr: "",
	exitCode: 0,
});

function githubFetch(url: string): Promise<Response> {
	const body = url.includes("/tags?")
		? [
				{
					name: "v2.5.0",
					commit: { sha: "tagcommit0000000000000000000000000000001" },
				},
				{
					name: "v2.4.0",
					commit: { sha: "tagcommit0000000000000000000000000000002" },
				},
			]
		: [
				{
					name: "main",
					commit: { sha: "branchcommit00000000000000000000000000001" },
				},
				{
					name: "dev",
					commit: { sha: "branchcommit00000000000000000000000000002" },
				},
				{
					name: "feature/my-branch",
					commit: { sha: "branchcommit00000000000000000000000000003" },
				},
			];
	return Promise.resolve(Response.json(body));
}

const imageLabels = {
	"org.opencontainers.image.source": "https://github.com/eprig/CodeRunner.git",
	"org.opencontainers.image.revision": "abc123def",
	"org.opencontainers.image.version": "v2.4.0",
};

async function deps(
	options: {
		hostRepoDir?: string | null;
		hostDataDir?: string | null;
		labels?: Record<string, string>;
		image?: string;
		failRun?: boolean;
		demo?: boolean;
		updateMetadataSource?: "container" | "local";
	} = {},
): Promise<{
	context: ServerUpdateDeps;
	root: string;
	calls: string[][];
}> {
	const root = await mkdtemp(join(tmpdir(), "coderunner-update-"));
	await mkdir(join(root, "data"), { recursive: true });
	const config = loadControlConfig({
		dataDir: join(root, "data"),
		hostDataDir: options.hostDataDir ?? join(root, "data"),
		hostRepoDir:
			options.hostRepoDir !== undefined
				? options.hostRepoDir
				: "/srv/coderunner",
		demo: options.demo ?? false,
		updateMetadataSource: options.updateMetadataSource ?? "container",
		catalogRepo: null,
		webDistDir: join(root, "web"),
		advantageScopeDistDir: join(root, "ascope"),
		pathplannerDistDir: join(root, "pathplanner"),
	});
	const calls: string[][] = [];
	const runner: DockerRunner = async (args) => {
		calls.push([...args]);
		if (args[0] === "container" && args[1] === "inspect") {
			if (options.updateMetadataSource === "local") {
				return { stdout: "", stderr: "Error: No such object", exitCode: 1 };
			}
			return ok(
				JSON.stringify([
					{
						Name: "/coderunner-control",
						Config: {
							Image: options.image ?? "ghcr.io/eprig/coderunner-control:v2.4.0",
							Labels: options.labels ?? imageLabels,
						},
					},
				]),
			);
		}
		if (args[0] === "run" && options.failRun) {
			return { stdout: "", stderr: "permission denied", exitCode: 1 };
		}
		return ok();
	};
	return {
		root,
		calls,
		context: {
			config,
			dockerRunner: runner,
			selfContainerId: "coderunner-control",
			fetch: githubFetch,
			now: () => new Date("2026-11-26T12:00:00.000Z"),
		},
	};
}

async function initGitRepo(dir: string): Promise<void> {
	const git = async (args: string[]): Promise<void> => {
		const subprocess = Bun.spawn(["git", "-C", dir, ...args], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const exitCode = await subprocess.exited;
		if (exitCode !== 0) throw new Error(`git ${args.join(" ")} failed`);
	};
	await git(["init", "-q"]);
	await git(["checkout", "-q", "-b", "dev"]);
	await git(["remote", "add", "origin", "git@github.com:eprig/CodeRunner.git"]);
	await git([
		"-c",
		"user.email=test@example.com",
		"-c",
		"user.name=Test",
		"commit",
		"--allow-empty",
		"-q",
		"-m",
		"init",
	]);
}

function clearEnv(names: string[]): Map<string, string | undefined> {
	const saved = new Map<string, string | undefined>();
	for (const name of names) {
		saved.set(name, Bun.env[name]);
		delete Bun.env[name];
	}
	return saved;
}

function restoreEnv(saved: Map<string, string | undefined>): void {
	for (const [name, value] of saved) {
		if (value === undefined) delete Bun.env[name];
		else Bun.env[name] = value;
	}
}

describe("server update helpers", () => {
	test("parses image namespaces and GitHub URLs", () => {
		expect(imageNamespace("ghcr.io/eprig/coderunner-control:v2.4.0")).toBe(
			"ghcr.io/eprig",
		);
		expect(imageNamespace("coderunner-control:dev")).toBeNull();
		expect(githubSlug(imageLabels["org.opencontainers.image.source"])).toBe(
			"eprig/CodeRunner",
		);
		expect(githubSlug("git@github.com:eprig/CodeRunner.git")).toBe(
			"eprig/CodeRunner",
		);
		expect(normalizeRepoUrl("git@github.com:eprig/CodeRunner.git")).toBe(
			"https://github.com/eprig/CodeRunner",
		);
	});

	test("lists refs from the image's GitHub repository", async () => {
		clearRefsCache();
		const result = await listRemoteRefs(
			imageLabels["org.opencontainers.image.source"],
			githubFetch,
		);
		expect(result).toEqual({
			tags: ["v2.5.0", "v2.4.0"],
			branches: ["main", "dev", "feature/my-branch"],
			commits: {
				"tag:v2.5.0": "tagcommit0000000000000000000000000000001",
				"tag:v2.4.0": "tagcommit0000000000000000000000000000002",
				"branch:main": "branchcommit00000000000000000000000000001",
				"branch:dev": "branchcommit00000000000000000000000000002",
				"branch:feature/my-branch": "branchcommit00000000000000000000000000003",
			},
			error: null,
		});
	});

	test("reports a useful error for non-GitHub image provenance", async () => {
		const result = await listRemoteRefs(
			"https://git.example.com/acme/cr",
			githubFetch,
		);
		expect(result.tags).toEqual([]);
		expect(result.error).toContain("GitHub repository URLs");
	});

	test("reports GitHub transport failures without throwing", async () => {
		clearRefsCache();
		const result = await listRemoteRefs(
			imageLabels["org.opencontainers.image.source"],
			() => Promise.resolve(new Response("rate limited", { status: 429 })),
		);
		expect(result.error).toContain("429");
	});
});

describe("server update status", () => {
	test("reports repo details, refs, and an idle job", async () => {
		clearRefsCache();
		const { context, root } = await deps();
		try {
			const status = await getServerUpdateStatus(context);
			expect(status.repo).toMatchObject({
				url: imageLabels["org.opencontainers.image.source"],
				slug: "eprig/CodeRunner",
				commit: "abc123def",
				version: "v2.4.0",
				mode: "prebuilt",
				hostDir: "/srv/coderunner",
				updatable: true,
			});
			expect(status.refs.tags).toContain("v2.5.0");
			expect(status.job.state).toBe("idle");
			expect(status.job.steps.map((step) => step.label)).toEqual([
				"Prepare checkout",
				"Build or pull images",
				"Recreate Compose services",
			]);
			expect(status.restartExpected).toBe(false);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("reads a persisted job so the new container can report the outcome", async () => {
		const { context, root } = await deps();
		try {
			await writeFile(
				join(root, "data", UPDATE_JOB_FILE),
				JSON.stringify({
					id: "abc12345",
					kind: "tag",
					ref: "v2.5.0",
					state: "succeeded",
					startedAt: "2026-11-26T12:00:00.000Z",
					finishedAt: "2026-11-26T12:02:00.000Z",
					message: "Now running tag v2.50.",
					steps: [],
					image: "ghcr.io/eprig/coderunner-control:v2.5.0",
				}),
			);
			const status = await getServerUpdateStatus(context);
			expect(status.job.state).toBe("succeeded");
			expect(status.job.ref).toBe("v2.5.0");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("returns a read-only mock in demo mode without calling Docker or GitHub", async () => {
		clearRefsCache();
		const { context, root, calls } = await deps({ demo: true });
		try {
			const status = await getServerUpdateStatus(context);
			expect(status.demo).toBe(true);
			expect(status.repo.commit).toBe(
				"demo0000000000000000000000000000000000000",
			);
			expect(status.refs.tags).toContain("v2.5.0");
			expect(status.repo.updatable).toBe(false);
			expect(calls).toEqual([]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("derives display data from the local checkout in from-source dev", async () => {
		clearRefsCache();
		const { context, root, calls } = await deps({
			updateMetadataSource: "local",
		});
		context.config.hostRepoDir = root;
		const savedEnv = clearEnv(["CODERUNNER_TAG", "CODERUNNER_IMAGE_NS"]);
		try {
			await initGitRepo(root);
			const status = await getServerUpdateStatus(context);
			expect(status.demo).toBe(false);
			expect(status.repo.source).toBe("local");
			expect(status.repo.url).toBe("https://github.com/eprig/CodeRunner");
			expect(status.repo.slug).toBe("eprig/CodeRunner");
			expect(status.repo.commit).toMatch(/^[0-9a-f]{40}$/u);
			expect(status.repo.version).toBe("branch-dev");
			expect(status.repo.imageNamespace).toBe("ghcr.io/eprig");
			expect(status.repo.updatable).toBe(false);
			expect(status.refs.tags).toContain("v2.5.0");
			// The failed container inspect is expected, but no helper is launched.
			expect(calls.every((call) => call[0] !== "run")).toBe(true);
		} finally {
			restoreEnv(savedEnv);
			await rm(root, { recursive: true, force: true });
		}
	});

	test("marks deployments built from a branch as source mode", async () => {
		clearRefsCache();
		const { context, root } = await deps({
			labels: {
				...imageLabels,
				"org.opencontainers.image.version": "branch-dev",
			},
		});
		try {
			const status = await getServerUpdateStatus(context);
			expect(status.repo.mode).toBe("source");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

describe("startServerUpdate", () => {
	test("rejects invalid refs and refs not offered by GitHub", async () => {
		clearRefsCache();
		const { context, root } = await deps();
		try {
			await expect(
				startServerUpdate(context, { kind: "tag", ref: "bad ref; rm -rf /" }),
			).rejects.toBeInstanceOf(ServerUpdateError);
			await expect(
				startServerUpdate(context, { kind: "tag", ref: "v9.9.9" }),
			).rejects.toThrow("not in the list");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("rejects updates from a from-source dev server", async () => {
		const { context, root, calls } = await deps({
			updateMetadataSource: "local",
		});
		context.config.hostRepoDir = root;
		try {
			await expect(
				startServerUpdate(context, { kind: "tag", ref: "v2.5.0" }),
			).rejects.toThrow("Compose container");
			expect(calls).toEqual([]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("rejects updates in demo mode", async () => {
		clearRefsCache();
		const { context, root, calls } = await deps({ demo: true });
		try {
			await expect(
				startServerUpdate(context, { kind: "tag", ref: "v2.5.0" }),
			).rejects.toThrow("disabled in demo mode");
			expect(calls).toEqual([]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("requires a detected host checkout", async () => {
		clearRefsCache();
		const { context, root } = await deps({ hostRepoDir: null });
		try {
			await expect(
				startServerUpdate(context, { kind: "tag", ref: "v2.5.0" }),
			).rejects.toThrow("CODERUNNER_UPDATE_REPO_DIR");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("launches a privileged sibling helper for a release tag", async () => {
		clearRefsCache();
		const { context, root, calls } = await deps();
		try {
			const result = await startServerUpdate(context, {
				kind: "tag",
				ref: "v2.5.0",
			});
			expect(result.image).toBe("ghcr.io/eprig/coderunner-control:v2.5.0");
			const run = calls.find((call) => call[0] === "run");
			expect(run).toBeTruthy();
			expect(run).toContain("--user");
			expect(run).toContain("/var/run/docker.sock:/var/run/docker.sock");
			expect(
				run?.some((arg) => arg === "/srv/coderunner:/srv/coderunner"),
			).toBe(true);
			expect(run?.some((arg) => arg === "CODERUNNER_UPDATE_REF=v2.5.0")).toBe(
				true,
			);
			expect(
				run?.some(
					(arg) =>
						arg ===
						"CODERUNNER_UPDATE_COMMIT=tagcommit0000000000000000000000000000001",
				),
			).toBe(true);
			expect(run?.at(-3)).toBe("coderunner");
			expect(run?.at(-2)).toBe("ghcr.io/eprig/coderunner-control:v2.4.0");
			expect(run?.at(-1)).toBe("update-server");

			const job = JSON.parse(
				await readFile(join(root, "data", UPDATE_JOB_FILE), "utf8"),
			) as {
				state: string;
				kind: string;
				ref: string;
				commit: string;
				log: Array<{ kind: string; text: string }>;
			};
			expect(job).toMatchObject({
				state: "starting",
				kind: "tag",
				ref: "v2.5.0",
				commit: "tagcommit0000000000000000000000000000001",
			});
			expect(job.log.some((entry) => entry.text.includes("Resolved tag"))).toBe(
				true,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("passes COMPOSE_FILE through so the helper uses the deployed stack", async () => {
		clearRefsCache();
		const previous = Bun.env.COMPOSE_FILE;
		Bun.env.COMPOSE_FILE = "docker-compose.yml:docker-compose.prod.yml";
		const { context, root, calls } = await deps();
		try {
			await startServerUpdate(context, { kind: "tag", ref: "v2.5.0" });
			const run = calls.find((call) => call[0] === "run");
			expect(run).toContain(
				"COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml",
			);
		} finally {
			if (previous === undefined) delete Bun.env.COMPOSE_FILE;
			else Bun.env.COMPOSE_FILE = previous;
			await rm(root, { recursive: true, force: true });
		}
	});

	test("builds a namespaced image tag for a branch", async () => {
		clearRefsCache();
		const { context, root, calls } = await deps();
		try {
			const result = await startServerUpdate(context, {
				kind: "branch",
				ref: "feature/my-branch",
			});
			expect(result.image).toBe(
				"ghcr.io/eprig/coderunner-control:branch-feature-my-branch",
			);
			const run = calls.find((call) => call[0] === "run");
			expect(
				run?.some(
					(arg) =>
						arg ===
						"CODERUNNER_UPDATE_WORKSPACE_IMAGE=ghcr.io/eprig/coderunner-workspace:branch-feature-my-branch",
				),
			).toBe(true);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("records a failed job when the helper cannot start", async () => {
		clearRefsCache();
		const { context, root } = await deps({ failRun: true });
		try {
			await expect(
				startServerUpdate(context, { kind: "tag", ref: "v2.5.0" }),
			).rejects.toThrow("permission denied");
			const job = JSON.parse(
				await readFile(join(root, "data", UPDATE_JOB_FILE), "utf8"),
			) as { state: string; message: string };
			expect(job.state).toBe("failed");
			expect(job.message).toContain("permission denied");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
