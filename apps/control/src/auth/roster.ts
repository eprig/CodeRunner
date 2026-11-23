/**
 * User roster — Better Auth's `user` table is the single roster row.
 *
 * A coach "adds a user" (formerly "allowlist entry") by provisioning a
 * `user` row with an optional username and/or real email. Better Auth owns
 * the row, its credential `account`, sessions, and password hashing; this
 * module only coordinates those internal-adapter calls.
 *
 * Domains stay in data/allowlist.json because a domain cannot identify a
 * person. Legacy username/email entries in that file are imported once at
 * startup and then left alone.
 */

import type { Database } from "bun:sqlite";
import { randomBytes } from "node:crypto";
import type { ControlConfig } from "../config";
import { getLogger } from "../logging";
import type { AppStorage } from "../storage";
import * as allowlist from "./allowlist";
import { isSyntheticEmail, syntheticEmailForUsername } from "./allowlist";
import type { Auth } from "./auth";

const log = getLogger("roster");

const ROSTER_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export class RosterError extends Error {
	readonly status: number;

	constructor(
		message: string,
		readonly code:
			| "INVALID_INPUT"
			| "CONFLICT"
			| "ACTIVE_USER"
			| "NOT_FOUND" = "INVALID_INPUT",
	) {
		super(message);
		this.name = "RosterError";
		this.status =
			code === "NOT_FOUND" ? 404 : code === "INVALID_INPUT" ? 400 : 409;
	}
}

export type RosterUser = {
	id: string;
	name: string;
	email: string;
	username: string | null;
	role: string;
	slug: string | null;
	mustChangePassword: boolean;
	accountCount: number;
	lastSeenAt: string | null;
	/** Pending means "needs a coach-set password or first password change". */
	pending: boolean;
};

export function normalizeRosterUsername(value: string): string {
	return value.trim().toLowerCase();
}

export function normalizeRosterEmail(value: string): string {
	return value.trim().toLowerCase();
}

export function isValidRosterEmail(value: string): boolean {
	return ROSTER_EMAIL_PATTERN.test(normalizeRosterEmail(value));
}

/** Generate a coach-shown temporary password (always >= Better Auth's minimum). */
export function generateTemporaryPassword(): string {
	return randomBytes(18).toString("base64url");
}

export function findRosterUserByUsername(
	db: Database,
	username: string,
): RosterUser | null {
	return findRosterUser(db, "username", normalizeRosterUsername(username));
}

export function findRosterUserByEmail(
	db: Database,
	email: string,
): RosterUser | null {
	return findRosterUser(db, "email", normalizeRosterEmail(email));
}

/** Admin UI deletions use the roster row id, not an email or username. */
export function findRosterUserById(
	db: Database,
	id: string,
): RosterUser | null {
	const row = db
		.query(
			`SELECT
				u.id, u.name, u.email, u.username, u.role, u.slug,
				u.mustChangePassword,
				(SELECT COUNT(*) FROM account a WHERE a.userId = u.id) AS accountCount,
				(SELECT MAX(w.last_accessed_at) FROM workspaces w WHERE w.user_id = u.id) AS lastSeenAt
			 FROM user u
			 WHERE u.id = ? AND u.classroomId IS NULL
			 LIMIT 1`,
		)
		.get(id) as Record<string, unknown> | null;
	return row ? toRosterUser(row) : null;
}

function findRosterUser(
	db: Database,
	field: "username" | "email",
	value: string,
): RosterUser | null {
	const row = db
		.query(
			`SELECT
				u.id, u.name, u.email, u.username, u.role, u.slug,
				u.mustChangePassword,
				(SELECT COUNT(*) FROM account a WHERE a.userId = u.id) AS accountCount,
				(SELECT MAX(w.last_accessed_at) FROM workspaces w WHERE w.user_id = u.id) AS lastSeenAt
			 FROM user u
			 WHERE lower(u.${field}) = ? AND u.classroomId IS NULL
			 LIMIT 1`,
		)
		.get(value) as Record<string, unknown> | null;
	return row ? toRosterUser(row) : null;
}

function toRosterUser(row: Record<string, unknown>): RosterUser {
	const mustChangePassword =
		row.mustChangePassword === true || row.mustChangePassword === 1;
	const accountCount = Number(row.accountCount ?? 0);
	return {
		id: String(row.id),
		name: String(row.name ?? ""),
		email: String(row.email ?? ""),
		username: typeof row.username === "string" ? row.username : null,
		role: String(row.role ?? "student"),
		slug: typeof row.slug === "string" ? row.slug : null,
		mustChangePassword,
		accountCount,
		lastSeenAt: typeof row.lastSeenAt === "string" ? row.lastSeenAt : null,
		pending: mustChangePassword || accountCount === 0,
	};
}

