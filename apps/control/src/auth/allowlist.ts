/**
 * Sign-in allowlist — load and validate usernames, emails, and domains.
 *
 * File location: data/allowlist.json (gitignored).
 * Schema: {
 *   "usernames": ["alice"],
 *   "emails": ["a@b.com"],
 *   "domains": ["b.com"]
 * }
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type AllowlistData = {
	usernames: string[];
	emails: string[];
	domains: string[];
};

type AllowlistKind = "username" | "email" | "domain";

const EMPTY: AllowlistData = { usernames: [], emails: [], domains: [] };

/** Matches Better Auth's username plugin defaults: 3-30 chars, no spaces. */
export const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/u;

let cached: AllowlistData = EMPTY;
let allowlistPath = "";

function normalize(s: string): string {
	return s.trim().toLowerCase();
}

export function normalizeUsername(value: string): string {
	return normalize(value);
}

export function isValidUsername(value: string): boolean {
	return USERNAME_PATTERN.test(normalize(value));
}

/**
 * Better Auth requires an email on every user row, but username accounts do
 * not have one. Use a reserved `.invalid` address derived from the username:
 * it can never be a real mailbox and is unique per username.
 */
export const SYNTHETIC_EMAIL_DOMAIN = "students.coderunner.invalid";

export function syntheticEmailForUsername(username: string): string {
	return `${normalizeUsername(username)}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

export function isSyntheticEmail(email: string): boolean {
	return normalize(email).endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`);
}

function normalizeEntry(kind: AllowlistKind, value: string): string {
	const normalized = normalize(value);
	if (!normalized) {
		throw new Error("Allowlist value is required.");
	}

	if (kind === "username") {
		if (!isValidUsername(normalized)) {
			throw new Error(
				"Allowlist username must be 3-30 characters using letters, numbers, dots, or underscores.",
			);
		}
		return normalized;
	}

	if (kind === "email") {
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) {
			throw new Error("Allowlist email must be a valid email address.");
		}
		return normalized;
	}

	const domain = normalized.startsWith("@") ? normalized.slice(1) : normalized;
	if (
		!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u.test(
			domain,
		)
	) {
		throw new Error(
			"Allowlist domain must be a valid domain, e.g. frcteam.org.",
		);
	}
	return domain;
}

function emptyAllowlist(): AllowlistData {
	return { usernames: [], emails: [], domains: [] };
}

export function setAllowlistPath(dataDir: string): void {
	allowlistPath = resolve(dataDir, "allowlist.json");
}

export async function loadAllowlist(): Promise<AllowlistData> {
	if (!allowlistPath) return EMPTY;
	let raw: string;
	try {
		raw = await readFile(allowlistPath, "utf8");
	} catch (error) {
		// First-boot bootstrap: missing file is normal, fall back to empty.
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			cached = EMPTY;
			return cached;
		}
		throw error;
	}

	const parsed = JSON.parse(raw) as Partial<AllowlistData>;
	cached = {
		usernames: (parsed.usernames ?? []).map((entry) =>
			normalizeEntry("username", entry),
		),
		emails: (parsed.emails ?? []).map((entry) =>
			normalizeEntry("email", entry),
		),
		domains: (parsed.domains ?? []).map((entry) =>
			normalizeEntry("domain", entry),
		),
	};
	return cached;
}

export function reloadAllowlist(): Promise<AllowlistData> {
	return loadAllowlist();
}

export function getAllowlist(): AllowlistData {
	return cached;
}

export function isUsernameAllowed(username: string): boolean {
	return cached.usernames.includes(normalizeUsername(username));
}

export function isEmailAllowed(email: string): boolean {
	const normalizedEmail = normalize(email);
	if (cached.emails.includes(normalizedEmail)) {
		return true;
	}

	const domain = normalizedEmail.split("@")[1];
	if (domain && cached.domains.includes(domain)) {
		return true;
	}

	return false;
}

export async function saveAllowlist(data: AllowlistData): Promise<void> {
	if (!allowlistPath) throw new Error("Allowlist path not set");
	const sorted: AllowlistData = {
		usernames: [
			...new Set(
				data.usernames.map((entry) => normalizeEntry("username", entry)),
			),
		].sort(),
		emails: [
			...new Set(data.emails.map((entry) => normalizeEntry("email", entry))),
		].sort(),
		domains: [
			...new Set(data.domains.map((entry) => normalizeEntry("domain", entry))),
		].sort(),
	};
	await mkdir(dirname(allowlistPath), { recursive: true });
	const tempPath = `${allowlistPath}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(tempPath, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
	await rename(tempPath, allowlistPath);
	cached = sorted;
}

export async function addAllowlistEntry(
	kind: AllowlistKind,
	value: string,
): Promise<AllowlistData> {
	const current = {
		...emptyAllowlist(),
		...cached,
		usernames: [...cached.usernames],
		emails: [...cached.emails],
		domains: [...cached.domains],
	};
	const normalized = normalizeEntry(kind, value);
	const list =
		kind === "username"
			? current.usernames
			: kind === "email"
				? current.emails
				: current.domains;
	if (!list.includes(normalized)) {
		list.push(normalized);
	}
	await saveAllowlist(current);
	return current;
}

export async function removeAllowlistEntry(
	kind: AllowlistKind,
	value: string,
): Promise<AllowlistData> {
	const current = {
		...emptyAllowlist(),
		...cached,
		usernames: [...cached.usernames],
		emails: [...cached.emails],
		domains: [...cached.domains],
	};
	const normalized = normalizeEntry(kind, value);
	if (kind === "username") {
		current.usernames = current.usernames.filter((u) => u !== normalized);
	} else if (kind === "email") {
		current.emails = current.emails.filter((e) => e !== normalized);
	} else {
		current.domains = current.domains.filter((d) => d !== normalized);
	}
	await saveAllowlist(current);
	return current;
}
