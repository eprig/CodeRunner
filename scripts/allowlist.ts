#!/usr/bin/env bun
/**
 * Manage the CodeRunner roster and domain allowlist.
 *
 * People are Better Auth `user` rows; only domains remain in
 * data/allowlist.json. Adding an existing username or email reuses that row
 * (and reissues a temporary password) instead of creating a duplicate.
 *
 * Usage:
 *   bun scripts/allowlist.ts list
 *   bun scripts/allowlist.ts add <username|email|domain> <value>
 *   bun scripts/allowlist.ts add user <username> [email]
 *   bun scripts/allowlist.ts remove <username|email|domain> <value>
 *
 * Examples:
 *   bun scripts/allowlist.ts add username alice
 *   bun scripts/allowlist.ts add email alice@frcteam.org
 *   bun scripts/allowlist.ts add domain frcteam.org
 *   bun scripts/allowlist.ts list
 */

import {
	addAllowlistEntry,
	getAllowlist,
	loadAllowlist,
	removeAllowlistEntry,
	setAllowlistPath,
} from "../apps/control/src/auth/allowlist";
import {
	addOrUpdateRosterUser,
	deletePendingRosterUser,
	findRosterUserByEmail,
	findRosterUserByUsername,
	listRosterUsers,
} from "../apps/control/src/auth/roster";
import { AppStorage } from "../apps/control/src/storage";

const dataDir = Bun.env.FRC_DATA_DIR ?? "data";
setAllowlistPath(dataDir);

const [command, firstArg, secondArg, thirdArg] = process.argv.slice(2);

type AllowlistKind = "username" | "email" | "domain" | "user";

const KINDS: AllowlistKind[] = ["username", "email", "domain", "user"];

function isAllowlistKind(value: string | undefined): value is AllowlistKind {
	return value !== undefined && KINDS.includes(value as AllowlistKind);
}

function inferKind(value: string | undefined): AllowlistKind {
	if (!value) usage();
	if (value.includes("@")) return "email";
	if (value.includes(".")) return "domain";
	return "username";
}

function usage(): never {
	console.error(
		"Usage: bun scripts/allowlist.ts <list|add|remove> [username|email|domain|user] [value] [email]",
	);
	process.exit(1);
}

async function openStorage(): Promise<AppStorage> {
	const storage = new AppStorage({ dataDir });
	await storage.initialize();
	return storage;
}

async function main(): Promise<void> {
	await loadAllowlist();

	switch (command) {
		case "list": {
			const allowlist = getAllowlist();
			const storage = await openStorage();
			try {
				const users = listRosterUsers(storage.db);
				if (users.length === 0 && allowlist.domains.length === 0) {
					console.log("The roster and domain allowlist are empty.");
					return;
				}
				if (users.length > 0) {
					console.log("Users:");
					for (const user of users) {
						const identity = user.username ?? user.email;
						console.log(
							`  ${identity}${user.pending ? " (pending)" : ""}${user.role === "admin" ? " [admin]" : ""}`,
						);
					}
				}
				if (allowlist.domains.length > 0) {
					console.log("Domains:");
					for (const domain of allowlist.domains) console.log(`  ${domain}`);
				}
			} finally {
				storage.close();
			}
			return;
		}

		case "add": {
			const kind = isAllowlistKind(firstArg) ? firstArg : inferKind(firstArg);
			const value = isAllowlistKind(firstArg) ? secondArg : firstArg;
			if (!value) usage();
			if (kind === "domain") {
				await addAllowlistEntry("domain", value);
				console.log(`Added domain: ${value.toLowerCase()}`);
				return;
			}
			const storage = await openStorage();
			try {
				const result = await addOrUpdateRosterUser(storage, {
					username: kind === "email" ? undefined : value,
					email:
						kind === "email" ? value : kind === "user" ? thirdArg : undefined,
				});
				console.log(
					`${result.created ? "Added" : "Updated"}: ${result.user.username ?? result.user.email}`,
				);
				if (result.temporaryPassword) {
					console.log(
						`Temporary password (shown once): ${result.temporaryPassword}`,
					);
				}
			} finally {
				storage.close();
			}
			return;
		}

		case "remove": {
			const kind = isAllowlistKind(firstArg) ? firstArg : inferKind(firstArg);
			const value = isAllowlistKind(firstArg) ? secondArg : firstArg;
			if (!value) usage();
			if (kind === "domain") {
				await removeAllowlistEntry("domain", value);
				console.log(`Removed domain: ${value.toLowerCase()}`);
				return;
			}
			const storage = await openStorage();
			try {
				const user =
					findRosterUserByUsername(storage.db, value) ??
					findRosterUserByEmail(storage.db, value);
				if (!user) {
					console.error(`No roster user matches ${value}.`);
					process.exit(1);
				}
				deletePendingRosterUser(storage, user.id);
				const current = getAllowlist();
				if (current.emails.includes(value.toLowerCase())) {
					await removeAllowlistEntry("email", value);
				}
				if (current.usernames.includes(value.toLowerCase())) {
					await removeAllowlistEntry("username", value);
				}
				console.log(`Removed: ${value.toLowerCase()}`);
			} finally {
				storage.close();
			}
			return;
		}

		default:
			usage();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
