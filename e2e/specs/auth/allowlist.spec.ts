/**
 * Domain rules are still file-backed; individual people now live in Better
 * Auth's `user` table. These specs cover the legacy file helpers that remain
 * for domain management and one-time config imports.
 */

import {
	addAllowlistEntry,
	isEmailAllowed,
	saveAllowlist,
} from "../../../apps/control/src/auth/allowlist";
import { expect, test } from "../../fixtures/app";

test("isEmailAllowed rejects non-roster emails when allowlist is configured", async ({
	app,
}) => {
	void app; // app fixture triggers setAllowlistPath via createApp
	await saveAllowlist({
		usernames: [],
		emails: ["alice@allowed.test"],
		domains: [],
	});
	expect(isEmailAllowed("alice@allowed.test")).toBe(true);
	expect(isEmailAllowed("evil@blocked.test")).toBe(false);
});

test("removing email from allowlist marks it not-allowed", async ({ app }) => {
	void app;
	await saveAllowlist({
		usernames: [],
		emails: ["alice@allowed.test"],
		domains: [],
	});
	expect(isEmailAllowed("alice@allowed.test")).toBe(true);
	await saveAllowlist({ usernames: [], emails: [], domains: [] });
	expect(isEmailAllowed("alice@allowed.test")).toBe(false);
});

test("domain allowlist matches @-suffix and ignores case", async ({ app }) => {
	void app;
	await saveAllowlist({ usernames: [], emails: [], domains: ["allowed.test"] });
	expect(isEmailAllowed("anyone@allowed.test")).toBe(true);
	expect(isEmailAllowed("ANYONE@ALLOWED.TEST")).toBe(true);
	expect(isEmailAllowed("anyone@blocked.test")).toBe(false);
});

test("addAllowlistEntry persists and is reflected by isEmailAllowed", async ({
	app,
}) => {
	void app;
	await saveAllowlist({ usernames: [], emails: [], domains: [] });
	await addAllowlistEntry("email", "newkid@allowed.test");
	expect(isEmailAllowed("newkid@allowed.test")).toBe(true);
});
