import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app";
import {
	addAllowlistEntry,
	isEmailAllowed,
	loadAllowlist,
	setAllowlistPath,
} from "../auth/allowlist";
import { addOrUpdateRosterUser } from "../auth/roster";
import {
	cookieFrom,
	createAdvantageScopeDist,
	createCatalogDir,
	createWebDist,
	exists,
	login,
	withApp,
} from "./helpers";

describe("session login and ownership", () => {
	test("new login creates a user, workspace, session, and an empty project dir", async () => {
		await withApp(async (app) => {
			const response = await login(app, "alice");
			expect(response.status).toBe(303);
			expect(response.headers.get("location")).toBe("/u/alice/");

			const userCount = app.storage.db
				.query("SELECT COUNT(*) AS count FROM user WHERE email = ?")
				.get("alice@test.local") as { count: number };
			const workspaceCount = app.storage.db
				.query("SELECT COUNT(*) AS count FROM workspaces")
				.get() as {
				count: number;
			};
			const sessionCount = app.storage.db
				.query("SELECT COUNT(*) AS count FROM session")
				.get() as {
				count: number;
			};
			const workspace = app.storage.db
				.query("SELECT * FROM workspaces WHERE slug = ?")
				.get("alice") as {
				project_path: string;
				current_module: string | null;
				current_module_kind: string | null;
			};

			expect(userCount.count).toBe(1);
			expect(workspaceCount.count).toBe(1);
			expect(sessionCount.count).toBe(1);

			// The project dir exists but is EMPTY (no first-login template seed):
			// the student fills it from the lesson picker (Decision 029 / D7).
			expect(await exists(workspace.project_path)).toBe(true);
			const { readdir } = await import("node:fs/promises");
			expect((await readdir(workspace.project_path)).length).toBe(0);
			expect(workspace.current_module).toBeNull();
			expect(workspace.current_module_kind).toBeNull();
		});
	});

	test("session cookie redirects to the existing workspace", async () => {
		await withApp(async (app) => {
			const response = await login(app, "alice");
			const cookie = cookieFrom(response);

			const reload = await app.fetch(
				new Request("http://localhost/", {
					headers: { cookie },
				}),
			);
			expect(reload.status).toBe(303);
			expect(reload.headers.get("location")).toBe("/u/alice/");

			const workspace = await app.fetch(
				new Request("http://localhost/u/alice/", {
					headers: { cookie },
				}),
			);
			expect(workspace.status).toBe(200);
			expect(await workspace.text()).toContain("V2 test shell");
		});
	});

	test("rejects bad workspace slugs before serving a workspace page", async () => {
		await withApp(async (app) => {
			const response = await login(app, "alice");
			const cookie = cookieFrom(response);

			const badSlug = await app.fetch(
				new Request("http://localhost/u/alice.bob/", {
					headers: { cookie },
				}),
			);

			expect(badSlug.status).toBe(400);
		});
	});

	test("prevents another session from accessing a different user's workspace", async () => {
		await withApp(async (app) => {
			const alice = await login(app, "alice");
			const aliceCookie = cookieFrom(alice);

			await login(app, "bob");

			// Alice's cookie should not let her access Bob's workspace
			const bobAsAlice = await app.fetch(
				new Request("http://localhost/u/bob/", {
					headers: { cookie: aliceCookie },
				}),
			);
			expect(bobAsAlice.status).toBe(403);
		});
	});

	test("returning user gets a fresh session with same workspace", async () => {
		await withApp(async (app) => {
			const first = await login(app, "alice");
			expect(first.status).toBe(303);
			expect(first.headers.get("location")).toBe("/u/alice/");

			// Second login with same display name → same user + new session
			const second = await login(app, "alice");
			expect(second.status).toBe(303);
			expect(second.headers.get("location")).toBe("/u/alice/");

			// Same login → same user, one new session, one workspace.
			const userCount = app.storage.db
				.query("SELECT COUNT(*) AS count FROM user WHERE email = ?")
				.get("alice@test.local") as { count: number };
			const sessionCount = app.storage.db
				.query("SELECT COUNT(*) AS count FROM session")
				.get() as {
				count: number;
			};
			const workspaceCount = app.storage.db
				.query("SELECT COUNT(*) AS count FROM workspaces")
				.get() as {
				count: number;
			};
			expect(userCount.count).toBe(1);
			expect(sessionCount.count).toBe(2);
			expect(workspaceCount.count).toBe(1);
		});
	});
});

