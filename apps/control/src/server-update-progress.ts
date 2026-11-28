/** Helpers for turning Docker build output into short admin-UI progress lines. */

// Built from a char code so the source stays free of literal control bytes.
const ESC = String.fromCharCode(27);
const ANSI_ESCAPE = new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, "gu");

/** Docker BuildKit colors its plain output even when stderr is not a TTY. */
export function stripAnsi(value: string): string {
	return value.replace(ANSI_ESCAPE, "").trim();
}

/**
 * Pick out the lines a CLI user watches during a build: classic `Step n/m`
 * headers and BuildKit's `[stage n/m]` / `DONE <duration>` lines. Ordinary
 * command output is ignored so the admin status stays readable.
 */
export function parseBuildProgressLine(raw: string): string | null {
	const line = stripAnsi(raw);
	if (!line || line.length > 2000) return null;

	const classic = /^Step \d+\/\d+ : .+$/u.exec(line);
	if (classic) return classic[0].slice(0, 400);

	const buildkit = /^#\d+\s+(?<body>\[[^\]]+\].*|DONE\s+[\d.]+s.*)$/u.exec(
		line,
	);
	const body = buildkit?.groups?.body;
	return body ? body.slice(0, 400) : null;
}

/**
 * Stateful variant for a whole build: BuildKit prints a step's header
 * (`#12 [ascope-build 9/9] RUN …`) and later `#12 CACHED` on its own line, so
 * remember headers by id and report a cache hit as `<header> (cached)`. That
 * is what tells an admin the slow AdvantageScope compile was skipped.
 */
export function createBuildProgressTracker(): (raw: string) => string | null {
	const headers = new Map<string, string>();
	return (raw) => {
		const line = stripAnsi(raw);
		const header = /^#(\d+)\s+(\[[^\]]+\].*)$/u.exec(line);
		if (header?.[1] && header[2]) {
			headers.set(header[1], header[2].slice(0, 400));
		}
		const cached = /^#(\d+)\s+CACHED$/u.exec(line);
		if (cached?.[1]) {
			const known = headers.get(cached[1]);
			return known ? `${known} (cached)` : null;
		}
		return parseBuildProgressLine(raw);
	};
}
