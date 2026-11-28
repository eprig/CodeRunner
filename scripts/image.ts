// Build or pull the CodeRunner Docker images under their canonical names:
//   ${CODERUNNER_IMAGE_NS:-ghcr.io/mathewdunne}/coderunner-<kind>:${CODERUNNER_TAG:-latest}
//
// Usage: bun scripts/image.ts <build|pull> <workspace|control>
//
// The same name resolution is used by docker-compose.yml and the control
// plane's codeImage default, so a local build is picked up directly by
// `docker compose up` — no re-tagging step. CODE_IMAGE overrides the
// workspace image name outright (matching the control plane).

const dockerPath = Bun.env.FRC_DOCKER_PATH ?? "docker";
/** Git branch a local build came from; read by the admin Update tab. */
const BRANCH_LABEL = "coderunner.git.branch";

const dockerfiles = {
	workspace: "containers/code/Dockerfile",
	control: "containers/control/Dockerfile",
} as const;

type Kind = keyof typeof dockerfiles;

function imageName(kind: Kind): string {
	if (kind === "workspace" && Bun.env.CODE_IMAGE) return Bun.env.CODE_IMAGE;
	const ns = Bun.env.CODERUNNER_IMAGE_NS ?? "ghcr.io/mathewdunne";
	const tag = Bun.env.CODERUNNER_TAG ?? "latest";
	return `${ns}/coderunner-${kind}:${tag}`;
}

const [command, kind] = Bun.argv.slice(2);
if ((command !== "build" && command !== "pull") || !(kind! in dockerfiles)) {
	console.error("Usage: bun scripts/image.ts <build|pull> <workspace|control>");
	process.exit(2);
}

// Local builds carry the same provenance labels CI adds to release images, so
// the admin Update tab can show a commit/repo even for a branch build. Labels
// are best-effort: keep building when git is unavailable (e.g. a source tarball).
async function gitOutput(args: string[]): Promise<string | null> {
	try {
		const subprocess = Bun.spawn(["git", ...args], {
			cwd: new URL("..", import.meta.url).pathname,
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

const image = imageName(kind as Kind);
const provenanceLabels: string[] = [];
if (command === "build") {
	const commit = await gitOutput(["rev-parse", "HEAD"]);
	const source = await gitOutput(["remote", "get-url", "origin"]);
	const version = Bun.env.CODERUNNER_TAG ?? "latest";
	if (commit)
		provenanceLabels.push(`org.opencontainers.image.revision=${commit}`);
	if (source)
		provenanceLabels.push(`org.opencontainers.image.source=${source}`);
	provenanceLabels.push(`org.opencontainers.image.version=${version}`);
	// The image tag alone ("latest") doesn't say which branch was built; the
	// admin Update tab shows this instead. Omitted on a detached HEAD (a tag).
	const branch = await gitOutput(["rev-parse", "--abbrev-ref", "HEAD"]);
	if (branch && branch !== "HEAD")
		provenanceLabels.push(`${BRANCH_LABEL}=${branch}`);
}
const args =
	command === "build"
		? [
				"build",
				"-f",
				dockerfiles[kind as Kind],
				"-t",
				image,
				...provenanceLabels.flatMap((label) => ["--label", label]),
				".",
			]
		: ["pull", image];

console.log(`${command === "build" ? "Building" : "Pulling"} ${image}`);

const subprocess = Bun.spawn([dockerPath, ...args], {
	stdout: "inherit",
	stderr: "inherit",
});

const exitCode = await subprocess.exited;
if (exitCode !== 0) {
	console.error(`docker ${args.join(" ")} failed with exit code ${exitCode}`);
	process.exit(exitCode);
}

export {};
