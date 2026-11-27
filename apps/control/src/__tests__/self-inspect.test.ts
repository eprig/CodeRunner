import { describe, expect, test } from "bun:test";
import { loadControlConfig } from "../config";
import { selfInspect } from "../containers/self-inspect";
import type { DockerInspectContainer } from "../containers/types";

type Mount = { Type?: string; Source?: string; Destination?: string };

function fakeInspect(
	options: {
		mounts?: Mount[];
		networks?: string[];
		labels?: Record<string, string>;
	} = {},
): DockerInspectContainer {
	const networks: Record<string, unknown> = {};
	for (const name of options.networks ?? []) {
		networks[name] = { NetworkID: `fake-${name}` };
	}
	return {
		Name: "/coderunner-control",
		State: { Running: true, Status: "running" },
		Config: { Labels: options.labels ?? {} },
		Mounts: options.mounts ?? [],
		NetworkSettings: { Ports: {}, Networks: networks },
	};
}

/** A container matching a real network-mode deployment: /data bind + coderunner. */
function containerizedFixture(): DockerInspectContainer {
	return fakeInspect({
		mounts: [
			{
				Type: "bind",
				Source: "/var/run/docker.sock",
				Destination: "/var/run/docker.sock",
			},
			{ Type: "bind", Source: "/srv/coderunner/data", Destination: "/data" },
		],
		// bridge is a default network and must be filtered out.
		networks: ["bridge", "coderunner"],
		labels: {
			"com.docker.compose.project": "coderunner",
			"com.docker.compose.project.working_dir": "/srv/coderunner",
		},
	});
}

describe("selfInspect — host (not containerized)", () => {
	test("returns not-containerized and makes zero docker calls", async () => {
		let inspectCalls = 0;
		const result = await selfInspect({
			dataDir: "/data",
			envHostDataDir: null,
			envContainerNetwork: null,
			envContainerUser: null,
			dockerenvExists: () => false,
			inspect: async () => {
				inspectCalls += 1;
				return null;
			},
			hostname: () => "should-not-be-read",
			stat: () => {
				throw new Error("stat should not be called on the host");
			},
		});

		expect(inspectCalls).toBe(0);
		expect(result).toEqual({
			containerized: false,
			hostDataDir: null,
			containerNetwork: null,
			containerUser: undefined,
			composeProject: null,
			composeWorkingDir: null,
			autoDetected: {
				hostDataDir: false,
				containerNetwork: false,
				containerUser: false,
			},
		});
	});
});

describe("selfInspect — containerized derivation", () => {
	test("derives host data dir, network, and user from the container", async () => {
		const inspectedIds: string[] = [];
		const result = await selfInspect({
			dataDir: "/data",
			envHostDataDir: null,
			envContainerNetwork: null,
			envContainerUser: null,
			dockerenvExists: () => true,
			hostname: () => "abc123",
			inspect: async (id) => {
				inspectedIds.push(id);
				return containerizedFixture();
			},
			stat: () => ({ uid: 1000, gid: 1000 }),
		});

		expect(inspectedIds).toEqual(["abc123"]);
		expect(result).toEqual({
			containerized: true,
			hostDataDir: "/srv/coderunner/data",
			containerNetwork: "coderunner",
			containerUser: "1000:1000",
			composeProject: "coderunner",
			composeWorkingDir: "/srv/coderunner",
			autoDetected: {
				hostDataDir: true,
				containerNetwork: true,
				containerUser: true,
			},
		});
	});

	test("leaves the workspace user undefined when the data dir is root-owned", async () => {
		const result = await selfInspect({
			dataDir: "/data",
			envHostDataDir: null,
			envContainerNetwork: null,
			envContainerUser: null,
			dockerenvExists: () => true,
			hostname: () => "abc123",
			inspect: async () => containerizedFixture(),
			stat: () => ({ uid: 0, gid: 0 }),
		});

		// Root-owned → not derived, so the config root-guard can fire.
		expect(result.containerUser).toBeUndefined();
		expect(result.autoDetected.containerUser).toBe(false);
		// The other two fields are still derived.
		expect(result.hostDataDir).toBe("/srv/coderunner/data");
		expect(result.containerNetwork).toBe("coderunner");
	});

	test("refuses to derive a root uid even with a non-root group", async () => {
		const result = await selfInspect({
			dataDir: "/data",
			envHostDataDir: null,
			envContainerNetwork: null,
			envContainerUser: null,
			dockerenvExists: () => true,
			hostname: () => "abc123",
			inspect: async () => containerizedFixture(),
			stat: () => ({ uid: 0, gid: 1001 }),
		});

		// "0:1001" would still run workspaces as root — not derived either.
		expect(result.containerUser).toBeUndefined();
		expect(result.autoDetected.containerUser).toBe(false);
	});

	test("derives the compose project label so workspaces can nest under it", async () => {
		const result = await selfInspect({
			dataDir: "/data",
			envHostDataDir: null,
			envContainerNetwork: null,
			envContainerUser: null,
			dockerenvExists: () => true,
			hostname: () => "abc123",
			inspect: async () =>
				fakeInspect({
					mounts: [{ Source: "/srv/data", Destination: "/data" }],
					networks: ["coderunner"],
					labels: { "com.docker.compose.project": "my-stack" },
				}),
			stat: () => ({ uid: 1000, gid: 1000 }),
		});

		expect(result.composeProject).toBe("my-stack");
	});

	test("compose project is null when the container carries no compose label", async () => {
		const result = await selfInspect({
			dataDir: "/data",
			envHostDataDir: null,
			envContainerNetwork: null,
			envContainerUser: null,
			dockerenvExists: () => true,
			hostname: () => "abc123",
			inspect: async () =>
				fakeInspect({
					mounts: [{ Source: "/srv/data", Destination: "/data" }],
					networks: ["coderunner"],
					// No labels (e.g. `docker run` outside compose).
				}),
			stat: () => ({ uid: 1000, gid: 1000 }),
		});

		expect(result.composeProject).toBeNull();
	});
});

