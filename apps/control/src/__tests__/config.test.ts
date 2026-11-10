import { describe, expect, test } from "bun:test";
import { loadControlConfig } from "../config";

describe("parseBoolean (via loadControlConfig)", () => {
	test("username/password auth accepts only true or false", () => {
		expect(
			loadControlConfig({ usernamePasswordAuth: "true" }).usernamePasswordAuth,
		).toBe(true);
		expect(
			loadControlConfig({ usernamePasswordAuth: "false" }).usernamePasswordAuth,
		).toBe(false);
		expect(() => loadControlConfig({ usernamePasswordAuth: "1" })).toThrow(
			/Expected true or false/,
		);
	});

	test("empty string falls back to the default for demo (false)", () => {
		expect(loadControlConfig({ demo: "" }).demo).toBe(false);
	});

	test("whitespace-only string falls back to the default for demo (false)", () => {
		expect(loadControlConfig({ demo: "  " }).demo).toBe(false);
	});

	test("empty string falls back to the default for containerAutoStart (true)", () => {
		expect(
			loadControlConfig({ containerAutoStart: "" }).containerAutoStart,
		).toBe(true);
	});

	test("whitespace-only string falls back to the default for containerAutoStart (true)", () => {
		expect(
			loadControlConfig({ containerAutoStart: "  " }).containerAutoStart,
		).toBe(true);
	});

	test('"0" and "false" still parse as false, overriding a true fallback', () => {
		expect(
			loadControlConfig({ containerAutoStart: "0" }).containerAutoStart,
		).toBe(false);
		expect(
			loadControlConfig({ containerAutoStart: "false" }).containerAutoStart,
		).toBe(false);
	});

	test('"1" still parses as true, overriding a false fallback', () => {
		expect(loadControlConfig({ demo: "1" }).demo).toBe(true);
	});
});

describe("containerNetwork (via loadControlConfig)", () => {
	test("empty string is treated as unset (port mode), not a network name", () => {
		expect(loadControlConfig({ containerNetwork: "" }).containerNetwork).toBe(
			null,
		);
	});

	test("whitespace-only string is treated as unset", () => {
		expect(loadControlConfig({ containerNetwork: "  " }).containerNetwork).toBe(
			null,
		);
	});

	test("a real network name is trimmed and kept", () => {
		expect(
			loadControlConfig({ containerNetwork: " coderunner " }).containerNetwork,
		).toBe("coderunner");
	});
});

describe("adminEmails (via loadControlConfig)", () => {
	test("unset input falls back to an empty list", () => {
		expect(loadControlConfig({}).adminEmails).toEqual([]);
	});

	test("a single email is parsed into a one-entry list", () => {
		expect(
			loadControlConfig({ adminEmails: "coach@team.org" }).adminEmails,
		).toEqual(["coach@team.org"]);
	});

	test("a comma list is split, trimmed, and lowercased", () => {
		expect(
			loadControlConfig({
				adminEmails: " Coach@Team.org , Assistant@Team.org ",
			}).adminEmails,
		).toEqual(["coach@team.org", "assistant@team.org"]);
	});

	test("empty entries are dropped", () => {
		expect(
			loadControlConfig({ adminEmails: "coach@team.org,, ,\t" }).adminEmails,
		).toEqual(["coach@team.org"]);
	});

	test("an empty string yields an empty list", () => {
		expect(loadControlConfig({ adminEmails: "" }).adminEmails).toEqual([]);
	});

	test("a string[] input is normalized the same way", () => {
		expect(
			loadControlConfig({
				adminEmails: ["Coach@Team.org", " ", "assistant@team.org"],
			}).adminEmails,
		).toEqual(["coach@team.org", "assistant@team.org"]);
	});
});

describe("codeDiskReadLimit (via loadControlConfig)", () => {
	test("defaults to 64mb", () => {
		expect(loadControlConfig({}).codeDiskReadLimit).toBe("64mb");
	});

	test("accepts a Docker byte rate and normalizes case", () => {
		expect(
			loadControlConfig({ codeDiskReadLimit: "100MB" }).codeDiskReadLimit,
		).toBe("100mb");
	});

	test('"0" and "off" disable the limit', () => {
		expect(
			loadControlConfig({ codeDiskReadLimit: "0" }).codeDiskReadLimit,
		).toBe(null);
		expect(
			loadControlConfig({ codeDiskReadLimit: "off" }).codeDiskReadLimit,
		).toBe(null);
	});

	test("empty string means unset and falls back to the default", () => {
		expect(loadControlConfig({ codeDiskReadLimit: "" }).codeDiskReadLimit).toBe(
			"64mb",
		);
	});

	test("explicit null disables the limit", () => {
		expect(
			loadControlConfig({ codeDiskReadLimit: null }).codeDiskReadLimit,
		).toBe(null);
	});

	test("rejects values Docker would not accept", () => {
		expect(() => loadControlConfig({ codeDiskReadLimit: "fast" })).toThrow(
			/CODE_DISK_READ_LIMIT/,
		);
		expect(() => loadControlConfig({ codeDiskReadLimit: "64 mb" })).toThrow(
			/CODE_DISK_READ_LIMIT/,
		);
	});
});
