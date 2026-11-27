import type {
	ServerUpdateKind,
	ServerUpdateStatusResponse,
} from "@frc-coderunner/contracts";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminPoll } from "../hooks/useAdminPoll";

async function fetchStatus(): Promise<ServerUpdateStatusResponse> {
	const res = await fetch("/admin/server-update", {
		credentials: "same-origin",
	});
	const body = (await res.json()) as ServerUpdateStatusResponse & {
		error?: string;
	};
	if (!res.ok) throw new Error(body.error ?? `${res.status}`);
	return body;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs uppercase tracking-wide text-muted-foreground">
				{label}
			</span>
			<span className="break-all text-sm">{children}</span>
		</div>
	);
}

export function ServerUpdate() {
	const { data, loading, error, refetch } = useAdminPoll(fetchStatus, 3000);
	const [kind, setKind] = useState<ServerUpdateKind>("tag");
	const [ref, setRef] = useState("");
	const [busy, setBusy] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);

	// Default to the newest tag, then the first branch, once refs arrive.
	useEffect(() => {
		if (ref || !data) return;
		if (data.refs.tags.length > 0) {
			setKind("tag");
			setRef(data.refs.tags[0]!);
		} else if (data.refs.branches.length > 0) {
			setKind("branch");
			setRef(data.refs.branches[0]!);
		}
	}, [data, ref]);

	const update = async () => {
		if (!ref) return;
		const noun = kind === "tag" ? `release tag ${ref}` : `branch ${ref}`;
		if (
			!window.confirm(
				`Update the CodeRunner server to ${noun}? Running simulations will be stopped and editors will reconnect. Student project files are kept.`,
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
				body: JSON.stringify({ kind, ref }),
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
	if (error) return <p className="p-4 text-destructive">Error: {error}</p>;
	if (!data) return null;

	const { repo, refs, job, demo } = data;
	const active = job.state === "starting" || job.state === "running";
	const refsAvailable = refs.tags.length > 0 || refs.branches.length > 0;

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-xl font-semibold">Server Update</h2>
				<p className="text-sm text-muted-foreground">
					Deploy a published release tag or build the server from a branch in
					your own checkout.
				</p>
			</div>

			{demo && (
				<p className="rounded border border-blue-900 bg-blue-950/40 p-3 text-sm text-blue-200">
					Demo mode is showing sample values. The Update tab is read-only here;
					no server changes will be made.
				</p>
			)}
			{!demo && repo.source === "local" && (
				<p className="rounded border border-blue-900 bg-blue-950/40 p-3 text-sm text-blue-200">
					Running from source: showing git and `.env` values from the local
					checkout. Updates are read-only here; they require the
					Compose-deployed control container.
				</p>
			)}

			<Card>
				<CardHeader className="pb-2">
					<CardTitle>Current deployment</CardTitle>
				</CardHeader>
				<CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<Detail label="Commit">
						<code className="font-mono" data-testid="update-current-commit">
							{repo.commit ?? "unknown"}
						</code>
					</Detail>
					<Detail label="Version">{repo.version ?? "unknown"}</Detail>
					<Detail label="Mode">{repo.mode}</Detail>
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
					<Detail label="Host checkout">
						{repo.hostDir ?? "not detected"}
					</Detail>
				</CardContent>
			</Card>

			{!repo.updatable && !demo && repo.source !== "local" && (
				<p className="rounded border border-yellow-900 bg-yellow-950/40 p-3 text-sm text-yellow-200">
					Updates need a host checkout. Set{" "}
					<code className="font-mono">CODERUNNER_UPDATE_REPO_DIR</code> to the
					directory containing{" "}
					<code className="font-mono">docker-compose.yml</code>, then recreate
					the control container. Prebuilt releases and branch builds both use
					that checkout's Docker configuration.
				</p>
			)}

			<Card>
				<CardHeader className="pb-2">
					<CardTitle>Available versions</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{refs.error && (
						<p className="text-sm text-yellow-300" role="alert">
							{refs.error}
						</p>
					)}
					<div className="flex flex-wrap items-end gap-3">
						<label className="flex flex-col gap-1 text-sm">
							<span className="text-muted-foreground">Release tag</span>
							<select
								className="min-w-48 rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
								value={kind === "tag" ? ref : ""}
								disabled={
									!repo.updatable || !refs.tags.length || busy || active
								}
								onChange={(event) => {
									setKind("tag");
									setRef(event.target.value);
								}}
								data-testid="update-tag-select"
							>
								<option value="">
									{refs.tags.length ? "Choose a tag" : "No tags found"}
								</option>
								{refs.tags.map((tag) => (
									<option key={tag} value={tag}>
										{tag}
									</option>
								))}
							</select>
						</label>
						<label className="flex flex-col gap-1 text-sm">
							<span className="text-muted-foreground">Branch</span>
							<select
								className="min-w-48 rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
								value={kind === "branch" ? ref : ""}
								disabled={
									!repo.updatable || !refs.branches.length || busy || active
								}
								onChange={(event) => {
									setKind("branch");
									setRef(event.target.value);
								}}
								data-testid="update-branch-select"
							>
								<option value="">
									{refs.branches.length
										? "Choose a branch"
										: "No branches found"}
								</option>
								{refs.branches.map((branch) => (
									<option key={branch} value={branch}>
										{branch}
									</option>
								))}
							</select>
						</label>
						<Button
							onClick={() => void update()}
							disabled={
								!ref || !refsAvailable || !repo.updatable || busy || active
							}
							data-testid="update-submit"
						>
							{busy ? "Starting…" : "Update server"}
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						Tags pull the prebuilt images from{" "}
						{repo.imageNamespace ?? "the registry"}. Branches fetch, check out,
						and build from the host checkout. The control plane restarts and
						workspace containers are recreated with the new workspace image;
						project files stay on disk.
					</p>
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
					<Loader2 className="size-4 animate-spin" aria-hidden="true" />
					<span>
						Updating
						{job.ref
							? ` to ${job.kind === "tag" ? "release" : "branch"} ${job.ref}`
							: ""}
						{job.message ? ` — ${job.message}` : ""}
					</span>
				</div>
			)}
		</div>
	);
}
