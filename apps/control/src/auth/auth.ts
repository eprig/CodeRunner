/**
 * Better Auth instance — the single source of truth for authentication.
 *
 * Creates and configures the betterAuth instance with:
 * - SQLite database (shared with AppStorage)
 * - GitHub + Google OAuth providers, plus Auth0 via genericOAuth
 * - Optional username/password auth (enabled by CODERUNNER_USERNAME_PASSWORD)
 * - Custom user fields: role, slug
 * - Username/email allowlist enforcement via hooks (Auth0 users: role claim instead)
 * - 14-day session expiry with daily refresh
 * - Separate username/password and OAuth accounts (account linking disabled)
 *
 * Passwords never reach the database in plaintext: Better Auth hashes them
 * with scrypt (random 16-byte salt, N=16384, r=16, p=1, 64-byte key) and stores
 * only `<salt>:<hash>` on the credential account row.
 *
 * Username accounts have no real email. A reserved
 * `<username>@students.coderunner.invalid` address satisfies Better Auth's
 * required email column; it can never receive mail. Linking an OAuth account
 * Username accounts use a reserved `.invalid` address; OAuth accounts use
 * their provider email as their allowlist identity.
 */

import type { Database } from "bun:sqlite";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { username } from "better-auth/plugins";
import type { AuditEventInput } from "../audit";
import type { ControlConfig } from "../config";
import { getLogger } from "../logging";
import {
	isEmailAllowed,
	isUsernameAllowed,
	isValidUsername,
	normalizeUsername,
	reloadAllowlist,
	syntheticEmailForUsername,
} from "./allowlist";
import { classroomPlugin } from "./classroom-plugin";
import { buildAuth0Plugin, buildSocialProviders } from "./providers";

const log = getLogger("auth");

const ROSTER_EMAIL_MESSAGE =
	"Your email is not on the roster. Ask your coach to add you.";
const ROSTER_USERNAME_MESSAGE =
	"Your username is not on the roster. Ask your coach to add you.";
const INVALID_USERNAME_MESSAGE =
	"Usernames must be 3-30 characters using letters, numbers, dots, or underscores.";

/** True for the genericOAuth callback of the Auth0 provider. */
function isAuth0Callback(
	ctx:
		| {
				path?: string | undefined;
				params?: Record<string, unknown> | undefined;
		  }
		| null
		| undefined,
): boolean {
	return (
		ctx?.path === "/oauth2/callback/:providerId" &&
		ctx.params?.providerId === "auth0"
	);
}

/**
 * Reload allowlist.json from disk before enforcing it, so CLI edits
 * (`coderunner allowlist add`) take effect on the next sign-in attempt
 * without requiring the admin-panel Reload button or a restart. A stale
 * cache is an acceptable fallback for a malformed file — a hard sign-in
 * crash is not.
 */
