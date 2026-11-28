/**
 * Reuse an already-built AdvantageScope Lite instead of compiling it.
 *
 * The control image's ascope-build stage needs the emscripten/emsdk image and
 * a ~30-minute wasm compile, yet its output only changes when its inputs do:
 * the vendor/AdvantageScope submodule commit, patches/advantagescope, the two
 * build scripts, and the stage's own Dockerfile text. This module hashes those
 * inputs into a key, then finds a matching dist:
 *
 *   1. `.cache/ascope-dist/<key>/` from an earlier build on this machine;
 *   2. the `ascope-dist.tar.gz` asset of a GitHub release (this checkout's
 *      origin, then upstream) whose tagged commit has the same key.
 *
 * The caller passes the directory as `--build-context ascope-dist=<dir>`,
 * which replaces the stage, so BuildKit never pulls emsdk. With no match the
 * build compiles as usual and `saveBuiltAscope` keeps the result for next time,
 * surviving `docker builder prune`.
 */

import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { downloadAndExtract, withScratch } from "./dist-download";

export const ASCOPE_INPUTS = [
	"vendor/AdvantageScope",
	"patches/advantagescope",
	"scripts/build-ascope-lite.ts",
	"scripts/apply-ascope-patches.ts",
] as const;
export const CONTROL_DOCKERFILE = "containers/control/Dockerfile";
const UPSTREAM_REPO = "mathewdunne/CodeRunner";
/** Release tags checked per repository, newest first. */
const MAX_RELEASES = 15;
const COMPLETE_MARKER = ".coderunner-complete";

export type Git = (args: string[]) => Promise<string | null>;

/**
 * A git tree of the AdvantageScope inputs exactly as they are on disk
 * (committed or not), built in a throwaway index so the real one is untouched.
 * Null when the submodule itself has uncommitted edits, which a tree (it only
 * records the submodule's commit) can't represent.
 */
