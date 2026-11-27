import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// Vitest runs from apps/web (see `test:web`). Read the config as text because
// importing it would pull Vite's esbuild into the jsdom test environment.
const viteConfig = readFileSync("vite.config.ts", "utf8");

describe("dev server proxy", () => {
	test("forwards the admin update API instead of falling through to the SPA", () => {
		expect(viteConfig).toContain("|server-update)");
		expect(viteConfig).not.toContain('"/admin": proxyOpts');
	});
});