describe("selfInspect — env overrides win", () => {
	test("all three env values set → nothing is derived, but the label is read", async () => {
		let inspectCalls = 0;
		const result = await selfInspect({
			dataDir: "/data",
			envHostDataDir: "/explicit/data",
			envContainerNetwork: "explicit-net",
			envContainerUser: "500:500",
			dockerenvExists: () => true,
			hostname: () => "abc123",
			inspect: async () => {
				inspectCalls += 1;
				return containerizedFixture();
			},
			stat: () => {
				throw new Error("stat should not be called when the user is explicit");
			},
		});

		expect(inspectCalls).toBe(1);
		expect(result).toEqual({
			containerized: true,
			hostDataDir: "/explicit/data",
			containerNetwork: "explicit-net",
			containerUser: "500:500",
			// Grouping must not depend on whether the other three fields happen
			// to be env-overridden.
			composeProject: "coderunner",
			composeWorkingDir: "/srv/coderunner",
			autoDetected: {
				hostDataDir: false,
				containerNetwork: false,
				containerUser: false,
			},
		});
	});

	test("a failed inspect on the fully-overridden path is not fatal", async () => {
		const result = await selfInspect({
			dataDir: "/data",
			envHostDataDir: "/explicit/data",
			envContainerNetwork: "explicit-net",
			envContainerUser: "500:500",
			dockerenvExists: () => true,
			hostname: () => "abc123",
			inspect: async () => {
				throw new Error("docker socket unavailable");
			},
			stat: () => {
				throw new Error("stat should not be called when the user is explicit");
			},
		});

		// Only the cosmetic label needed the inspect, so startup carries on with
		// workspaces ungrouped rather than hard-failing.
		expect(result.composeProject).toBeNull();
		expect(result.containerized).toBe(true);
		expect(result.hostDataDir).toBe("/explicit/data");
	});

	test("an explicit field keeps its env value while the rest are derived", async () => {
		const result = await selfInspect({
			dataDir: "/data",
			envHostDataDir: null,
			envContainerNetwork: "explicit-net",
			envContainerUser: null,
			dockerenvExists: () => true,
			hostname: () => "abc123",
			inspect: async () => containerizedFixture(),
			stat: () => ({ uid: 1000, gid: 1000 }),
		});

		expect(result.containerNetwork).toBe("explicit-net");
		expect(result.autoDetected.containerNetwork).toBe(false);
		expect(result.hostDataDir).toBe("/srv/coderunner/data");
		expect(result.autoDetected.hostDataDir).toBe(true);
		expect(result.containerUser).toBe("1000:1000");
		expect(result.autoDetected.containerUser).toBe(true);
	});
});

