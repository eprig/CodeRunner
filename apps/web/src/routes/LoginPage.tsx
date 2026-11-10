import { type FormEvent, useEffect, useState } from "react";
import type { IconType } from "react-icons";
import { SiAuth0, SiGithub, SiGoogle } from "react-icons/si";
import { useSearchParams } from "react-router";
import coderunnerMascotImg from "@/assets/coderunner-mascot.png";
import { authClient } from "@/lib/auth-client";
import {
	type AuthProvider,
	authProvidersResponseSchema,
} from "@/lib/contracts";
import { cn } from "@/lib/utils";

const PROVIDER_BUTTONS: Record<
	AuthProvider,
	{ label: string; Icon: IconType; className: string }
> = {
	github: {
		label: "Sign in with GitHub",
		Icon: SiGithub,
		className:
			"border-border bg-white/[0.06] text-foreground hover:bg-white/[0.11] hover:shadow-[0_0_18px_rgba(34,197,94,0.12)]",
	},
	google: {
		label: "Sign in with Google",
		Icon: SiGoogle,
		className:
			"border-border bg-white/[0.03] text-foreground hover:bg-white/[0.06]",
	},
	auth0: {
		label: "Sign in with Auth0",
		Icon: SiAuth0,
		className:
			"border-border bg-white/[0.03] text-foreground hover:bg-white/[0.06]",
	},
};

interface OAuthButtonProps {
	provider: AuthProvider;
	disabled: boolean;
	onClick: () => void;
}

function OAuthButton({ provider, disabled, onClick }: OAuthButtonProps) {
	const { label, Icon, className } = PROVIDER_BUTTONS[provider];
	return (
		<div className="rounded-lg border border-border bg-card p-2">
			<button
				type="button"
				onClick={onClick}
				disabled={disabled}
				className={cn(
					"flex h-11 w-full items-center justify-center gap-3 rounded-md border px-4 text-[13px] font-semibold tracking-wide transition-all disabled:cursor-not-allowed disabled:opacity-45",
					className,
				)}
			>
				<Icon className="size-[18px] shrink-0" />
				{label}
			</button>
		</div>
	);
}

const inputClassName =
	"h-11 w-full rounded-md border border-border bg-card px-3.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/30 focus:ring-2 focus:ring-white/[0.06]";

const ROSTER_MESSAGE =
	"You're not on the roster yet. Ask your coach to add you.";

const INVALID_CREDENTIALS_MESSAGE = "Incorrect username or password.";

/** The server replaces this with a reserved address derived from the username. */
const PLACEHOLDER_EMAIL_DOMAIN = "students.coderunner.invalid";

function friendlyAuthError(message: string | undefined, signUp: boolean) {
	const detail = message?.trim() ?? "";
	const lower = detail.toLowerCase();

	if (lower.includes("roster") || lower.includes("not on the allowlist")) {
		return ROSTER_MESSAGE;
	}
	if (
		lower.includes("invalid username or password") ||
		lower.includes("invalid email or password") ||
		lower.includes("invalid credentials")
	) {
		return INVALID_CREDENTIALS_MESSAGE;
	}
	if (lower.includes("already exists") || lower.includes("already taken")) {
		return "That username is already taken. Try signing in instead.";
	}
	if (lower.includes("username") && lower.includes("valid")) {
		return "Usernames must be 3–30 characters using letters, numbers, dots, or underscores.";
	}
	if (lower.includes("too short")) {
		return "Passwords must be at least 8 characters.";
	}
	if (detail.length > 0) {
		return detail;
	}
	return signUp
		? "Couldn't create your account. Please try again."
		: "Couldn't sign in. Please try again.";
}

