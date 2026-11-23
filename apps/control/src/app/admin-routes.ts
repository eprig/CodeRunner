import { mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type {
	AdminActionResponse,
	WorkspaceId,
} from "@frc-coderunner/contracts";
import { queryAuditLog, recordAuditEvent } from "../audit";
import {
	addAllowlistEntry,
	getAllowlist,
	removeAllowlistEntry,
} from "../auth/allowlist";
import { requireAdmin } from "../auth/middleware";
import {
	addOrUpdateRosterUser,
	deletePendingRosterUser,
	findRosterUserByEmail,
	findRosterUserById,
	findRosterUserByUsername,
	isSyntheticEmail,
	listRosterUsers,
	RosterError,
	setTemporaryPassword,
	updateRosterIdentity,
} from "../auth/roster";
import { getLogger } from "../logging";
import type { RunManager } from "../runs";
import type { WorkspaceRuntimeProvider } from "../runtime";
import type { AppStorage } from "../storage";
import { deleteUserAndWorkspace } from "../user-deletion";
import {
	createProjectArchive,
	directorySizeBytes,
	restoreProjectArchive,
} from "./archive-utils";
import { isInsideDirectory, webAssetResponse } from "./assets";
import { handleAdminClassroomRoute } from "./classroom-routes";
import { apiErrorResponse, jsonResponse, notFound } from "./responses";
import { adminStatusResponse, auditActor } from "./status";

const log = getLogger("admin");
const SELF_EDIT_MESSAGE =
	"You can't change your own account here. Use Account settings instead.";

function selfEditResponse(): Response {
	return jsonResponse({ error: SELF_EDIT_MESSAGE }, { status: 409 });
}

/** Stop a deleted identity from being recreated by legacy JSON on next boot. */
async function forgetLegacyIdentity(email: string, username: string | null) {
	const current = getAllowlist();
	let next = current;
	if (current.emails.includes(email.toLowerCase())) {
		next = await removeAllowlistEntry("email", email);
	}
	if (username && next.usernames.includes(username.toLowerCase())) {
		await removeAllowlistEntry("username", username);
	}
}

export type AdminRouteContext = {
	storage: AppStorage;
	runs: RunManager;
	runtimeProvider: WorkspaceRuntimeProvider;
	closeWorkspaceSockets: (workspaceId: WorkspaceId) => void;
};

export async function handleAdminRoute(
	ctx: AdminRouteContext,
	url: URL,
	request: Request,
): Promise<Response> {
	const { storage, runs, runtimeProvider } = ctx;
	const adminResult = await requireAdmin(storage, request);
	if (adminResult instanceof Response) {
		return adminResult;
	}
	log.debug("admin route", {
		method: request.method,
		path: url.pathname,
		actor: adminResult.user.id,
	});

	const classroomResponse = await handleAdminClassroomRoute(
		{
			storage,
			deleteUser: (userId) => deleteUserAndWorkspace(ctx, userId),
		},
		url,
		request,
		auditActor(adminResult),
	);
	if (classroomResponse) {
		return classroomResponse;
	}

	// Serve static assets for the admin SPA
	if (url.pathname.startsWith("/admin/assets/") && request.method === "GET") {
		return webAssetResponse(
			storage,
			`assets/${url.pathname.slice("/admin/assets/".length)}`,
		);
	}

	if (url.pathname === "/admin/status" && request.method === "GET") {
		return jsonResponse(adminStatusResponse(storage, runs));
	}

	if (url.pathname === "/admin/containers/stats" && request.method === "GET") {
		const workspacesById = new Map(
			storage
				.listAllWorkspacesWithLeases()
				.map((entry) => [entry.workspace.id, entry]),
		);
		const stats = await runtimeProvider.listRuntimes();
		return jsonResponse({
			ok: true,
			containers: stats.map((container) => {
				const entry = container.workspaceId
					? workspacesById.get(container.workspaceId as WorkspaceId)
					: undefined;
				const lease = entry?.lease ?? null;
				return {
					...container,
					workspaceSlug: entry?.workspace.slug ?? null,
					ports: {
						nt4: lease?.nt4_port ?? null,
						vscode: lease?.vscode_port ?? null,
						halsim: lease?.halsim_port ?? null,
					},
				};
			}),
		});
	}

	if (
		url.pathname === "/admin/workspaces/disk-usage" &&
		request.method === "GET"
	) {
		const entries = storage.listAllWorkspacesWithLeases();
		const usage = await Promise.all(
			entries.map(async (entry) => ({
				workspaceId: entry.workspace.id,
				workspaceSlug: entry.workspace.slug,
				projectPath: entry.workspace.project_path,
				bytes: await directorySizeBytes(entry.workspace.project_path),
			})),
		);
		return jsonResponse({ ok: true, workspaces: usage });
	}

	const adminWorkspaceMatch = /^\/admin\/workspaces\/([^/]+)\/(.+)$/.exec(
		url.pathname,
	);
	if (adminWorkspaceMatch && request.method === "POST") {
		const targetWorkspaceId = adminWorkspaceMatch[1] ?? "";
		const action = adminWorkspaceMatch[2] ?? "";
		const workspace = storage.findWorkspaceById(
			targetWorkspaceId as WorkspaceId,
		);
		if (!workspace) {
			return jsonResponse({ error: "Workspace not found." }, { status: 404 });
		}

		const actor = auditActor(adminResult);

		try {
			if (action === "restart-code") {
				await runtimeProvider.restartWorkspace(workspace.id);
				recordAuditEvent(storage, {
					actor,
					action: "container.restart-code",
					target: { kind: "workspace", id: workspace.id },
				});
				return jsonResponse({
					ok: true,
					action: "restart-code",
					workspaceId: workspace.id,
					detail: "Code container restarted.",
				} satisfies AdminActionResponse);
			}

			if (action === "stop-containers") {
				await runtimeProvider.stopWorkspace(workspace.id);
				recordAuditEvent(storage, {
					actor,
					action: "container.stop",
					target: { kind: "workspace", id: workspace.id },
				});
				return jsonResponse({
					ok: true,
					action: "stop-containers",
					workspaceId: workspace.id,
					detail: "All containers stopped.",
				} satisfies AdminActionResponse);
			}

			if (action === "backup") {
				const projectDir = workspace.project_path;
				try {
					const s = await stat(projectDir);
					if (!s.isDirectory()) {
						return jsonResponse(
							{ error: "Project directory does not exist." },
							{ status: 404 },
						);
					}
				} catch {
					return jsonResponse(
						{ error: "Project directory does not exist." },
						{ status: 404 },
					);
				}
				const now = new Date();
				const pad = (n: number) => String(n).padStart(2, "0");
				const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
				const backupRoot = resolve(storage.config.dataDir, "backups", ts);
				const workspaceBackupDir = resolve(backupRoot, workspace.id);
				const dest = resolve(workspaceBackupDir, "project.tar.gz");
				await mkdir(workspaceBackupDir, { recursive: true });
				await createProjectArchive(projectDir, dest);
				recordAuditEvent(storage, {
					actor,
					action: "workspace.backup",
					target: { kind: "workspace", id: workspace.id },
					metadata: { dest },
				});
				return jsonResponse({
					ok: true,
					action: "backup",
					workspaceId: workspace.id,
					detail: `Backed up to ${dest}`,
				} satisfies AdminActionResponse);
			}

			if (action === "restore") {
				let body: { path?: string };
				try {
					body = (await request.json()) as { path?: string };
				} catch {
					return jsonResponse(
						{ error: "Request body must be valid JSON." },
						{ status: 400 },
					);
				}
				if (typeof body.path !== "string" || body.path.trim().length === 0) {
					return jsonResponse(
						{ error: "Missing or empty 'path' in request body." },
						{ status: 400 },
					);
				}
				const backupsRoot = resolve(storage.config.dataDir, "backups");
				const sourcePath = resolve(body.path);
				if (!isInsideDirectory(backupsRoot, sourcePath)) {
					return jsonResponse(
						{ error: "Restore path must be under data/backups/." },
						{ status: 403 },
					);
				}
				try {
					const s = await stat(sourcePath);
					if (!s.isFile()) {
						return jsonResponse(
							{ error: "Restore source is not a file." },
							{ status: 404 },
						);
					}
				} catch {
					return jsonResponse(
						{ error: "Restore source not found." },
						{ status: 404 },
					);
				}
				const projectDir = workspace.project_path;
				await mkdir(dirname(projectDir), { recursive: true });
				await restoreProjectArchive(projectDir, sourcePath);
				recordAuditEvent(storage, {
					actor,
					action: "workspace.restore",
					target: { kind: "workspace", id: workspace.id },
					metadata: { source: sourcePath },
				});
				return jsonResponse({
					ok: true,
					action: "restore",
					workspaceId: workspace.id,
					detail: `Restored from ${sourcePath}`,
				} satisfies AdminActionResponse);
			}
		} catch (error) {
			return apiErrorResponse(error, `Admin action ${action} failed.`);
		}
	}

	// --- User management endpoints ---
	if (url.pathname === "/admin/users" && request.method === "GET") {
		const rows = storage.db
			.query(
				`
        SELECT
          u.id, u.name, u.email, u.username, u.role, u.slug, u.classroomId,
          u.createdAt, u.updatedAt, u.mustChangePassword,
          (SELECT COUNT(*) FROM account a WHERE a.userId = u.id) AS accountCount,
          w.id AS workspaceId, w.last_accessed_at AS lastSeenAt
        FROM user u
        LEFT JOIN workspaces w ON w.user_id = u.id
        ORDER BY u.name
      `,
			)
			.all() as Array<{
			id: string;
			name: string;
			email: string;
			username: string | null;
			role: string | null;
			slug: string | null;
			classroomId: string | null;
			createdAt: string;
			updatedAt: string;
			mustChangePassword: number | boolean | null;
			accountCount: number;
			workspaceId: string | null;
			lastSeenAt: string | null;
		}>;
		const users = rows.map((row) => {
			const mustChangePassword =
				row.mustChangePassword === true || row.mustChangePassword === 1;
			const enrolled =
				Boolean(row.lastSeenAt) || Boolean(row.slug && row.workspaceId);
			return {
				...row,
				mustChangePassword,
				// A forced change still gates the site, but an established user
				// isn't "pending" onboarding — their badge says why they're gated.
				passwordReset: mustChangePassword && enrolled,
				pending: mustChangePassword || Number(row.accountCount ?? 0) === 0,
			};
		});
		return jsonResponse({
			ok: true,
			users,
			// Lets the Admin UI hide actions on the signed-in admin's own row.
			currentUserId: adminResult.user.id,
		});
	}

	const passwordResetMatch = /^\/admin\/users\/([^/]+)\/reset-password$/.exec(
		url.pathname,
	);
	if (passwordResetMatch && request.method === "POST") {
		const userId = passwordResetMatch[1] ?? "";
		if (userId === adminResult.user.id) return selfEditResponse();
		const user = storage.db
			.query(
				"SELECT id, name, email, username, classroomId FROM user WHERE id = ?",
			)
			.get(userId) as {
			id: string;
			name: string;
			email: string;
			username: string | null;
			classroomId: string | null;
		} | null;
		if (!user || user.classroomId) {
			return jsonResponse({ error: "User not found." }, { status: 404 });
		}
		try {
			const temporaryPassword = await setTemporaryPassword(storage, userId);
			recordAuditEvent(storage, {
				actor: auditActor(adminResult),
				action: "user.password-reset",
				target: { kind: "user", id: userId },
			});
			return jsonResponse({ ok: true, userId, temporaryPassword });
		} catch (error) {
			return apiErrorResponse(error, "Couldn't reset that password.");
		}
	}

	const identityMatch = /^\/admin\/users\/([^/]+)\/identity$/.exec(
		url.pathname,
	);
	if (identityMatch && request.method === "POST") {
		const userId = identityMatch[1] ?? "";
		if (userId === adminResult.user.id) return selfEditResponse();
		let body: { username?: unknown; email?: unknown; displayName?: unknown };
		try {
			body = (await request.json()) as typeof body;
		} catch {
			return jsonResponse({ error: "Invalid JSON body." }, { status: 400 });
		}
		const input: {
			username?: string | null;
			email?: string | null;
			displayName?: string | null;
		} = {};
		if (body.username !== undefined) {
			if (typeof body.username !== "string" && body.username !== null) {
				return jsonResponse({ error: "Invalid username." }, { status: 400 });
			}
			input.username = body.username;
		}
		if (body.email !== undefined) {
			if (typeof body.email !== "string" && body.email !== null) {
				return jsonResponse({ error: "Invalid email." }, { status: 400 });
			}
			input.email = body.email;
		}
		if (body.displayName !== undefined) {
			if (typeof body.displayName !== "string" && body.displayName !== null) {
				return jsonResponse(
					{ error: "Invalid display name." },
					{ status: 400 },
				);
			}
			input.displayName = body.displayName;
		}
		try {
			const user = await updateRosterIdentity(storage, userId, input);
			recordAuditEvent(storage, {
				actor: auditActor(adminResult),
				action: "user.update-identity",
				target: { kind: "user", id: userId },
				metadata: {
					name: user.name,
					username: user.username,
					email: user.email,
				},
			});
			return jsonResponse({ ok: true, user });
		} catch (error) {
			if (error instanceof RosterError) {
				return jsonResponse({ error: error.message }, { status: error.status });
			}
			return apiErrorResponse(error, "Couldn't update that user.");
		}
	}

	const userActionMatch = /^\/admin\/users\/([^/]+)\/(promote|demote)$/.exec(
		url.pathname,
	);
	if (userActionMatch && request.method === "POST") {
		const userId = userActionMatch[1] ?? "";
		if (userId === adminResult.user.id) return selfEditResponse();
		const action = userActionMatch[2] as "promote" | "demote";
		const user = storage.db
			.query("SELECT id, name, email, role, classroomId FROM user WHERE id = ?")
			.get(userId) as {
			id: string;
			name: string;
			email: string;
			role: string | null;
			classroomId: string | null;
		} | null;
		if (!user) {
			return jsonResponse({ error: "User not found." }, { status: 404 });
		}
		// Anyone with the classroom code and a guest's name can sign in as that
		// guest, so guests are never admins (decision 043).
		if (action === "promote" && user.classroomId) {
			return jsonResponse(
				{ error: "Classroom guests cannot be admins." },
				{ status: 409 },
			);
		}
		const newRole = action === "promote" ? "admin" : "student";
		if (action === "demote" && user.role === "admin") {
			const adminCount = storage.db
				.query("SELECT COUNT(*) AS count FROM user WHERE role = 'admin'")
				.get() as { count: number };
			if (adminCount.count <= 1) {
				return jsonResponse(
					{ error: "Cannot demote the last admin user." },
					{ status: 409 },
				);
			}
		}
		storage.db
			.query("UPDATE user SET role = ?, updatedAt = ? WHERE id = ?")
			.run(newRole, new Date().toISOString(), userId);
		recordAuditEvent(storage, {
			actor: auditActor(adminResult),
			action: action === "promote" ? "user.promote" : "user.demote",
			target: { kind: "user", id: userId },
			metadata: { email: user.email, newRole },
		});
		return jsonResponse({ ok: true, userId, role: newRole });
	}

	const userDeleteMatch = /^\/admin\/users\/([^/]+)$/.exec(url.pathname);
	if (userDeleteMatch && request.method === "DELETE") {
		const userId = userDeleteMatch[1] ?? "";
		if (userId === adminResult.user.id) return selfEditResponse();
		const user = storage.db
			.query("SELECT id, name, email, username, role FROM user WHERE id = ?")
			.get(userId) as {
			id: string;
			name: string;
			email: string;
			username: string | null;
			role: string | null;
		} | null;
		if (!user) {
			return jsonResponse({ error: "User not found." }, { status: 404 });
		}
		if (user.role === "admin") {
			const adminCount = storage.db
				.query("SELECT COUNT(*) AS count FROM user WHERE role = 'admin'")
				.get() as { count: number };
			if (adminCount.count <= 1) {
				return jsonResponse(
					{ error: "Cannot delete the last admin user." },
					{ status: 409 },
				);
			}
		}

		await deleteUserAndWorkspace(ctx, userId);
		await forgetLegacyIdentity(user.email, user.username);

		recordAuditEvent(storage, {
			actor: auditActor(adminResult),
			action: "user.delete",
			target: { kind: "user", id: userId },
			metadata: { email: user.email },
		});

		return jsonResponse({ ok: true, userId });
	}

	// --- Roster + domain allowlist endpoints ---
	// People live in Better Auth's `user` table; only domains remain in JSON.
	if (url.pathname === "/admin/allowlist" && request.method === "GET") {
		return jsonResponse({
			ok: true,
			users: listRosterUsers(storage.db),
			domains: getAllowlist().domains,
		});
	}

	if (url.pathname === "/admin/allowlist" && request.method === "POST") {
		let body: {
			kind?: string;
			value?: string;
			username?: string;
			email?: string;
			password?: string;
			displayName?: string;
			createOnly?: boolean;
		};
		try {
			body = (await request.json()) as typeof body;
		} catch {
			return jsonResponse({ error: "Invalid JSON body." }, { status: 400 });
		}

		// Domain rules are still file-backed; everything else is a user.
		if (body.kind === "domain") {
			if (typeof body.value !== "string" || !body.value.trim()) {
				return jsonResponse({ error: "value is required." }, { status: 400 });
			}
			try {
				await addAllowlistEntry("domain", body.value);
			} catch (error) {
				return apiErrorResponse(error, "Couldn't add that domain.");
			}
			recordAuditEvent(storage, {
				actor: auditActor(adminResult),
				action: "allowlist.add",
				target: { kind: "allowlist", id: body.value.toLowerCase() },
				metadata: { kind: "domain" },
			});
			return jsonResponse({
				ok: true,
				domains: getAllowlist().domains,
				users: listRosterUsers(storage.db),
			});
		}

		const username =
			body.username ?? (body.kind === "username" ? body.value : undefined);
		const email =
			body.email ?? (body.kind === "email" ? body.value : undefined);
		if (!username?.trim() && !email?.trim()) {
			return jsonResponse(
				{ error: "Enter a username or an email address." },
				{ status: 400 },
			);
		}
		const selfUser =
			(username?.trim()
				? findRosterUserByUsername(storage.db, username.trim())
				: null) ??
			(email?.trim() ? findRosterUserByEmail(storage.db, email.trim()) : null);
		if (selfUser?.id === adminResult.user.id) return selfEditResponse();
		try {
			// Adding someone never grants admin: promote them from the Users tab
			// once you know who they are. promoteOnly keeps existing roles intact.
			const result = await addOrUpdateRosterUser(storage, {
				username: username?.trim() || null,
				email: email?.trim() || null,
				password: body.password?.trim() || undefined,
				displayName: body.displayName,
				role: "student",
				promoteOnly: true,
				createOnly: body.createOnly === true,
			});
			recordAuditEvent(storage, {
				actor: auditActor(adminResult),
				action: "allowlist.add",
				target: {
					kind: "user",
					id: result.user.id,
				},
				metadata: {
					username: result.user.username,
					email: isSyntheticEmail(result.user.email) ? null : result.user.email,
					created: result.created,
				},
			});
			return jsonResponse({
				ok: true,
				created: result.created,
				user: result.user,
				// Shown once by the admin UI. Stored only as a Better Auth hash.
				temporaryPassword: result.temporaryPassword,
				domains: getAllowlist().domains,
				users: listRosterUsers(storage.db),
			});
		} catch (error) {
			if (error instanceof RosterError) {
				return jsonResponse({ error: error.message }, { status: error.status });
			}
			return apiErrorResponse(error, "Couldn't add that user.");
		}
	}

	const allowlistDeleteMatch = /^\/admin\/allowlist\/(.+)$/.exec(url.pathname);
	if (allowlistDeleteMatch && request.method === "DELETE") {
		const value = decodeURIComponent(allowlistDeleteMatch[1] ?? "");
		const requestedKind = url.searchParams.get("kind");
		const current = getAllowlist();

		try {
			if (
				requestedKind === "domain" ||
				current.domains.includes(value.toLowerCase())
			) {
				await removeAllowlistEntry("domain", value);
			} else {
				const user =
					(requestedKind === "user"
						? findRosterUserById(storage.db, value)
						: null) ??
					(requestedKind === "user" || requestedKind === "username"
						? findRosterUserByUsername(storage.db, value)
						: null) ??
					(requestedKind === "user" || requestedKind === "email"
						? findRosterUserByEmail(storage.db, value)
						: null) ??
					findRosterUserByUsername(storage.db, value) ??
					findRosterUserByEmail(storage.db, value);
				if (!user) {
					return jsonResponse({ error: "User not found." }, { status: 404 });
				}
				if (user.id === adminResult.user.id) return selfEditResponse();
				deletePendingRosterUser(storage, user.id);
				await forgetLegacyIdentity(user.email, user.username);
			}
		} catch (error) {
			if (error instanceof RosterError) {
				return jsonResponse({ error: error.message }, { status: error.status });
			}
			return apiErrorResponse(error, "Couldn't remove that entry.");
		}

		recordAuditEvent(storage, {
			actor: auditActor(adminResult),
			action: "allowlist.remove",
			target: { kind: "allowlist", id: value },
			metadata: { kind: requestedKind ?? "user" },
		});
		return jsonResponse({
			ok: true,
			domains: getAllowlist().domains,
			users: listRosterUsers(storage.db),
		});
	}

	// --- Allowlist reload (legacy domain edits from disk) ---
	if (url.pathname === "/admin/allowlist/reload" && request.method === "POST") {
		const { reloadAllowlist } = await import("../auth/allowlist");
		try {
			const result = await reloadAllowlist();
			return jsonResponse({ ok: true, ...result });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return jsonResponse({ ok: false, error: message }, { status: 400 });
		}
	}

	// --- Capacity cap runtime override ---
	if (
		url.pathname === "/admin/config/max-active-containers" &&
		request.method === "POST"
	) {
		let body: { value?: unknown };
		try {
			body = (await request.json()) as { value?: unknown };
		} catch {
			return jsonResponse({ error: "Invalid JSON body." }, { status: 400 });
		}
		const value = Number(body.value);
		if (!Number.isInteger(value) || value < 1) {
			return jsonResponse(
				{ error: "value must be a positive integer." },
				{ status: 400 },
			);
		}
		storage.setRuntimeConfig("max_active_containers", String(value));
		const actor = auditActor(adminResult);
		recordAuditEvent(storage, {
			actor,
			action: "config.max-active-containers",
			metadata: { value },
		});
		return jsonResponse({ ok: true, maxActiveContainers: value });
	}

	if (
		url.pathname === "/admin/config/max-active-containers" &&
		request.method === "GET"
	) {
		return jsonResponse({
			ok: true,
			maxActiveContainers: storage.getEffectiveMaxActiveContainers(),
			configDefault: storage.config.maxActiveContainers,
		});
	}

	// --- Audit log ---
	if (url.pathname === "/admin/audit-log" && request.method === "GET") {
		const limit = Number(url.searchParams.get("limit") ?? "100");
		const before = url.searchParams.get("before")
			? Number(url.searchParams.get("before"))
			: undefined;
		const actorEmail = url.searchParams.get("actor") ?? undefined;
		const actionPrefix = url.searchParams.get("action") ?? undefined;
		const days = url.searchParams.get("days")
			? Number(url.searchParams.get("days"))
			: undefined;
		const sinceMs = days ? Date.now() - days * 86_400_000 : undefined;
		const entries = queryAuditLog(storage, {
			limit,
			before,
			actorEmail,
			actionPrefix,
			sinceMs,
		});
		return jsonResponse({ ok: true, entries });
	}

	return notFound();
}
