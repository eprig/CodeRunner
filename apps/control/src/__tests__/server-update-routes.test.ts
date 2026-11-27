import { describe, expect, test } from "bun:test";
import type { DockerCommandResult, DockerRunner } from "../containers/types";
import { clearRefsCache } from "../server-update";
import { cookieFrom, login, withApp } from "./helpers";

const ok = (stdout = ""): DockerCommandResult => ({
	stdout,
	stderr: "",
	exitCode: 0,
});

function githubFetch(input: string | URL | Request): Promise<Response> {
	const url = String(input);
	return Promise.resolve(
		Response.json(
			url.includes("/tags?")
				? [{ name: "v2.5.0" }, { name: "v2.4.0" }]
				: [{ name: "main" }, { name: "dev" }],
		),
	);
}

function fakeControlDocker(): DockerRunner {
	return async (args) => {
		if (args[0] === "image" && args[1] === "inspect") return ok("sha256:abc");
		if (args[0] === "container" && args[1] === "inspect") {
			return ok(
				JSON.stringify([
					{
						Name: "/coderunner-control",
						Config: {
							Image: "ghcr.io/eprig/coderunner-control:v2.4.0",
							Labels: {
								"org.opencontainers.image.source":
									"https://github.com/eprig/CodeRunner",
								"org.opencontainers.image.revision": "abc123",
								"org.opencontainers.image.version": "v2.4.0",
							},
						},
					},
				]),
			);
		}
		return ok();
	};
}

describe("admin server-update routes", () => {
	test("requires an admin session", async () => {
		clearRefsCache();
		await withApp(
			async (app) => {
				const response = await app.fetch(
					new Request("http://localhost/admin/server-update"),
				);
				expect(response.status).toBe(401);

				const student = await login(app, "alice");
				const denied = await app.fetch(
					new Request("http://localhost/admin/server-update", {
						headers: { cookie: cookieFrom(student) },
					}),
				);
				expect(denied.status).toBe(403);
			},
			{
				dockerRunner: fakeControlDocker(),
				serverUpdateFetch: githubFetch,
				hostRepoDir: "/srv/coderunner",
			},
		);
	});

	test("serves repo details to an admin and records an accepted update", async () => {
		clearRefsCache();
		await withApp(
			async (app) => {
				const admin = await login(app, "alice", { role: "admin" });
				const cookie = cookieFrom(admin);

				const statusResponse = await app.fetch(
					new Request("http://localhost/admin/server-update", {
						headers: { cookie },
					}),
				);
				expect(statusResponse.status).toBe(200);
				const status = (await statusResponse.json()) as {
					repo: { slug: string | null; commit: string | null };
					refs: { tags: string[]; branches: string[] };
				};
				expect(status.repo.slug).toBe("eprig/CodeRunner");
				expect(status.repo.commit).toBe("abc123");
				expect(status.refs.tags).toContain("v2.5.0");

				const startResponse = await app.fetch(
					new Request("http://localhost/admin/server-update", {
						method: "POST",
						headers: { cookie, "content-type": "application/json" },
						body: JSON.stringify({ kind: "tag", ref: "v2.5.0" }),
					}),
				);
				expect(startResponse.status).toBe(202);
				const accepted = (await startResponse.json()) as {
					ok: boolean;
					ref: string;
					image: string;
				};
				expect(accepted).toMatchObject({
					ok: true,
					ref: "v2.5.0",
					image: "ghcr.io/eprig/coderunner-control:v2.5.0",
				});

				const audit = await app.fetch(
					new Request("http://localhost/admin/audit-log?action=server.update", {
						headers: { cookie },
					}),
				);
				const { entries } = (await audit.json()) as {
					entries: Array<{ action: string; metadata_json: string }>;
				};
				expect(entries.length).toBe(1);
				expect(entries[0]?.action).toBe("server.update");
				expect(entries[0]?.metadata_json).toContain("v2.5.0");
			},
			{
				dockerRunner: fakeControlDocker(),
				serverUpdateFetch: githubFetch,
				hostRepoDir: "/srv/coderunner",
			},
		);
	});
});