export function listRosterUsers(db: Database): RosterUser[] {
	const rows = db
		.query(
			`SELECT
				u.id, u.name, u.email, u.username, u.role, u.slug,
				u.mustChangePassword,
				(SELECT COUNT(*) FROM account a WHERE a.userId = u.id) AS accountCount,
				(SELECT MAX(w.last_accessed_at) FROM workspaces w WHERE w.user_id = u.id) AS lastSeenAt
			 FROM user u
			 WHERE u.classroomId IS NULL
			 ORDER BY u.name COLLATE NOCASE, u.email COLLATE NOCASE`,
		)
		.all() as Array<Record<string, unknown>>;
	return rows.map(toRosterUser);
}

/** A username is permitted exactly when a scaffolded user owns it. */
export function isUsernamePermitted(db: Database, username: string): boolean {
	return findRosterUserByUsername(db, username) !== null;
}

/**
 * An email is permitted when a scaffolded user owns it, or when a domain
 * rule in allowlist.json matches. Explicit legacy email entries still work
 * through `isEmailAllowed` so old configs keep functioning until imported.
 */
export function isEmailPermitted(db: Database, email: string): boolean {
	const normalized = normalizeRosterEmail(email);
	if (findRosterUserByEmail(db, normalized)) return true;
	return allowlist.isEmailAllowed(normalized);
}

/** Domain checks only; kept separate so callers don't accidentally bypass roster lookup. */
export function isDomainAllowed(email: string): boolean {
	const domain = normalizeRosterEmail(email).split("@")[1];
	return Boolean(domain && allowlist.isEmailAllowed(`nobody@${domain}`));
}

function roleForIdentity(
	config: Pick<ControlConfig, "adminEmails" | "adminUsernames">,
	username: string | null,
	email: string,
): "admin" | "student" {
	if (username && config.adminUsernames.includes(username)) return "admin";
	if (config.adminEmails.includes(normalizeRosterEmail(email))) return "admin";
	return "student";
}

function assertUsername(value: string): string {
	const username = normalizeRosterUsername(value);
	if (!/^[a-z0-9_.]{3,30}$/u.test(username)) {
		throw new RosterError(
			"Username must be 3-30 characters using letters, numbers, dots, or underscores.",
		);
	}
	return username;
}

function assertEmail(value: string): string {
	const email = normalizeRosterEmail(value);
	if (!isValidRosterEmail(email)) {
		throw new RosterError("Enter a valid email address.");
	}
	return email;
}

export type AddRosterUserInput = {
	username?: string | null | undefined;
	email?: string | null | undefined;
	password?: string | null | undefined;
	displayName?: string | null | undefined;
	role?: "admin" | "student" | undefined;
	/** Provision the row without a credential (OAuth/bootstrap path). */
	provisionOnly?: boolean | undefined;
	/** Never lower an existing user's role on a repeat call. */
	promoteOnly?: boolean | undefined;
	/** Admin Add user: refuse to reuse a row; edits use updateRosterIdentity. */
	createOnly?: boolean | undefined;
};

export type AddRosterUserResult = {
	user: RosterUser;
	created: boolean;
	temporaryPassword: string | null;
};

export type UpdateRosterIdentityInput = {
	/** A blank string or null clears the username. */
	username?: string | null | undefined;
	/** A blank string or null restores the synthetic email for the username. */
	email?: string | null | undefined;
	/** A blank string or null leaves the current display name unchanged. */
	displayName?: string | null | undefined;
};

/**
 * Upsert one roster identity. If a username and/or email already belongs to a
 * user, that row is reused — no duplicate user or workspace is ever created.
 */
