import type {
	ServerUpdateCommit,
	ServerUpdateRefDetails,
	ServerUpdateStatusResponse,
} from "@frc-coderunner/contracts";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type RefChoice, RefPicker } from "../components/RefPicker";
import { useAdminPoll } from "../hooks/useAdminPoll";

async function fetchStatus(
	refresh = false,
): Promise<ServerUpdateStatusResponse> {
	const res = await fetch(
		refresh ? "/admin/server-update?refresh=1" : "/admin/server-update",
		{ credentials: "same-origin" },
	);
	const body = (await res.json()) as ServerUpdateStatusResponse & {
		error?: string;
	};
	if (!res.ok) throw new Error(body.error ?? `${res.status}`);
	return body;
}

async function fetchRefDetails(
	choice: RefChoice,
): Promise<ServerUpdateRefDetails> {
	const params = new URLSearchParams({ kind: choice.kind, ref: choice.ref });
	const res = await fetch(`/admin/server-update/ref?${params}`, {
		credentials: "same-origin",
	});
	const body = (await res.json()) as ServerUpdateRefDetails & {
		error?: string;
	};
	if (!res.ok) throw new Error(body.error ?? `${res.status}`);
	return body;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex min-w-0 flex-col gap-1">
			<span className="text-xs uppercase tracking-wide text-muted-foreground">
				{label}
			</span>
			<span className="break-words text-sm">{children}</span>
		</div>
	);
}

