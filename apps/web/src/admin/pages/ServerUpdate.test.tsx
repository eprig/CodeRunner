import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ServerUpdate } from "./ServerUpdate";

const status = {
	ok: true as const,
	demo: false,
	repo: {
		url: "https://github.com/eprig/CodeRunner",
		slug: "eprig/CodeRunner",
		commit: "abc123def456",
		version: "v2.4.0",
		image: "ghcr.io/eprig/coderunner-control:v2.4.0",
		imageNamespace: "ghcr.io/eprig",
		mode: "prebuilt" as const,
		source: "container" as const,
		hostDir: "/srv/coderunner",
		updatable: true,
	},
	refs: {
		tags: ["v2.5.0", "v2.4.0"],
		branches: ["main", "dev"],
		error: null,
	},
	job: {
		id: null,
		state: "idle" as const,
		kind: null,
		ref: null,
		startedAt: null,
		finishedAt: null,
		message: null,
		steps: [],
	},
	restartExpected: false,
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe("ServerUpdate", () => {
	test("shows the running commit and posts the selected branch", async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn(
			(_input: string | URL | Request, init?: RequestInit) => {
				if (init?.method === "POST") {
					return Promise.resolve({
						ok: true,
						status: 202,
						json: () => Promise.resolve({ ok: true }),
					});
				}
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () => Promise.resolve(status),
				});
			},
		);
		vi.stubGlobal("fetch", fetchMock);
		vi.spyOn(window, "confirm").mockReturnValue(true);

		render(<ServerUpdate />);

		expect(
			await screen.findByTestId("update-current-commit"),
		).toHaveTextContent("abc123def456");
		expect(
			screen.getByText(/Tags pull the prebuilt images from/),
		).toHaveTextContent("ghcr.io/eprig");
		expect(screen.queryByText("Image")).toBeNull();
		expect(screen.queryByTestId("update-active-status")).toBeNull();

		const branch = screen.getByTestId(
			"update-branch-select",
		) as HTMLSelectElement;
		await user.selectOptions(branch, "dev");
		await user.click(screen.getByTestId("update-submit"));

		await waitFor(() => {
			const post = fetchMock.mock.calls.find(
				(call) => (call[1] as RequestInit | undefined)?.method === "POST",
			);
			expect(post).toBeTruthy();
			expect(post?.[0]).toBe("/admin/server-update");
			expect(JSON.parse(String(post?.[1]?.body))).toEqual({
				kind: "branch",
				ref: "dev",
			});
		});
		expect(window.confirm).toHaveBeenCalledWith(
			expect.stringContaining("branch dev"),
		);
	});

	test("keeps updates read-only when no host checkout is detected", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() =>
				Promise.resolve({
					ok: true,
					status: 200,
					json: () =>
						Promise.resolve({
							...status,
							repo: { ...status.repo, hostDir: null, updatable: false },
						}),
				}),
			),
		);

		render(<ServerUpdate />);

		expect(await screen.findByTestId("update-submit")).toBeDisabled();
		expect(screen.getByTestId("update-tag-select")).toBeDisabled();
		expect(screen.getByTestId("update-branch-select")).toBeDisabled();
		expect(
			screen.getByText(/Updates need a host checkout/),
		).toBeInTheDocument();
	});

	test("shows a read-only mock in demo mode", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() =>
				Promise.resolve({
					ok: true,
					status: 200,
					json: () =>
						Promise.resolve({
							...status,
							demo: true,
							repo: {
								...status.repo,
								commit: "demo0000",
								source: "local" as const,
								hostDir: "/demo/coderunner",
								updatable: false,
							},
							refs: { tags: ["v2.5.0"], branches: ["main"], error: null },
						}),
				}),
			),
		);

		render(<ServerUpdate />);

		expect(
			await screen.findByTestId("update-current-commit"),
		).toHaveTextContent("demo0000");
		expect(
			screen.getByText(/Demo mode is showing sample values/),
		).toBeInTheDocument();
		expect(screen.getByTestId("update-submit")).toBeDisabled();
		expect(screen.getByTestId("update-tag-select")).toBeDisabled();
		expect(screen.queryByText(/Updates need a host checkout/)).toBeNull();
	});

	test("explains that a from-source dev run is read-only", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() =>
				Promise.resolve({
					ok: true,
					status: 200,
					json: () =>
						Promise.resolve({
							...status,
							repo: {
								...status.repo,
								source: "local" as const,
								hostDir: "/work/CodeRunner",
								updatable: false,
							},
						}),
				}),
			),
		);

		render(<ServerUpdate />);

		expect(await screen.findByText(/Running from source/)).toBeInTheDocument();
		expect(screen.getByTestId("update-submit")).toBeDisabled();
		expect(screen.queryByText(/Updates need a host checkout/)).toBeNull();
	});

	test("shows a spinner and status only while an update is running", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() =>
				Promise.resolve({
					ok: true,
					status: 200,
					json: () =>
						Promise.resolve({
							...status,
							job: {
								...status.job,
								state: "running",
								kind: "tag" as const,
								ref: "v2.5.0",
								message: "Pulling prebuilt images",
								steps: [
									{ label: "Prepare checkout", state: "done" },
									{ label: "Build or pull images", state: "running" },
								],
							},
						}),
				}),
			),
		);

		render(<ServerUpdate />);

		const active = await screen.findByTestId("update-active-status");
		expect(active).toHaveTextContent("Updating to release v2.5.0");
		expect(active).toHaveTextContent("Pulling prebuilt images");
		expect(active.querySelector("svg")).toHaveClass("animate-spin");
		expect(screen.queryByText("Last update")).toBeNull();
		expect(screen.queryByTestId("update-steps")).toBeNull();
		expect(screen.getByTestId("update-submit")).toBeDisabled();
	});
});