export async function addOrUpdateRosterUser(
	storage: AppStorage,
	input: AddRosterUserInput,
): Promise<AddRosterUserResult> {
	const username = input.username?.trim()
		? assertUsername(input.username)
		: null;
	const email = input.email?.trim() ? assertEmail(input.email) : null;
	if (!username && !email) {
		throw new RosterError("Enter a username or an email address.");
	}

	const byUsername = username
		? findRosterUserByUsername(storage.db, username)
		: null;
	const byEmail = email ? findRosterUserByEmail(storage.db, email) : null;
	if (byUsername && byEmail && byUsername.id !== byEmail.id) {
		throw new RosterError(
			"That username and email belong to different users.",
			"CONFLICT",
		);
	}
	const existing = byUsername ?? byEmail;
	if (input.createOnly && existing) {
		throw new RosterError(
			"That username or email already belongs to a user. Edit that user instead.",
			"CONFLICT",
		);
	}
	const resolvedEmail =
		email ?? existing?.email ?? syntheticEmailForUsername(username!);
	const resolvedUsername = username ?? existing?.username ?? null;
	const roleFromConfig = roleForIdentity(
		storage.config,
		resolvedUsername,
		resolvedEmail,
	);

	const password = input.provisionOnly
		? null
		: (input.password ?? generateTemporaryPassword());
	if (password !== null && (password.length < 8 || password.length > 128)) {
		throw new RosterError("Password must be between 8 and 128 characters.");
	}

	const ctx = await storage.auth.$context;
	const adapter = ctx.internalAdapter;

	if (existing) {
		const updates: Record<string, unknown> = {};
		if (resolvedUsername && resolvedUsername !== existing.username) {
			updates.username = resolvedUsername;
		}
		if (email && email !== normalizeRosterEmail(existing.email)) {
			updates.email = email;
		}
		const nextRole = input.role ?? roleFromConfig;
		if (nextRole === "admin" && existing.role !== "admin")
			updates.role = "admin";
		if (!input.promoteOnly && input.role && input.role !== existing.role) {
			updates.role = input.role;
		}
		if (Object.keys(updates).length > 0) {
			await adapter.updateUser(existing.id, updates);
		}
		if (password !== null) {
			await setCredentialPassword(ctx, existing.id, password);
			await adapter.updateUser(existing.id, {
				mustChangePassword: true,
				rosterScaffold: true,
			});
			await adapter.deleteSessions(existing.id);
		}
	} else {
		const name =
			input.displayName?.trim() ||
			resolvedUsername ||
			resolvedEmail.split("@")[0] ||
			"Student";
		const created = await adapter.createUser({
			email: resolvedEmail,
			emailVerified: false,
			name,
			username: resolvedUsername ?? undefined,
			role: input.role ?? roleFromConfig,
			slug: slugFor(resolvedUsername ?? resolvedEmail),
			rosterScaffold: true,
			mustChangePassword: password !== null,
		});
		if (!created)
			throw new RosterError("Couldn't create the user.", "CONFLICT");
		if (password !== null) {
			await setCredentialPassword(ctx, created.id, password);
		}
	}

	const user =
		(username ? findRosterUserByUsername(storage.db, username) : null) ??
		(email ? findRosterUserByEmail(storage.db, email) : null);
	if (!user)
		throw new RosterError("Couldn't reload the roster user.", "CONFLICT");

	return {
		user,
		created: existing === null,
		temporaryPassword: password,
	};
}

/**
 * Change an existing roster user's username, email, and/or display name without
 * touching their password, role, workspace, or sessions. Blank username/email
 * inputs clear that field; a user must keep at least one usable identity. A
 * blank display name leaves the current name in place.
 */
export async function updateRosterIdentity(
	storage: AppStorage,
	userId: string,
	input: UpdateRosterIdentityInput,
): Promise<RosterUser> {
	const current = findRosterUserById(storage.db, userId);
	if (!current) throw new RosterError("User not found.", "NOT_FOUND");

	const nextUsername =
		input.username === undefined
			? current.username
			: input.username?.trim()
				? assertUsername(input.username)
				: null;

	let nextEmail: string;
	const rawEmail = input.email;
	if (rawEmail !== undefined) {
		if (typeof rawEmail === "string" && rawEmail.trim()) {
			nextEmail = assertEmail(rawEmail);
		} else if (nextUsername) {
			nextEmail = syntheticEmailForUsername(nextUsername);
		} else {
			throw new RosterError("Enter an email address or keep a username.");
		}
	} else if (isSyntheticEmail(current.email)) {
		if (!nextUsername) {
			throw new RosterError("Enter a real email before removing the username.");
		}
		nextEmail = syntheticEmailForUsername(nextUsername);
	} else {
		nextEmail = normalizeRosterEmail(current.email);
	}

	const byUsername = nextUsername
		? findRosterUserByUsername(storage.db, nextUsername)
		: null;
	if (byUsername && byUsername.id !== userId) {
		throw new RosterError("That username is already taken.", "CONFLICT");
	}
	const byEmail = findRosterUserByEmail(storage.db, nextEmail);
	if (byEmail && byEmail.id !== userId) {
		throw new RosterError("That email is already taken.", "CONFLICT");
	}

	const nextName = input.displayName?.trim();
	const ctx = await storage.auth.$context;
	const updated = await ctx.internalAdapter.updateUser(userId, {
		username: nextUsername,
		email: nextEmail,
		...(nextName ? { name: nextName } : {}),
	});
	if (!updated) {
		throw new RosterError("Couldn't update the user.", "CONFLICT");
	}
	const reloaded = findRosterUserById(storage.db, userId);
	if (!reloaded) throw new RosterError("Couldn't reload the user.", "CONFLICT");
	return reloaded;
}

