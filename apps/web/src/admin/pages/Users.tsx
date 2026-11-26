import {
	ArrowDownCircle,
	ArrowUpCircle,
	Eye,
	EyeOff,
	Globe,
	KeyRound,
	MoreHorizontal,
	Pencil,
	Plus,
	Trash2,
	UserPlus,
	X,
} from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useAdminPoll } from "../hooks/useAdminPoll";

type UserRow = {
	id: string;
	name: string;
	email: string;
	username: string | null;
	role: string | null;
	slug: string | null;
	classroomId: string | null;
	createdAt: string;
	lastSeenAt: string | null;
	/** Forced password change, kept separate from onboarding "Pending". */
	mustChangePassword?: boolean;
	/** Established user with a coach-reset password. */
	passwordReset?: boolean;
	pending: boolean;
};

type UsersResponse = {
	ok: boolean;
	users: UserRow[];
	currentUserId: string;
};

type AddUserResponse = {
	ok: boolean;
	user?: { username: string | null; email: string };
	temporaryPassword?: string | null;
	error?: string;
};

type EditUserResponse = {
	ok: boolean;
	error?: string;
};

type UserSheet = { mode: "add" } | { mode: "edit"; user: UserRow };

const inputClassName =
	"h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-2 text-sm";

function displayEmail(email: string): string {
	return email.endsWith("@students.coderunner.invalid") ? "—" : email;
}

/** Same shape as the roster service's 18-byte base64url temporary passwords. */
function generateTemporaryPassword(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(18));
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/u, "");
}

async function fetchUsers(): Promise<UsersResponse> {
	const res = await fetch("/admin/users", { credentials: "same-origin" });
	if (!res.ok) throw new Error(`${res.status}`);
	return (await res.json()) as UsersResponse;
}

async function fetchDomains(): Promise<string[]> {
	const res = await fetch("/admin/allowlist", { credentials: "same-origin" });
	if (!res.ok) throw new Error(`${res.status}`);
	const body = (await res.json()) as { domains: string[] };
	return body.domains;
}