async function refreshAllowlistBeforeCheck(): Promise<void> {
	try {
		await reloadAllowlist();
	} catch (error) {
		log.warn("allowlist reload failed, using cached allowlist", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export function slugify(value: string): string {
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

export function slugFromEmail(email: string): string {
	return slugify(email.split("@")[0] ?? "student");
}

function usernameFromUser(user: Record<string, unknown>): string | null {
	const value = user.username;
	return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export type AuthCallbacks = {
	/** Called after OAuth callback for new users to create their workspace. */
	ensureWorkspace: (userId: string, slug: string) => Promise<void>;
	/** Records an audit event (classroom guest joins). */
	audit: (event: AuditEventInput) => void;
};

export function createAuth(
	db: Database,
	config: ControlConfig,
	callbacks: AuthCallbacks,
) {
	const socialProviders = config.demo ? {} : buildSocialProviders(config);
	const auth0Plugin = config.demo ? null : buildAuth0Plugin(config);
	// Demo mode bypasses auth entirely, so the password endpoints stay off even
	// if an operator happens to set the env var.
	const usernamePasswordEnabled = !config.demo && config.usernamePasswordAuth;
	const options: BetterAuthOptions = {
		database: db,
		baseURL: config.baseUrl,
		basePath: "/api/auth",
		secret: config.sessionSecret,
		socialProviders,
		emailAndPassword: {
			enabled: usernamePasswordEnabled,
			// Better Auth's defaults, stated explicitly: passwords shorter than 8
			// are rejected and inputs are capped at 128 characters.
			minPasswordLength: 8,
			maxPasswordLength: 128,
		},
		plugins: [
			classroomPlugin({
				db,
				ensureWorkspace: callbacks.ensureWorkspace,
				audit: callbacks.audit,
			}),
			...(auth0Plugin ? [auth0Plugin] : []),
			// Only register the plugin when the feature is on: it also registers
			// the /sign-in/username and /is-username-available endpoints, which
			// must not accept passwords while the feature is disabled.
			...(usernamePasswordEnabled
				? [
						username({
							minUsernameLength: 3,
							maxUsernameLength: 30,
							usernameValidator: (value) => isValidUsername(value),
						}),
					]
				: []),
		],
		session: {
			expiresIn: 14 * 24 * 60 * 60, // 14 days in seconds
			updateAge: 24 * 60 * 60, // refresh session expiry daily
			cookieCache: {
				enabled: true,
				maxAge: 5 * 60, // 5 minutes
			},
		},
		user: {
			additionalFields: {
				role: {
					type: "string",
					required: false,
					defaultValue: "student",
					input: false,
				},
				slug: {
					type: "string",
					required: false,
					input: false,
				},
				// Classroom guests (decision 043). Better Auth adds these columns.
				classroomId: {
					type: "string",
					required: false,
					input: false,
				},
				guestNameKey: {
					type: "string",
					required: false,
					input: false,
				},
			},
		},
		advanced: {
			cookiePrefix: "frc",
			cookies: {
				session_token: {
					name: "coderunner_session",
				},
			},
		},
		databaseHooks: {
			user: {
				create: {
					before: async (user, ctx) => {
						const classroomId = (user as { classroomId?: string | null })
							.classroomId;
						if (classroomId) {
							// Classroom guests: no allowlist, never admin, slug from name.
							const slug = slugify(user.name);
							log.info("creating classroom guest", { classroomId, slug });
							return { data: { ...user, slug, role: "student" } };
						}

						const rawUsername = usernameFromUser(user);
						if (rawUsername) {
							const username = normalizeUsername(rawUsername);
							if (!isValidUsername(username)) {
								throw new APIError("BAD_REQUEST", {
									message: INVALID_USERNAME_MESSAGE,
								});
							}
							await refreshAllowlistBeforeCheck();
							if (!isUsernameAllowed(username)) {
								log.warn("new user rejected: username not on allowlist", {
									username,
								});
								throw new APIError("FORBIDDEN", {
									message: ROSTER_USERNAME_MESSAGE,
								});
							}
							const role = config.adminUsernames.includes(username)
								? "admin"
								: "student";
							const slug = slugify(username);
							log.info("creating new username user", { username, slug, role });
							return {
								data: {
									...user,
									username,
									// Never trust a client-supplied email for username
									// accounts; derive the reserved address server-side.
									email: syntheticEmailForUsername(username),
									name: user.name.trim() || username,
									slug,
									role,
								},
							};
						}

						const slug = slugFromEmail(user.email);
						if (isAuth0Callback(ctx)) {
							// Auth0 vets the user; the role claim replaces the allowlist.
							// The Auth0 profile mapper already denied users with no role
							// and put the role on `user`.
							const role = (user as { role?: string }).role;
							log.info("creating new auth0 user", {
								email: user.email,
								slug,
								role,
							});
							return { data: { ...user, slug, role } };
						}
						// Enforce allowlist on new user creation
						await refreshAllowlistBeforeCheck();
						if (!isEmailAllowed(user.email)) {
							log.warn("new user rejected: not on allowlist", {
								email: user.email,
							});
							throw new APIError("FORBIDDEN", {
								message: ROSTER_EMAIL_MESSAGE,
							});
						}
						const role = config.adminEmails.includes(user.email.toLowerCase())
							? "admin"
							: "student";
						log.info("creating new user", { email: user.email, slug, role });
						return {
							data: {
								...user,
								slug,
								role,
							},
						};
					},
				},
			},
		},
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				// Username/password sign-in must be blocked *before* Better Auth
				// creates a session: an after-hook rejection still ships the
				// fresh session cookie, whose 5-minute cookie cache would keep
				// the user signed in, and the session row delete races the
				// cookie. Sign-up is covered by user.create.before above, but is
				// also checked here so the roster error arrives before hashing.
				if (ctx.path === "/sign-up/email") {
					const body = ctx.body as
						| { username?: unknown; name?: unknown }
						| undefined;
					const rawUsername = body?.username;
					if (typeof rawUsername !== "string") {
						throw new APIError("BAD_REQUEST", {
							message: INVALID_USERNAME_MESSAGE,
						});
					}
					const normalized = normalizeUsername(rawUsername);
					if (!isValidUsername(normalized)) {
						throw new APIError("BAD_REQUEST", {
							message: INVALID_USERNAME_MESSAGE,
						});
					}
					await refreshAllowlistBeforeCheck();
					if (!isUsernameAllowed(normalized)) {
						log.warn("username/password sign-up rejected: not on allowlist", {
							username: normalized,
						});
						throw new APIError("FORBIDDEN", {
							message: ROSTER_USERNAME_MESSAGE,
						});
					}
					// Force the reserved address and derive a display name, so a
					// client cannot choose an email that collides with a real user.
					return {
						context: {
							body: {
								...(body as Record<string, unknown>),
								email: syntheticEmailForUsername(normalized),
								name:
									typeof body?.name === "string" && body.name.trim()
										? body.name
										: normalized,
							},
						},
					};
				}

				if (ctx.path === "/sign-in/username") {
					const rawUsername = (ctx.body as { username?: unknown } | undefined)
						?.username;
					if (typeof rawUsername !== "string") {
						return;
					}
					const normalized = normalizeUsername(rawUsername);
					await refreshAllowlistBeforeCheck();
					const allowed = isUsernameAllowed(normalized);
					if (!allowed) {
					}
					if (!allowed) {
						log.warn("username/password sign-in rejected: not on allowlist", {
							username: normalized,
						});
						throw new APIError("FORBIDDEN", {
							message: ROSTER_USERNAME_MESSAGE,
						});
					}
					return;
				}

				// Email sign-in has no place in a username deployment: it would
				// accept the synthetic address and bypass the username-facing
				// error paths. Username sign-in is the supported endpoint.
				if (ctx.path === "/sign-in/email") {
					throw new APIError("BAD_REQUEST", {
						message: "Sign in with your username instead.",
					});
				}
			}),
			after: createAuthMiddleware(async (ctx) => {
				const auth0 = isAuth0Callback(ctx);
				const oauthCallback = ctx.path === "/callback/:id" || auth0;
				const usernamePasswordSignIn = ctx.path === "/sign-in/username";
				const usernamePasswordSignUp = ctx.path === "/sign-up/email";

				if (oauthCallback || usernamePasswordSignIn || usernamePasswordSignUp) {
					const newSession = ctx.context.newSession;
					// Re-check the allowlist for returning OAuth users. New users
					// were already checked by user.create.before, username/password
					// sign-in by the before hook, and Auth0 users are vetted by
					// their role claim instead.
					if (newSession && oauthCallback && !auth0) {
						await refreshAllowlistBeforeCheck();
						const user = newSession.user as Record<string, unknown>;
						const linkedUsername = usernameFromUser(user);
						const allowed =
							isEmailAllowed(newSession.user.email) ||
							(linkedUsername !== null && isUsernameAllowed(linkedUsername));
						if (!allowed) {
							log.warn("oauth callback rejected: not on allowlist", {
								email: newSession.user.email,
								username: linkedUsername,
							});
							// Revoke the session that was just created
							await ctx.context.internalAdapter.deleteSession(
								newSession.session.token,
							);
							throw new APIError("FORBIDDEN", {
								message: ROSTER_EMAIL_MESSAGE,
							});
						}
					}

					// Create workspace if this is the user's first login
					if (newSession) {
						const user = newSession.user as {
							id: string;
							slug?: string;
							username?: string | null;
						};
						const slug =
							user.slug ??
							(user.username
								? slugify(user.username)
								: slugFromEmail(newSession.user.email));
						log.info("sign-in ok", {
							userId: user.id,
							email: newSession.user.email,
							username: user.username ?? null,
							slug,
						});
						await callbacks.ensureWorkspace(user.id, slug);
					}
				}
			}),
		},
	};

	return betterAuth(options);
}

export type Auth = ReturnType<typeof createAuth>;
