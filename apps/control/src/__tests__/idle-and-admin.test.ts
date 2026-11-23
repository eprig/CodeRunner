import { describe, expect, test } from "bun:test";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { codeContainerName } from "../containers/metadata";
import {
	cookieFrom,
	createFakeDocker,
	exists,
	login,
	withApp,
	workspaceBySlug,
	workspaceProjectPath,
} from "./helpers";

describe("idle lifecycle and admin controls", () => {
	test("heartbeat touches container lease activity", async () => {
		const fakeDocker = createFakeDocker();
		await withApp(
			async (app) => {
				const response = await login(app, "alice");
				const cookie = cookieFrom(response);
				const workspace = workspaceBySlug(app, "alice");

				await app.containers.ensureCodeContainer(workspace);

				const leaseBefore = app.storage.getContainerLease(workspace.id);
				expect(leaseBefore).toBeTruthy();
				const lastUsedBefore = leaseBefore!.last_used_at;

				await Bun.sleep(20);

				const heartbeat = await app.fetch(
					new Request("http://localhost/u/alice/api/heartbeat", {
						method: "POST",
						headers: { cookie, "content-type": "application/json" },
						body: "{}",
					}),
				);
				expect(heartbeat.status).toBe(200);
				const body = (await heartbeat.json()) as { ok: boolean };
				expect(body.ok).toBe(true);

				const leaseAfter = app.storage.getContainerLease(workspace.id);
				expect(leaseAfter).toBeTruthy();
				expect(leaseAfter!.last_used_at >= lastUsedBefore).toBe(true);
			},
			{
				dockerRunner: fakeDocker.runner,
				codeImage: "coderunner-workspace:test",
				simPortRange: { start: 25980, end: 25980 },
				vscodePortRange: { start: 33120, end: 33120 },
			},
		);
	});

	test("heartbeat accepts a closing flag", async () => {
		await withApp(async (app) => {
			const response = await login(app, "alice");
			const cookie = cookieFrom(response);

			const heartbeat = await app.fetch(
				new Request("http://localhost/u/alice/api/heartbeat", {
					method: "POST",
					headers: { cookie, "content-type": "application/json" },
					body: JSON.stringify({ closing: true }),
				}),
			);
			expect(heartbeat.status).toBe(200);
			const body = (await heartbeat.json()) as {
				ok: boolean;
				closing: boolean;
			};
			expect(body.ok).toBe(true);
			expect(body.closing).toBe(true);
		});
	});

	test("admin status returns workspace and container info", async () => {
		const fakeDocker = createFakeDocker();
		await withApp(
			async (app) => {
				const admin = await login(app, "alice", { role: "admin" });
				const adminCookie = cookieFrom(admin);
				await login(app, "bob");

				const status = await app.fetch(
					new Request("http://localhost/admin/status", {
						headers: { cookie: adminCookie },
					}),
				);
				expect(status.status).toBe(200);
				const body = (await status.json()) as {
					ok: boolean;
					workspaces: Array<{
						workspace: { slug: string };
						user: { displayName: string };
					}>;
					idleStopMinutes: number;
					activeBuilds: number;
				};
				expect(body.ok).toBe(true);
				expect(body.workspaces.length).toBe(2);
				const slugs = body.workspaces.map((w) => w.workspace.slug).sort();
				expect(slugs).toEqual(["alice", "bob"]);
				expect(body.idleStopMinutes).toBe(30);
				expect(body.activeBuilds).toBe(0);
			},
			{ dockerRunner: fakeDocker.runner },
		);
	});

	test("admin shell requires an admin session and serves assets from /admin/", async () => {
		await withApp(async (app) => {
			const student = await login(app, "student");
			const studentCookie = cookieFrom(student);
			const admin = await login(app, "coach", { role: "admin" });
			const adminCookie = cookieFrom(admin);

			const anonymous = await app.fetch(new Request("http://localhost/admin"));
			expect(anonymous.status).toBe(401);

			const studentResponse = await app.fetch(
				new Request("http://localhost/admin", {
					headers: { cookie: studentCookie },
				}),
			);
			expect(studentResponse.status).toBe(403);

			const redirect = await app.fetch(
				new Request("http://localhost/admin", {
					headers: { cookie: adminCookie },
				}),
			);
			expect(redirect.status).toBe(308);
			expect(redirect.headers.get("location")).toBe("/admin/");

			const shell = await app.fetch(
				new Request("http://localhost/admin/", {
					headers: { cookie: adminCookie },
				}),
			);
			expect(shell.status).toBe(200);
			expect(await shell.text()).toContain("V2 test shell");

			const asset = await app.fetch(
				new Request("http://localhost/admin/assets/app.js", {
					headers: { cookie: adminCookie },
				}),
			);
			expect(asset.status).toBe(200);
		});
	});

	test("admin status is rejected with wrong token when adminToken is configured", async () => {
		await withApp(
			async (app) => {
				const admin = await login(app, "alice", { role: "admin" });
				const adminCookie = cookieFrom(admin);

				const noToken = await app.fetch(
					new Request("http://localhost/admin/status"),
				);
				expect(noToken.status).toBe(401);

				const wrongToken = await app.fetch(
					new Request("http://localhost/admin/status", {
						headers: { authorization: "Bearer wrong-token" },
					}),
				);
				expect(wrongToken.status).toBe(401);

				const correctToken = await app.fetch(
					new Request("http://localhost/admin/status", {
						headers: { authorization: "Bearer test-admin-token" },
					}),
				);
				expect(correctToken.status).toBe(200);

				const adminSession = await app.fetch(
					new Request("http://localhost/admin/status", {
						headers: { cookie: adminCookie },
					}),
				);
				expect(adminSession.status).toBe(200);
			},
			{ adminToken: "test-admin-token" },
		);
	});

	test("admin can restart a code container", async () => {
		const fakeDocker = createFakeDocker();
		await withApp(
			async (app) => {
				const admin = await login(app, "alice", { role: "admin" });
				const adminCookie = cookieFrom(admin);
				const workspace = workspaceBySlug(app, "alice");

				await app.containers.ensureCodeContainer(workspace);
				expect(fakeDocker.containers.has(codeContainerName(workspace.id))).toBe(
					true,
				);

				const response = await app.fetch(
					new Request(
						`http://localhost/admin/workspaces/${workspace.id}/restart-code`,
						{
							method: "POST",
							headers: { cookie: adminCookie },
						},
					),
				);
				expect(response.status).toBe(200);
				const body = (await response.json()) as { ok: boolean; action: string };
				expect(body.ok).toBe(true);
				expect(body.action).toBe("restart-code");

				expect(fakeDocker.containers.has(codeContainerName(workspace.id))).toBe(
					true,
				);
				expect(
					fakeDocker.containers.get(codeContainerName(workspace.id))?.running,
				).toBe(true);
			},
			{
				dockerRunner: fakeDocker.runner,
				codeImage: "coderunner-workspace:test",
				simPortRange: { start: 25981, end: 25982 },
				vscodePortRange: { start: 33121, end: 33122 },
			},
		);
	});

	test("admin can stop all containers for a workspace", async () => {
		const fakeDocker = createFakeDocker();
		await withApp(
			async (app) => {
				const admin = await login(app, "alice", { role: "admin" });
				const adminCookie = cookieFrom(admin);
				const workspace = workspaceBySlug(app, "alice");

				await app.containers.ensureCodeContainer(workspace);
				expect(
					fakeDocker.containers.get(codeContainerName(workspace.id))?.running,
				).toBe(true);

				const response = await app.fetch(
					new Request(
						`http://localhost/admin/workspaces/${workspace.id}/stop-containers`,
						{
							method: "POST",
							headers: { cookie: adminCookie },
						},
					),
				);
				expect(response.status).toBe(200);
				const body = (await response.json()) as { ok: boolean; action: string };
				expect(body.ok).toBe(true);
				expect(body.action).toBe("stop-containers");

				expect(
					fakeDocker.containers.get(codeContainerName(workspace.id))?.running,
				).toBe(false);
			},
			{
				dockerRunner: fakeDocker.runner,
				codeImage: "coderunner-workspace:test",
				simPortRange: { start: 25987, end: 25988 },
				vscodePortRange: { start: 33127, end: 33128 },
			},
		);
	});

	test("admin returns 404 for unknown workspace", async () => {
		await withApp(async (app) => {
			const admin = await login(app, "alice", { role: "admin" });
			const adminCookie = cookieFrom(admin);

			const response = await app.fetch(
				new Request(
					"http://localhost/admin/workspaces/ws_0000000000000000deadbeef00000000/restart-code",
					{
						method: "POST",
						headers: { cookie: adminCookie },
					},
				),
			);
			expect(response.status).toBe(404);
		});
	});

	test("admin backup creates a backup of a workspace project", async () => {
		await withApp(async (app) => {
			const admin = await login(app, "alice", { role: "admin" });
			const adminCookie = cookieFrom(admin);
			const workspace = workspaceBySlug(app, "alice");

			const response = await app.fetch(
				new Request(
					`http://localhost/admin/workspaces/${workspace.id}/backup`,
					{
						method: "POST",
						headers: { cookie: adminCookie },
					},
				),
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				ok: boolean;
				action: string;
				detail: string;
			};
			expect(body.ok).toBe(true);
			expect(body.action).toBe("backup");

			// Verify backup archive was created.
			const backupsDir = join(app.storage.config.dataDir, "backups");
			const backupDirs = await readdir(backupsDir);
			expect(backupDirs.length).toBeGreaterThan(0);

			const latestBackup = backupDirs.sort().at(-1)!;
			const backedUpProject = join(
				backupsDir,
				latestBackup,
				workspace.id,
				"project.tar.gz",
			);
			expect(await exists(backedUpProject)).toBe(true);
		});
	});

	test("admin restore restores a workspace project from backup", async () => {
		await withApp(async (app) => {
			const admin = await login(app, "alice", { role: "admin" });
			const adminCookie = cookieFrom(admin);
			const workspace = workspaceBySlug(app, "alice");
			const projectPath = workspaceProjectPath(app, "alice");

			// The workspace project starts empty (no first-login seed). Seed some
			// content so backup/restore has something to round-trip.
			await mkdir(join(projectPath, "src", "main", "java", "frc", "robot"), {
				recursive: true,
			});
			await writeFile(
				join(projectPath, "build.gradle"),
				"plugins {}\n",
				"utf8",
			);

			// First backup.
			const backupResponse = await app.fetch(
				new Request(
					`http://localhost/admin/workspaces/${workspace.id}/backup`,
					{
						method: "POST",
						headers: { cookie: adminCookie },
					},
				),
			);
			expect(backupResponse.status).toBe(200);

			// Write a marker file into the project.
			await writeFile(
				join(projectPath, "src", "main", "java", "frc", "robot", "Marker.java"),
				"marker\n",
				"utf8",
			);
			expect(
				await exists(
					join(
						projectPath,
						"src",
						"main",
						"java",
						"frc",
						"robot",
						"Marker.java",
					),
				),
			).toBe(true);

			// Find backup path.
			const backupsDir = join(app.storage.config.dataDir, "backups");
			const backupDirs = await readdir(backupsDir);
			const latestBackup = backupDirs.sort().at(-1)!;
			const restorePath = join(
				backupsDir,
				latestBackup,
				workspace.id,
				"project.tar.gz",
			);

			// Restore should overwrite project from backup (which has no Marker.java).
			const response = await app.fetch(
				new Request(
					`http://localhost/admin/workspaces/${workspace.id}/restore`,
					{
						method: "POST",
						headers: {
							cookie: adminCookie,
							"content-type": "application/json",
						},
						body: JSON.stringify({ path: restorePath }),
					},
				),
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as { ok: boolean; action: string };
			expect(body.ok).toBe(true);
			expect(body.action).toBe("restore");

			// The base template file should still exist.
			expect(await exists(join(projectPath, "build.gradle"))).toBe(true);
			expect(
				await exists(
					join(
						projectPath,
						"src",
						"main",
						"java",
						"frc",
						"robot",
						"Marker.java",
					),
				),
			).toBe(false);
		});
	});

	test("admin restore rejects paths outside data/backups/", async () => {
		await withApp(async (app) => {
			const admin = await login(app, "alice", { role: "admin" });
			const adminCookie = cookieFrom(admin);
			const workspace = workspaceBySlug(app, "alice");

			const response = await app.fetch(
				new Request(
					`http://localhost/admin/workspaces/${workspace.id}/restore`,
					{
						method: "POST",
						headers: {
							cookie: adminCookie,
							"content-type": "application/json",
						},
						body: JSON.stringify({ path: "/tmp/evil" }),
					},
				),
			);
			expect(response.status).toBe(403);
		});
	});

	test("student file API routes stay unavailable", async () => {
		await withApp(async (app) => {
			const response = await login(app, "alice");
			const cookie = cookieFrom(response);

			const fileRead = await app.fetch(
				new Request(
					"http://localhost/u/alice/api/files?path=src/main/java/frc/robot/Robot.java",
					{
						headers: { cookie },
					},
				),
			);
			expect(fileRead.status).toBe(404);

			const treeRead = await app.fetch(
				new Request("http://localhost/u/alice/api/project/tree", {
					headers: { cookie },
				}),
			);
			expect(treeRead.status).toBe(404);
		});
	});

	test("idle sweep stops containers for idle workspaces", async () => {
		const fakeDocker = createFakeDocker();
		await withApp(
			async (app) => {
				await login(app, "alice");
				const workspace = workspaceBySlug(app, "alice");

				await app.containers.ensureCodeContainer(workspace);
				expect(
					fakeDocker.containers.get(codeContainerName(workspace.id))?.running,
				).toBe(true);

				const pastTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
				app.storage.db
					.query("UPDATE workspaces SET last_accessed_at = ? WHERE id = ?")
					.run(pastTime, workspace.id);

				const stopped = await app.idle.sweep();
				expect(stopped).toContain(workspace.id);

				expect(
					fakeDocker.containers.get(codeContainerName(workspace.id))?.running,
				).toBe(false);
			},
			{
				dockerRunner: fakeDocker.runner,
				codeImage: "coderunner-workspace:test",
				simPortRange: { start: 25989, end: 25990 },
				vscodePortRange: { start: 33129, end: 33130 },
				idleStopMinutes: 30,
			},
		);
	});

	test("idle sweep does not stop active workspaces", async () => {
		const fakeDocker = createFakeDocker();
		await withApp(
			async (app) => {
				await login(app, "alice");
				const workspace = workspaceBySlug(app, "alice");

				await app.containers.ensureCodeContainer(workspace);
				expect(
					fakeDocker.containers.get(codeContainerName(workspace.id))?.running,
				).toBe(true);

				const stopped = await app.idle.sweep();
				expect(stopped).not.toContain(workspace.id);
				expect(
					fakeDocker.containers.get(codeContainerName(workspace.id))?.running,
				).toBe(true);
			},
			{
				dockerRunner: fakeDocker.runner,
				codeImage: "coderunner-workspace:test",
				simPortRange: { start: 25991, end: 25992 },
				vscodePortRange: { start: 33131, end: 33132 },
				idleStopMinutes: 30,
			},
		);
	});

	test("returning user gets new containers after idle teardown", async () => {
		const fakeDocker = createFakeDocker();
		await withApp(
			async (app) => {
				await login(app, "alice");
				const workspace = workspaceBySlug(app, "alice");

				// The bind-mounted project dir persists across teardown. Write a
				// marker into it (the project starts empty — no first-login seed).
				await writeFile(
					join(workspace.project_path, "Marker.java"),
					"marker\n",
					"utf8",
				);

				await app.containers.ensureCodeContainer(workspace);

				await app.containers.stopWorkspaceContainers(workspace.id);
				await app.containers.removeCodeContainer(workspace.id);
				expect(fakeDocker.containers.has(codeContainerName(workspace.id))).toBe(
					false,
				);

				expect(await exists(join(workspace.project_path, "Marker.java"))).toBe(
					true,
				);

				await app.containers.ensureCodeContainer(workspace);
				expect(fakeDocker.containers.has(codeContainerName(workspace.id))).toBe(
					true,
				);
				expect(
					fakeDocker.containers.get(codeContainerName(workspace.id))?.running,
				).toBe(true);
			},
			{
				dockerRunner: fakeDocker.runner,
				codeImage: "coderunner-workspace:test",
				simPortRange: { start: 25993, end: 25994 },
				vscodePortRange: { start: 33133, end: 33134 },
			},
		);
	});

	test("cleanup removes stopped managed containers", async () => {
		const fakeDocker = createFakeDocker();
		await withApp(
			async (app) => {
				await login(app, "alice");
				const workspace = workspaceBySlug(app, "alice");

				await app.containers.ensureCodeContainer(workspace);
				await app.containers.stopCodeContainer(workspace.id);
				expect(
					fakeDocker.containers.get(codeContainerName(workspace.id))?.running,
				).toBe(false);

				const removed = await app.containers.cleanupStoppedContainers();
				expect(removed).toContain(codeContainerName(workspace.id));
				expect(fakeDocker.containers.has(codeContainerName(workspace.id))).toBe(
					false,
				);
			},
			{
				dockerRunner: fakeDocker.runner,
				codeImage: "coderunner-workspace:test",
				simPortRange: { start: 25995, end: 25996 },
				vscodePortRange: { start: 33135, end: 33136 },
			},
		);
	});

	test("operator restart does not affect other student's containers", async () => {
		const fakeDocker = createFakeDocker();
		await withApp(
			async (app) => {
				const admin = await login(app, "alice", { role: "admin" });
				const adminCookie = cookieFrom(admin);
				await login(app, "bob");
				const aliceWorkspace = workspaceBySlug(app, "alice");
				const bobWorkspace = workspaceBySlug(app, "bob");

				await Promise.all([
					app.containers.ensureCodeContainer(aliceWorkspace),
					app.containers.ensureCodeContainer(bobWorkspace),
				]);

				expect(
					fakeDocker.containers.get(codeContainerName(aliceWorkspace.id))
						?.running,
				).toBe(true);
				expect(
					fakeDocker.containers.get(codeContainerName(bobWorkspace.id))
						?.running,
				).toBe(true);

				const response = await app.fetch(
					new Request(
						`http://localhost/admin/workspaces/${bobWorkspace.id}/restart-code`,
						{
							method: "POST",
							headers: { cookie: adminCookie },
						},
					),
				);
				expect(response.status).toBe(200);

				expect(
					fakeDocker.containers.get(codeContainerName(aliceWorkspace.id))
						?.running,
				).toBe(true);
				expect(
					fakeDocker.containers.get(codeContainerName(bobWorkspace.id))
						?.running,
				).toBe(true);
			},
			{
				dockerRunner: fakeDocker.runner,
				codeImage: "coderunner-workspace:test",
				simPortRange: { start: 25800, end: 25809 },
				vscodePortRange: { start: 33140, end: 33149 },
			},
		);
	});

	test("admin users endpoint lists users", async () => {
		await withApp(async (app) => {
			const admin = await login(app, "alice", { role: "admin" });
			const adminCookie = cookieFrom(admin);
			await login(app, "bob");

			const response = await app.fetch(
				new Request("http://localhost/admin/users", {
					headers: { cookie: adminCookie },
				}),
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				ok: boolean;
				users: Array<{ email: string; role: string }>;
			};
			expect(body.ok).toBe(true);
			// Bootstrap admins from the operator's .env may also be present.
			const emails = body.users
				.map((u) => u.email)
				.filter((email) => email.endsWith("@test.local"))
				.sort();
			expect(emails).toEqual(["alice@test.local", "bob@test.local"]);
		});
	});

	test("admin users distinguishes onboarding pending from a password reset", async () => {
		await withApp(async (app) => {
			const admin = await login(app, "alice", { role: "admin" });
			const adminCookie = cookieFrom(admin);
			await login(app, "bob");
			const bob = app.storage.db
				.query("SELECT id FROM user WHERE email = ?")
				.get("bob@test.local") as { id: string };

			const reset = await app.fetch(
				new Request(`http://localhost/admin/users/${bob.id}/reset-password`, {
					method: "POST",
					headers: { cookie: adminCookie },
				}),
			);
			expect(reset.status).toBe(200);

			const response = await app.fetch(
				new Request("http://localhost/admin/users", {
					headers: { cookie: adminCookie },
				}),
			);
			const body = (await response.json()) as {
				users: Array<{
					email: string;
					mustChangePassword: boolean;
					passwordReset: boolean;
					pending: boolean;
				}>;
			};
			const bobRow = body.users.find((u) => u.email === "bob@test.local");
			expect(bobRow).toMatchObject({
				mustChangePassword: true,
				passwordReset: true,
				pending: true,
			});
		});
	});

	test("admin stats and disk usage endpoints report managed resources", async () => {
		const fakeDocker = createFakeDocker();
		await withApp(
			async (app) => {
				const admin = await login(app, "alice", { role: "admin" });
				const adminCookie = cookieFrom(admin);
				const workspace = workspaceBySlug(app, "alice");
				// The project starts empty; write a file so disk-usage is non-zero.
				await writeFile(
					join(workspace.project_path, "README.md"),
					"# project\n",
					"utf8",
				);
				await app.containers.ensureCodeContainer(workspace);

				const stats = await app.fetch(
					new Request("http://localhost/admin/containers/stats", {
						headers: { cookie: adminCookie },
					}),
				);
				expect(stats.status).toBe(200);
				const statsBody = (await stats.json()) as {
					ok: boolean;
					containers: Array<{
						workspaceSlug: string | null;
						ports: { nt4: number | null; vscode: number | null };
					}>;
				};
				expect(statsBody.ok).toBe(true);
				expect(statsBody.containers[0]?.workspaceSlug).toBe("alice");
				expect(statsBody.containers[0]?.ports.nt4).toBe(25970);
				expect(statsBody.containers[0]?.ports.vscode).toBe(33110);

				const disk = await app.fetch(
					new Request("http://localhost/admin/workspaces/disk-usage", {
						headers: { cookie: adminCookie },
					}),
				);
				expect(disk.status).toBe(200);
				const diskBody = (await disk.json()) as {
					ok: boolean;
					workspaces: Array<{ workspaceSlug: string; bytes: number }>;
				};
				expect(diskBody.ok).toBe(true);
				expect(
					diskBody.workspaces.find((entry) => entry.workspaceSlug === "alice")
						?.bytes,
				).toBeGreaterThan(0);
			},
			{
				dockerRunner: fakeDocker.runner,
				codeImage: "coderunner-workspace:test",
				simPortRange: { start: 25970, end: 25970 },
				vscodePortRange: { start: 33110, end: 33110 },
				halsimPortRange: { start: 34110, end: 34110 },
			},
		);
	});

	test("admin can promote and demote users", async () => {
		await withApp(async (app) => {
			const admin = await login(app, "alice", { role: "admin" });
			const adminCookie = cookieFrom(admin);
			await login(app, "bob");
			const user = app.storage.db
				.query("SELECT id, role FROM user WHERE email = ?")
				.get("bob@test.local") as {
				id: string;
				role: string;
			};
			expect(user.role).toBe("student");

			const promote = await app.fetch(
				new Request(`http://localhost/admin/users/${user.id}/promote`, {
					method: "POST",
					headers: { cookie: adminCookie },
				}),
			);
			expect(promote.status).toBe(200);
			const body = (await promote.json()) as { ok: boolean; role: string };
			expect(body.role).toBe("admin");

			const after = app.storage.db
				.query("SELECT role FROM user WHERE id = ?")
				.get(user.id) as { role: string };
			expect(after.role).toBe("admin");

			const demote = await app.fetch(
				new Request(`http://localhost/admin/users/${user.id}/demote`, {
					method: "POST",
					headers: { cookie: adminCookie },
				}),
			);
			expect(demote.status).toBe(200);
			const dBody = (await demote.json()) as { ok: boolean; role: string };
			expect(dBody.role).toBe("student");
		});
	});

	test("admin can delete a user and their workspace", async () => {
		const fakeDocker = createFakeDocker();
		await withApp(
			async (app) => {
				const admin = await login(app, "alice", { role: "admin" });
				const adminCookie = cookieFrom(admin);
				await login(app, "bob");
				const bobWorkspace = workspaceBySlug(app, "bob");
				await app.containers.ensureCodeContainer(bobWorkspace);
				expect(
					fakeDocker.containers.has(codeContainerName(bobWorkspace.id)),
				).toBe(true);

				const bob = app.storage.db
					.query("SELECT id FROM user WHERE email = ?")
					.get("bob@test.local") as { id: string };
				const response = await app.fetch(
					new Request(`http://localhost/admin/users/${bob.id}`, {
						method: "DELETE",
						headers: { cookie: adminCookie },
					}),
				);
				expect(response.status).toBe(200);
				expect(
					app.storage.db
						.query("SELECT id FROM workspaces WHERE slug = ?")
						.get("bob"),
				).toBeNull();
				expect(
					app.storage.db.query("SELECT id FROM user WHERE id = ?").get(bob.id),
				).toBeNull();
				expect(
					fakeDocker.containers.has(codeContainerName(bobWorkspace.id)),
				).toBe(false);
				expect(await exists(bobWorkspace.project_path)).toBe(false);
			},
			{
				dockerRunner: fakeDocker.runner,
				codeImage: "coderunner-workspace:test",
				simPortRange: { start: 25971, end: 25972 },
				vscodePortRange: { start: 33111, end: 33112 },
				halsimPortRange: { start: 34111, end: 34112 },
			},
		);
	});

	test("admin allowlist manages roster users and domains", async () => {
		await withApp(async (app) => {
			const admin = await login(app, "alice", { role: "admin" });
			const adminCookie = cookieFrom(admin);

			// List — domains and people are separate surfaces.
			const list = await app.fetch(
				new Request("http://localhost/admin/allowlist", {
					headers: { cookie: adminCookie },
				}),
			);
			expect(list.status).toBe(200);
			const body = (await list.json()) as {
				ok: boolean;
				domains: string[];
				users: Array<{ id: string; email: string }>;
			};
			expect(body.domains).toEqual([]);
			expect(body.users.some((u) => u.email === "test@example.com")).toBe(
				false,
			);

			// Add a person: the response carries the one-time temp password.
			const add = await app.fetch(
				new Request("http://localhost/admin/allowlist", {
					method: "POST",
					headers: { cookie: adminCookie, "content-type": "application/json" },
					body: JSON.stringify({ email: "test@example.com" }),
				}),
			);
			expect(add.status).toBe(200);
			const addBody = (await add.json()) as {
				ok: boolean;
				user: { id: string; email: string };
				temporaryPassword: string;
			};
			expect(addBody.user.email).toBe("test@example.com");
			expect(addBody.temporaryPassword.length).toBeGreaterThanOrEqual(8);

			// Remove the pending roster row by id.
			const del = await app.fetch(
				new Request(
					`http://localhost/admin/allowlist/${encodeURIComponent(addBody.user.id)}?kind=user`,
					{ method: "DELETE", headers: { cookie: adminCookie } },
				),
			);
			expect(del.status).toBe(200);
			const delBody = (await del.json()) as {
				users: Array<{ id: string }>;
			};
			expect(delBody.users.some((u) => u.id === addBody.user.id)).toBe(false);

			// Domains are still file-backed.
			const domain = await app.fetch(
				new Request("http://localhost/admin/allowlist", {
					method: "POST",
					headers: { cookie: adminCookie, "content-type": "application/json" },
					body: JSON.stringify({ kind: "domain", value: "example.com" }),
				}),
			);
			expect(domain.status).toBe(200);
			const domainBody = (await domain.json()) as { domains: string[] };
			expect(domainBody.domains).toContain("example.com");
		});
	});

	test("admin edits roster identities without duplicating users", async () => {
		await withApp(async (app) => {
			const admin = await login(app, "alice", { role: "admin" });
			const adminCookie = cookieFrom(admin);
			const post = (path: string, body: unknown) =>
				app.fetch(
					new Request(`http://localhost${path}`, {
						method: "POST",
						headers: {
							cookie: adminCookie,
							"content-type": "application/json",
						},
						body: JSON.stringify(body),
					}),
				);

			const added = await post("/admin/allowlist", { username: "kid" });
			const addedBody = (await added.json()) as { user: { id: string } };
			const userId = addedBody.user.id;

			// The Add user sheet sends createOnly so an existing row cannot be
			// silently changed (or have its password rotated) by a second add.
			const duplicate = await post("/admin/allowlist", {
				username: "kid",
				createOnly: true,
			});
			expect(duplicate.status).toBe(409);

			// Both the Add and Edit sheets must keep at least one identity.
			const missing = await post("/admin/allowlist", {
				username: "",
				email: "",
				createOnly: true,
			});
			expect(missing.status).toBe(400);
			const cleared = await post(`/admin/users/${userId}/identity`, {
				username: "",
				email: "",
			});
			expect(cleared.status).toBe(400);

			const edited = await post(`/admin/users/${userId}/identity`, {
				username: "kid2",
				email: "kid@team.test",
				displayName: "Kid Two",
			});
			expect(edited.status).toBe(200);
			const editedBody = (await edited.json()) as {
				user: { id: string; name: string; username: string; email: string };
			};
			expect(editedBody.user.id).toBe(userId);
			expect(editedBody.user.name).toBe("Kid Two");
			expect(editedBody.user.username).toBe("kid2");
			expect(editedBody.user.email).toBe("kid@team.test");

			// A blank display name leaves the existing one alone.
			const blankName = await post(`/admin/users/${userId}/identity`, {
				displayName: "   ",
			});
			expect(blankName.status).toBe(200);
			const blankNameBody = (await blankName.json()) as {
				user: { name: string };
			};
			expect(blankNameBody.user.name).toBe("Kid Two");

			// A reserved synthetic email follows a username-only rename.
			const renamed = await post("/admin/allowlist", {
				username: "placeholder",
				createOnly: true,
			});
			const renamedBody = (await renamed.json()) as {
				user: { id: string; email: string };
			};
			const synthetic = await post(
				`/admin/users/${renamedBody.user.id}/identity`,
				{ username: "renamed" },
			);
			const syntheticBody = (await synthetic.json()) as {
				user: { email: string };
			};
			expect(syntheticBody.user.email).toBe(
				"renamed@students.coderunner.invalid",
			);

			// Names already owned by someone else are rejected.
			const conflict = await post(`/admin/users/${userId}/identity`, {
				username: "kid2",
				email: "renamed@students.coderunner.invalid",
			});
			expect(conflict.status).toBe(409);
			const userCount = app.storage.db
				.query("SELECT COUNT(*) AS count FROM user WHERE username = ?")
				.get("kid2") as { count: number };
			expect(userCount.count).toBe(1);
		});
	});

	test("admin endpoints are gated when adminToken is set", async () => {
		await withApp(
			async (app) => {
				const student = await login(app, "alice");
				const studentCookie = cookieFrom(student);
				const admin = await login(app, "coach", { role: "admin" });
				const adminCookie = cookieFrom(admin);

				// No token → 401
				const noAuth = await app.fetch(
					new Request("http://localhost/admin/users"),
				);
				expect(noAuth.status).toBe(401);

				// Wrong token → 401
				const wrongAuth = await app.fetch(
					new Request("http://localhost/admin/users", {
						headers: { authorization: "Bearer wrong" },
					}),
				);
				expect(wrongAuth.status).toBe(401);

				const studentAuth = await app.fetch(
					new Request("http://localhost/admin/users", {
						headers: { cookie: studentCookie },
					}),
				);
				expect(studentAuth.status).toBe(403);

				// Correct token → 200
				const goodAuth = await app.fetch(
					new Request("http://localhost/admin/users", {
						headers: { authorization: "Bearer test-admin-token" },
					}),
				);
				expect(goodAuth.status).toBe(200);

				const adminAuth = await app.fetch(
					new Request("http://localhost/admin/users", {
						headers: { cookie: adminCookie },
					}),
				);
				expect(adminAuth.status).toBe(200);
			},
			{ adminToken: "test-admin-token" },
		);
	});
});