export function LoginPage() {
	const [searchParams] = useSearchParams();
	const [loading, setLoading] = useState(false);
	const [providers, setProviders] = useState<AuthProvider[] | null>(null);
	const [usernamePasswordEnabled, setUsernamePasswordEnabled] = useState(false);
	const [providersError, setProvidersError] = useState<string | null>(null);
	const [signInError, setSignInError] = useState<string | null>(null);
	const [signUpMode, setSignUpMode] = useState(false);
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");

	const rawError = searchParams.get("error");
	const friendlyError =
		rawError === "forbidden" ||
		rawError?.toLowerCase().includes("roster") ||
		rawError?.toLowerCase().includes("not_on_the_roster")
			? ROSTER_MESSAGE
			: (rawError?.replaceAll("_", " ") ?? null);
	const availableProviders = providers ?? [];

	useEffect(() => {
		const controller = new AbortController();

		async function loadProviders() {
			try {
				const response = await fetch("/api/auth/providers", {
					credentials: "same-origin",
					signal: controller.signal,
				});
				if (!response.ok) {
					throw new Error(
						`Auth provider discovery failed with status ${response.status}`,
					);
				}
				const parsed = authProvidersResponseSchema.parse(await response.json());
				setProviders(parsed.providers);
				setUsernamePasswordEnabled(parsed.usernamePassword);
				setProvidersError(null);
			} catch (error) {
				if (error instanceof DOMException && error.name === "AbortError") {
					return;
				}
				setProviders([]);
				setUsernamePasswordEnabled(false);
				setProvidersError(
					"Sign-in is unavailable right now. Please refresh and try again.",
				);
			}
		}

		void loadProviders();

		return () => {
			controller.abort();
		};
	}, []);

	async function signIn(provider: AuthProvider) {
		setLoading(true);
		setSignInError(null);
		try {
			if (provider === "auth0") {
				// Auth0 is a genericOAuth provider, not a Better Auth social one.
				await authClient.signIn.oauth2({
					providerId: "auth0",
					callbackURL: "/",
					errorCallbackURL: "/login",
				});
			} else {
				await authClient.signIn.social({
					provider,
					callbackURL: "/",
					errorCallbackURL: "/login",
				});
			}
		} catch (error) {
			setLoading(false);
			setSignInError(
				error instanceof Error && error.message.trim().length > 0
					? error.message
					: "Couldn't start sign-in. Please try again.",
			);
		}
	}

	async function submitUsernamePassword(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setLoading(true);
		setSignInError(null);
		const normalizedUsername = username.trim().toLowerCase();
		try {
			const result = signUpMode
				? await authClient.signUp.email({
						username: normalizedUsername,
						name: normalizedUsername,
						// Better Auth requires an email field. The server discards
						// this value and derives the reserved address itself.
						email: `${normalizedUsername}@${PLACEHOLDER_EMAIL_DOMAIN}`,
						password,
					})
				: await authClient.signIn.username({
						username: normalizedUsername,
						password,
					});

			if (result.error) {
				setSignInError(friendlyAuthError(result.error.message, signUpMode));
				return;
			}

			// Let the server route "/" decide where this user belongs.
			window.location.assign("/");
		} catch (error) {
			setSignInError(
				error instanceof Error
					? friendlyAuthError(error.message, signUpMode)
					: "Something went wrong. Please try again.",
			);
		} finally {
			setLoading(false);
		}
	}

	function toggleUsernamePasswordMode() {
		setSignUpMode((current) => !current);
		setSignInError(null);
	}

	return (
		<div className="flex h-screen w-full overflow-hidden bg-background">
			{/* Left panel — mascot */}
			<div
				className="relative hidden flex-col items-center justify-center lg:flex"
				style={{ width: "55%" }}
			>
				<div
					className="absolute inset-0 bg-card"
					style={{
						background:
							"radial-gradient(ellipse at 50% 60%, oklch(0.24 0 0) 0%, oklch(0.145 0 0) 75%)",
					}}
				/>
				<img
					src={coderunnerMascotImg}
					alt="CodeRunner mascot"
					className="relative z-10 w-150 select-none drop-shadow-2xl"
					draggable={false}
				/>
			</div>

			{/* Divider */}
			<div className="hidden w-px shrink-0 bg-border lg:block" />

			{/* Right panel — sign in */}
			<div className="flex flex-1 flex-col items-center justify-center px-8">
				<div className="w-full max-w-[320px]">
					{/* DS-style section label */}
					<p className="mb-6 text-[9.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
						Sign in to continue
					</p>

					{/* Error */}
					{friendlyError && (
						<div className="mb-5 rounded-md border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[12px] text-red-300">
							{friendlyError}
						</div>
					)}
					{providersError && (
						<div className="mb-5 rounded-md border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[12px] text-red-300">
							{providersError}
						</div>
					)}
					{signInError && (
						<div className="mb-5 rounded-md border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[12px] text-red-300">
							{signInError}
						</div>
					)}

					{/* Username/password */}
					{usernamePasswordEnabled && (
						<form
							onSubmit={submitUsernamePassword}
							className="mb-4 flex flex-col gap-2"
						>
							<input
								type="text"
								name="username"
								value={username}
								onChange={(event) => setUsername(event.target.value)}
								placeholder="Username"
								autoComplete="username"
								autoCapitalize="none"
								spellCheck={false}
								aria-label="Username"
								minLength={3}
								maxLength={30}
								required
								className={inputClassName}
							/>
							<input
								type="password"
								name="password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								placeholder={
									signUpMode ? "Password (8+ characters)" : "Password"
								}
								autoComplete={signUpMode ? "new-password" : "current-password"}
								aria-label="Password"
								minLength={signUpMode ? 8 : undefined}
								required
								className={inputClassName}
							/>
							<button
								type="submit"
								disabled={loading}
								className="mt-1 flex h-11 w-full items-center justify-center rounded-md border border-border bg-white/[0.06] text-[13px] font-semibold tracking-wide text-foreground transition-all hover:bg-white/[0.11] disabled:cursor-not-allowed disabled:opacity-45"
							>
								{signUpMode ? "Create account" : "Sign in with username"}
							</button>
							<button
								type="button"
								onClick={toggleUsernamePasswordMode}
								disabled={loading}
								className="mt-1 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-45"
							>
								{signUpMode
									? "Already have an account? Sign in"
									: "Need an account? Create one"}
							</button>
						</form>
					)}

					{/* Divider between password and OAuth */}
					{usernamePasswordEnabled && availableProviders.length > 0 && (
						<div className="mb-4 flex items-center gap-3 text-[9.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
							<span className="h-px flex-1 bg-border" />
							or
							<span className="h-px flex-1 bg-border" />
						</div>
					)}

					{/* OAuth buttons */}
					<div className="flex flex-col gap-2">
						{providers === null ? (
							<div className="rounded-lg border border-border bg-card px-4 py-3 text-[12px] text-muted-foreground">
								Checking sign-in options...
							</div>
						) : providersError ? null : availableProviders.length > 0 ? (
							availableProviders.map((provider) => (
								<OAuthButton
									key={provider}
									provider={provider}
									disabled={loading}
									onClick={() => signIn(provider)}
								/>
							))
						) : usernamePasswordEnabled ? null : (
							<div className="rounded-lg border border-border bg-card px-4 py-3 text-[12px] text-muted-foreground">
								Sign-in isn&apos;t configured yet. Ask your coach to enable a
								sign-in provider.
							</div>
						)}
					</div>

					{/* Classroom guests */}
					<a
						href="/join"
						className="mt-3 flex h-11 w-full items-center justify-center rounded-md border border-border text-[13px] font-semibold tracking-wide text-foreground transition-all hover:bg-white/[0.06]"
					>
						Join a classroom
					</a>

					{/* Fine print */}
					<p className="mt-6 text-[10.5px] leading-relaxed text-muted-foreground">
						Not on the roster?{" "}
						<span className="text-foreground/60">
							Ask your coach for a classroom code.
						</span>
					</p>
				</div>
			</div>
		</div>
	);
}
