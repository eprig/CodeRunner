#!/usr/bin/env bun
/**
 * Manage the username/email/domain allowlist.
 *
 * Usage:
 *   bun scripts/allowlist.ts list
 *   bun scripts/allowlist.ts add <email-or-domain>
 *   bun scripts/allowlist.ts add <username|email|domain> <value>
 *   bun scripts/allowlist.ts remove <email-or-domain>
 *   bun scripts/allowlist.ts remove <username|email|domain> <value>
 *
 * Examples:
 *   bun scripts/allowlist.ts add coach@frcteam.org
 *   bun scripts/allowlist.ts add frcteam.org
 *   bun scripts/allowlist.ts add username alice
 *   bun scripts/allowlist.ts add username alice.smith
 *   bun scripts/allowlist.ts remove old-member@frcteam.org
 *   bun scripts/allowlist.ts list
 */

import { resolve } from "node:path";
import {
	type AllowlistData,
	addAllowlistEntry,
	loadAllowlist,
	removeAllowlistEntry,
	setAllowlistPath,
} from "../apps/control/src/auth/allowlist";

const dataDir = Bun.env.FRC_DATA_DIR ?? "data";
setAllowlistPath(dataDir);

const [command, firstArg, secondArg] = process.argv.slice(2);

type AllowlistKind = "username" | "email" | "domain";

const KINDS: AllowlistKind[] = ["username", "email", "domain"];

function isAllowlistKind(value: string | undefined): value is AllowlistKind {
	return value !== undefined && KINDS.includes(value as AllowlistKind);
}

/**
 * Preserve the historical one-argument form: an address is an email, and a
 * value containing a dot is a domain. A value with no dot and no `@` is a
 * username. Dotted usernames need the explicit `add username <value>` form.
 */
function resolveTarget(): { kind: AllowlistKind; value: string } {
	if (isAllowlistKind(firstArg) && secondArg) {
		return { kind: firstArg, value: secondArg };
	}
	const value = firstArg ?? "";
	if (value.includes("@")) return { kind: "email", value };
	if (value.includes(".")) return { kind: "domain", value };
	return { kind: "username", value };
}

function summary(data: AllowlistData): string {
	return `${data.usernames.length} username(s), ${data.emails.length} email(s), and ${data.domains.length} domain(s)`;
}

async function main(): Promise<void> {
	await loadAllowlist();

	switch (command) {
		case "list": {
			const data = await loadAllowlist();
			if (
				data.usernames.length === 0 &&
				data.emails.length === 0 &&
				data.domains.length === 0
			) {
				console.log(
					"Allowlist is empty — sign-in is blocked until a username, email, or domain is added.",
				);
				return;
			}
			if (data.usernames.length > 0) {
				console.log("Usernames:");
				for (const u of data.usernames) console.log(`  ${u}`);
			}
			if (data.emails.length > 0) {
				console.log("Emails:");
				for (const e of data.emails) console.log(`  ${e}`);
			}
			if (data.domains.length > 0) {
				console.log("Domains:");
				for (const d of data.domains) console.log(`  ${d}`);
			}
			return;
		}

		case "add": {
			const { kind, value } = resolveTarget();
			if (!value) {
				console.error(
					"Usage: bun scripts/allowlist.ts add <email-or-domain>\n" +
						"       bun scripts/allowlist.ts add <username|email|domain> <value>",
				);
				process.exit(1);
			}
			const result = await addAllowlistEntry(kind, value);
			console.log(`Added ${kind}: ${value.toLowerCase()}`);
			console.log(`Allowlist now has ${summary(result)}.`);
			console.log(`File: ${resolve(dataDir, "allowlist.json")}`);
			return;
		}

		case "remove": {
			const { kind, value } = resolveTarget();
			if (!value) {
				console.error(
					"Usage: bun scripts/allowlist.ts remove <email-or-domain>\n" +
						"       bun scripts/allowlist.ts remove <username|email|domain> <value>",
				);
				process.exit(1);
			}
			const result = await removeAllowlistEntry(kind, value);
			console.log(`Removed ${kind}: ${value.toLowerCase()}`);
			console.log(`Allowlist now has ${summary(result)}.`);
			return;
		}

		default:
			console.error(
				"Usage: bun scripts/allowlist.ts <list|add|remove> [username|email|domain] [value]",
			);
			process.exit(1);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