/** Generate/assign a new temporary password and revoke existing sessions. */
export async function setTemporaryPassword(
	storage: AppStorage,
	userId: string,
	password: string = generateTemporaryPassword(),
): Promise<string> {
	if (password.length < 8 || password.length > 128) {
		throw new RosterError("Password must be between 8 and 128 characters.");
	}
	const ctx = await storage.auth.$context;
	await setCredentialPassword(ctx, userId, password);
	await ctx.internalAdapter.updateUser(userId, {
		mustChangePassword: true,
		rosterScaffold: true,
	});
	await ctx.internalAdapter.deleteSessions(userId);
	return password;
}

/** Delete a roster row that has no workspace and no signed-in history. */
export function deletePendingRosterUser(
	storage: AppStorage,
	userId: string,
): void {
	const user = storage.db
		.query(
			`SELECT u.id, w.id AS workspaceId
			 FROM user u
			 LEFT JOIN workspaces w ON w.user_id = u.id
			 WHERE u.id = ? AND u.classroomId IS NULL`,
		)
		.get(userId) as { id: string; workspaceId: string | null } | null;
	if (!user) throw new RosterError("User not found.", "NOT_FOUND");
	if (user.workspaceId) {
		throw new RosterError(
			"This user is active. Remove them from Admin → Users instead.",
			"ACTIVE_USER",
		);
	}
	storage.db.exec("BEGIN");
	try {
		storage.db.query("DELETE FROM session WHERE userId = ?").run(userId);
		storage.db.query("DELETE FROM account WHERE userId = ?").run(userId);
		storage.db.query("DELETE FROM user WHERE id = ?").run(userId);
		storage.db.exec("COMMIT");
	} catch (error) {
		storage.db.exec("ROLLBACK");
		throw error;
	}
}

/** One-time import of legacy JSON usernames/emails into the user table. */
export async function importLegacyAllowlist(
	storage: AppStorage,
): Promise<number> {
	if (storage.config.demo) return 0;
	const legacy = allowlist.getAllowlist();
	let imported = 0;
	for (const username of legacy.usernames) {
		if (findRosterUserByUsername(storage.db, username)) continue;
		await addOrUpdateRosterUser(storage, { username, provisionOnly: true });
		imported += 1;
	}
	for (const email of legacy.emails) {
		if (findRosterUserByEmail(storage.db, email)) continue;
		await addOrUpdateRosterUser(storage, { email, provisionOnly: true });
		imported += 1;
	}
	// People now live in `user`; leaving the old entries would let a deleted
	// roster row come back on the next boot and would keep two sources of truth.
	if (legacy.usernames.length > 0 || legacy.emails.length > 0) {
		await allowlist.saveAllowlist({
			usernames: [],
			emails: [],
			domains: legacy.domains,
		});
		log.info("legacy allowlist identities imported into the roster", {
			imported,
		});
	}
	return imported;
}

type AuthContext = Awaited<Auth["$context"]>;

async function setCredentialPassword(
	ctx: AuthContext,
	userId: string,
	password: string,
): Promise<void> {
	const hash = await ctx.password.hash(password);
	const accounts = await ctx.internalAdapter.findAccounts(userId);
	const credential = accounts.find(
		(account) => account.providerId === "credential",
	);
	if (credential) {
		await ctx.internalAdapter.updateAccount(credential.id, { password: hash });
		return;
	}
	await ctx.internalAdapter.linkAccount({
		userId,
		providerId: "credential",
		accountId: userId,
		password: hash,
	});
}

function slugFor(value: string): string {
	return (
		value
			.toLowerCase()
			.normalize("NFKD")
			.replace(/[\u0300-\u036f]/gu, "")
			.replace(/[^a-z0-9_-]+/gu, "-")
			.replace(/-+/gu, "-")
			.replace(/^[-_]+|[-_]+$/gu, "")
			.slice(0, 40) || "student"
	);
}

// Re-exported for admin routes that need to hide the reserved address.
export { isSyntheticEmail };