export function Users() {
	const {
		data: usersData,
		loading,
		error,
		refetch: refetchUsers,
	} = useAdminPoll(useCallback(fetchUsers, []), 10000);
	const { data: domainData, refetch: refetchDomains } = useAdminPoll(
		useCallback(fetchDomains, []),
		10000,
	);
	const users = usersData?.users;
	const currentUserId = usersData?.currentUserId;
	const domains = domainData ?? [];
	const [busy, setBusy] = useState<string | null>(null);
	const [sheet, setSheet] = useState<UserSheet | null>(null);
	const [sheetBusy, setSheetBusy] = useState(false);
	const [sheetError, setSheetError] = useState<string | null>(null);
	const [username, setUsername] = useState("");
	const [email, setEmail] = useState("");
	const [displayName, setDisplayName] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [editUsername, setEditUsername] = useState("");
	const [editEmail, setEditEmail] = useState("");
	const [editDisplayName, setEditDisplayName] = useState("");
	const [domain, setDomain] = useState("");
	const [issuedPassword, setIssuedPassword] = useState<{
		label: string;
		password: string;
	} | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [domainsOpen, setDomainsOpen] = useState(false);

	const addHasIdentity = username.trim().length > 0 || email.trim().length > 0;
	const addPasswordValid = password.trim().length >= 8;
	const canCreateUser = addHasIdentity && addPasswordValid;
	const editHasIdentity =
		editUsername.trim().length > 0 || editEmail.trim().length > 0;

	async function refetch() {
		await Promise.all([refetchUsers(), refetchDomains()]);
	}

	function closeSheet() {
		setSheet(null);
		setSheetError(null);
		setSheetBusy(false);
	}

	function openAddSheet() {
		setUsername("");
		setEmail("");
		setDisplayName("");
		setPassword("");
		setShowPassword(false);
		setSheetError(null);
		setSheet({ mode: "add" });
	}

	function openEditSheet(user: UserRow) {
		setEditUsername(user.username ?? "");
		setEditEmail(displayEmail(user.email) === "—" ? "" : user.email);
		setEditDisplayName(user.name);
		setSheetError(null);
		setSheet({ mode: "edit", user });
	}

	async function addUser() {
		if (!addHasIdentity) {
			setSheetError("Enter a username or an email address.");
			return;
		}
		if (!addPasswordValid) {
			setSheetError(
				"Enter a temporary password of at least 8 characters, or click Generate.",
			);
			return;
		}
		setSheetBusy(true);
		setSheetError(null);
		setActionError(null);
		setMessage(null);
		try {
			const res = await fetch("/admin/allowlist", {
				method: "POST",
				credentials: "same-origin",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					username: username.trim() || undefined,
					email: email.trim() || undefined,
					displayName: displayName.trim() || undefined,
					password: password.trim(),
					createOnly: true,
				}),
			});
			const body = (await res.json()) as AddUserResponse;
			if (!res.ok || !body.ok) {
				setSheetError(body.error ?? `Couldn't add that user (${res.status}).`);
				return;
			}
			const label = body.user?.username || body.user?.email || "user";
			if (body.temporaryPassword) {
				setIssuedPassword({ label, password: body.temporaryPassword });
			} else {
				setMessage(`${label} was added.`);
			}
			closeSheet();
			await refetch();
		} catch (err) {
			setSheetError(
				err instanceof Error ? err.message : "Couldn't add that user.",
			);
		} finally {
			setSheetBusy(false);
		}
	}

	async function editUser(user: UserRow) {
		if (!editHasIdentity) {
			setSheetError("Keep at least a username or an email address.");
			return;
		}
		setSheetBusy(true);
		setSheetError(null);
		setActionError(null);
		setMessage(null);
		try {
			const res = await fetch(
				`/admin/users/${encodeURIComponent(user.id)}/identity`,
				{
					method: "POST",
					credentials: "same-origin",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						username: editUsername.trim(),
						email: editEmail.trim(),
						displayName: editDisplayName.trim() || null,
					}),
				},
			);
			const body = (await res.json()) as EditUserResponse;
			if (!res.ok || !body.ok) {
				setSheetError(
					body.error ?? `Couldn't update that user (${res.status}).`,
				);
				return;
			}
			setMessage(`${editDisplayName.trim() || user.name} was updated.`);
			closeSheet();
			await refetch();
		} catch (err) {
			setSheetError(
				err instanceof Error ? err.message : "Couldn't update that user.",
			);
		} finally {
			setSheetBusy(false);
		}
	}

	async function resetPassword(user: UserRow) {
		if (!confirm(`Issue a new temporary password for ${user.name}?`)) return;
		setBusy(user.id);
		setActionError(null);
		try {
			const response = await fetch(`/admin/users/${user.id}/reset-password`, {
				method: "POST",
				credentials: "same-origin",
			});
			const body = (await response.json()) as {
				temporaryPassword?: string;
				error?: string;
			};
			if (!response.ok || !body.temporaryPassword) {
				setActionError(
					body.error ?? `Couldn't reset the password (${response.status}).`,
				);
				return;
			}
			setIssuedPassword({
				label: user.name,
				password: body.temporaryPassword,
			});
			await refetch();
		} finally {
			setBusy(null);
		}
	}

	async function setRole(userId: string, action: "promote" | "demote") {
		setBusy(userId);
		setActionError(null);
		try {
			const response = await fetch(`/admin/users/${userId}/${action}`, {
				method: "POST",
				credentials: "same-origin",
			});
			if (!response.ok) {
				const body = (await response.json()) as { error?: string };
				setActionError(
					body.error ?? `Couldn't update that role (${response.status}).`,
				);
				return;
			}
			await refetch();
		} finally {
			setBusy(null);
		}
	}

	async function removeUser(user: UserRow) {
		if (
			!confirm(
				`Delete ${user.name} and their workspace? This cannot be undone.`,
			)
		)
			return;
		setBusy(user.id);
		setActionError(null);
		try {
			const response = await fetch(`/admin/users/${user.id}`, {
				method: "DELETE",
				credentials: "same-origin",
			});
			if (!response.ok) {
				const body = (await response.json()) as { error?: string };
				setActionError(
					body.error ?? `Couldn't remove that user (${response.status}).`,
				);
				return;
			}
			await refetch();
		} finally {
			setBusy(null);
		}
	}

	async function addDomain() {
		if (!domain.trim()) return;
		setBusy("domain");
		setActionError(null);
		try {
			const response = await fetch("/admin/allowlist", {
				method: "POST",
				credentials: "same-origin",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ kind: "domain", value: domain.trim() }),
			});
			if (!response.ok) throw new Error(`${response.status}`);
			setDomain("");
			await refetch();
		} finally {
			setBusy(null);
		}
	}

	async function removeDomain(value: string) {
		setBusy(value);
		try {
			await fetch(`/admin/allowlist/${encodeURIComponent(value)}?kind=domain`, {
				method: "DELETE",
				credentials: "same-origin",
			});
			await refetch();
		} finally {
			setBusy(null);
		}
	}

	if (loading && !users)
		return <p className="text-muted-foreground p-4">Loading…</p>;
	if (error) return <p className="text-destructive p-4">Error: {error}</p>;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-3">
				<h2 className="text-xl font-semibold">Users</h2>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setDomainsOpen(true)}
					>
						<Globe className="size-4" />
						Domains
					</Button>
					<Button size="sm" onClick={openAddSheet}>
						<UserPlus className="size-4" />
						Add user
					</Button>
				</div>
			</div>
			{message && <p className="text-sm text-green-400">{message}</p>}
			{actionError && (
				<p className="text-destructive text-sm" role="alert">
					{actionError}
				</p>
			)}
			{issuedPassword && (
				<div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
					<p className="font-medium">
						Temporary password for {issuedPassword.label}
					</p>
					<p
						data-testid="admin-temporary-password"
						className="mt-1 font-mono text-xs break-all"
					>
						{issuedPassword.password}
					</p>
					<p className="text-muted-foreground mt-1 text-xs">
						Copy it now. It is stored only as a hash and won&apos;t be shown
						again. The user must change it at first sign-in.
					</p>
					<Button
						variant="outline"
						size="sm"
						className="mt-2"
						onClick={() => setIssuedPassword(null)}
					>
						Done
					</Button>
				</div>
			)}

			<Card>
				<CardContent className="pt-6">
					{!users || users.length === 0 ? (
						<p className="text-muted-foreground">No users yet.</p>
					) : (
						<table data-testid="admin-users-table" className="w-full text-sm">
							<thead>
								<tr className="border-b text-left text-muted-foreground">
									<th className="pb-2">Name</th>
									<th className="pb-2">Username</th>
									<th className="pb-2">Email</th>
									<th className="pb-2">Slug</th>
									<th className="pb-2">Last seen</th>
									<th className="pb-2"></th>
								</tr>
							</thead>
							<tbody>
								{users.map((u) => (
									<tr key={u.id} className="border-b last:border-0">
										<td className="py-2">
											{u.name}
											{u.role === "admin" && (
												<span className="ml-2 rounded bg-blue-900/60 px-1.5 py-0.5 text-[10px] uppercase text-blue-300">
													Admin
												</span>
											)}
											{u.passwordReset && (
												<span className="ml-2 rounded bg-blue-900/60 px-1.5 py-0.5 text-[10px] uppercase text-blue-300">
													Password reset
												</span>
											)}
											{u.pending && !u.passwordReset && (
												<span className="ml-2 rounded bg-yellow-900/60 px-1.5 py-0.5 text-[10px] uppercase text-yellow-300">
													Pending
												</span>
											)}
										</td>
										<td className="py-2 font-mono">{u.username ?? "—"}</td>
										<td className="py-2">{displayEmail(u.email)}</td>
										<td className="py-2 font-mono">{u.slug ?? "—"}</td>
										<td className="py-2">
											{u.lastSeenAt
												? new Date(u.lastSeenAt).toLocaleString()
												: "—"}
										</td>
										<td className="py-2">
											{u.id !== currentUserId && (
												<DropdownMenu>
													<DropdownMenuTrigger
														render={
															<Button
																variant="ghost"
																size="icon"
																className="size-8"
																aria-label={`Actions for ${u.name}`}
																disabled={busy === u.id}
															/>
														}
													>
														<MoreHorizontal className="size-4" />
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem onClick={() => openEditSheet(u)}>
															<Pencil />
															Edit
														</DropdownMenuItem>
														{!u.classroomId && (
															<DropdownMenuItem
																onClick={() => void resetPassword(u)}
															>
																<KeyRound />
																Reset password
															</DropdownMenuItem>
														)}
														{u.role === "admin" ? (
															<DropdownMenuItem
																onClick={() => void setRole(u.id, "demote")}
															>
																<ArrowDownCircle />
																Demote
															</DropdownMenuItem>
														) : u.classroomId ? null : (
															// Classroom guests can't be admins (decision 043).
															<DropdownMenuItem
																onClick={() => void setRole(u.id, "promote")}
															>
																<ArrowUpCircle />
																Promote
															</DropdownMenuItem>
														)}
														<DropdownMenuSeparator />
														<DropdownMenuItem
															variant="destructive"
															onClick={() => void removeUser(u)}
														>
															<Trash2 />
															Remove
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</CardContent>
			</Card>

			<Sheet
				open={sheet !== null}
				onOpenChange={(open) => {
					if (!open) closeSheet();
				}}
			>
				<SheetContent>
					{sheet?.mode === "add" && (
						<>
							<SheetHeader>
								<SheetTitle>Add user</SheetTitle>
								<SheetDescription className="sr-only">
									Create a new student account.
								</SheetDescription>
							</SheetHeader>
							<div className="space-y-2">
								<div className="space-y-1">
									<label
										htmlFor="add-username"
										className="block text-xs font-medium text-muted-foreground"
									>
										Username
									</label>
									<input
										id="add-username"
										data-testid="admin-allowlist-input"
										type="text"
										value={username}
										onChange={(e) => setUsername(e.target.value)}
										placeholder="Username"
										className={inputClassName}
									/>
								</div>
								<div className="space-y-1">
									<label
										htmlFor="add-email"
										className="block text-xs font-medium text-muted-foreground"
									>
										Email
									</label>
									<input
										id="add-email"
										type="email"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										placeholder="Email"
										className={inputClassName}
									/>
								</div>
								<div className="space-y-1">
									<label
										htmlFor="add-display-name"
										className="block text-xs font-medium text-muted-foreground"
									>
										Display name
									</label>
									<input
										id="add-display-name"
										type="text"
										value={displayName}
										onChange={(e) => setDisplayName(e.target.value)}
										placeholder="Display name (optional)"
										className={inputClassName}
									/>
								</div>
								<div className="space-y-1">
									<label
										htmlFor="add-password"
										className="block text-xs font-medium text-muted-foreground"
									>
										Temporary password
									</label>
									<div className="flex gap-2">
										<input
											id="add-password"
											type={showPassword ? "text" : "password"}
											value={password}
											onChange={(e) => setPassword(e.target.value)}
											placeholder="Temporary password"
											className={inputClassName}
											minLength={8}
											maxLength={128}
											required
											data-testid="admin-temporary-password-input"
										/>
										<Button
											type="button"
											variant="outline"
											className="shrink-0"
											onClick={() => setPassword(generateTemporaryPassword())}
										>
											Generate
										</Button>
										<Button
											type="button"
											variant="outline"
											size="icon"
											className="shrink-0"
											aria-label={
												showPassword ? "Hide password" : "Show password"
											}
											title={showPassword ? "Hide password" : "Show password"}
											onClick={() => setShowPassword((visible) => !visible)}
										>
											{showPassword ? <EyeOff /> : <Eye />}
										</Button>
									</div>
								</div>
								{sheetError && (
									<p className="text-destructive text-sm" role="alert">
										{sheetError}
									</p>
								)}
							</div>
							<SheetFooter>
								<Button variant="outline" onClick={closeSheet}>
									Cancel
								</Button>
								<Button
									onClick={() => void addUser()}
									disabled={sheetBusy || !canCreateUser}
									title={
										canCreateUser
											? undefined
											: !addHasIdentity
												? "Enter a username or email"
												: "Enter a temporary password (8+ characters)"
									}
								>
									Create user
								</Button>
							</SheetFooter>
						</>
					)}
					{sheet?.mode === "edit" && (
						<>
							<SheetHeader>
								<SheetTitle>Edit {sheet.user.name}</SheetTitle>
								<SheetDescription className="sr-only">
									Change this user&apos;s display name, username, or email.
								</SheetDescription>
							</SheetHeader>
							<div className="space-y-2">
								<div className="space-y-1">
									<label
										htmlFor="edit-display-name"
										className="block text-xs font-medium text-muted-foreground"
									>
										Display name
									</label>
									<input
										id="edit-display-name"
										data-testid="admin-edit-display-name"
										type="text"
										value={editDisplayName}
										onChange={(e) => setEditDisplayName(e.target.value)}
										placeholder="Display name"
										className={inputClassName}
									/>
								</div>
								<div className="space-y-1">
									<label
										htmlFor="edit-username"
										className="block text-xs font-medium text-muted-foreground"
									>
										Username
									</label>
									<input
										id="edit-username"
										data-testid="admin-edit-username"
										type="text"
										value={editUsername}
										onChange={(e) => setEditUsername(e.target.value)}
										placeholder="Username"
										className={inputClassName}
									/>
								</div>
								<div className="space-y-1">
									<label
										htmlFor="edit-email"
										className="block text-xs font-medium text-muted-foreground"
									>
										Email
									</label>
									<input
										id="edit-email"
										data-testid="admin-edit-email"
										type="email"
										value={editEmail}
										onChange={(e) => setEditEmail(e.target.value)}
										placeholder="Email"
										className={inputClassName}
									/>
								</div>
								{sheetError && (
									<p className="text-destructive text-sm" role="alert">
										{sheetError}
									</p>
								)}
							</div>
							<SheetFooter>
								<Button variant="outline" onClick={closeSheet}>
									Cancel
								</Button>
								<Button
									onClick={() => void editUser(sheet.user)}
									disabled={sheetBusy || !editHasIdentity}
									title={
										editHasIdentity ? undefined : "Keep a username or email"
									}
								>
									Save changes
								</Button>
							</SheetFooter>
						</>
					)}
				</SheetContent>
			</Sheet>

			<Sheet open={domainsOpen} onOpenChange={setDomainsOpen}>
				<SheetContent>
					<SheetHeader>
						<SheetTitle>Allowed email domains</SheetTitle>
						<SheetDescription className="sr-only">
							Manage the email domains allowed to sign in.
						</SheetDescription>
					</SheetHeader>
					<div className="flex gap-2">
						<input
							data-testid="admin-domain-input"
							type="text"
							value={domain}
							onChange={(e) => setDomain(e.target.value)}
							placeholder="frcteam.org"
							className={inputClassName}
							onKeyDown={(e) => e.key === "Enter" && void addDomain()}
						/>
						<Button
							size="sm"
							onClick={() => void addDomain()}
							disabled={busy !== null || !domain.trim()}
						>
							<Plus className="size-4" />
							Add domain
						</Button>
					</div>
					{domains.length > 0 && (
						<ul className="space-y-1">
							{domains.map((value) => (
								<li
									key={value}
									className="flex items-center justify-between rounded px-2 py-1 hover:bg-zinc-800"
								>
									<span className="font-mono text-sm">{value}</span>
									<Button
										variant="ghost"
										size="icon"
										className="size-8"
										aria-label={`Remove ${value}`}
										onClick={() => void removeDomain(value)}
										disabled={busy !== null}
									>
										<X className="size-4" />
									</Button>
								</li>
							))}
						</ul>
					)}
					<SheetFooter>
						<Button variant="outline" onClick={() => setDomainsOpen(false)}>
							Done
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>
		</div>
	);
}
