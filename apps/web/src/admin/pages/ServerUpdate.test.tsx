import type {
	ServerUpdateRefDetails,
	ServerUpdateStatusResponse,
} from "@frc-coderunner/contracts";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ServerUpdate } from "./ServerUpdate";

const status: ServerUpdateStatusResponse = {
	ok: true,
	demo: false,
	repo: {
		url: "https://github.com/eprig/CodeRunner",
		slug: "eprig/CodeRunner",
		commit: "abc123def456",
		version: "v2.4.0",
		image: "ghcr.io/eprig/coderunner-control:v2.4.0",
		imageNamespace: "ghcr.io/eprig",
		mode: "prebuilt",
		source: "container",
		hostDir: "/srv/coderunner",
		updatable: true,
		versionPinnedInEnv: false,
		commitInfo: {
			sha: "abc123def456",
			title: "Fix gamepad deadzone",
			author: "mathew",
			date: "2026-11-20T00:00:00.000Z",
			url: "https://github.com/eprig/CodeRunner/commit/abc123def456",
		},
	},
	refs: {
		tags: ["v2.5.0", "v2.4.0"],
		branches: ["main", "dev"],
		commits: {
			"tag:v2.5.0": "tagcommit0000000000000000000000000000001",
			"tag:v2.4.0": "abc123def456",
			"branch:dev": "branchcommit00000000000000000000000000001",
		},
		error: null,
	},
	job: {
		id: null,
		state: "idle",
		kind: null,
		ref: null,
		commit: null,
		startedAt: null,
		finishedAt: null,
		message: null,
		requestedBy: null,
		steps: [],
		log: [],
	},
	restartExpected: false,
	activity: { activeWorkspaces: 0, activeBuilds: 0 },
};

function details(
	kind: "tag" | "branch",
	ref: string,
	overrides: Partial<ServerUpdateRefDetails> = {},
): ServerUpdateRefDetails {
	return {
		ok: true,
		kind,
		ref,
		commit: {
			sha: `${ref}-sha0000`,
			title: `Head of ${ref}`,
			author: "octo",
			date: "2026-11-25T00:00:00.000Z",
			url: null,
		},
		release:
			kind === "tag"
				? {
						name: `CodeRunner ${ref}`,
						notes: "- Faster builds\n- New lessons",
						publishedAt: "2026-11-25T00:00:00.000Z",
						prerelease: false,
						url: `https://github.com/eprig/CodeRunner/releases/tag/${ref}`,
					}
				: null,
		compare: {
			status: "ahead",
			aheadBy: 2,
			behindBy: 0,
			commits: [
				{
					sha: "c2",
					title: "Add lesson picker",
					author: "octo",
					date: null,
					url: null,
				},
				{
					sha: "c1",
					title: "Speed up builds",
					author: "octo",
					date: null,
					url: null,
				},
			],
			url: "https://github.com/eprig/CodeRunner/compare/a...b",
		},
		error: null,
		...overrides,
	};
}

type Routes = {
	status?: () => Promise<unknown> | unknown;
	details?: (kind: "tag" | "branch", ref: string) => ServerUpdateRefDetails;
	post?: () => unknown;
};