function Pill({
	tone,
	children,
}: {
	tone: "neutral" | "good" | "info" | "warn";
	children: ReactNode;
}) {
	const tones = {
		neutral: "bg-zinc-800 text-zinc-200",
		good: "bg-green-950 text-green-300",
		info: "bg-sky-950 text-sky-300",
		warn: "bg-yellow-950 text-yellow-300",
	};
	return (
		<span className={`rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
			{children}
		</span>
	);
}

function Banner({
	tone,
	children,
	testId,
	role = "status",
}: {
	tone: "info" | "warn" | "error" | "good";
	children: ReactNode;
	testId?: string;
	role?: "status" | "alert";
}) {
	const tones = {
		info: "border-blue-900 bg-blue-950/40 text-blue-200",
		warn: "border-yellow-900 bg-yellow-950/40 text-yellow-200",
		error: "border-red-900 bg-red-950/40 text-red-200",
		good: "border-green-900 bg-green-950/40 text-green-200",
	};
	return (
		<div
			className={`rounded border p-3 text-sm ${tones[tone]}`}
			role={role}
			data-testid={testId}
		>
			{children}
		</div>
	);
}

function formatDuration(ms: number): string {
	const seconds = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const rest = seconds % 60;
	if (hours > 0) return `${hours}h ${minutes}m ${rest}s`;
	if (minutes > 0) return `${minutes}m ${rest}s`;
	return `${rest}s`;
}

function formatElapsed(startedAt: string | null, now: number): string | null {
	const started = startedAt ? Date.parse(startedAt) : Number.NaN;
	return Number.isFinite(started) ? formatDuration(now - started) : null;
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "3 days ago" with the exact local time on hover. */
function When({ at, now }: { at: string | null; now: number }) {
	const time = at ? Date.parse(at) : Number.NaN;
	if (!Number.isFinite(time)) return null;
	const diff = (time - now) / 1000;
	const abs = Math.abs(diff);
	const [value, unit]: [number, Intl.RelativeTimeFormatUnit] =
		abs < 60
			? [diff, "second"]
			: abs < 3600
				? [diff / 60, "minute"]
				: abs < 86_400
					? [diff / 3600, "hour"]
					: abs < 30 * 86_400
						? [diff / 86_400, "day"]
						: abs < 365 * 86_400
							? [diff / (30 * 86_400), "month"]
							: [diff / (365 * 86_400), "year"];
	return (
		<time dateTime={at ?? undefined} title={new Date(time).toLocaleString()}>
			{relative.format(Math.round(value), unit)}
		</time>
	);
}

function logTime(at: string): string {
	return /^\d{4}-/u.test(at) ? at.slice(11, 19) : at;
}

/** Mirrors the control plane's `branch-<slug>` image tag for branch builds. */
function branchTag(branch: string): string {
	return `branch-${branch
		.replace(/[^A-Za-z0-9._-]+/gu, "-")
		.replace(/^-+|-+$/gu, "")
		.slice(0, 60)}`;
}

type RunningVersion = {
	/** What to call it: `v2.5.0`, `dev`, or `main / dev` when ambiguous. */
	label: string;
	kind: "tag" | "branch" | "unknown";
	/** Picker key (`tag:<name>` / `branch:<name>`), when exactly one matches. */
	key: string | null;
	/** True when the branch was matched by commit, not recorded by the build. */
	inferred: boolean;
	/** The image tag, shown only when it doesn't already say the version. */
	imageTag: string | null;
};

const sameCommit = (a: string | undefined, b: string) =>
	Boolean(a) && (a === b || a!.startsWith(b) || b.startsWith(a!));

/**
 * Name the running build the way a person would. Release images carry their
 * tag; branch builds carry a `coderunner.git.branch` label (or the checkout
 * says, from source). Older builds tagged `latest` say neither, so fall back
 * to matching the running commit against the branch heads GitHub reports.
 */
function describeRunning(data: ServerUpdateStatusResponse): RunningVersion {
	const { version, branch, commit } = data.repo;
	const { tags, branches, commits } = data.refs;
	if (version && tags.includes(version)) {
		return {
			label: version,
			kind: "tag",
			key: `tag:${version}`,
			inferred: false,
			imageTag: null,
		};
	}
	const named =
		branch ?? branches.find((name) => branchTag(name) === version) ?? null;
	if (named) {
		return {
			label: named,
			kind: "branch",
			key: branches.includes(named) ? `branch:${named}` : null,
			inferred: false,
			imageTag: version && version !== branchTag(named) ? version : null,
		};
	}
	if (commit) {
		const tag = tags.find((name) => sameCommit(commits[`tag:${name}`], commit));
		if (tag) {
			return {
				label: tag,
				kind: "tag",
				key: `tag:${tag}`,
				inferred: true,
				imageTag: version,
			};
		}
		const matches = branches.filter((name) =>
			sameCommit(commits[`branch:${name}`], commit),
		);
		if (matches.length > 0) {
			return {
				label: matches.join(" / "),
				kind: "branch",
				key: matches.length === 1 ? `branch:${matches[0]}` : null,
				inferred: true,
				imageTag: version,
			};
		}
	}
	return {
		label: version ?? "Unknown version",
		kind: "unknown",
		key: null,
		inferred: false,
		imageTag: null,
	};
}

function CommitLine({
	commit,
	now,
	testId,
}: {
	commit: ServerUpdateCommit;
	now: number;
	testId?: string;
}) {
	const sha = commit.sha.slice(0, 7);
	return (
		<span className="text-sm" data-testid={testId}>
			<span className="text-foreground">{commit.title || "(no message)"}</span>
			<span className="text-muted-foreground">
				{" · "}
				{commit.url ? (
					<a
						className="font-mono underline hover:no-underline"
						href={commit.url}
						target="_blank"
						rel="noreferrer"
					>
						{sha}
					</a>
				) : (
					<code className="font-mono">{sha}</code>
				)}
				{commit.author ? ` · ${commit.author}` : ""}
				{commit.date ? " · " : ""}
				<When at={commit.date} now={now} />
			</span>
		</span>
	);
}

function compareSummary(
	compare: NonNullable<ServerUpdateRefDetails["compare"]>,
): { tone: "good" | "warn"; text: string } | null {
	const plural = (n: number) => `${n} commit${n === 1 ? "" : "s"}`;
	switch (compare.status) {
		case "identical":
			// Nothing worth saying: the Current badge and "Redeploy" button cover it.
			return null;
		case "ahead":
			return {
				tone: "good",
				text: `${plural(compare.aheadBy)} newer than what's running.`,
			};
		case "behind":
			return {
				tone: "warn",
				text: `Older than what's running: this is a downgrade that removes ${plural(compare.behindBy)}.`,
			};
		default:
			return {
				tone: "warn",
				text: `A different line of history: adds ${plural(compare.aheadBy)} and removes ${plural(compare.behindBy)} that are running now.`,
			};
	}
}