export async function worktreeInputsTree(
	repoRoot: string,
): Promise<string | null> {
	const run = async (args: string[], env: Record<string, string> = {}) => {
		const subprocess = Bun.spawn(["git", ...args], {
			cwd: repoRoot,
			env: { ...(Bun.env as Record<string, string>), ...env },
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, exitCode] = await Promise.all([
			new Response(subprocess.stdout).text(),
			subprocess.exited,
		]);
		return exitCode === 0 ? stdout.trim() : null;
	};
	const submoduleChanges = await run([
		"-C",
		"vendor/AdvantageScope",
		"status",
		"--porcelain",
	]);
	if (submoduleChanges === null || submoduleChanges !== "") return null;
	const scratch = await mkdtemp(join(tmpdir(), "coderunner-ascope-index-"));
	try {
		const env = { GIT_INDEX_FILE: join(scratch, "index") };
		if ((await run(["read-tree", "HEAD"], env)) === null) return null;
		if ((await run(["add", "-A", "--", ...ASCOPE_INPUTS], env)) === null) {
			return null;
		}
		return await run(["write-tree"], env);
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}
}

/** The ascope-build stage: its FROM line up to the next stage's FROM. */
export function ascopeStageText(dockerfile: string): string | null {
	const lines = dockerfile.split(/\r?\n/u);
	const start = lines.findIndex((line) =>
		/^FROM\s+emscripten\/emsdk\b/iu.test(line),
	);
	if (start < 0) return null;
	const rest = lines.slice(start + 1);
	const end = rest.findIndex((line) => /^FROM\s/iu.test(line));
	return [lines[start] ?? "", ...(end < 0 ? rest : rest.slice(0, end))]
		.map((line) => line.trimEnd())
		.join("\n")
		.trim();
}

/** Key for the AdvantageScope inputs at `rev`, with the given Dockerfile text. */
export async function ascopeInputsKey(
	git: Git,
	rev: string,
	dockerfile: string,
): Promise<string | null> {
	const parts: string[] = [];
	for (const path of ASCOPE_INPUTS) {
		const object = await git(["rev-parse", `${rev}:${path}`]);
		if (!object) return null;
		parts.push(`${path}=${object}`);
	}
	const stage = ascopeStageText(dockerfile);
	if (!stage) return null;
	parts.push(stage);
	return createHash("sha256").update(parts.join("\n")).digest("hex");
}

/** `owner/repo` for a GitHub remote URL (https or ssh). */
export function githubSlug(remote: string | null): string | null {
	if (!remote) return null;
	const match =
		/^(?:https?:\/\/github\.com\/|git@github\.com:)([^/]+)\/(.+?)(?:\.git)?\/?$/u.exec(
			remote.trim(),
		);
	return match ? `${match[1]}/${match[2]}` : null;
}

/** Release tags (`vX.Y.Z[-pre]`) → commit, newest version first. */
export function parseReleaseTags(lsRemote: string): Array<{
	tag: string;
	commit: string;
}> {
	const commits = new Map<string, string>();
	for (const line of lsRemote.split("\n")) {
		const [sha, ref] = line.trim().split(/\s+/u);
		const match = ref
			? /^refs\/tags\/(v\d+\.\d+\.\d+[^^]*)(\^\{\})?$/u.exec(ref)
			: null;
		if (!sha || !match?.[1]) continue;
		// Annotated tags list the tag object, then the peeled commit (`^{}`).
		if (match[2] || !commits.has(match[1])) commits.set(match[1], sha);
	}
	const version = (tag: string) =>
		(/^v(\d+)\.(\d+)\.(\d+)/u.exec(tag) ?? []).slice(1).map(Number);
	return [...commits]
		.map(([tag, commit]) => ({ tag, commit }))
		.sort((a, b) => {
			const [x, y] = [version(a.tag), version(b.tag)];
			for (let i = 0; i < 3; i += 1) {
				const diff = (y[i] ?? 0) - (x[i] ?? 0);
				if (diff !== 0) return diff;
			}
			// A prerelease sorts below its release.
			return Number(a.tag.includes("-")) - Number(b.tag.includes("-"));
		});
}

async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

export function cacheDir(repoRoot: string, key: string): string {
	return resolve(repoRoot, ".cache", "ascope-dist", key);
}

/** Move a finished dist into the cache atomically, marking it complete. */
async function commitToCache(from: string, dest: string): Promise<void> {
	await Bun.write(join(from, COMPLETE_MARKER), "");
	await mkdir(resolve(dest, ".."), { recursive: true });
	await rm(dest, { recursive: true, force: true });
	await rename(from, dest);
}

export type PrebuiltAscope = { dir: string; source: string };

/**
 * Find a reusable AdvantageScope dist for the checkout at `repoRoot`, or null
 * when its inputs have local edits or nothing matches.
 */
export async function resolvePrebuiltAscope(options: {
	repoRoot: string;
	git: Git;
	log?: (message: string) => void;
}): Promise<PrebuiltAscope | null> {
	const { repoRoot, git } = options;
	const log = options.log ?? console.log;
	// Key on what is on disk, committed or not, since that is what gets built.
	const tree = await worktreeInputsTree(repoRoot);
	if (!tree) {
		log(
			"AdvantageScope has uncommitted edits inside the submodule (or this isn't a git checkout); compiling it.",
		);
		return null;
	}
	const dockerfile = await Bun.file(
		resolve(repoRoot, CONTROL_DOCKERFILE),
	).text();
	const key = await ascopeInputsKey(git, tree, dockerfile);
	if (!key) return null;

	const cached = cacheDir(repoRoot, key);
	if (await exists(join(cached, COMPLETE_MARKER))) {
		return { dir: cached, source: "local cache" };
	}

	const origin = githubSlug(await git(["remote", "get-url", "origin"]));
	const repos = [
		...new Set(
			[
				origin,
				Bun.env.CODERUNNER_ASCOPE_RELEASE_REPO?.trim() || UPSTREAM_REPO,
			].filter((slug): slug is string => Boolean(slug)),
		),
	];
	for (const slug of repos) {
		const listing = await git([
			"ls-remote",
			"--tags",
			`https://github.com/${slug}.git`,
		]);
		if (!listing) continue;
		for (const { tag, commit } of parseReleaseTags(listing).slice(
			0,
			MAX_RELEASES,
		)) {
			// The fork shares history with upstream, so release commits are
			// usually present; a missing one just can't be compared.
			if ((await git(["cat-file", "-t", commit])) === null) continue;
			const releaseDockerfile = await git([
				"show",
				`${commit}:${CONTROL_DOCKERFILE}`,
			]);
			if (!releaseDockerfile) continue;
			if ((await ascopeInputsKey(git, commit, releaseDockerfile)) !== key)
				continue;
			const url = `https://github.com/${slug}/releases/download/${tag}/ascope-dist.tar.gz`;
			const staging = `${cached}.partial-${process.pid}`;
			try {
				const ok = await withScratch((scratch) =>
					downloadAndExtract(
						{
							asset: "ascope-dist.tar.gz",
							url,
							destDir: staging,
							optional: true,
						},
						scratch,
					),
				);
				if (!ok || !(await exists(join(staging, "index.html")))) {
					await rm(staging, { recursive: true, force: true });
					continue;
				}
				await commitToCache(staging, cached);
				return { dir: cached, source: `${slug} ${tag}` };
			} catch (error) {
				await rm(staging, { recursive: true, force: true });
				log(
					`Couldn't use ${slug} ${tag}'s AdvantageScope build: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	}
	return null;
}

/**
 * After a build that compiled AdvantageScope, copy its dist out of the build
 * cache (every step is cached, so this is quick) for future builds to reuse.
 */
export async function saveBuiltAscope(options: {
	repoRoot: string;
	git: Git;
	dockerPath: string;
}): Promise<void> {
	const { repoRoot, git, dockerPath } = options;
	const tree = await worktreeInputsTree(repoRoot);
	if (!tree) return;
	const dockerfile = await Bun.file(
		resolve(repoRoot, CONTROL_DOCKERFILE),
	).text();
	const key = await ascopeInputsKey(git, tree, dockerfile);
	if (!key) return;
	const dest = cacheDir(repoRoot, key);
	if (await exists(join(dest, COMPLETE_MARKER))) return;
	const staging = `${dest}.partial-${process.pid}`;
	const subprocess = Bun.spawn(
		[
			dockerPath,
			"build",
			"--target",
			"ascope-dist",
			"-f",
			CONTROL_DOCKERFILE,
			"--output",
			`type=local,dest=${staging}`,
			".",
		],
		{ cwd: repoRoot, stdout: "ignore", stderr: "ignore" },
	);
	if (
		(await subprocess.exited) === 0 &&
		(await exists(join(staging, "index.html")))
	) {
		await commitToCache(staging, dest);
		console.log(`Saved this AdvantageScope build to ${dest} for reuse.`);
	} else {
		await rm(staging, { recursive: true, force: true });
	}
}
