import type { ServerUpdateKind } from "@frc-coderunner/contracts";
import { Check, ChevronsUpDown, GitBranch, Search, Tag } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export type RefChoice = { kind: ServerUpdateKind; ref: string };

type Option = RefChoice & {
	key: string;
	commit: string | null;
	current: boolean;
	latest: boolean;
};

type Props = {
	tags: string[];
	branches: string[];
	/** Commit SHA per `tag:<name>` / `branch:<name>`. */
	commits: Record<string, string>;
	/** Key (`tag:<name>` / `branch:<name>`) of the version running now. */
	currentKey: string | null;
	value: RefChoice | null;
	onChange: (choice: RefChoice) => void;
	disabled?: boolean;
};

const keyOf = (choice: RefChoice) => `${choice.kind}:${choice.ref}`;

/**
 * One searchable dropdown for every deployable version, split into Releases
 * and Branches sections. Follows the WAI-ARIA combobox pattern: the search
 * input owns focus while arrow keys move the active option.
 */
export function RefPicker({
	tags,
	branches,
	commits,
	currentKey,
	value,
	onChange,
	disabled = false,
}: Props) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [activeKey, setActiveKey] = useState<string | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const id = useId();
	const listId = `${id}-list`;

	const sections = useMemo(() => {
		const needle = query.trim().toLowerCase();
		const build = (kind: ServerUpdateKind, names: string[]): Option[] =>
			names
				.filter((name) => !needle || name.toLowerCase().includes(needle))
				.map((name) => {
					const key = `${kind}:${name}`;
					return {
						kind,
						ref: name,
						key,
						commit: commits[key] ?? null,
						current: key === currentKey,
						latest: kind === "tag" && name === tags[0],
					};
				});
		return [
			{ kind: "tag" as const, label: "Releases", options: build("tag", tags) },
			{
				kind: "branch" as const,
				label: "Branches",
				options: build("branch", branches),
			},
		];
	}, [query, tags, branches, commits, currentKey]);
	const flat = useMemo(
		() => sections.flatMap((section) => section.options),
		[sections],
	);

	// Keep the active option valid as the filter narrows the list.
	useEffect(() => {
		if (!open) return;
		if (!activeKey || !flat.some((option) => option.key === activeKey)) {
			setActiveKey(flat[0]?.key ?? null);
		}
	}, [open, flat, activeKey]);

	useEffect(() => {
		if (!open || !activeKey) return;
		const element = listRef.current?.querySelector<HTMLElement>(
			`[data-key="${CSS.escape(activeKey)}"]`,
		);
		element?.scrollIntoView?.({ block: "nearest" });
	}, [open, activeKey]);

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [open]);

	const openPicker = () => {
		if (disabled) return;
		setQuery("");
		setActiveKey(value ? keyOf(value) : null);
		setOpen(true);
		queueMicrotask(() => inputRef.current?.focus());
	};

	const choose = (option: Option) => {
		onChange({ kind: option.kind, ref: option.ref });
		setOpen(false);
	};

	const move = (delta: number) => {
		if (flat.length === 0) return;
		const index = flat.findIndex((option) => option.key === activeKey);
		const next = (index + delta + flat.length) % flat.length;
		setActiveKey(flat[next]!.key);
	};

	const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			move(1);
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			move(-1);
		} else if (event.key === "Enter") {
			event.preventDefault();
			const option = flat.find((candidate) => candidate.key === activeKey);
			if (option) choose(option);
		} else if (event.key === "Escape") {
			event.preventDefault();
			setOpen(false);
		}
	};

	const selected = value
		? flat.find((option) => option.key === keyOf(value))
		: null;
	const selectedCommit = value ? (commits[keyOf(value)] ?? null) : null;
	const Icon = value?.kind === "branch" ? GitBranch : Tag;

	return (
		<div ref={rootRef} className="relative w-full max-w-md">
			<button
				type="button"
				className="flex w-full items-center gap-2 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
				onClick={() => (open ? setOpen(false) : openPicker())}
				disabled={disabled}
				aria-haspopup="listbox"
				aria-expanded={open}
				data-testid="update-ref-picker"
			>
				{value ? (
					<>
						<Icon className="size-4 shrink-0 text-muted-foreground" />
						<span className="truncate font-medium">{value.ref}</span>
						<span className="text-xs text-muted-foreground">
							{value.kind === "tag" ? "release" : "branch"}
						</span>
						{(selected?.current ?? keyOf(value) === currentKey) && (
							<RefBadge tone="current">Current</RefBadge>
						)}
						{selectedCommit && (
							<code className="ml-auto font-mono text-xs text-muted-foreground">
								{selectedCommit.slice(0, 7)}
							</code>
						)}
					</>
				) : (
					<span className="text-muted-foreground">
						{tags.length + branches.length > 0
							? "Choose a release or branch…"
							: "No releases or branches found"}
					</span>
				)}
				<ChevronsUpDown
					className={`size-4 shrink-0 text-muted-foreground ${value && selectedCommit ? "" : "ml-auto"}`}
				/>
			</button>

			{open && (
				<div className="absolute z-20 mt-1 w-full overflow-hidden rounded border border-zinc-700 bg-zinc-900 shadow-lg">
					<div className="flex items-center gap-2 border-b border-zinc-800 px-3">
						<Search className="size-4 shrink-0 text-muted-foreground" />
						<input
							ref={inputRef}
							className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
							placeholder="Search releases and branches"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							onKeyDown={onKeyDown}
							role="combobox"
							aria-expanded={open}
							aria-controls={listId}
							aria-autocomplete="list"
							aria-activedescendant={
								activeKey ? `${id}-${activeKey}` : undefined
							}
							data-testid="update-ref-search"
						/>
					</div>
					<div
						ref={listRef}
						id={listId}
						role="listbox"
						aria-label="Versions"
						className="max-h-72 overflow-auto py-1"
					>
						{flat.length === 0 && (
							<p className="px-3 py-2 text-sm text-muted-foreground">
								No matches for “{query}”
							</p>
						)}
						{sections.map(
							(section) =>
								section.options.length > 0 && (
									// biome-ignore lint/a11y/useSemanticElements: ARIA listbox sections are role="group"; a <fieldset> is not valid inside role="listbox".
									<div
										key={section.kind}
										role="group"
										aria-labelledby={`${id}-${section.kind}-label`}
									>
										<div
											id={`${id}-${section.kind}-label`}
											className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
										>
											{section.kind === "tag" ? (
												<Tag className="size-3" />
											) : (
												<GitBranch className="size-3" />
											)}
											{section.label}
											<span className="font-normal normal-case">
												·{" "}
												{section.kind === "tag"
													? "prebuilt"
													: "built on this server"}
											</span>
										</div>
										{section.options.map((option) => {
											const isSelected =
												value !== null && keyOf(value) === option.key;
											return (
												<div
													key={option.key}
													id={`${id}-${option.key}`}
													data-key={option.key}
													role="option"
													aria-selected={isSelected}
													tabIndex={-1}
													className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${option.key === activeKey ? "bg-zinc-800" : ""}`}
													onPointerMove={() => setActiveKey(option.key)}
													onMouseDown={(event) => event.preventDefault()}
													onClick={() => choose(option)}
													onKeyDown={() => {}}
												>
													<Check
														className={`size-4 shrink-0 ${isSelected ? "" : "invisible"}`}
													/>
													<span className="truncate">{option.ref}</span>
													{option.latest && (
														<RefBadge tone="latest">Latest</RefBadge>
													)}
													{option.current && (
														<RefBadge tone="current">Current</RefBadge>
													)}
													{option.commit && (
														<code className="ml-auto font-mono text-xs text-muted-foreground">
															{option.commit.slice(0, 7)}
														</code>
													)}
												</div>
											);
										})}
									</div>
								),
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function RefBadge({
	tone,
	children,
}: {
	tone: "current" | "latest";
	children: React.ReactNode;
}) {
	return (
		<span
			className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
				tone === "current"
					? "bg-green-950 text-green-300"
					: "bg-sky-950 text-sky-300"
			}`}
		>
			{children}
		</span>
	);
}
