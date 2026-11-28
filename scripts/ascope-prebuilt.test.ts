import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	ascopeInputsKey,
	ascopeStageText,
	githubSlug,
	parseReleaseTags,
	worktreeInputsTree,
} from "./ascope-prebuilt";

const dockerfile = `ARG BUN_VERSION=1
FROM oven/bun:1 AS web-build
RUN echo web
FROM emscripten/emsdk:4.0.12 AS ascope-build
RUN echo compile   
COPY patches/ patches/
FROM scratch AS ascope-dist
COPY --from=ascope-build /out /
`;

describe("prebuilt AdvantageScope reuse", () => {
	test("keys on the ascope-build stage only", () => {
		expect(ascopeStageText(dockerfile)).toBe(
			"FROM emscripten/emsdk:4.0.12 AS ascope-build\nRUN echo compile\nCOPY patches/ patches/",
		);
		// Edits elsewhere in the Dockerfile don't change it.
		expect(
			ascopeStageText(dockerfile.replace("RUN echo web", "RUN echo other")),
		).toBe(ascopeStageText(dockerfile));
		expect(ascopeStageText("FROM alpine\n")).toBeNull();
	});

	test("changes the key when any input or the stage changes", async () => {
		const objects: Record<string, string> = {
			"vendor/AdvantageScope": "sub1",
			"patches/advantagescope": "tree1",
			"scripts/build-ascope-lite.ts": "blob1",
			"scripts/apply-ascope-patches.ts": "blob2",
		};
		const git = (map: Record<string, string>) => async (args: string[]) =>
			map[args[1]!.split(":")[1]!] ?? null;
		const base = await ascopeInputsKey(git(objects), "HEAD", dockerfile);
		expect(base).toMatch(/^[0-9a-f]{64}$/u);
		expect(await ascopeInputsKey(git(objects), "v1", dockerfile)).toBe(base);
		expect(
			await ascopeInputsKey(
				git({ ...objects, "patches/advantagescope": "tree2" }),
				"HEAD",
				dockerfile,
			),
		).not.toBe(base);
		expect(
			await ascopeInputsKey(
				git(objects),
				"HEAD",
				dockerfile.replace("echo compile", "echo compile2"),
			),
		).not.toBe(base);
		const { "scripts/apply-ascope-patches.ts": _, ...missing } = objects;
		expect(await ascopeInputsKey(git(missing), "HEAD", dockerfile)).toBeNull();
	});

	test("orders release tags newest first and prefers peeled commits", () => {
		const listing = [
			"aaa\trefs/tags/v0.6.9",
			"tagobj\trefs/tags/v0.6.10",
			"commit10\trefs/tags/v0.6.10^{}",
			"bbb\trefs/tags/v0.6.10-rc.1",
			"ccc\trefs/tags/not-a-release",
			"ddd\trefs/tags/v1.0.0",
		].join("\n");
		expect(parseReleaseTags(listing)).toEqual([
			{ tag: "v1.0.0", commit: "ddd" },
			{ tag: "v0.6.10", commit: "commit10" },
			{ tag: "v0.6.10-rc.1", commit: "bbb" },
			{ tag: "v0.6.9", commit: "aaa" },
		]);
	});

	test("reads GitHub slugs from https and ssh remotes", () => {
		expect(githubSlug("https://github.com/eprig/CodeRunner.git")).toBe(
			"eprig/CodeRunner",
		);
		expect(githubSlug("git@github.com:eprig/CodeRunner.git")).toBe(
			"eprig/CodeRunner",
		);
		expect(githubSlug("https://gitlab.com/a/b")).toBeNull();
	});

	test("hashes uncommitted edits without touching the real index", async () => {
		const root = await mkdtemp(join(tmpdir(), "coderunner-ascope-tree-"));
		const git = async (args: string[]) => {
			const p = Bun.spawn(["git", ...args], {
				cwd: root,
				stdout: "pipe",
				stderr: "pipe",
			});
			const [out, code] = await Promise.all([
				new Response(p.stdout).text(),
				p.exited,
			]);
			if (code !== 0) throw new Error(`git ${args.join(" ")} failed`);
			return out.trim();
		};
		try {
			await git(["init", "-q"]);
			await Bun.write(join(root, "patches/advantagescope/001.patch"), "a\n");
			await Bun.write(join(root, "scripts/build-ascope-lite.ts"), "x\n");
			await Bun.write(join(root, "scripts/apply-ascope-patches.ts"), "y\n");
			await Bun.write(join(root, "vendor/AdvantageScope/README"), "r\n");
			await git(["-C", "vendor/AdvantageScope", "init", "-q"]);
			await git(["-C", "vendor/AdvantageScope", "add", "."]);
			await git([
				"-C",
				"vendor/AdvantageScope",
				"-c",
				"user.email=a@b",
				"-c",
				"user.name=t",
				"commit",
				"-qm",
				"s",
			]);
			await git(["add", "."]);
			await git([
				"-c",
				"user.email=a@b",
				"-c",
				"user.name=t",
				"commit",
				"-qm",
				"c",
			]);
			const committed = await worktreeInputsTree(root);
			expect(committed).toMatch(/^[0-9a-f]{40}$/u);

			await writeFile(join(root, "patches/advantagescope/001.patch"), "b\n");
			const edited = await worktreeInputsTree(root);
			expect(edited).not.toBe(committed);
			expect(await git(["diff", "--cached", "--name-only"])).toBe("");

			// Uncommitted edits inside the submodule can't be keyed: compile.
			await writeFile(join(root, "vendor/AdvantageScope/README"), "changed\n");
			expect(await worktreeInputsTree(root)).toBeNull();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
