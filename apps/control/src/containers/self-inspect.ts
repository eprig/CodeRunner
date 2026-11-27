import { existsSync, statSync } from "node:fs";
import { hostname as osHostname } from "node:os";
import { resolve } from "node:path";
import { defaultDockerRunner, inspectContainerOrThrow } from "./docker-client";
import type { DockerInspectContainer } from "./types";

/**
 * Zero-config detection for the containerized control plane.
 *
 * When the control plane runs inside a container it has the host Docker socket
 * bind-mounted, so it can `docker inspect` its own container to learn three
 * things that would otherwise need hand-wired env plumbing:
 *
 *   - `hostDataDir`   — the host-side path of the `/data` bind mount (the Docker
 *                       daemon resolves `docker run --mount src=...` against the
 *                       host filesystem, so workspace bind mounts must use it).
 *   - `containerNetwork` — the user-defined network this container is attached
 *                       to, which workspace containers must join as siblings.
 *   - `containerUser` — the uid:gid that owns the data dir, so student files are
 *                       not created as root.
 *
 * The three env vars (`FRC_HOST_DATA_DIR`, `FRC_CONTAINER_NETWORK`,
 * `FRC_CONTAINER_USER`) become optional overrides: an explicit value always
 * wins and its field is not derived. Inspection only fills the gaps.
 *
 * On the host (the dev loop) `/.dockerenv` is absent, so this returns
 * immediately with `containerized: false` and makes zero Docker calls — the
 * caller then leaves the config untouched (port mode).
 *
 * There is deliberately no fallback to port mode inside a container: port mode
 * publishes loopback host ports the containerized control plane cannot reach,
 * so a silent fallback would be a broken deployment. Every failure to derive a
 * still-needed field is a hard startup error that names the env var that fixes
 * it.
 */

const DEFAULT_NETWORKS = new Set(["bridge", "host", "none"]);

export type SelfInspectOptions = {
	/**
	 * In-container data dir, resolved the same way config does
	 * (`resolve(Bun.env.FRC_DATA_DIR ?? …)`). The image always sets
	 * `FRC_DATA_DIR=/data`, so this is `/data` in a real deployment.
	 */
	dataDir: string;
	/** Explicit `FRC_HOST_DATA_DIR` override, or null when unset. */
	envHostDataDir: string | null;
	/** Explicit `FRC_CONTAINER_NETWORK` override, or null when unset. */
	envContainerNetwork: string | null;
	/**
	 * Explicit workspace user override (`FRC_CONTAINER_USER`, or
	 * `FRC_UID`:`FRC_GID`), or null when unset.
	 */
	envContainerUser: string | null;

	// ── Injectable dependencies (defaults hit the real system) ──────────
	/** Whether this process runs inside a container. */
	dockerenvExists?: () => boolean;
	/** `docker inspect` runner; throws or returns null when it can't be read. */
	inspect?: (id: string) => Promise<DockerInspectContainer | null>;
	/** This container's id/hostname (compose sets the hostname to the id). */
	hostname?: () => string;
	/** stat() for the data dir, returning its owner uid/gid. */
	stat?: (path: string) => { uid: number; gid: number };
};

export type SelfInspectResult = {
	containerized: boolean;
	hostDataDir: string | null;
	containerNetwork: string | null;
	/** undefined when root-owned — left to the config root-guard to reject. */
	containerUser: string | undefined;
	/**
	 * The `com.docker.compose.project` label of this container, so workspace
	 * containers can carry the same label and nest under the control plane's
	 * compose project in tools that group by it (Portainer, `docker compose ls`).
	 * Null on the host, when the control plane was not started by compose, and
	 * when the inspect that reads it fails on the fully-overridden path.
	 */
	composeProject: string | null;
	/**
	 * Host-side compose project directory (`com.docker.compose.project.working_dir`).
	 * The admin server updater needs it to find the host's repo checkout; null
	 * when this container wasn't started by compose (decision 052).
	 */
	composeWorkingDir: string | null;
	/** Which fields came from inspection (vs. an explicit env override). */
	autoDetected: {
		hostDataDir: boolean;
		containerNetwork: boolean;
		containerUser: boolean;
	};
};

export async function selfInspect(
	options: SelfInspectOptions,
): Promise<SelfInspectResult> {
	const {
		dataDir,
		envHostDataDir,
		envContainerNetwork,
		envContainerUser,
		dockerenvExists = () => existsSync("/.dockerenv"),
		inspect = (id: string) => inspectContainerOrThrow(defaultDockerRunner, id),
		hostname = osHostname,
		stat = defaultStat,
	} = options;

	// On the host the dev loop must behave byte-identically: no Docker calls, no
	// derived values.
	if (!dockerenvExists()) {
		return notDerived(envHostDataDir, envContainerNetwork, envContainerUser);
	}

	const needHostDataDir = envHostDataDir === null;
	const needNetwork = envContainerNetwork === null;
	const needUser = envContainerUser === null;

	// Everything explicitly configured — nothing to derive. The compose label is
	// still worth reading so workspace containers keep nesting under the control
	// plane's project no matter how the deployment is configured; it is cosmetic,
	// so unlike the three derived fields a failed inspect here is not fatal.
	if (!needHostDataDir && !needNetwork && !needUser) {
		const labels = await readComposeLabels(inspect, hostname());
		return {
			...notDerived(envHostDataDir, envContainerNetwork, envContainerUser),
			containerized: true,
			composeProject: deriveComposeProject(labels),
			composeWorkingDir: deriveComposeWorkingDir(labels),
		};
	}

	const id = hostname();
	let container: DockerInspectContainer | null;
	try {
		container = await inspect(id);
	} catch (error) {
		throw new Error(inspectFailureMessage(id, error));
	}
	if (!container) {
		throw new Error(inspectFailureMessage(id));
	}

	const hostDataDir = needHostDataDir
		? deriveHostDataDir(container, dataDir)
		: envHostDataDir;
	const containerNetwork = needNetwork
		? deriveNetwork(container)
		: envContainerNetwork;
	const containerUser = needUser
		? deriveContainerUser(stat, dataDir)
		: (envContainerUser ?? undefined);

	const labels = container.Config?.Labels ?? {};
	return {
		containerized: true,
		hostDataDir,
		containerNetwork,
		containerUser,
		composeProject: deriveComposeProject(labels),
		composeWorkingDir: deriveComposeWorkingDir(labels),
		autoDetected: {
			hostDataDir: needHostDataDir,
			containerNetwork: needNetwork,
			// Root-owned dirs are intentionally not derived (containerUser stays
			// undefined), so they are not "auto-detected" either.
			containerUser: needUser && containerUser !== undefined,
		},
	};
}