function mockFetch(routes: Routes = {}) {
	const fn = vi.fn(
		(input: string | URL | Request, init?: RequestInit): Promise<unknown> => {
			const url = String(input);
			const ok = (body: unknown, code = 200) =>
				Promise.resolve({
					ok: code < 400,
					status: code,
					json: () => Promise.resolve(body),
				});
			if (init?.method === "POST")
				return ok(routes.post?.() ?? { ok: true }, 202);
			if (url.startsWith("/admin/server-update/ref")) {
				const params = new URL(url, "http://x").searchParams;
				const kind = params.get("kind") as "tag" | "branch";
				const ref = params.get("ref") ?? "";
				return ok((routes.details ?? details)(kind, ref));
			}
			return Promise.resolve(routes.status?.() ?? status).then((body) =>
				body instanceof Error ? Promise.reject(body) : ok(body),
			);
		},
	);
	vi.stubGlobal("fetch", fn);
	return fn;
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("ServerUpdate", () => {
	test("shows what is running and that a newer release exists", async () => {
		mockFetch();
		render(<ServerUpdate />);

		expect(
			await screen.findByTestId("update-running-version"),
		).toHaveTextContent("v2.4.0");
		expect(screen.getByText("Release")).toBeInTheDocument();
		expect(screen.getByTestId("update-available")).toHaveTextContent(
			"Update available: v2.5.0",
		);
		expect(screen.getByTestId("update-current-commit")).toHaveTextContent(
			"Fix gamepad deadzone",
		);
		expect(screen.getByTestId("update-current-commit")).toHaveTextContent(
			"abc123d",
		);
		expect(screen.getByTestId("update-activity")).toHaveTextContent(
			"won't interrupt anyone",
		);
		// Registry internals are not end-user information.
		expect(screen.queryByText(/ghcr\.io/u)).toBeNull();
	});

	test("explains what the selected release changes", async () => {
		mockFetch();
		render(<ServerUpdate />);

		const panel = await screen.findByTestId("update-ref-details");
		expect(within(panel).getByTestId("update-compare")).toHaveTextContent(
			"2 commits newer than what's running",
		);
		expect(within(panel).getByText("CodeRunner v2.5.0")).toBeInTheDocument();
		expect(within(panel).getByTestId("update-release-notes")).toHaveTextContent(
			"Faster builds",
		);
		expect(within(panel).getByTestId("update-new-commits")).toHaveTextContent(
			"Add lesson picker",
		);
		expect(
			within(panel).getByTestId("update-selected-commit"),
		).toHaveTextContent("Head of v2.5.0");
		expect(screen.getByTestId("update-plan")).toHaveTextContent(
			"pulls its prebuilt images",
		);
	});

	test("searches one list of releases and branches and posts the choice", async () => {
		const user = userEvent.setup();
		const fetchMock = mockFetch();
		vi.spyOn(window, "confirm").mockReturnValue(true);
		render(<ServerUpdate />);

		await waitFor(() =>
			expect(screen.getByTestId("update-ref-picker")).toHaveTextContent(
				"v2.5.0",
			),
		);
		await user.click(screen.getByTestId("update-ref-picker"));
		expect(
			screen.getByRole("group", { name: /Releases/u }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("group", { name: /Branches/u }),
		).toBeInTheDocument();
		expect(screen.getByRole("option", { name: /v2\.4\.0/u })).toHaveTextContent(
			"Current",
		);
		expect(screen.getByRole("option", { name: /v2\.5\.0/u })).toHaveTextContent(
			"Latest",
		);
		await user.type(screen.getByTestId("update-ref-search"), "de");
		expect(screen.queryByRole("group", { name: /Releases/u })).toBeNull();
		expect(screen.getAllByRole("option")).toHaveLength(1);
		await user.keyboard("{Enter}");
		expect(screen.queryByRole("listbox")).toBeNull();
		expect(screen.getByTestId("update-ref-picker")).toHaveTextContent("dev");
		expect(screen.getByTestId("update-plan")).toHaveTextContent(
			"builds both images on this server",
		);

		await user.click(screen.getByTestId("update-submit"));
		await waitFor(() => {
			const post = fetchMock.mock.calls.find(
				(call) => (call[1] as RequestInit | undefined)?.method === "POST",
			);
			expect(JSON.parse(String(post?.[1]?.body))).toEqual({
				kind: "branch",
				ref: "dev",
			});
		});
		expect(window.confirm).toHaveBeenCalledWith(
			expect.stringContaining("branch dev"),
		);
	});

	test("warns about a downgrade and about active students", async () => {
		const user = userEvent.setup();
		mockFetch({
			status: () => ({
				...status,
				activity: { activeWorkspaces: 3, activeBuilds: 1 },
			}),
			details: (kind, ref) =>
				details(kind, ref, {
					compare: {
						status: "behind",
						aheadBy: 0,
						behindBy: 4,
						commits: [],
						url: "https://github.com/eprig/CodeRunner/compare/x...y",
					},
				}),
		});
		const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
		render(<ServerUpdate />);

		expect(await screen.findByTestId("update-compare")).toHaveTextContent(
			"downgrade that removes 4 commits",
		);
		expect(screen.getByTestId("update-activity")).toHaveTextContent(
			"3 students are active and 1 build is running",
		);
		await user.click(screen.getByTestId("update-submit"));
		expect(confirm).toHaveBeenCalledWith(
			expect.stringMatching(/downgrade.*3 active students/u),
		);
	});

	test("labels a branch build and a legacy .env pin", async () => {
		mockFetch({
			status: () => ({
				...status,
				repo: {
					...status.repo,
					version: "branch-dev",
					mode: "source",
					versionPinnedInEnv: true,
				},
			}),
		});
		render(<ServerUpdate />);
		expect(
			await screen.findByTestId("update-running-version"),
		).toHaveTextContent("dev");
		expect(screen.getByText("Branch build")).toBeInTheDocument();
		expect(screen.queryByTestId("update-available")).toBeNull();
		expect(screen.getByTestId("update-legacy")).toHaveTextContent(
			"CODERUNNER_TAG",
		);
	});

	test("keeps updates read-only when no host checkout is detected", async () => {
		mockFetch({
			status: () => ({
				...status,
				repo: { ...status.repo, hostDir: null, updatable: false },
			}),
		});
		render(<ServerUpdate />);
		expect(await screen.findByTestId("update-submit")).toBeDisabled();
		expect(screen.getByTestId("update-ref-picker")).toBeDisabled();
		expect(
			screen.getByText(/Updates need the server's git checkout/u),
		).toBeInTheDocument();
	});

	test("shows a read-only mock in demo mode", async () => {
		mockFetch({
			status: () => ({
				...status,
				demo: true,
				repo: {
					...status.repo,
					source: "local" as const,
					updatable: false,
				},
			}),
		});
		render(<ServerUpdate />);
		expect(
			await screen.findByText(/Demo mode is showing sample values/u),
		).toBeInTheDocument();
		expect(screen.getByTestId("update-submit")).toBeDisabled();
		expect(screen.queryByTestId("update-check")).toBeNull();
	});

	test("explains that a from-source dev run is read-only", async () => {
		mockFetch({
			status: () => ({
				...status,
				repo: {
					...status.repo,
					source: "local" as const,
					hostDir: "/work/CodeRunner",
					updatable: false,
				},
			}),
		});
		render(<ServerUpdate />);
		expect(await screen.findByText(/Running from source/u)).toBeInTheDocument();
		expect(screen.getByTestId("update-submit")).toBeDisabled();
	});

	test("shows progress, who started it, and the command log while running", async () => {
		mockFetch({
			status: () => ({
				...status,
				restartExpected: true,
				job: {
					...status.job,
					id: "job1",
					state: "running",
					kind: "tag",
					ref: "v2.5.0",
					commit: "abc123def4567890",
					requestedBy: "admin@example.com",
					startedAt: new Date(Date.now() - 65_000).toISOString(),
					message: "#9 [stage-1 6/9] RUN bun install 34.8s",
					log: [
						{
							at: "2026-11-27T04:00:00.000Z",
							kind: "command",
							text: "$ git fetch --prune --tags --force origin",
						},
					],
				},
			}),
		});
		render(<ServerUpdate />);

		const active = await screen.findByTestId("update-active-status");
		expect(active).toHaveTextContent("Updating to release v2.5.0");
		expect(active).toHaveTextContent("abc123def456");
		expect(active).toHaveTextContent(/1m/u);
		expect(active).toHaveTextContent("started by admin@example.com");
		expect(active.querySelector("svg")).toHaveClass("animate-spin");
		expect(screen.getByTestId("update-submit")).toBeDisabled();
		expect(screen.getByTestId("update-command-log")).toHaveTextContent(
			"$ git fetch --prune --tags --force origin",
		);
	});

	test("keeps the page and says it is reconnecting when a poll fails mid-update", async () => {
		const running = {
			...status,
			job: {
				...status.job,
				id: "job1",
				state: "running" as const,
				kind: "tag" as const,
				ref: "v2.5.0",
				startedAt: new Date().toISOString(),
			},
		};
		let calls = 0;
		mockFetch({
			status: () => {
				calls += 1;
				return calls > 1 ? new Error("Failed to fetch") : running;
			},
		});
		vi.useFakeTimers({ shouldAdvanceTime: true });
		try {
			render(<ServerUpdate />);
			await screen.findByTestId("update-active-status");
			await vi.advanceTimersByTimeAsync(3500);
			expect(await screen.findByTestId("update-poll-error")).toHaveTextContent(
				"Reconnecting",
			);
			expect(screen.getByTestId("update-active-status")).toBeInTheDocument();
		} finally {
			vi.useRealTimers();
		}
	});

	test("reports the last update's result, who ran it, and how long it took", async () => {
		mockFetch({
			status: () => ({
				...status,
				job: {
					...status.job,
					id: "job1",
					state: "failed" as const,
					kind: "branch" as const,
					ref: "dev",
					requestedBy: "admin@example.com",
					startedAt: "2026-11-26T12:00:00.000Z",
					finishedAt: "2026-11-26T12:01:32.000Z",
					message:
						"The new control container did not become healthy. Rolled back to v2.4.0.",
				},
			}),
		});
		render(<ServerUpdate />);
		expect(await screen.findByTestId("update-failed")).toHaveTextContent(
			"Last update to branch dev failed: The new control container did not become healthy. Rolled back to v2.4.0.",
		);
		expect(screen.getByTestId("update-last")).toHaveTextContent(
			/Failed: dev by admin@example\.com, .* \(took 1m 32s\)/u,
		);
	});
});
