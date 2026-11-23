import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Default RAF/CAF — jsdom omits these. Tests that need finer control should
// override via vi.spyOn(window, "requestAnimationFrame").
if (typeof globalThis.requestAnimationFrame !== "function") {
	globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number =>
		setTimeout(() => cb(performance.now()), 16) as unknown as number;
	globalThis.cancelAnimationFrame = (id: number): void =>
		clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
}

// Node 26 exposes a global `localStorage` getter that resolves to undefined
// outside a --localstorage-file process, which breaks Zustand's persist
// middleware even though jsdom supplies its own Storage implementation.
function installStorage(name: "localStorage" | "sessionStorage"): void {
	if (typeof globalThis[name] !== "undefined") return;
	const values = new Map<string, string>();
	const storage: Storage = {
		get length() {
			return values.size;
		},
		clear: () => values.clear(),
		getItem: (key) => values.get(key) ?? null,
		key: (index) => [...values.keys()][index] ?? null,
		removeItem: (key) => values.delete(key),
		setItem: (key, value) => values.set(key, String(value)),
	};
	Object.defineProperty(globalThis, name, {
		configurable: true,
		value: storage,
	});
}

installStorage("localStorage");
installStorage("sessionStorage");

afterEach(() => {
	cleanup();
});
