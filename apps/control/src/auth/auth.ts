/**
 * Better Auth instance — the single source of truth for authentication.
 *
 * Creates and configures the betterAuth instance with:
 * - SQLite database (shared with AppStorage)
 * - GitHub + Google OAuth providers, plus Auth0 via genericOAuth
 * - Optional username/password auth (enabled by CODERUNNER_USERNAME_PASSWORD)
 * - Custom user fields: role, slug, rosterScaffold, mustChangePassword
 * - User-table roster enforcement via hooks (Auth0 users: role claim instead)
 * - 14-day session expiry with daily refresh
 * - Additive logins: one user may hold a username, an email, and OAuth accounts
 *
 * Public sign-up is disabled. A coach provisions (or updates) a Better Auth
 * `user` row with a temporary password through `auth/roster.ts`; the student
 * signs in and must rotate that password before using the rest of the site.
 * OAuth uses Better Auth's implicit linking to attach another account to the
 * same user. Google verifies the real address, so it can be linked to a
 * username-only row even though that row has a reserved placeholder email.
 *
 * Passwords never reach the database in plaintext: Better Auth hashes them
 * with scrypt (random 16-byte salt, N=16384, r=16, p=1, 64-byte key) and stores
 * only `<salt>:<hash>` on the credential account row.
 *
 * Username-only accounts use a reserved
 * `<username>@students.coderunner.invalid` address, which can never receive
 * mail. Accounts with a real email keep it and can sign in either way.
 */

import type { Database } from "bun:sqlite";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { username } from "better-auth/plugins";
import type { AuditEventInput } from "../audit";
import type { ControlConfig } from "../config";
import { getLogger } from "../logging";
import {
	isSyntheticEmail,
	isValidUsername,
	normalizeUsername,
	reloadAllowlist,
	syntheticEmailForUsername,
} from "./allowlist";
import { classroomPlugin } from "./classroom-plugin";
import { enrollmentPlugin } from "./enrollment-plugin";
import {
	buildAuth0Plugin,
	buildSocialProviders,
	getEnabledAuthProviders,
} from "./providers";
import { isEmailPermitted, isUsernamePermitted } from "./roster";

const log = getLogger("auth");

const ROSTER_EMAIL_MESSAGE =
	"Your email is not on the roster. Ask your coach to add you.";
const ROSTER_USERNAME_MESSAGE =
	"Your username is not on the roster. Ask your coach to add you.";
const INVALID_USERNAME_MESSAGE =
	"Usernames must be 3-30 characters using letters, numbers, dots, or underscores.";