function RefDetailsPanel({
	details,
	loading,
	error,
	now,
}: {
	details: ServerUpdateRefDetails | null;
	loading: boolean;
	error: string | null;
	now: number;
}) {
	if (loading && !details) {
		return (
			<p className="flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2 className="size-4 animate-spin" aria-hidden="true" />
				Loading version details…
			</p>
		);
	}
	const problem = error ?? details?.error ?? null;
	if (!details) {
		return problem ? (
			<p className="text-sm text-yellow-300">{problem}</p>
		) : null;
	}
	const summary = details.compare ? compareSummary(details.compare) : null;
	// The newest commit in "What's new" is the one deployed; only show it on
	// its own when that list doesn't (a downgrade, or no comparison).
	const listed =
		details.compare?.status !== "behind"
			? (details.compare?.commits.slice(0, 10) ?? [])
			: [];
	const showDeploysCommit =
		details.compare?.status !== "identical" &&
		!listed.some((commit) => commit.sha === details.commit?.sha);
	const hiddenCommits = details.compare
		? Math.max(0, details.compare.aheadBy - details.compare.commits.length)
		: 0;
	const hasCommits = (details.compare?.commits.length ?? 0) > 0;
	// Don't draw an empty box (e.g. picking the version that's already running).
	if (
		!summary &&
		!details.release &&
		!hasCommits &&
		!(details.commit && showDeploysCommit) &&
		!problem
	) {
		return null;
	}
	return (
		<div
			className="space-y-3 rounded border border-zinc-800 bg-black/20 p-3"
			data-testid="update-ref-details"
		>
			{summary && (
				<p
					className={
						summary.tone === "good"
							? "text-sm text-green-300"
							: "text-sm text-yellow-300"
					}
					data-testid="update-compare"
				>
					{summary.text}
				</p>
			)}
			{details.release && (
				<div className="space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-medium">{details.release.name}</span>
						{details.release.prerelease && <Pill tone="warn">Pre-release</Pill>}
						{details.release.publishedAt && (
							<span className="text-xs text-muted-foreground">
								Published <When at={details.release.publishedAt} now={now} />
							</span>
						)}
						<a
							className="ml-auto inline-flex items-center gap-1 text-xs underline hover:no-underline"
							href={details.release.url}
							target="_blank"
							rel="noreferrer"
						>
							Release on GitHub <ExternalLink className="size-3" />
						</a>
					</div>
					{details.release.notes.trim() && (
						<details data-testid="update-release-notes">
							<summary className="cursor-pointer text-sm text-muted-foreground">
								Release notes
							</summary>
							<div className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-zinc-950 p-3 text-sm">
								{details.release.notes}
							</div>
						</details>
					)}
				</div>
			)}
			{details.compare && details.compare.commits.length > 0 && (
				<div className="space-y-1">
					<p className="text-xs uppercase tracking-wide text-muted-foreground">
						{details.compare.status === "behind"
							? "Commits this version doesn't have"
							: "What's new"}
					</p>
					{details.compare.status !== "behind" && (
						<ul className="space-y-1" data-testid="update-new-commits">
							{details.compare.commits.slice(0, 10).map((commit) => (
								<li key={commit.sha}>
									<CommitLine commit={commit} now={now} />
								</li>
							))}
						</ul>
					)}
					{(hiddenCommits > 0 ||
						details.compare.commits.length > 10 ||
						details.compare.status === "behind") &&
						details.compare.url && (
							<a
								className="inline-flex items-center gap-1 text-xs underline hover:no-underline"
								href={details.compare.url}
								target="_blank"
								rel="noreferrer"
							>
								See the full comparison on GitHub{" "}
								<ExternalLink className="size-3" />
							</a>
						)}
				</div>
			)}
			{details.commit && showDeploysCommit && (
				<div className="space-y-1">
					<p className="text-xs uppercase tracking-wide text-muted-foreground">
						Deploys commit
					</p>
					<CommitLine
						commit={details.commit}
						now={now}
						testId="update-selected-commit"
					/>
				</div>
			)}
			{problem && <p className="text-xs text-yellow-300">{problem}</p>}
		</div>
	);
}

