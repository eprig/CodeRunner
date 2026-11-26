/**
 * Better Auth plugin for additive roster credentials.
 *
 * Coaches provision a `user` row (with a temporary password) through the
 * roster service. These endpoints let that signed-in person add or remove a
 * username and rotate a one-time password without creating a second user or
 * workspace. Established password changes use Better Auth's `/change-password`;
 * OAuth linking uses `linkSocial`/`oauth2.link`. Email is roster/provider-owned.
 */

import type { BetterAuthPlugin } from "better-auth";
import {
	APIError,
	createAuthEndpoint,
	sensitiveSessionMiddleware,
	sessionMiddleware,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { isValidUsername, normalizeUsername } from "./allowlist";

const INVALID_USERNAME_MESSAGE =
	"Usernames must be 3-30 characters using letters, numbers, dots, or underscores.";

export function enrollmentPlugin() {
	return {
		id: "coderunner-enrollment",
		endpoints: {
			removePassword: createAuthEndpoint(
				"/roster/remove-password",
				{
					method: "POST",
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const session = ctx.context.session;
					const user = session.user as {
						id: string;
						username?: string | null;
						mustChangePassword?: boolean;
					};
					if (user.mustChangePassword) {
						throw new APIError("FORBIDDEN", {
							message: "Change your temporary password first.",
						});
					}
					if (!user.username) {
						throw new APIError("CONFLICT", {
							message: "This account has no username to remove.",
						});
					}

					const accounts = await ctx.context.internalAdapter.findAccounts(
						user.id,
					);
					const credential = accounts.find(
						(account) => account.providerId === "credential",
					);
					if (!credential) {
						throw new APIError("CONFLICT", {
							message: "This account already has no password login.",
						});
					}
					// Never strand a user with no way in: an OAuth account must
					// already be attached before the credential can go away.
					if (
						!accounts.some((account) => account.providerId !== "credential")
					) {
						throw new APIError("BAD_REQUEST", {
							message:
								"Connect Google (or another sign-in method) before removing your username and password.",
						});
					}

					await ctx.context.internalAdapter.deleteAccount(credential.id);
					const updated = await ctx.context.internalAdapter.updateUser(
						user.id,
						{
							username: null,
						},
					);
					if (!updated) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: "Couldn't remove your username.",
						});
					}
					await setSessionCookie(ctx, {
						session: session.session,
						user: updated,
					});
					return ctx.json({ ok: true });
				},
			),
			/**
			 * A coach-set password is a one-time credential. Reaching this
			 * endpoint requires a signed-in session — whether that came from
			 * the temporary password or from Google — so asking for the old
			 * password again would only block students who never used it.
			 */
			replaceTemporaryPassword: createAuthEndpoint(
				"/roster/replace-temporary-password",
				{
					method: "POST",
					use: [sensitiveSessionMiddleware],
				},
				async (ctx) => {
					const { newPassword, confirmPassword } = (ctx.body ?? {}) as {
						newPassword?: unknown;
						confirmPassword?: unknown;
					};
					if (
						typeof newPassword !== "string" ||
						newPassword.length < 8 ||
						newPassword.length > 128
					) {
						throw new APIError("BAD_REQUEST", {
							message: "Password must be between 8 and 128 characters.",
						});
					}
					if (newPassword !== confirmPassword) {
						throw new APIError("BAD_REQUEST", {
							message: "The two passwords don't match.",
						});
					}

					const session = ctx.context.session;
					const user = session.user as {
						id: string;
						mustChangePassword?: boolean;
					};
					if (!user.mustChangePassword) {
						throw new APIError("FORBIDDEN", {
							message: "Use Change password to update your password.",
						});
					}

					const accounts = await ctx.context.internalAdapter.findAccounts(
						user.id,
					);
					const passwordHash = await ctx.context.password.hash(newPassword);
					const credential = accounts.find(
						(account) => account.providerId === "credential",
					);
					if (credential) {
						await ctx.context.internalAdapter.updateAccount(credential.id, {
							password: passwordHash,
						});
					} else {
						await ctx.context.internalAdapter.linkAccount({
							userId: user.id,
							providerId: "credential",
							accountId: user.id,
							password: passwordHash,
						});
					}

					const updated = await ctx.context.internalAdapter.updateUser(
						user.id,
						{ mustChangePassword: false },
					);
					if (!updated) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: "Couldn't save your new password.",
						});
					}
					// Refresh the cookie cache: the control-plane gate reads the
					// user flag on the very next request.
					await setSessionCookie(ctx, {
						session: session.session,
						user: updated,
					});
					return ctx.json({ ok: true });
				},
			),
			/**
			 * Better Auth 1.6.10 exports `setPassword` without a routed path, so
			 * `/api/auth/set-password` is a 404. Own the "add a password" step
			 * here instead; codium sessions are still required and fresh.
			 */
			addPassword: createAuthEndpoint(
				"/roster/set-password",
				{
					method: "POST",
					use: [sensitiveSessionMiddleware],
				},
				async (ctx) => {
					const { newPassword } = (ctx.body ?? {}) as {
						newPassword?: unknown;
					};
					if (
						typeof newPassword !== "string" ||
						newPassword.length < 8 ||
						newPassword.length > 128
					) {
						throw new APIError("BAD_REQUEST", {
							message: "Password must be between 8 and 128 characters.",
						});
					}

					const user = ctx.context.session.user as { id: string };
					const accounts = await ctx.context.internalAdapter.findAccounts(
						user.id,
					);
					if (accounts.some((account) => account.providerId === "credential")) {
						throw new APIError("CONFLICT", {
							message:
								"This account already has a password. Use Change password instead.",
						});
					}

					const passwordHash = await ctx.context.password.hash(newPassword);
					await ctx.context.internalAdapter.linkAccount({
						userId: user.id,
						providerId: "credential",
						accountId: user.id,
						password: passwordHash,
					});
					return ctx.json({ ok: true });
				},
			),
			claimUsername: createAuthEndpoint(
				"/roster/claim-username",
				{
					method: "POST",
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const rawUsername = (ctx.body as { username?: unknown } | undefined)
						?.username;
					if (typeof rawUsername !== "string") {
						throw new APIError("BAD_REQUEST", {
							message: INVALID_USERNAME_MESSAGE,
						});
					}
					const session = ctx.context.session;
					const user = session.user as { id: string; username?: string | null };
					if (user.username) {
						throw new APIError("CONFLICT", {
							message: "This account already has a username.",
						});
					}

					const username = normalizeUsername(rawUsername);
					if (!isValidUsername(username)) {
						throw new APIError("BAD_REQUEST", {
							message: INVALID_USERNAME_MESSAGE,
						});
					}

					const existing = await ctx.context.adapter.findOne<{
						id: string;
					}>({
						model: "user",
						where: [{ field: "username", value: username }],
					});
					if (existing && existing.id !== user.id) {
						throw new APIError("CONFLICT", {
							message: "That username is already taken.",
						});
					}

					const updated = await ctx.context.internalAdapter.updateUser(
						user.id,
						{ username },
					);
					if (!updated) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: "Couldn't save your username.",
						});
					}
					await setSessionCookie(ctx, {
						session: session.session,
						user: updated,
					});
					return ctx.json({ ok: true, username });
				},
			),
		},
	} satisfies BetterAuthPlugin;
}
