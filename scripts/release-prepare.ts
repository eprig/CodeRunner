#!/usr/bin/env bun
/**
 * Pin a release version into docker-compose.yml (decision 052).
 *
 *   bun run release:prepare v2.6.0
 *
 * Rewrites every `${CODERUNNER_TAG:-…}` default in docker-compose.yml to the
 * given tag. Commit the result, then tag that commit: checking out the tag
 * (by hand, or from Admin → Update) then deploys exactly that release with a
 * plain `docker compose pull && docker compose up -d`, with no version in
 * .env. release.yml refuses to publish a tag whose compose file pins anything
 * else.
 */

import { readFile, writeFile } from "node:fs/promises";

const RELEASE_TAG =
	/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/u;
const DEFAULT = /\$\{CODERUNNER_TAG:-[^}]*\}/gu;
const composePath = new URL("../docker-compose.yml", import.meta.url).pathname;

const tag = Bun.argv[2];
if (!tag || !RELEASE_TAG.test(tag)) {
	console.error("Usage: bun run release:prepare vMAJOR.MINOR.PATCH[-pre]");
	process.exit(2);
}

const before = await readFile(composePath, "utf8");
const count = before.match(DEFAULT)?.length ?? 0;
if (count === 0) {
	console.error(`No \${CODERUNNER_TAG:-…} defaults found in ${composePath}`);
	process.exit(1);
}
const after = before.replace(DEFAULT, `\${CODERUNNER_TAG:-${tag}}`);
await writeFile(composePath, after, "utf8");
console.log(
	`Pinned ${count} image reference(s) in docker-compose.yml to ${tag}.`,
);
console.log(
	`Next: git commit -am "release ${tag}" && git tag ${tag} && git push --follow-tags`,
);
