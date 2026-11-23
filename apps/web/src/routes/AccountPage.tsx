import { ArrowLeft } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { IconType } from "react-icons";
import { SiAuth0, SiGithub, SiGoogle } from "react-icons/si";
import { Navigate, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import {
	type AuthProvider,
	authProvidersResponseSchema,
} from "@/lib/contracts";

const inputClassName =
	"h-10 w-full rounded-md border border-border bg-card px-3 text-[13px] text-foreground outline-none focus:border-foreground/30";

const PROVIDERS: Record<AuthProvider, { label: string; Icon: IconType }> = {
	github: { label: "GitHub", Icon: SiGithub },
	google: { label: "Google", Icon: SiGoogle },
	auth0: { label: "Auth0", Icon: SiAuth0 },
};

type SessionUser = {
	id: string;
	name?: string;
	email?: string;
	username?: string | null;
	mustChangePassword?: boolean;
};

type LinkedAccount = {
	providerId: string;
	accountId?: string;
};

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message.trim().length > 0
		? error.message
		: fallback;
}

function displayEmail(email: string | undefined): string {
	if (!email || email.endsWith("@students.coderunner.invalid")) return "—";
	return email;
}

export function AccountPage() {
	const navigate = useNavigate();
	const { data: session, isPending, refetch } = authClient.useSession();
	const [providers, setProviders] = useState<AuthProvider[]>([]);
	const [usernamePasswordEnabled, setUsernamePasswordEnabled] = useState(false);
	const [linkedProviders, setLinkedProviders] = useState<string[]>([]);
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [changePasswordOpen, setChangePasswordOpen] = useState(false);
	const [username, setUsername] = useState("");
	const [linkPassword, setLinkPassword] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const refreshAccounts = useCallback(async () => {
		const result = await authClient.$fetch("/list-accounts", { method: "GET" });
		if (result.error) return;
		const accounts = (result.data ?? []) as LinkedAccount[];
		setLinkedProviders(accounts.map((account) => account.providerId));
	}, []);

	useEffect(() => {
		const controller = new AbortController();
		fetch("/api/auth/providers", {
			credentials: "same-origin",
			signal: controller.signal,
		})
			.then((res) => res.json())
			.then((raw: unknown) => {
				const parsed = authProvidersResponseSchema.parse(raw);
				setProviders(parsed.providers);
				setUsernamePasswordEnabled(parsed.usernamePassword);
			})
			.catch(() => {
				// The forms that need discovery simply stay hidden.
			});
		void refreshAccounts().catch(() => {
			// Connection statuses stay "Not connected" until the next load.
		});
		return () => controller.abort();
	}, [refreshAccounts]);

	if (!isPending && !session) {
		return <Navigate to="/login" replace />;
	}

	const user = (session?.user ?? {}) as SessionUser;
	const mustChangePassword = user.mustChangePassword === true;
	const hasCredential = linkedProviders.includes("credential");
	const passwordConnected = Boolean(user.username) && hasCredential;
	const oauthMethods = linkedProviders.filter(
		(provider) => provider !== "credential" && provider !== "",
	);
	const hasOAuthFallback = oauthMethods.length > 0;
	// Password sign-in and every other connected provider can be removed as
	// long as at least one method survives.
	const canDisconnectOAuth = passwordConnected || oauthMethods.length > 1;
	const hasGoogleProvider = providers.includes("google");
	const emailInfo = (
		<div className="mt-2 border-t border-border pt-2">
			<p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
				Email
			</p>
			<p data-testid="account-email" className="mt-1 font-mono">
				{displayEmail(user.email)}
			</p>
		</div>
	);

	async function runAction(action: () => Promise<void>, fallback: string) {
		setBusy(true);
		setError(null);
		setMessage(null);
		try {
			await action();
		} catch (err) {
			setError(errorMessage(err, fallback));
		} finally {
			setBusy(false);
		}
	}

	async function changePassword(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		await runAction(async () => {
			const result = await authClient.changePassword({
				currentPassword,
				newPassword,
				revokeOtherSessions: true,
			});
			if (result.error) {
				setError(result.error.message ?? "Couldn't change your password.");
				return;
			}
			setCurrentPassword("");
			setNewPassword("");
			setChangePasswordOpen(false);
			await Promise.all([refetch(), refreshAccounts()]);
			setMessage("Password updated. Redirecting…");
			window.location.assign("/");
		}, "Couldn't change your password.");
	}

	async function replaceTemporaryPassword(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		await runAction(async () => {
			// The old password is deliberately not requested: this session was
			// created after the coach reset it, possibly through Google.
			const result = await authClient.$fetch(
				"/roster/replace-temporary-password",
				{
					method: "POST",
					body: { newPassword, confirmPassword },
				},
			);
			if (result.error) {
				setError(result.error.message ?? "Couldn't set your new password.");
				return;
			}
			setNewPassword("");
			setConfirmPassword("");
			await Promise.all([refetch(), refreshAccounts()]);
			setMessage("Password updated. Redirecting…");
			window.location.assign("/");
		}, "Couldn't set your new password.");
	}

	async function setupPasswordSignIn(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		await runAction(async () => {
			if (!user.username) {
				const response = await fetch("/api/auth/roster/claim-username", {
					method: "POST",
					credentials: "same-origin",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ username: username.trim().toLowerCase() }),
				});
				const body = (await response.json()) as {
					ok?: boolean;
					message?: string;
					error?: string;
				};
				if (!response.ok || !body.ok) {
					setError(body.message ?? body.error ?? "Couldn't add that username.");
					return;
				}
			}

			if (!hasCredential) {
				const result = await authClient.$fetch("/roster/set-password", {
					method: "POST",
					body: { newPassword: linkPassword },
				});
				if (result.error) {
					setError(result.error.message ?? "Couldn't add a password.");
					return;
				}
			}

			setUsername("");
			setLinkPassword("");
			await Promise.all([refetch(), refreshAccounts()]);
			setMessage(
				hasCredential
					? "Username added to your account."
					: "Username and password added to your account.",
			);
		}, "Couldn't add username and password.");
	}

	async function removePassword() {
		await runAction(async () => {
			const response = await fetch("/api/auth/roster/remove-password", {
				method: "POST",
				credentials: "same-origin",
			});
			const body = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !body.ok) {
				setError(body.error ?? "Couldn't remove your username and password.");
				return;
			}
			await Promise.all([refetch(), refreshAccounts()]);
			setMessage("Username and password removed.");
		}, "Couldn't remove your username and password.");
	}

	async function linkProvider(provider: AuthProvider) {
		await runAction(async () => {
			const result =
				provider === "auth0"
					? await authClient.oauth2.link({
							providerId: "auth0",
							callbackURL: "/account",
						})
					: await authClient.linkSocial({
							provider,
							callbackURL: "/account",
						});
			if (result.error) {
				setError(
					result.error.message ??
						`Couldn't start linking ${PROVIDERS[provider].label}.`,
				);
			}
		}, "Couldn't start linking.");
	}

	async function disconnectProvider(provider: AuthProvider) {
		await runAction(async () => {
			const result = await authClient.$fetch("/unlink-account", {
				method: "POST",
				body: { providerId: provider },
			});
			if (result.error) {
				setError(
					result.error.message ??
						`Couldn't disconnect ${PROVIDERS[provider].label}.`,
				);
				return;
			}
			await refreshAccounts();
			setMessage(`${PROVIDERS[provider].label} disconnected.`);
		}, "Couldn't disconnect that sign-in method.");
	}

	return (
		<div className="mx-auto min-h-screen w-full max-w-2xl px-6 py-10">
			<div className="mb-6 flex items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<Button
						variant="outline"
						size="icon"
						aria-label="Back"
						onClick={() => navigate("/")}
					>
						<ArrowLeft className="size-4" />
					</Button>
					<h1 className="text-2xl font-semibold">Your account</h1>
				</div>
				<Button
					variant="outline"
					onClick={() =>
						void authClient.signOut().then(() => navigate("/login"))
					}
				>
					Sign out
				</Button>
			</div>

			{mustChangePassword && (
				<div className="mb-5 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
					Your coach gave you a temporary password. Choose a new one before
					using the rest of CodeRunner.
				</div>
			)}
			{message && <p className="mb-4 text-sm text-green-400">{message}</p>}
			{error && (
				<p className="mb-4 text-sm text-destructive" role="alert">
					{error}
				</p>
			)}

			<div className="space-y-5">
				<Card>
					<CardHeader>
						<CardTitle className="text-sm">Sign-in methods</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4 text-sm">
						<div className="rounded-md border border-border p-3">
							<div className="flex items-center justify-between gap-2">
								<div>
									<p className="font-medium">Username &amp; password</p>
									<p className="text-xs text-muted-foreground">
										{passwordConnected
											? `Signing in as ${user.username}`
											: mustChangePassword
												? "Choose a new password"
												: !usernamePasswordEnabled
													? "Not connected"
													: hasCredential
														? "Add a username to finish"
														: "Add a username and password"}
									</p>
								</div>
								<span
									className={`rounded px-2 py-0.5 text-[10px] uppercase ${
										passwordConnected
											? "bg-green-900/50 text-green-300"
											: "bg-zinc-800 text-zinc-400"
									}`}
								>
									{passwordConnected ? "Connected" : "Not connected"}
								</span>
							</div>
							{!hasGoogleProvider && emailInfo}
							{mustChangePassword ? (
								<form
									onSubmit={replaceTemporaryPassword}
									className="mt-3 space-y-2"
								>
									<p className="text-xs text-muted-foreground">
										You&apos;re already signed in. Enter a new password twice —
										no old password needed.
									</p>
									<input
										type="password"
										value={newPassword}
										onChange={(e) => setNewPassword(e.target.value)}
										placeholder="New password (8+ characters)"
										autoComplete="new-password"
										minLength={8}
										className={inputClassName}
										required
									/>
									<input
										type="password"
										value={confirmPassword}
										onChange={(e) => setConfirmPassword(e.target.value)}
										placeholder="Confirm new password"
										autoComplete="new-password"
										minLength={8}
										className={inputClassName}
										required
									/>
									<Button type="submit" disabled={busy}>
										Set new password
									</Button>
								</form>
							) : passwordConnected ? (
								<>
									<div className="mt-3 flex flex-wrap items-center gap-2">
										<Button
											variant="outline"
											size="sm"
											disabled={busy}
											onClick={() => setChangePasswordOpen((open) => !open)}
										>
											Change password
										</Button>
										<Button
											variant="outline"
											size="sm"
											disabled={busy || !hasOAuthFallback}
											onClick={() => void removePassword()}
										>
											Remove username &amp; password
										</Button>
										{!hasOAuthFallback && (
											<span className="text-xs text-yellow-500">
												Link another sign-in method first — one must remain.
											</span>
										)}
									</div>
									{changePasswordOpen && (
										<form onSubmit={changePassword} className="mt-2 space-y-2">
											<input
												type="password"
												value={currentPassword}
												onChange={(e) => setCurrentPassword(e.target.value)}
												placeholder="Current password"
												autoComplete="current-password"
												className={inputClassName}
												required
											/>
											<input
												type="password"
												value={newPassword}
												onChange={(e) => setNewPassword(e.target.value)}
												placeholder="New password (8+ characters)"
												autoComplete="new-password"
												minLength={8}
												className={inputClassName}
												required
											/>
											<div className="flex gap-2">
												<Button type="submit" disabled={busy}>
													Update password
												</Button>
												<Button
													type="button"
													variant="ghost"
													disabled={busy}
													onClick={() => setChangePasswordOpen(false)}
												>
													Cancel
												</Button>
											</div>
										</form>
									)}
								</>
							) : usernamePasswordEnabled ? (
								<form onSubmit={setupPasswordSignIn} className="mt-3 space-y-2">
									{!user.username && (
										<input
											type="text"
											value={username}
											onChange={(e) => setUsername(e.target.value)}
											placeholder="Username"
											className={inputClassName}
											required
										/>
									)}
									{!hasCredential && (
										<input
											type="password"
											value={linkPassword}
											onChange={(e) => setLinkPassword(e.target.value)}
											placeholder="Password (8+ characters)"
											autoComplete="new-password"
											minLength={8}
											className={inputClassName}
											required
										/>
									)}
									<Button type="submit" disabled={busy}>
										{hasCredential ? "Add username" : "Add username & password"}
									</Button>
								</form>
							) : (
								<p className="mt-2 text-xs text-muted-foreground">
									Password sign-in isn&apos;t enabled for this site.
								</p>
							)}
						</div>

						{providers.map((provider) => {
							const { label, Icon } = PROVIDERS[provider];
							const connected = linkedProviders.includes(provider);
							return (
								<div
									key={provider}
									className="rounded-md border border-border p-3"
								>
									<div className="flex items-center justify-between gap-2">
										<div className="flex items-center gap-2">
											<Icon className="size-4 shrink-0" />
											<div>
												<p className="font-medium">{label}</p>
												<p className="text-xs text-muted-foreground">
													{connected
														? "Connected to your account"
														: "Not connected"}
												</p>
											</div>
										</div>
										<div className="flex items-center gap-2">
											{connected && (
												<span className="rounded bg-green-900/50 px-2 py-0.5 text-[10px] uppercase text-green-300">
													Connected
												</span>
											)}
											{connected ? (
												<Button
													variant="outline"
													size="sm"
													disabled={busy || !canDisconnectOAuth}
													onClick={() => void disconnectProvider(provider)}
												>
													Disconnect
												</Button>
											) : (
												<Button
													variant="outline"
													size="sm"
													disabled={busy}
													onClick={() => void linkProvider(provider)}
												>
													Link {label}
												</Button>
											)}
										</div>
									</div>
									{connected && !canDisconnectOAuth && (
										<p className="mt-2 text-xs text-yellow-500">
											Add another sign-in method before disconnecting this one.
										</p>
									)}
									{provider === "google" && emailInfo}
								</div>
							);
						})}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