/** True for the genericOAuth callback of the Auth0 provider. */
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
			// Students are provisioned by a coach; public sign-up would create a
			// second roster row and a second workspace for the same person.
			disableSignUp: true,
			// Better Auth's defaults, stated explicitly: passwords shorter than 8
			// are rejected and inputs are capped at 128 characters.
			minPasswordLength: 8,
			maxPasswordLength: 128,
		},
		account: {
			accountLinking: {
				enabled: true,
				// A username-only roster row has a reserved, undeliverable email.
				// Google verifies the real address, so allow it to be linked to
				// that row instead of creating a second user. Auth0's role claim
				// is still authoritative.
				allowDifferentEmails: true,
				trustedProviders: getEnabledAuthProviders(config),
			},
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
						enrollmentPlugin(),
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
			changeEmail: {
				// The endpoint stays registered so the before hook can return a
				// clear error. Every request is rejected: email is roster/
				// provider-owned, set by coaches or verified by OAuth.
				enabled: true,
				updateEmailWithoutVerification: false,
			},
			additionalFields: {
				role: {
					type: "string",
					required: false,
					defaultValue: "student",
					input: false,
				},
				// Set only by the roster service. Lets user.create.before tell a
				// coach-provisioned row from a client/OAuth signup without a
				// client-settable flag.
				rosterScaffold: {
					type: "boolean",
					required: false,
					defaultValue: false,
					input: false,
					returned: false,
				},
				// True until the student rotates their coach-set temporary
				// password. The control plane blocks other routes in the
				// meantime; /change-password clears it via an after-hook.
				mustChangePassword: {
					type: "boolean",
					required: false,
					defaultValue: false,
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

						// Only the roster service sets this (input: false for clients).
						// Provisioned rows are already vetted; don't re-run the
						// domain/roster gate against their own email.
						const provisioned =
							(user as { rosterScaffold?: boolean }).rosterScaffold === true;

						const rawUsername = usernameFromUser(user);
						if (rawUsername) {
							const username = normalizeUsername(rawUsername);
							if (!isValidUsername(username)) {
								throw new APIError("BAD_REQUEST", {
									message: INVALID_USERNAME_MESSAGE,
								});
							}
							if (!provisioned) {
								await refreshAllowlistBeforeCheck();
								if (!isUsernamePermitted(db, username)) {
									log.warn("new user rejected: username not on roster", {
										username,
									});
									throw new APIError("FORBIDDEN", {
										message: ROSTER_USERNAME_MESSAGE,
									});
								}
							}
							const role =
								(user as { role?: string }).role ??
								(config.adminUsernames.includes(username)
									? "admin"
									: "student");
							const slug = slugify(username);
							const email = isSyntheticEmail(user.email)
								? syntheticEmailForUsername(username)
								: user.email;
							log.info("creating new username user", {
								username,
								slug,
								role,
								provisioned,
							});
							return {
								data: {
									...user,
									username,
									email,
									name: user.name.trim() || username,
									slug,
									role,
								},
							};
						}

						const slug = slugFromEmail(user.email);
						if (isAuth0Callback(ctx)) {
							// Auth0 vets the user; the role claim replaces the roster.
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
						if (!provisioned) {
							await refreshAllowlistBeforeCheck();
							if (!isEmailPermitted(db, user.email)) {
								log.warn("new user rejected: not on roster", {
									email: user.email,
								});
								throw new APIError("FORBIDDEN", {
									message: ROSTER_EMAIL_MESSAGE,
								});
							}
						}
						const role =
							(user as { role?: string }).role ??
							(config.adminEmails.includes(user.email.toLowerCase())
								? "admin"
								: "student");
						log.info("creating new user", {
							email: user.email,
							slug,
							role,
							provisioned,
						});
						return { data: { ...user, slug, role } };
					},
				},
			},
		},
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				// Sign-in roster checks run *before* Better Auth creates a session:
				// an after-hook rejection still ships the cookie, whose 5-minute
				// cache would keep the user signed in briefly.
				if (ctx.path === "/sign-up/email") {
					throw new APIError("FORBIDDEN", {
						message:
							"Accounts are created by your coach. Ask them to add you to the roster.",
					});
				}

				// Email is roster/provider-owned: coaches set it when provisioning
				// and Google supplies the verified address. The account page only
				// displays it, so a direct API call must be rejected too.
				if (ctx.path === "/change-email") {
					throw new APIError("FORBIDDEN", {
						message:
							"Email is managed by your coach or sign-in provider and can't be changed here.",
					});
				}

				// Better Auth stops the last account from being unlinked, but a
				// user can still be locked out by removing the wrong one. Keep a
				// username + password while an OAuth method exists, and vice versa.
				// The credential half clears `username` via /roster/remove-password.
				if (ctx.path === "/unlink-account") {
					const providerId = (ctx.body as { providerId?: unknown } | undefined)
						?.providerId;
					if (typeof providerId !== "string") return;
					const session = await getSessionFromCtx(ctx);
					if (!session) return; // the endpoint itself rejects this
					const accounts = await ctx.context.internalAdapter.findAccounts(
						session.user.id,
					);
					if (providerId === "credential") {
						throw new APIError("BAD_REQUEST", {
							message:
								"Use Remove username and password so your username is cleared too.",
						});
					}
					if (accounts.length <= 1) {
						throw new APIError("BAD_REQUEST", {
							message:
								"Add another sign-in method before disconnecting this one.",
						});
					}
					return;
				}

				if (ctx.path === "/sign-in/username") {
					const rawUsername = (ctx.body as { username?: unknown } | undefined)
						?.username;
					if (typeof rawUsername !== "string") return;
					const normalized = normalizeUsername(rawUsername);
					await refreshAllowlistBeforeCheck();
					if (!isUsernamePermitted(db, normalized)) {
						log.warn("username/password sign-in rejected: not on roster", {
							username: normalized,
						});
						throw new APIError("FORBIDDEN", {
							message: ROSTER_USERNAME_MESSAGE,
						});
					}
					return;
				}

				if (ctx.path === "/sign-in/email") {
					const rawEmail = (ctx.body as { email?: unknown } | undefined)?.email;
					if (typeof rawEmail !== "string") return;
					const email = rawEmail.trim().toLowerCase();
					// Username-only users have a synthetic mailbox; make them use
					// the username endpoint so the error messages stay accurate.
					if (isSyntheticEmail(email)) {
						throw new APIError("BAD_REQUEST", {
							message: "Sign in with your username instead.",
						});
					}
					await refreshAllowlistBeforeCheck();
					if (!isEmailPermitted(db, email)) {
						log.warn("email/password sign-in rejected: not on roster", {
							email,
						});
						throw new APIError("FORBIDDEN", {
							message: ROSTER_EMAIL_MESSAGE,
						});
					}
				}
			}),
			after: createAuthMiddleware(async (ctx) => {
				// The temp password is a one-time credential. Clear the flag as
				// soon as the student rotates it, and refresh the cookie cache so
				// the control-plane gate sees the change on the very next request.
				if (ctx.path === "/change-password") {
					const current = ctx.context.session;
					if (current?.session) {
						const updated = await ctx.context.internalAdapter.updateUser(
							current.user.id,
							{ mustChangePassword: false },
						);
						if (updated) {
							// With revokeOtherSessions, Better Auth deletes every session
							// and returns the new token in the response. Refreshing from
							// ctx.context.session would write the deleted token back.
							let activeSession = current;
							const returned = ctx.context.returned as
								| { token?: unknown }
								| undefined;
							if (typeof returned?.token === "string") {
								const fresh = await ctx.context.internalAdapter.findSession(
									returned.token,
								);
								if (fresh) activeSession = fresh;
							}
							await setSessionCookie(ctx, {
								session: activeSession.session,
								user: updated,
							});
						}
					}
				}

				const auth0 = isAuth0Callback(ctx);
				const oauthCallback = ctx.path === "/callback/:id" || auth0;
				const passwordSignIn =
					ctx.path === "/sign-in/username" || ctx.path === "/sign-in/email";

				if (oauthCallback || passwordSignIn) {
					const newSession = ctx.context.newSession;
					// Re-check the roster for returning OAuth users. New users were
					// already checked by user.create.before; username/password sign-in
					// by the before hook; Auth0 by its role claim instead.
					if (newSession && oauthCallback && !auth0) {
						await refreshAllowlistBeforeCheck();
						const user = newSession.user as Record<string, unknown>;
						const linkedUsername = usernameFromUser(user);
						const allowed =
							isEmailPermitted(db, newSession.user.email) ||
							(linkedUsername !== null &&
								isUsernamePermitted(db, linkedUsername));
						if (!allowed) {
							log.warn("oauth callback rejected: not on roster", {
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