describe("selfInspect — hard errors (never falls back to port mode)", () => {
	test("no mount matching the data dir names FRC_HOST_DATA_DIR", async () => {
		await expect(
			selfInspect({
				dataDir: "/data",
				envHostDataDir: null,
				envContainerNetwork: null,
				envContainerUser: null,
				dockerenvExists: () => true,
				hostname: () => "abc123",
				inspect: async () =>
					fakeInspect({
						mounts: [{ Type: "bind", Source: "/x", Destination: "/other" }],
						networks: ["coderunner"],
					}),
				stat: () => ({ uid: 1000, gid: 1000 }),
			}),
		).rejects.toThrow(/FRC_HOST_DATA_DIR/);
	});

	test("zero user-defined networks names FRC_CONTAINER_NETWORK", async () => {
		await expect(
			selfInspect({
				dataDir: "/data",
				envHostDataDir: null,
				envContainerNetwork: null,
				envContainerUser: null,
				dockerenvExists: () => true,
				hostname: () => "abc123",
				inspect: async () =>
					fakeInspect({
						mounts: [{ Source: "/srv/data", Destination: "/data" }],
						networks: ["bridge"],
					}),
				stat: () => ({ uid: 1000, gid: 1000 }),
			}),
		).rejects.toThrow(/FRC_CONTAINER_NETWORK/);
	});

	test("multiple user-defined networks names FRC_CONTAINER_NETWORK and lists them", async () => {
		let error: Error | null = null;
		try {
			await selfInspect({
				dataDir: "/data",
				envHostDataDir: null,
				envContainerNetwork: null,
				envContainerUser: null,
				dockerenvExists: () => true,
				hostname: () => "abc123",
				inspect: async () =>
					fakeInspect({
						mounts: [{ Source: "/srv/data", Destination: "/data" }],
						networks: ["coderunner", "extra-net"],
					}),
				stat: () => ({ uid: 1000, gid: 1000 }),
			});
		} catch (err) {
			error = err as Error;
		}
		expect(error?.message).toMatch(/FRC_CONTAINER_NETWORK/);
		expect(error?.message).toMatch(/coderunner/);
		expect(error?.message).toMatch(/extra-net/);
	});

	test("a null inspect result names all three env vars", async () => {
		let error: Error | null = null;
		try {
			await selfInspect({
				dataDir: "/data",
				envHostDataDir: null,
				envContainerNetwork: null,
				envContainerUser: null,
				dockerenvExists: () => true,
				hostname: () => "abc123",
				inspect: async () => null,
				stat: () => ({ uid: 1000, gid: 1000 }),
			});
		} catch (err) {
			error = err as Error;
		}
		expect(error?.message).toMatch(/FRC_HOST_DATA_DIR/);
		expect(error?.message).toMatch(/FRC_CONTAINER_NETWORK/);
		expect(error?.message).toMatch(/FRC_CONTAINER_USER/);
	});

	test("an inspect exception is wrapped with the manual-override guidance", async () => {
		await expect(
			selfInspect({
				dataDir: "/data",
				envHostDataDir: null,
				envContainerNetwork: null,
				envContainerUser: null,
				dockerenvExists: () => true,
				hostname: () => "abc123",
				inspect: async () => {
					throw new Error("daemon unreachable");
				},
				stat: () => ({ uid: 1000, gid: 1000 }),
			}),
		).rejects.toThrow(/daemon unreachable/);
	});
});

describe("config root-guard interaction with stat derivation", () => {
	test("a root-owned data dir leaves the guard to reject with the chown fix", () => {
		// selfInspect returns containerUser: undefined for a root-owned data dir
		// (verified above). main.ts then passes no explicit user, and — running as
		// root inside the container — loadControlConfig's defaultContainerUser
		// resolves to 0:0 and the guard fires. Simulate root here.
		const proc = process as unknown as {
			getuid: () => number;
			getgid: () => number;
		};
		const originalGetuid = proc.getuid;
		const originalGetgid = proc.getgid;
		const savedEnv = {
			FRC_CONTAINER_USER: Bun.env.FRC_CONTAINER_USER,
			FRC_UID: Bun.env.FRC_UID,
			FRC_GID: Bun.env.FRC_GID,
		};
		proc.getuid = () => 0;
		proc.getgid = () => 0;
		// Assigning undefined coerces to the string "undefined" — delete instead.
		delete Bun.env.FRC_CONTAINER_USER;
		delete Bun.env.FRC_UID;
		delete Bun.env.FRC_GID;
		try {
			let error: Error | null = null;
			try {
				loadControlConfig({ containerNetwork: "coderunner" });
			} catch (err) {
				error = err as Error;
			}
			expect(error?.message).toMatch(/chown/);
			expect(error?.message).toMatch(/FRC_CONTAINER_USER/);
		} finally {
			proc.getuid = originalGetuid;
			proc.getgid = originalGetgid;
			restoreEnv(savedEnv);
		}
	});
});

function restoreEnv(saved: Record<string, string | undefined>): void {
	for (const [key, value] of Object.entries(saved)) {
		if (value === undefined) {
			delete Bun.env[key];
		} else {
			Bun.env[key] = value;
		}
	}
}
