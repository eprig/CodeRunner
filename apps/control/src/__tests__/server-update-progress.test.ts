import { describe, expect, test } from "bun:test";
import {
	createBuildProgressTracker,
	parseBuildProgressLine,
	stripAnsi,
} from "../server-update-progress";

describe("server build progress parsing", () => {
	test("strips ANSI colors from Docker output", () => {
		expect(stripAnsi("\u001B[31m#7 [stage-1 2/9] RUN test\u001B[0m")).toBe(
			"#7 [stage-1 2/9] RUN test",
		);
	});

	test("keeps BuildKit step headers and completed-step timings", () => {
		expect(
			parseBuildProgressLine("#12 [linux/amd64 stage-1 6/9] RUN bun install"),
		).toBe("[linux/amd64 stage-1 6/9] RUN bun install");
		expect(parseBuildProgressLine("#12 DONE 34.8s")).toBe("DONE 34.8s");
	});

	test("keeps classic builder step headers", () => {
		expect(parseBuildProgressLine("Step 4/10 : RUN ./gradlew build")).toBe(
			"Step 4/10 : RUN ./gradlew build",
		);
	});

	test("ignores ordinary command output", () => {
		expect(
			parseBuildProgressLine("#12 2.34 downloading dependencies"),
		).toBeNull();
		expect(parseBuildProgressLine(" ---> 0123456789ab")).toBeNull();
		expect(parseBuildProgressLine("")).toBeNull();
	});

	test("reports a cached step with its header", () => {
		const track = createBuildProgressTracker();
		expect(
			track("#14 [ascope-build 9/9] RUN bun scripts/build-ascope-lite.ts"),
		).toBe("[ascope-build 9/9] RUN bun scripts/build-ascope-lite.ts");
		expect(track("#14 CACHED")).toBe(
			"[ascope-build 9/9] RUN bun scripts/build-ascope-lite.ts (cached)",
		);
		expect(track("#99 CACHED")).toBeNull();
	});
});