describe("workspace creation concurrency", () => {
	test("concurrent first-logins with the same base slug get distinct slugs", async () => {
		await withApp(async (app) => {
			const now = new Date().toISOString();
			const insertUser = app.storage.db.query(
				"INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt, role, slug) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
			);

			const ids = ["userAAAAAAAAAAAAAAAA", "userBBBBBBBBBBBBBBBB"];
			ids.forEach((id, i) => {
				insertUser.run(
					id,
					`Alice${i}`,
					`alice${i}@example.com`,
					0,
					null,
					now,
					now,
					"student",
					"alice",
				);
			});

			const results = await Promise.all(
				ids.map((id) => app.storage.ensureWorkspaceForUser(id, "alice")),
			);
			const slugs = results.map((w) => w.slug);

			expect(slugs[0]).not.toBe(slugs[1]);
			expect(new Set(slugs)).toEqual(new Set(["alice", "alice-1"]));

			const workspaceCount = app.storage.db
				.query("SELECT COUNT(*) AS count FROM workspaces")
				.get() as {
				count: number;
			};
			expect(workspaceCount.count).toBe(2);
		});
	});
});

describe("allowlist enforcement", () => {
	test("empty allowlist blocks OAuth emails until a matching entry is added", async () => {
		const root = await mkdtemp(join(tmpdir(), "frc-allowlist-"));
		try {
			setAllowlistPath(root);
			await loadAllowlist();
			expect(isEmailAllowed("student@example.com")).toBe(false);

			await addAllowlistEntry("domain", "example.com");
			expect(isEmailAllowed("student@example.com")).toBe(true);
			expect(isEmailAllowed("student@other.test")).toBe(false);

			await addAllowlistEntry("email", "coach@other.test");
			expect(isEmailAllowed("coach@other.test")).toBe(true);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

describe("allowlist reload on sign-in", () => {
	type CreateBeforeHook = (user: {
		email: string;
		name: string;
	}) => Promise<{ data: { role: string; slug: string } } | undefined>;

	test("a CLI-written allowlist.json is picked up by the sign-in hook without an explicit reload call", async () => {
		await withApp(async (app) => {
			// Simulate `coderunner allowlist add` running as a separate process: it
			// writes allowlist.json directly on disk, bypassing addAllowlistEntry
			// (which would also update this process's in-memory cache).
			const allowlistPath = join(app.storage.config.dataDir, "allowlist.json");
			await writeFile(
				allowlistPath,
				JSON.stringify({ emails: ["late@test.local"], domains: [] }, null, 2),
				"utf8",
			);

			// The in-memory cache is stale until something reloads it.
			expect(isEmailAllowed("late@test.local")).toBe(false);

			const hook = app.storage.auth.options.databaseHooks?.user?.create
				?.before as unknown as CreateBeforeHook | undefined;
			const result = await hook?.({
				email: "late@test.local",
				name: "Late",
			});

			// The hook reloads from disk before checking, so the CLI's write takes
			// effect on this very sign-in attempt.
			expect(result?.data.role).toBe("student");
		});
	});
});

describe("bootstrap admin (CODERUNNER_ADMIN_EMAIL)", () => {
	type CreateBeforeHook = (user: {
		email: string;
		name: string;
	}) => Promise<{ data: { role: string; slug: string } } | undefined>;

	test("user.create hook grants admin to listed emails and student to others", async () => {
		await withApp(
			async (app) => {
				// The student email must be on the allowlist so the hook's roster gate
				// passes; the admin email was seeded into the allowlist at startup.
				await addAllowlistEntry("email", "student@test.local");

				const hook = app.storage.auth.options.databaseHooks?.user?.create
					?.before as unknown as CreateBeforeHook | undefined;
				expect(hook).toBeTruthy();

				// Mixed-case listed email still resolves to admin (case-insensitive).
				const adminResult = await hook?.({
					email: "Coach@Test.local",
					name: "Coach",
				});
				expect(adminResult?.data.role).toBe("admin");

				const studentResult = await hook?.({
					email: "student@test.local",
					name: "Student",
				});
				expect(studentResult?.data.role).toBe("student");
			},
			{ adminEmails: ["coach@test.local"] },
		);
	});

	test("startup provisions admin roster rows, promotes students, leaves admins and Auth0 users", async () => {
		const root = await mkdtemp(join(tmpdir(), "frc-bootstrap-"));
		try {
			const catalogDir = await createCatalogDir(root);
			const webDistDir = await createWebDist(root);
			const advantageScopeDistDir = await createAdvantageScopeDist(root);
			const dataDir = join(root, "data");
			const baseOptions = {
				dataDir,
				catalogDir,
				webDistDir,
				advantageScopeDistDir,
				sessionSecret: "test-session-secret",
				baseUrl: "http://localhost:4000",
				containerAutoStart: false,
				catalogRepo: null,
				adminUsernames: [],
				adminEmails: ["coach@team.org", "boss@team.org", "lead@team.org"],
			};

			// First startup: admin emails become roster rows, not JSON entries.
			const first = await createApp(baseOptions);
			expect(await exists(join(dataDir, "allowlist.json"))).toBe(false);
			const seeded = first.storage.db
				.query("SELECT email, role FROM user ORDER BY email")
				.all() as Array<{ email: string; role: string }>;
			expect(seeded.map((u) => u.email)).toEqual([
				"boss@team.org",
				"coach@team.org",
				"lead@team.org",
			]);
			expect(seeded.every((u) => u.role === "admin")).toBe(true);

			// Simulate an older OAuth row: mixed-case address, demoted before the
			// env var was set. Another row is already an admin. The third has an
			// Auth0 account, so Auth0's role claim must win.
			const staleAdminTimestamp = "2020-01-01T00:00:00.000Z";
			first.storage.db
				.query(
					"UPDATE user SET email = ?, role = 'student', updatedAt = ? WHERE email = ?",
				)
				.run("Coach@Team.org", staleAdminTimestamp, "coach@team.org");
			first.storage.db
				.query("UPDATE user SET updatedAt = ? WHERE email = ?")
				.run(staleAdminTimestamp, "boss@team.org");
			const lead = first.storage.db
				.query("SELECT id FROM user WHERE email = ?")
				.get("lead@team.org") as { id: string };
			first.storage.db
				.query(
					"INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
				)
				.run(
					"acctLeadCCCCCCCCCCCC",
					"auth0|lead",
					"auth0",
					lead.id,
					staleAdminTimestamp,
					staleAdminTimestamp,
				);
			first.storage.db
				.query("UPDATE user SET role = 'student' WHERE id = ?")
				.run(lead.id);
			first.close();

			// Second startup: no duplicates, the student is promoted, the existing
			// admin row is untouched, and the Auth0 row keeps its own role.
			const second = await createApp(baseOptions);
			try {
				const rows = second.storage.db
					.query("SELECT email, role, updatedAt FROM user ORDER BY email")
					.all() as Array<{
					email: string;
					role: string;
					updatedAt: string;
				}>;
				expect(rows).toHaveLength(3);

				const coach = rows.find(
					(u) => u.email.toLowerCase() === "coach@team.org",
				);
				expect(coach?.role).toBe("admin");
				expect(coach?.updatedAt).not.toBe(staleAdminTimestamp);

				const boss = rows.find((u) => u.email === "boss@team.org");
				expect(boss?.role).toBe("admin");
				expect(boss?.updatedAt).toBe(staleAdminTimestamp);

				const auth0Lead = rows.find((u) => u.email === "lead@team.org");
				expect(auth0Lead?.role).toBe("student");
			} finally {
				second.close();
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

describe("auth provider discovery", () => {
	test("lists only configured OAuth providers", async () => {
		await withApp(
			async (app) => {
				const response = await app.fetch(
					new Request("http://localhost/api/auth/providers"),
				);
				expect(response.status).toBe(200);
				expect(await response.json()).toEqual({
					providers: ["github"],
					usernamePassword: false,
				});
			},
			{
				usernamePasswordAuth: false,
				githubClientId: "github-client-id",
				githubClientSecret: "github-client-secret",
				googleClientId: "",
				googleClientSecret: "",
				auth0Domain: "",
				auth0ClientId: "",
				auth0ClientSecret: "",
			},
		);
	});

	test("lists auth0 only when its domain, client ID, secret, and audience are all set", async () => {
		const others = {
			usernamePasswordAuth: false,
			githubClientId: "",
			githubClientSecret: "",
			googleClientId: "",
			googleClientSecret: "",
		};
		const providersFor = (options: Parameters<typeof withApp>[1]) =>
			withApp(async (app) => {
				const response = await app.fetch(
					new Request("http://localhost/api/auth/providers"),
				);
				return ((await response.json()) as { providers: string[] }).providers;
			}, options);

		expect(
			await providersFor({
				...others,
				auth0Domain: "tenant.auth0.test",
				auth0ClientId: "id",
				auth0ClientSecret: "secret",
				auth0Audience: "https://coderunner.test/api",
			}),
		).toEqual(["auth0"]);
		expect(
			await providersFor({
				...others,
				auth0Domain: "tenant.auth0.test",
				auth0ClientId: "id",
				auth0ClientSecret: "",
				auth0Audience: "https://coderunner.test/api",
			}),
		).toEqual([]);
		expect(
			await providersFor({
				...others,
				auth0Domain: "tenant.auth0.test",
				auth0ClientId: "id",
				auth0ClientSecret: "secret",
				auth0Audience: "",
			}),
		).toEqual([]);
	});

	test("returns an empty list when no sign-in methods are configured", async () => {
		await withApp(
			async (app) => {
				const response = await app.fetch(
					new Request("http://localhost/api/auth/providers"),
				);
				expect(response.status).toBe(200);
				expect(await response.json()).toEqual({
					providers: [],
					usernamePassword: false,
				});
			},
			{
				usernamePasswordAuth: false,
				githubClientId: "",
				githubClientSecret: "",
				googleClientId: "",
				googleClientSecret: "",
				auth0Domain: "",
				auth0ClientId: "",
				auth0ClientSecret: "",
			},
		);
	});

	test("reports username/password sign-in when it is enabled", async () => {
		await withApp(
			async (app) => {
				const response = await app.fetch(
					new Request("http://localhost/api/auth/providers"),
				);
				expect(await response.json()).toEqual({
					providers: [],
					usernamePassword: true,
				});
			},
			{
				usernamePasswordAuth: true,
				githubClientId: "",
				githubClientSecret: "",
				googleClientId: "",
				googleClientSecret: "",
				auth0Domain: "",
				auth0ClientId: "",
				auth0ClientSecret: "",
			},
		);
	});
});

function authRequest(path: string, body: unknown, cookie?: string): Request {
	const headers = new Headers();
	headers.set("content-type", "application/json");
	headers.set("origin", "http://localhost:4000");
	if (cookie) {
		headers.set("cookie", cookie);
	}
	return new Request(`http://localhost${path}`, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
}

describe("username/password authentication", () => {
	const PASSWORD = "correct horse battery staple";
	// Username/password is deliberately isolated from OAuth in these tests.
	const passwordOptions = {
		usernamePasswordAuth: true,
		githubClientId: "",
		githubClientSecret: "",
		googleClientId: "",
		googleClientSecret: "",
		auth0Domain: "",
		auth0ClientId: "",
		auth0ClientSecret: "",
	};

	test("public sign-up is disabled and username routes are off when the feature is off", async () => {
		await withApp(
			async (app) => {
				const response = await app.fetch(
					authRequest("/api/auth/sign-up/email", {
						name: "Student",
						username: "student",
						email: "student@students.coderunner.invalid",
						password: PASSWORD,
					}),
				);
				expect(response.status).toBe(403);
				expect(await response.text()).toContain(
					"Accounts are created by your coach",
				);

				const usernameSignIn = await app.fetch(
					authRequest("/api/auth/sign-in/username", {
						username: "student",
						password: PASSWORD,
					}),
				);
				expect(usernameSignIn.status).toBe(404);

				const users = app.storage.db
					.query("SELECT COUNT(*) AS count FROM user")
					.get() as { count: number };
				expect(users.count).toBe(0);
			},
			{ usernamePasswordAuth: false },
		);
	});

	test("an email-only scaffold gets a workspace on first email sign-in", async () => {
		await withApp(async (app) => {
			await addAllowlistEntry("domain", "example.com");
			const scaffold = await addOrUpdateRosterUser(app.storage, {
				email: "student@example.com",
				displayName: "Student",
			});
			const signIn = await app.fetch(
				authRequest("/api/auth/sign-in/email", {
					email: "student@example.com",
					password: scaffold.temporaryPassword!,
				}),
			);
			expect(signIn.status).toBe(200);

			const workspace = app.storage.db
				.query("SELECT slug FROM workspaces WHERE user_id = ?")
				.get(scaffold.user.id) as { slug: string } | null;
			expect(workspace?.slug).toBe("student");
		}, passwordOptions);
	});

	test("a coach scaffold signs in with a scrypt-hashed temporary password, then must rotate it", async () => {
		const { verifyPassword } = await import("better-auth/crypto");
		await withApp(async (app) => {
			// No private email is required: a reserved address keeps the
			// username row unambiguous until the student adds a real one.
			await addAllowlistEntry("domain", "students.coderunner.invalid");
			const scaffold = await addOrUpdateRosterUser(app.storage, {
				username: "student",
				displayName: "Student",
			});
			expect(scaffold.created).toBe(true);
			expect(scaffold.temporaryPassword).toBeTruthy();
			const temporaryPassword = scaffold.temporaryPassword!;

			const user = app.storage.db
				.query(
					"SELECT id, email, username, role, slug, mustChangePassword FROM user WHERE username = ?",
				)
				.get("student") as {
				id: string;
				email: string;
				username: string;
				role: string;
				slug: string;
				mustChangePassword: number;
			};
			expect(user.email).toBe("student@students.coderunner.invalid");
			expect(user.username).toBe("student");
			expect(user.role).toBe("student");
			expect(user.slug).toBe("student");
			expect(user.mustChangePassword).toBe(1);

			const account = app.storage.db
				.query("SELECT providerId, password FROM account WHERE userId = ?")
				.get(user.id) as { providerId: string; password: string };
			expect(account.providerId).toBe("credential");
			// `<16-byte hex salt>:<64-byte hex key>`, with no plaintext copy.
			expect(account.password).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/u);
			expect(account.password).not.toContain(temporaryPassword);
			expect(
				await verifyPassword({
					hash: account.password,
					password: temporaryPassword,
				}),
			).toBe(true);

			const signIn = await app.fetch(
				authRequest("/api/auth/sign-in/username", {
					username: "student",
					password: temporaryPassword,
				}),
			);
			expect(signIn.status).toBe(200);
			const cookie = cookieFrom(signIn);

			const workspace = app.storage.db
				.query("SELECT slug FROM workspaces WHERE user_id = ?")
				.get(user.id) as { slug: string } | null;
			expect(workspace?.slug).toBe("student");

			// The rest of the site stays locked until the password rotates.
			const blocked = await app.fetch(
				new Request("http://localhost/u/student/", { headers: { cookie } }),
			);
			expect(blocked.status).toBe(403);
			expect((await blocked.json()).mustChangePassword).toBe(true);

			// Reaching the account page already proved who they are, so the
			// forced-reset endpoint takes the new password twice and not the
			// temporary one again.
			const mismatch = await app.fetch(
				authRequest(
					"/api/auth/roster/replace-temporary-password",
					{ newPassword: PASSWORD, confirmPassword: `${PASSWORD}!` },
					cookie,
				),
			);
			expect(mismatch.status).toBe(400);
			expect((await mismatch.json()).message).toContain("don't match");

			const change = await app.fetch(
				authRequest(
					"/api/auth/roster/replace-temporary-password",
					{ newPassword: PASSWORD, confirmPassword: PASSWORD },
					cookie,
				),
			);
			expect(change.status).toBe(200);

			const rotated = app.storage.db
				.query("SELECT mustChangePassword FROM user WHERE id = ?")
				.get(user.id) as { mustChangePassword: number };
			expect(rotated.mustChangePassword).toBe(0);
			const rotatedHash = app.storage.db
				.query("SELECT password FROM account WHERE userId = ?")
				.get(user.id) as { password: string };
			expect(
				await verifyPassword({
					hash: rotatedHash.password,
					password: PASSWORD,
				}),
			).toBe(true);

			const unlocked = await app.fetch(
				new Request("http://localhost/u/student/", {
					headers: { cookie: cookieFrom(change) },
				}),
			);
			expect(unlocked.status).toBe(200);
		}, passwordOptions);
	});

	test("the email address is roster-owned and cannot be changed from the account page", async () => {
		await withApp(async (app) => {
			const scaffold = await addOrUpdateRosterUser(app.storage, {
				username: "student",
			});
			const signIn = await app.fetch(
				authRequest("/api/auth/sign-in/username", {
					username: "student",
					password: scaffold.temporaryPassword!,
				}),
			);
			expect(signIn.status).toBe(200);
			const cookie = cookieFrom(signIn);

			const emailChange = await app.fetch(
				authRequest(
					"/api/auth/change-email",
					{ newEmail: "student@example.com" },
					cookie,
				),
			);
			expect(emailChange.status).toBe(403);

			const user = app.storage.db
				.query("SELECT email, username FROM user WHERE id = ?")
				.get(scaffold.user.id) as { email: string; username: string };
			expect(user.email).toBe("student@students.coderunner.invalid");
			expect(user.username).toBe("student");
		}, passwordOptions);
	});

	test("sign-in methods can only be removed when another one remains", async () => {
		await withApp(async (app) => {
			const scaffold = await addOrUpdateRosterUser(app.storage, {
				username: "student",
			});
			const signIn = await app.fetch(
				authRequest("/api/auth/sign-in/username", {
					username: "student",
					password: scaffold.temporaryPassword!,
				}),
			);
			const cookie = cookieFrom(signIn);
			const change = await app.fetch(
				authRequest(
					"/api/auth/change-password",
					{
						currentPassword: scaffold.temporaryPassword!,
						newPassword: PASSWORD,
					},
					cookie,
				),
			);
			expect(change.status).toBe(200);

			const removeWithoutFallback = await app.fetch(
				authRequest("/api/auth/roster/remove-password", {}, cookie),
			);
			expect(removeWithoutFallback.status).toBe(400);

			const now = new Date().toISOString();
			app.storage.db
				.query(
					"INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
				)
				.run(
					"acctGoogleAAAAAAAAAAAA",
					"google-123",
					"google",
					scaffold.user.id,
					now,
					now,
				);

			const unlinkGoogle = await app.fetch(
				authRequest(
					"/api/auth/unlink-account",
					{ providerId: "google" },
					cookie,
				),
			);
			expect(unlinkGoogle.status).toBe(200);
			const afterUnlink = app.storage.db
				.query("SELECT COUNT(*) AS count FROM account WHERE userId = ?")
				.get(scaffold.user.id) as { count: number };
			expect(afterUnlink.count).toBe(1);

			app.storage.db
				.query(
					"INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
				)
				.run(
					"acctGoogleBBBBBBBBBBBB",
					"google-123",
					"google",
					scaffold.user.id,
					now,
					now,
				);
			const removeWithFallback = await app.fetch(
				authRequest("/api/auth/roster/remove-password", {}, cookie),
			);
			expect(removeWithFallback.status).toBe(200);
			const user = app.storage.db
				.query("SELECT username FROM user WHERE id = ?")
				.get(scaffold.user.id) as { username: string | null };
			expect(user.username).toBeNull();
			const credential = app.storage.db
				.query(
					"SELECT COUNT(*) AS count FROM account WHERE userId = ? AND providerId = 'credential'",
				)
				.get(scaffold.user.id) as { count: number };
			expect(credential.count).toBe(0);

			const unlinkLast = await app.fetch(
				authRequest(
					"/api/auth/unlink-account",
					{ providerId: "google" },
					cookie,
				),
			);
			expect(unlinkLast.status).toBe(400);
		}, passwordOptions);
	});

	test("a password can be added once to an account without one", async () => {
		await withApp(async (app) => {
			const response = await login(app, "oauth", {
				email: "addpassword@test.local",
			});
			const cookie = cookieFrom(response);
			const user = app.storage.db
				.query("SELECT id FROM user WHERE email = ?")
				.get("addpassword@test.local") as { id: string };

			const set = await app.fetch(
				authRequest(
					"/api/auth/roster/set-password",
					{ newPassword: PASSWORD },
					cookie,
				),
			);
			expect(set.status).toBe(200);
			const credential = app.storage.db
				.query(
					"SELECT password FROM account WHERE userId = ? AND providerId = 'credential'",
				)
				.get(user.id) as { password: string } | null;
			expect(credential?.password).toBeTruthy();

			const again = await app.fetch(
				authRequest(
					"/api/auth/roster/set-password",
					{ newPassword: PASSWORD },
					cookie,
				),
			);
			expect(again.status).toBe(409);
		}, passwordOptions);
	});

	test("OAuth-only users can disconnect one of several providers", async () => {
		await withApp(async (app) => {
			const response = await login(app, "oauth", {
				email: "oauth@test.local",
			});
			const cookie = cookieFrom(response);
			const user = app.storage.db
				.query("SELECT id FROM user WHERE email = ?")
				.get("oauth@test.local") as { id: string };
			const now = new Date().toISOString();
			for (const [id, provider] of [
				["acctGoogleMulti", "google"],
				["acctGithubMulti", "github"],
			] as const) {
				app.storage.db
					.query(
						"INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
					)
					.run(id, `${provider}-123`, provider, user.id, now, now);
			}

			const unlinkGoogle = await app.fetch(
				authRequest(
					"/api/auth/unlink-account",
					{ providerId: "google" },
					cookie,
				),
			);
			expect(unlinkGoogle.status).toBe(200);

			const unlinkLast = await app.fetch(
				authRequest(
					"/api/auth/unlink-account",
					{ providerId: "github" },
					cookie,
				),
			);
			expect(unlinkLast.status).toBe(400);
			expect((await unlinkLast.json()).message).toContain(
				"another sign-in method",
			);
		});
	});

	test("removing a roster row blocks password sign-in", async () => {
		await withApp(async (app) => {
			const scaffold = await addOrUpdateRosterUser(app.storage, {
				username: "student",
			});
			const { deletePendingRosterUser } = await import("../auth/roster");
			deletePendingRosterUser(app.storage, scaffold.user.id);

			const signIn = await app.fetch(
				authRequest("/api/auth/sign-in/username", {
					username: "student",
					password: scaffold.temporaryPassword!,
				}),
			);
			expect(signIn.status).toBe(403);
			const sessions = app.storage.db
				.query("SELECT COUNT(*) AS count FROM session")
				.get() as { count: number };
			expect(sessions.count).toBe(0);
		}, passwordOptions);
	});
});
