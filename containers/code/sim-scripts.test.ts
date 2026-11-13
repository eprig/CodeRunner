import { describe, expect, test } from "bun:test";
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function waitFor(
	predicate: () => boolean | Promise<boolean>,
): Promise<void> {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		if (await predicate()) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error("Timed out waiting for condition.");
}

function processArgs(pid: number): string {
	const result = Bun.spawnSync(["ps", "-p", String(pid), "-o", "args="], {
		stdout: "pipe",
		stderr: "ignore",
	});
	return result.stdout.toString();
}

describe("sim container scripts", () => {
	test("start-sim applies bounded Gradle runtime defaults", async () => {
		const root = await mkdtemp(join(tmpdir(), "frc-sim-start-"));
		const home = join(root, "home");
		const projectRoot = join(root, "project");
		const argsPath = join(projectRoot, "gradlew.args");
		const userHomePath = join(projectRoot, "gradle-user-home");
		await mkdir(projectRoot, { recursive: true });
		await mkdir(home, { recursive: true });
		await writeFile(join(projectRoot, "build.gradle"), "plugins {}\n", "utf8");
		await writeFile(
			join(projectRoot, "gradlew"),
			[
				"#!/usr/bin/env bash",
				'printf "%s\\n" "$@" > "$SIM_PROJECT_ROOT/gradlew.args"',
				'printf "%s\\n" "$GRADLE_USER_HOME" > "$SIM_PROJECT_ROOT/gradle-user-home"',
				"sleep 60",
			].join("\n"),
			"utf8",
		);
		await chmod(join(projectRoot, "gradlew"), 0o755);

		try {
			const start = Bun.spawn(["bash", join(import.meta.dir, "start-sim.sh")], {
				env: {
					...Bun.env,
					HOME: home,
					SIM_PID_FILE: join(home, "sim.pid"),
					SIM_LOG_FILE: join(home, "sim.log"),
					SIM_PROJECT_ROOT: projectRoot,
					RUN_SIM_SCRIPT: join(import.meta.dir, "run-sim.sh"),
				},
				stdin: "ignore",
				stdout: "pipe",
				stderr: "pipe",
			});

			const [exitCode, stdout, stderr] = await Promise.all([
				start.exited,
				new Response(start.stdout).text(),
				new Response(start.stderr).text(),
			]);
			expect(exitCode).toBe(0);
			expect(stderr).toBe("");
			expect(stdout).toContain("started sim with pid");

			await waitFor(async () => {
				const args = await readFile(argsPath, "utf8").catch(() => "");
				return args.length > 0;
			});

			const args = (await readFile(argsPath, "utf8")).trim().split("\n");
			expect(args).toContain("--no-daemon");
			expect(args).toContain("--no-watch-fs");
			expect(args).toContain("--max-workers=2");
			expect(args).toContain("--console=plain");
			expect(args).toContain(
				"-Dorg.gradle.jvmargs=-Xms64m -Xmx384m -XX:MaxMetaspaceSize=192m -XX:ReservedCodeCacheSize=96m -XX:+HeapDumpOnOutOfMemoryError -XX:ActiveProcessorCount=2 -Dfile.encoding=UTF-8",
			);
			expect(args.at(-1)).toBe("simulateExternalJavaRelease");
			expect(await readFile(userHomePath, "utf8")).toBe(
				`${join(home, ".gradle")}\n`,
			);
		} finally {
			const stop = Bun.spawn(["bash", join(import.meta.dir, "stop-sim.sh")], {
				env: {
					...Bun.env,
					HOME: home,
					SIM_PID_FILE: join(home, "sim.pid"),
					SIM_PROJECT_ROOT: projectRoot,
				},
				stdin: "ignore",
				stdout: "ignore",
				stderr: "ignore",
			});

			await stop.exited;
			await rm(root, { recursive: true, force: true });
		}
	});

	test("run-sim uses the unified descriptor for org.wpilib GradleRIO projects", async () => {
		const fixture = await createRunSimFixture([
			'last=""; for arg; do last="$arg"; done; printf "%s\\n" "$last" > task.txt',
			"mkdir -p build/sim build/libs",
			'printf "[{\\"libraryDir\\":\\"%s\\",\\"extensions\\":[],\\"mainClassName\\":\\"com.example.Robot\\"}]\\n" "$PWD/../lib" > build/sim/java.json',
			'printf "%s\\n" "$PWD/build/libs/project.jar" > build/sim/classpath.txt',
			"touch build/libs/robot.jar",
		]);
		try {
			await writeFile(
				join(fixture.projectRoot, "build.gradle"),
				'plugins { id "org.wpilib.GradleRIO" version "2027.0.0-alpha-7" }\n',
			);
			const result = await fixture.run(null);
			expect(result.exitCode).toBe(0);
			expect(
				await readFile(join(fixture.projectRoot, "task.txt"), "utf8"),
			).toBe("simulateExternalJava\n");
			const javaArgs = await readFile(join(fixture.root, "java.args"), "utf8");
			expect(javaArgs).toContain("-cp");
			expect(javaArgs).toContain("com.example.Robot");
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	test("stop-sim cleans orphaned robot jar processes without a pid file", async () => {
		const root = await mkdtemp(join(tmpdir(), "frc-sim-scripts-"));
		const home = join(root, "home");
		const projectRoot = join(root, "project");
		const robotJar = join(
			projectRoot,
			"build",
			"libs",
			"frc-training-robot.jar",
		);
		await mkdir(join(projectRoot, "build", "libs"), { recursive: true });
		await mkdir(home, { recursive: true });

		const sleeper = Bun.spawn(
			["bash", "-lc", 'exec -a "java -jar $ROBOT_JAR" sleep 60'],
			{
				env: { ...Bun.env, ROBOT_JAR: robotJar },
				stdin: "ignore",
				stdout: "ignore",
				stderr: "ignore",
			},
		);

		try {
			await waitFor(() => processArgs(sleeper.pid).includes(robotJar));

			const stop = Bun.spawn(["bash", join(import.meta.dir, "stop-sim.sh")], {
				env: {
					...Bun.env,
					HOME: home,
					SIM_PID_FILE: join(home, "sim.pid"),
					SIM_PROJECT_ROOT: projectRoot,
				},
				stdin: "ignore",
				stdout: "pipe",
				stderr: "pipe",
			});

			const [exitCode, stdout, stderr] = await Promise.all([
				stop.exited,
				new Response(stop.stdout).text(),
				new Response(stop.stderr).text(),
			]);
			expect(exitCode).toBe(0);
			expect(stderr).toBe("");
			expect(stdout).toContain("sim stopped");

			const sleeperExit = await Promise.race([
				sleeper.exited,
				new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000)),
			]);
			expect(sleeperExit).not.toBeNull();
		} finally {
			try {
				sleeper.kill("SIGKILL");
			} catch {
				// The script should have already stopped it.
			}
			await rm(root, { recursive: true, force: true });
		}
	});

	async function createRunSimFixture(gradlewBody: string[]) {
		const root = await mkdtemp(join(tmpdir(), "frc-run-sim-"));
		const home = join(root, "home");
		const projectRoot = join(root, "project");
		const binDir = join(root, "bin");
		const libDir = join(root, "lib");
		await mkdir(home, { recursive: true });
		await mkdir(projectRoot, { recursive: true });
		await mkdir(binDir, { recursive: true });
		await mkdir(libDir, { recursive: true });
		await writeFile(
			join(projectRoot, "gradlew"),
			["#!/usr/bin/env bash", ...gradlewBody].join("\n"),
			"utf8",
		);
		await chmod(join(projectRoot, "gradlew"), 0o755);
		// Fake `java`: records its args. run-sim.sh exec's it, so it keeps the script's pid.
		await writeFile(
			join(binDir, "java"),
			[
				"#!/usr/bin/env bash",
				'printf "%s\\n" "$@" > "$JAVA_ARGS_FILE"',
				'printf "%s\\n" "$$" > "$JAVA_PID_FILE"',
			].join("\n"),
			"utf8",
		);
		await chmod(join(binDir, "java"), 0o755);

		async function run(mode: string | null) {
			const args = [
				"bash",
				join(import.meta.dir, "run-sim.sh"),
				projectRoot,
				join(home, ".gradle-project-sim"),
				"2",
				"-Xmx64m",
				"-Xmx32m",
				join(root, "missing.init.gradle"),
			];
			if (mode !== null) args.push(mode);
			const proc = Bun.spawn(args, {
				env: {
					...Bun.env,
					HOME: home,
					PATH: `${binDir}:${Bun.env.PATH}`,
					JAVA_ARGS_FILE: join(root, "java.args"),
					JAVA_PID_FILE: join(root, "java.pid"),
				},
				stdin: "ignore",
				stdout: "pipe",
				stderr: "pipe",
			});
			const [exitCode, stdout, stderr] = await Promise.all([
				proc.exited,
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
			]);
			return { exitCode, stdout, stderr, pid: proc.pid };
		}

		return { root, home, projectRoot, libDir, run };
	}

	// gradlew that records its task and produces a runnable sim descriptor + jar.
	const simulatingGradlew = [
		// biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion, not JS template literal
		'printf "%s\\n" "${@: -1}" > "$PWD/gradle.task"',
		"mkdir -p build/sim build/libs",
		'printf \'[{"libraryDir":"%s","extensions":[]}]\' "$PWD/../lib" > build/sim/release_java.json',
		": > build/libs/robot.jar",
	];

	test("run-sim run mode starts the robot without a debug agent or marker", async () => {
		const fixture = await createRunSimFixture(simulatingGradlew);
		try {
			const result = await fixture.run(null);
			expect(result.exitCode).toBe(0);
			expect(
				(
					await readFile(join(fixture.projectRoot, "gradle.task"), "utf8")
				).trim(),
			).toBe("simulateExternalJavaRelease");
			const javaArgs = await readFile(join(fixture.root, "java.args"), "utf8");
			expect(javaArgs).not.toContain("jdwp");
			expect(javaArgs).toContain("-jar");
			expect(
				await readFile(join(fixture.home, "sim-debug.json"), "utf8").catch(
					() => null,
				),
			).toBeNull();
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	test("run-sim debug mode adds a loopback JDWP agent and writes the marker with the JVM pid", async () => {
		const fixture = await createRunSimFixture(simulatingGradlew);
		try {
			const result = await fixture.run("debug");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain(
				"Waiting up to 120s for the editor's debugger to attach on port 5005...",
			);
			const javaArgs = (
				await readFile(join(fixture.root, "java.args"), "utf8")
			).split("\n");
			const agent =
				"-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=127.0.0.1:5005,timeout=120000,quiet=y";
			expect(javaArgs).toContain(agent);
			expect(javaArgs.indexOf(agent)).toBeLessThan(javaArgs.indexOf("-jar"));
			const javaPid = Number(
				(await readFile(join(fixture.root, "java.pid"), "utf8")).trim(),
			);
			expect(javaPid).toBe(result.pid);
			expect(
				JSON.parse(
					await readFile(join(fixture.home, "sim-debug.json"), "utf8"),
				),
			).toEqual({ port: 5005, pid: javaPid });
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	test("run-sim build mode runs gradle build and starts no JVM", async () => {
		const fixture = await createRunSimFixture([
			// biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion, not JS template literal
			'printf "%s\\n" "${@: -1}" > "$PWD/gradle.task"',
		]);
		try {
			const result = await fixture.run("build");
			expect(result.exitCode).toBe(0);
			expect(
				(
					await readFile(join(fixture.projectRoot, "gradle.task"), "utf8")
				).trim(),
			).toBe("build");
			expect(
				await readFile(join(fixture.root, "java.args"), "utf8").catch(
					() => null,
				),
			).toBeNull();
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	test("run-sim reports BUILD FAILED when gradle exits non-zero without saying so", async () => {
		const fixture = await createRunSimFixture(["exit 3"]);
		try {
			const result = await fixture.run("build");
			expect(result.exitCode).toBe(3);
			expect(result.stderr).toContain("BUILD FAILED");
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	test("run-sim rejects an unknown mode", async () => {
		const fixture = await createRunSimFixture(simulatingGradlew);
		try {
			const result = await fixture.run("profile");
			expect(result.exitCode).toBe(64);
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	test("stop-sim removes the debug marker and claims", async () => {
		const root = await mkdtemp(join(tmpdir(), "frc-sim-debug-files-"));
		const home = join(root, "home");
		await mkdir(home, { recursive: true });
		for (const name of ["sim-debug.json", "sim-debug.4242.claim"]) {
			await writeFile(join(home, name), "x", "utf8");
		}
		try {
			const stop = Bun.spawn(["bash", join(import.meta.dir, "stop-sim.sh")], {
				env: {
					...Bun.env,
					HOME: home,
					SIM_PID_FILE: join(home, "sim.pid"),
					SIM_PROJECT_ROOT: join(root, "project"),
				},
				stdin: "ignore",
				stdout: "ignore",
				stderr: "ignore",
			});
			expect(await stop.exited).toBe(0);
			for (const name of ["sim-debug.json", "sim-debug.4242.claim"]) {
				expect(
					await readFile(join(home, name), "utf8").catch(() => null),
				).toBeNull();
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("stop-sim leaves Build-style gradle processes from other cache dirs alone", async () => {
		const root = await mkdtemp(join(tmpdir(), "frc-sim-foreign-gradle-"));
		const home = join(root, "home");
		await mkdir(home, { recursive: true });
		// Same shape as run-sim's Build invocation, but not this workspace's cache dir
		// (e.g. a developer's own process on the host running these tests).
		const fakeArgs = `java -cp gradle-wrapper.jar org.gradle.wrapper.GradleWrapperMain --no-daemon --project-cache-dir ${root}/elsewhere/.gradle-project-sim build`;
		const sleeper = Bun.spawn(
			["bash", "-lc", 'exec -a "$FAKE_ARGS" sleep 60'],
			{
				env: { ...Bun.env, FAKE_ARGS: fakeArgs },
				stdin: "ignore",
				stdout: "ignore",
				stderr: "ignore",
			},
		);
		try {
			await waitFor(() =>
				processArgs(sleeper.pid).includes("GradleWrapperMain"),
			);
			const stop = Bun.spawn(["bash", join(import.meta.dir, "stop-sim.sh")], {
				env: {
					...Bun.env,
					HOME: home,
					SIM_PID_FILE: join(home, "sim.pid"),
					SIM_PROJECT_ROOT: join(root, "project"),
				},
				stdin: "ignore",
				stdout: "ignore",
				stderr: "ignore",
			});
			expect(await stop.exited).toBe(0);
			expect(processArgs(sleeper.pid)).toContain("GradleWrapperMain");
		} finally {
			sleeper.kill("SIGKILL");
			await rm(root, { recursive: true, force: true });
		}
	});

	test("stop-sim cleans an orphaned Build gradle process without a pid file", async () => {
		const root = await mkdtemp(join(tmpdir(), "frc-sim-build-orphan-"));
		const home = join(root, "home");
		await mkdir(home, { recursive: true });
		const fakeArgs = `java -cp gradle-wrapper.jar org.gradle.wrapper.GradleWrapperMain --no-daemon --project-cache-dir ${home}/.gradle-project-sim build`;
		const sleeper = Bun.spawn(
			["bash", "-lc", 'exec -a "$FAKE_ARGS" sleep 60'],
			{
				env: { ...Bun.env, FAKE_ARGS: fakeArgs },
				stdin: "ignore",
				stdout: "ignore",
				stderr: "ignore",
			},
		);
		try {
			await waitFor(() =>
				processArgs(sleeper.pid).includes("GradleWrapperMain"),
			);
			const stop = Bun.spawn(["bash", join(import.meta.dir, "stop-sim.sh")], {
				env: {
					...Bun.env,
					HOME: home,
					SIM_PID_FILE: join(home, "sim.pid"),
					SIM_PROJECT_ROOT: join(root, "project"),
				},
				stdin: "ignore",
				stdout: "pipe",
				stderr: "ignore",
			});
			expect(await stop.exited).toBe(0);
			const sleeperExit = await Promise.race([
				sleeper.exited,
				new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000)),
			]);
			expect(sleeperExit).not.toBeNull();
		} finally {
			try {
				sleeper.kill("SIGKILL");
			} catch {
				// Already stopped by the script.
			}
			await rm(root, { recursive: true, force: true });
		}
	});
});