function defaultStat(path: string): { uid: number; gid: number } {
	const s = statSync(path);
	return { uid: s.uid, gid: s.gid };
}

function notDerived(
	hostDataDir: string | null,
	containerNetwork: string | null,
	containerUser: string | null,
): SelfInspectResult {
	return {
		containerized: false,
		hostDataDir,
		containerNetwork,
		containerUser: containerUser ?? undefined,
		composeProject: null,
		composeWorkingDir: null,
		autoDetected: {
			hostDataDir: false,
			containerNetwork: false,
			containerUser: false,
		},
	};
}

function deriveHostDataDir(
	container: DockerInspectContainer,
	dataDir: string,
): string {
	const target = resolve(dataDir);
	const mount = (container.Mounts ?? []).find(
		(m) =>
			typeof m.Destination === "string" && resolve(m.Destination) === target,
	);
	if (!mount?.Source) {
		throw new Error(
			`Could not auto-detect the host-side data directory: no bind mount in ` +
				`this container has destination ${target}. Set FRC_HOST_DATA_DIR to the ` +
				`host path of the data directory. If this .env was reused from a ` +
				`pre-compose deployment, also remove its FRC_DATA_DIR/FRC_DB_PATH/PORT ` +
				`lines — they override the image's in-container paths.`,
		);
	}
	return mount.Source;
}

function deriveNetwork(container: DockerInspectContainer): string {
	const networks = Object.keys(
		container.NetworkSettings?.Networks ?? {},
	).filter((name) => !DEFAULT_NETWORKS.has(name));
	if (networks.length === 1) {
		return networks[0]!;
	}
	const found =
		networks.length === 0
			? "none"
			: `${networks.length} (${networks.join(", ")})`;
	throw new Error(
		`Could not auto-detect the workspace container network: expected exactly ` +
			`one user-defined network attached to this container, found ${found}. Set ` +
			`FRC_CONTAINER_NETWORK to the network workspace containers should join.`,
	);
}

/**
 * The compose project label, best-effort. Only used on the fully-overridden
 * path, where nothing else needs the inspect: grouping in Portainer / Docker
 * Desktop is a convenience, so it degrades to "ungrouped" (which the startup
 * config log reports) instead of failing startup.
 */
async function readComposeLabels(
	inspect: (id: string) => Promise<DockerInspectContainer | null>,
	id: string,
): Promise<Record<string, string>> {
	try {
		const container = await inspect(id);
		return container?.Config?.Labels ?? {};
	} catch {
		return {};
	}
}

function deriveComposeProject(labels: Record<string, string>): string | null {
	const project = labels["com.docker.compose.project"];
	return project ? project : null;
}

function deriveComposeWorkingDir(
	labels: Record<string, string>,
): string | null {
	const dir = labels["com.docker.compose.project.working_dir"];
	return dir ? dir : null;
}

function deriveContainerUser(
	stat: (path: string) => { uid: number; gid: number },
	dataDir: string,
): string | undefined {
	const { uid, gid } = stat(dataDir);
	// Root-owned (any group): do NOT derive. Workspaces would run as uid 0 and
	// root-own student files. Leaving this undefined lets the config root-guard
	// fire (chown the data dir, or set FRC_CONTAINER_USER, to fix).
	if (uid === 0) {
		return undefined;
	}
	return `${uid}:${gid}`;
}

function inspectFailureMessage(id: string, error?: unknown): string {
	const raw =
		error instanceof Error ? error.message : error ? String(error) : "";
	const detail = raw ? `: ${raw}` : "";

	// None of the three env vars below can fix a denied socket, so pointing at
	// them sends people the wrong way. Name the real fix when docker says so.
	if (/permission denied/i.test(raw) && /docker\.sock/i.test(raw)) {
		return (
			`Failed to inspect this control-plane container ("${id}")${detail}. The ` +
			`control plane runs as a non-root user and reaches the Docker socket via ` +
			`its supplementary groups, none of which own /var/run/docker.sock. Set ` +
			`CODERUNNER_DOCKER_GID in .env to the owning group — find it with ` +
			`stat -c '%g' /var/run/docker.sock — then recreate the container with ` +
			`docker compose up -d control.`
		);
	}

	return (
		`Failed to inspect this control-plane container ("${id}")${detail}. The ` +
		`containerized control plane auto-detects FRC_HOST_DATA_DIR, ` +
		`FRC_CONTAINER_NETWORK, and FRC_CONTAINER_USER from its own container; set ` +
		`those three environment variables manually to override when inspection is ` +
		`unavailable.`
	);
}
