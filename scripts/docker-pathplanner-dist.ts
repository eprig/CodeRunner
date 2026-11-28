#!/usr/bin/env bun
/**
 * Control Dockerfile's pathplanner-dist stage: download the PathPlanner web
 * dist into dist/pathplanner with fetch-pathplanner-dist.ts, on the oven/bun
 * image the build already uses (no extra base image to pull).
 *
 * PATHPLANNER_DIST_TAG doubles as the failure policy:
 *   - a real tag (what release.yml passes) is pinned and required: a failed
 *     download fails the build rather than publishing a control image that
 *     silently 503s on /pathplanner/.
 *   - "latest" (the local default) is best-effort: the dist stays empty and
 *     /pathplanner/ serves a 503 explaining how to install it, so an offline
 *     or rate-limited local build still works.
 */

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const pinned = Bun.env.PATHPLANNER_DIST_TAG?.trim() ?? "";
const required = pinned !== "" && pinned !== "latest";
// fetch-pathplanner-dist reads its tag when imported, so set it first.
if (required) Bun.env.PATHPLANNER_RELEASE_TAG = pinned;
const { fetchPathPlannerDist } = await import("./fetch-pathplanner-dist");

try {
	const ok = await fetchPathPlannerDist({ optional: !required });
	if (!ok) {
		console.warn(
			"WARNING: PathPlanner dist unavailable; /pathplanner will 503",
		);
	}
} catch (error) {
	console.error(
		`ERROR: pinned PathPlanner dist ${pinned} could not be downloaded: ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exit(1);
}
// The runtime stage copies this directory, so it must exist even when empty.
await mkdir(resolve(import.meta.dirname, "..", "dist/pathplanner"), {
	recursive: true,
});