export function ServerUpdate() {
	const [pollMs, setPollMs] = useState(15_000);
	const { data, loading, error, refetch } = useAdminPoll(
		useCallback(() => fetchStatus(), []),
		pollMs,
	);
	const [choice, setChoice] = useState<RefChoice | null>(null);
	const [busy, setBusy] = useState(false);
	const [checking, setChecking] = useState(false);
	const [refreshCount, setRefreshCount] = useState(0);
	const [actionError, setActionError] = useState<string | null>(null);
	const [now, setNow] = useState(() => Date.now());
	const [details, setDetails] = useState<ServerUpdateRefDetails | null>(null);
	const [detailsLoading, setDetailsLoading] = useState(false);
	const [detailsError, setDetailsError] = useState<string | null>(null);
	const active =
		data?.job.state === "starting" || data?.job.state === "running";

	// Poll fast only while an update runs; the idle page changes rarely.
	useEffect(() => setPollMs(active ? 3000 : 15_000), [active]);

	// The commit this page's JS was served with. When the server reports a
	// different one after an update, the admin bundle on screen is stale.
	const loadedCommit = useRef<string | null>(null);
	if (data && loadedCommit.current === null) {
		loadedCommit.current = data.repo.commit ?? "";
	}
	const serverChanged = Boolean(
		data?.repo.commit &&
			loadedCommit.current &&
			data.repo.commit !== loadedCommit.current,
	);

	// Tick once a second while a job runs (elapsed timer), else each minute.
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), active ? 1000 : 60_000);
		return () => clearInterval(timer);
	}, [active]);

	// Default to the newest release, then the first branch, once refs arrive.
	useEffect(() => {
		if (choice || !data) return;
		if (data.refs.tags.length > 0) {
			setChoice({ kind: "tag", ref: data.refs.tags[0]! });
		} else if (data.refs.branches.length > 0) {
			setChoice({ kind: "branch", ref: data.refs.branches[0]! });
		}
	}, [data, choice]);

	// Load what the selected version would change. Re-run when the running
	// commit changes, since the comparison is relative to it.
	const runningCommit = data?.repo.commit ?? null;
	const canQuery = Boolean(data?.repo.slug);
	// The selected ref's head commit: when a check finds new commits on it,
	// its comparison and commit details must be reloaded too.
	const selectedTarget = choice
		? (data?.refs.commits[`${choice.kind}:${choice.ref}`] ?? null)
		: null;
	// biome-ignore lint/correctness/useExhaustiveDependencies: runningCommit, selectedTarget, and refreshCount are deliberate re-fetch triggers.
	useEffect(() => {
		if (!choice || !canQuery) {
			setDetails(null);
			return;
		}
		let cancelled = false;
		setDetailsLoading(true);
		setDetailsError(null);
		setDetails(null);
		fetchRefDetails(choice)
			.then((result) => {
				if (!cancelled) setDetails(result);
			})
			.catch((err: unknown) => {
				if (!cancelled)
					setDetailsError(err instanceof Error ? err.message : String(err));
			})
			.finally(() => {
				if (!cancelled) setDetailsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [choice, canQuery, runningCommit, selectedTarget, refreshCount]);

	const checkForUpdates = async () => {
		setChecking(true);
		try {
			await fetchStatus(true);
			await refetch();
			setRefreshCount((count) => count + 1);
		} catch {
			// The regular poll reports errors.
		} finally {
			setChecking(false);
		}
	};

	const update = async () => {
		if (!choice || !data) return;
		const noun =
			choice.kind === "tag" ? `release ${choice.ref}` : `branch ${choice.ref}`;
		const students = data.activity.activeWorkspaces;
		const downgrade =
			details?.compare?.status === "behind" ? " This is a downgrade." : "";
		const who =
			students > 0
				? ` ${students} active student${students === 1 ? "" : "s"} will be disconnected and their running simulations stopped.`
				: " Running simulations will be stopped and editors will reconnect.";
		if (
			!window.confirm(
				`Update the CodeRunner server to ${noun}?${downgrade}${who} Student project files are kept.`,
			)
		) {
			return;
		}
		setBusy(true);
		setActionError(null);
		try {
			const res = await fetch("/admin/server-update", {
				method: "POST",
				headers: { "content-type": "application/json" },
				credentials: "same-origin",
				body: JSON.stringify(choice),
			});
			const body = (await res.json()) as { error?: string };
			if (!res.ok) throw new Error(body.error ?? `${res.status}`);
			await refetch();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Update failed.");
		} finally {
			setBusy(false);
		}
	};

	if (loading && !data)
		return <p className="p-4 text-muted-foreground">Loading…</p>;
	// Keep the last status on screen when a poll fails: mid-update that is the
	// expected control-plane restart, not something to replace the page with.
	if (error && !data)
		return <p className="p-4 text-destructive">Error: {error}</p>;
	if (!data) return null;

	const { repo, refs, job, demo, activity } = data;
	const refsAvailable = refs.tags.length > 0 || refs.branches.length > 0;
	const running = describeRunning(data);
	const currentKey = running.key;
	const latestTag = refs.tags[0] ?? null;
	const isBranchBuild = running.kind === "branch";
	const updateAvailable = Boolean(
		latestTag &&
			!isBranchBuild &&
			currentKey !== `tag:${latestTag}` &&
			repo.version &&
			repo.version !== latestTag,
	);
	const elapsed = active ? formatElapsed(job.startedAt, now) : null;
	const lastDuration =
		job.startedAt && job.finishedAt
			? formatDuration(Date.parse(job.finishedAt) - Date.parse(job.startedAt))
			: null;
	const selectedIsCurrent =
		choice !== null && currentKey === `${choice.kind}:${choice.ref}`;

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="text-xl font-semibold">Server Update</h2>
					<p className="text-sm text-muted-foreground">
						Deploy a published release, or build the server from a branch.
					</p>
				</div>
			</div>

			{error && (
				<Banner tone={active ? "warn" : "error"} testId="update-poll-error">
					{active
						? "The control plane is restarting onto the new version. Reconnecting…"
						: `Couldn't refresh update status: ${error}`}
				</Banner>
			)}
			{serverChanged && !active && (
				<Banner tone="good" testId="update-reload">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<span>
							The server is now running <strong>{running.label}</strong>. Reload
							to use the updated admin pages.
						</span>
						<Button size="sm" onClick={() => window.location.reload()}>
							Reload
						</Button>
					</div>
				</Banner>
			)}
			{demo && (
				<Banner tone="info">
					Demo mode is showing sample values. The Update tab is read-only here;
					no server changes will be made.
				</Banner>
			)}
			{!demo && repo.source === "local" && (
				<Banner tone="info">
					Running from source: showing the local checkout's git details.
					Updating needs the Docker Compose deployment.
				</Banner>
			)}
			{!repo.updatable && !demo && repo.source !== "local" && (
				<Banner tone="warn">
					Updates need the server's git checkout. Set{" "}
					<code className="font-mono">CODERUNNER_UPDATE_REPO_DIR</code> in{" "}
					<code className="font-mono">.env</code> to the directory containing{" "}
					<code className="font-mono">docker-compose.yml</code>, then recreate
					the control container.
				</Banner>
			)}

			<Card>
				<CardHeader className="pb-2">
					<CardTitle>Running now</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex flex-wrap items-center gap-2">
						<span
							className="text-2xl font-semibold"
							data-testid="update-running-version"
						>
							{running.label}
						</span>
						{isBranchBuild ? (
							<Pill tone="neutral">Branch build</Pill>
						) : running.kind === "tag" ? (
							<Pill tone="neutral">Release</Pill>
						) : null}
						{updateAvailable && latestTag && (
							<Pill tone="info">
								<span data-testid="update-available">
									Update available: {latestTag}
								</span>
							</Pill>
						)}
						{!updateAvailable &&
							latestTag &&
							currentKey === `tag:${latestTag}` && (
								<Pill tone="good">Up to date</Pill>
							)}
					</div>
					{(running.inferred ||
						running.imageTag ||
						running.kind === "unknown") && (
						<p
							className="text-xs text-muted-foreground"
							data-testid="update-running-hint"
						>
							{running.kind === "unknown"
								? `This build doesn't record its branch, and its commit isn't the latest on any branch${running.label === "latest" ? ", so “latest” can't be resolved" : ""}. Updating from this page records it.`
								: running.inferred
									? `Matched by commit: this build doesn't record its branch${running.imageTag ? ` (image tag ${running.imageTag})` : ""}.${running.kind === "branch" && running.key === null ? " Several branches point at this commit." : ""}`
									: `Image tag ${running.imageTag}.`}
						</p>
					)}
					{repo.commitInfo ? (
						<CommitLine
							commit={repo.commitInfo}
							now={now}
							testId="update-current-commit"
						/>
					) : (
						<p className="text-sm text-muted-foreground">
							Commit{" "}
							<code className="font-mono" data-testid="update-current-commit">
								{repo.commit?.slice(0, 12) ?? "unknown"}
							</code>
						</p>
					)}
					<div className="grid grid-cols-1 gap-4 border-t border-zinc-800 pt-4 sm:grid-cols-2 lg:grid-cols-3">
						<Detail label="Repository">
							{repo.url ? (
								<a
									className="underline hover:no-underline"
									href={repo.url}
									target="_blank"
									rel="noreferrer"
								>
									{repo.slug ?? repo.url}
								</a>
							) : (
								"unknown"
							)}
						</Detail>
						<Detail label="Server checkout">
							<code className="font-mono text-xs">
								{repo.hostDir ?? "not detected"}
							</code>
						</Detail>
						<Detail label="Last update">
							{job.state === "succeeded" || job.state === "failed" ? (
								<span data-testid="update-last">
									{job.state === "failed" ? (
										<span className="text-red-300">Failed · </span>
									) : null}
									{job.ref ?? "unknown"}
									{job.requestedBy ? ` by ${job.requestedBy}` : ""}
									{job.finishedAt ? ", " : ""}
									<When at={job.finishedAt} now={now} />
									{lastDuration ? ` (took ${lastDuration})` : ""}
								</span>
							) : (
								<span className="text-muted-foreground">
									None from this page yet
								</span>
							)}
						</Detail>
					</div>
					{!active && job.state === "failed" && job.message && (
						<p
							className="text-sm text-red-300"
							role="alert"
							data-testid="update-failed"
						>
							{job.message}
						</p>
					)}
					{repo.versionPinnedInEnv && (
						<p
							className="text-xs text-muted-foreground"
							data-testid="update-legacy"
						>
							Legacy setup: <code className="font-mono">.env</code> pins{" "}
							<code className="font-mono">CODERUNNER_TAG</code>, and updates
							keep that line current.
						</p>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle>Choose a version</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{refs.error && (
						<p className="text-sm text-yellow-300" role="alert">
							{refs.error}
						</p>
					)}
					<div className="flex flex-wrap items-center gap-3">
						<RefPicker
							tags={refs.tags}
							branches={refs.branches}
							commits={refs.commits ?? {}}
							currentKey={currentKey}
							value={choice}
							onChange={setChoice}
							disabled={!repo.updatable || !refsAvailable || busy || active}
						/>
						{!demo && repo.slug && (
							<Button
								variant="outline"
								onClick={() => void checkForUpdates()}
								disabled={checking || active}
								title="Fetch the latest releases and branches from GitHub"
								data-testid="update-check"
							>
								<RefreshCw
									className={`size-4 ${checking ? "animate-spin" : ""}`}
									aria-hidden="true"
								/>
								{checking ? "Checking…" : "Check for updates"}
							</Button>
						)}
						<Button
							onClick={() => void update()}
							disabled={
								!choice || !refsAvailable || !repo.updatable || busy || active
							}
							data-testid="update-submit"
						>
							{busy
								? "Starting…"
								: selectedIsCurrent
									? "Redeploy"
									: "Update server"}
						</Button>
					</div>
					{refs.checkedAt && (
						<p
							className="-mt-2 text-xs text-muted-foreground"
							data-testid="update-checked-at"
						>
							Versions checked <When at={refs.checkedAt} now={now} />
						</p>
					)}
					{choice && (
						<p
							className="text-sm text-muted-foreground"
							data-testid="update-plan"
						>
							{choice.kind === "tag"
								? "Pulls the prebuilt images, usually in a minute or two."
								: "Builds both images on this server, which takes 10+ minutes."}
						</p>
					)}
					<RefDetailsPanel
						details={details}
						loading={detailsLoading}
						error={detailsError}
						now={now}
					/>
					{(activity.activeWorkspaces > 0 || activity.activeBuilds > 0) && (
						<p
							className="text-sm text-yellow-300"
							data-testid="update-activity"
						>
							{`${activity.activeWorkspaces} student${activity.activeWorkspaces === 1 ? " is" : "s are"} active and ${activity.activeBuilds} build${activity.activeBuilds === 1 ? " is" : "s are"} running. Updating disconnects their editors and stops running simulations.`}
						</p>
					)}
					{actionError && (
						<p className="text-sm text-destructive" role="alert">
							{actionError}
						</p>
					)}
				</CardContent>
			</Card>

			{active && (
				<div
					className="flex items-center gap-2 rounded border border-yellow-900 bg-yellow-950/40 p-3 text-sm text-yellow-200"
					role="status"
					data-testid="update-active-status"
				>
					<Loader2
						className="size-4 shrink-0 animate-spin"
						aria-hidden="true"
					/>
					<div className="min-w-0">
						<span>
							Updating
							{job.ref
								? ` to ${job.kind === "tag" ? "release" : "branch"} ${job.ref}`
								: ""}
							{job.commit ? ` · ${job.commit.slice(0, 12)}` : ""}
							{elapsed ? ` · ${elapsed}` : ""}
							{job.requestedBy ? ` · started by ${job.requestedBy}` : ""}
						</span>
						{job.message && (
							<p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
								{job.message}
							</p>
						)}
					</div>
				</div>
			)}

			{job.log.length > 0 && (
				<details open={active} data-testid="update-command-log">
					<summary className="cursor-pointer text-sm font-medium">
						Command log ({job.log.length})
					</summary>
					<div className="mt-2 max-h-72 space-y-0.5 overflow-auto rounded border border-zinc-800 bg-black/30 p-3 font-mono text-xs">
						{job.log.map((entry, index) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: log lines are append-only and may repeat verbatim.
								key={index}
								className={
									entry.kind === "command"
										? "text-sky-300"
										: entry.kind === "error"
											? "text-red-300"
											: "text-foreground"
								}
							>
								<span className="mr-2 text-muted-foreground">
									{logTime(entry.at)}
								</span>
								{entry.text}
							</div>
						))}
					</div>
				</details>
			)}
		</div>
	);
}
