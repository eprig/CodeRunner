import { useCallback, useRef, useState } from "react";
import type { ImportServerMessage } from "@/lib/contracts";
import { importServerMessageSchema } from "@/lib/contracts";

export type ProjectSwapStatus =
	| "idle"
	| "connecting"
	| "running"
	| "done"
	| "error";

export interface ProjectSwapState {
	status: ProjectSwapStatus;
	stage: string;
	detail: string;
	logLines: string[];
	success: boolean | null;
	message: string;
}

/**
 * A "switch project" operation. Both the GitHub import (`/ws/import`, body
 * `{ url }`) and the lesson load (`/ws/lesson-load`, body `{ moduleId }`) speak
 * the exact same `importServerMessage` streaming protocol, so they share one
 * hook and one progress UI.
 */
export type ProjectSwapKind =
	| { kind: "import"; url: string }
	| { kind: "lesson"; moduleId: string };

interface UseProjectSwapReturn {
	state: ProjectSwapState;
	startSwap: (target: ProjectSwapKind) => void;
	reset: () => void;
}

const MAX_LOG_LINES = 200;

const INITIAL_STATE: ProjectSwapState = {
	status: "idle",
	stage: "",
	detail: "",
	logLines: [],
	success: null,
	message: "",
};

function endpointFor(target: ProjectSwapKind): {
	path: string;
	payload: string;
} {
	if (target.kind === "import") {
		return {
			path: "ws/import",
			payload: JSON.stringify({ url: target.url }),
		};
	}
	return {
		path: "ws/lesson-load",
		payload: JSON.stringify({ moduleId: target.moduleId }),
	};
}

export function useProjectSwap(
	workspaceSlug: string | null,
): UseProjectSwapReturn {
	const [state, setState] = useState<ProjectSwapState>(INITIAL_STATE);
	const socketRef = useRef<WebSocket | null>(null);

	const reset = useCallback(() => {
		const socket = socketRef.current;
		if (socket) {
			socketRef.current = null;
			socket.close();
		}
		setState(INITIAL_STATE);
	}, []);

	const startSwap = useCallback(
		(target: ProjectSwapKind) => {
			if (!workspaceSlug) return;

			// Close any existing socket before starting a new swap.
			if (socketRef.current) {
				socketRef.current.close();
				socketRef.current = null;
			}

			const { path, payload } = endpointFor(target);

			setState({
				...INITIAL_STATE,
				status: "connecting",
				stage: "connecting",
				detail: "Opening channel…",
			});

			const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
			const socket = new WebSocket(
				`${protocol}//${window.location.host}/u/${workspaceSlug}/${path}`,
			);
			socketRef.current = socket;

			socket.addEventListener("open", () => {
				setState((prev) => ({
					...prev,
					status: "running",
					stage: "starting",
					detail: "Sending request…",
				}));
				socket.send(payload);
			});

			socket.addEventListener("message", (event) => {
				try {
					const message: ImportServerMessage = importServerMessageSchema.parse(
						JSON.parse(String(event.data)),
					);

					setState((prev) => {
						switch (message.type) {
							case "hello":
								return { ...prev, status: "running" };
							case "progress":
								return {
									...prev,
									stage: message.stage,
									detail: message.detail ?? "",
								};
							case "log":
								return {
									...prev,
									logLines: [...prev.logLines, message.line].slice(
										-MAX_LOG_LINES,
									),
								};
							case "done":
								return {
									...prev,
									status: "done",
									success: message.success,
									message: message.message,
									stage: message.success ? "complete" : "failed",
									detail: message.message,
								};
							case "error":
								return {
									...prev,
									status: "error",
									success: false,
									message: message.message,
									stage: "error",
									detail: message.message,
								};
						}
					});
				} catch {
					// Ignore malformed messages.
				}
			});

			socket.addEventListener("close", () => {
				if (socketRef.current === socket) {
					socketRef.current = null;
				}
				setState((prev) => {
					if (prev.status === "running" || prev.status === "connecting") {
						return {
							...prev,
							status: "error",
							success: false,
							message: "Connection closed unexpectedly.",
							stage: "error",
							detail: "Connection closed unexpectedly.",
						};
					}
					return prev;
				});
			});

			socket.addEventListener("error", () => {
				// The close handler takes care of the state update.
			});
		},
		[workspaceSlug],
	);

	return { state, startSwap, reset };
}
