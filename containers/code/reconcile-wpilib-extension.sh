#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${1:-/workspace/project}"
EXTENSIONS_DIR="${2:-${HOME}/extensions}"
PREFERENCES_FILE="${PROJECT_DIR}/.wpilib/wpilib_preferences.json"
EXTENSION_ID="wpilibsuite.vscode-wpilib"
RELEASES_URL="https://api.github.com/repos/wpilibsuite/vscode-wpilib/releases?per_page=100"

if [[ ! -f "${PREFERENCES_FILE}" ]]; then
	echo "No WPILib preferences found; keeping the baked WPILib extension." >&2
	exit 0
fi

project_preference="$(jq -r '.projectYear // empty' "${PREFERENCES_FILE}")"
project_year="$(printf '%s' "${project_preference}" | grep -oE '^[0-9]{4}' || true)"
if [[ ! "${project_year}" =~ ^[0-9]{4}$ ]]; then
	echo "Invalid WPILib projectYear in ${PREFERENCES_FILE}; expected YYYY or YYYY_..." >&2
	exit 1
fi

requested_release=""
if [[ "${project_preference}" =~ ^[0-9]{4}_(alpha|beta)([0-9]+)$ ]]; then
	requested_release="${project_year}.0.0-${BASH_REMATCH[1]}-${BASH_REMATCH[2]}"
fi

installed_version="$(
	find "${EXTENSIONS_DIR}" -mindepth 1 -maxdepth 1 -type d \
		-name "${EXTENSION_ID}-*" -print -quit \
		| sed -n "s#^.*/${EXTENSION_ID}-##p"
)"
if [[ -n "${requested_release}" && "${installed_version}" == "${requested_release}" ]] ||
	[[ -z "${requested_release}" && "${installed_version}" == "${project_year}."* ]]; then
	echo "WPILib extension ${installed_version} matches project preference ${project_preference}."
	exit 0
fi

if [[ -n "${requested_release}" ]]; then
	release_version="${requested_release}"
else
	release_version="$(
		wget -qO- "${RELEASES_URL}" \
			| jq -r --arg year "${project_year}" '
				[.[] | select(.draft == false and (.tag_name | test("^v" + $year + "\\.")))]
				| sort_by(.tag_name | ltrimstr("v"))
				| last
				| .tag_name // empty
				| ltrimstr("v")
			'
	)"
fi
if [[ ! "${release_version}" =~ ^${project_year//./\\.}\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$ ]]; then
	echo "No WPILib extension release found for project year ${project_year}." >&2
	exit 1
fi

vsix="$(mktemp --suffix=.vsix)"
cleanup() {
	rm -f "${vsix}"
}
trap cleanup EXIT

release_url="https://github.com/wpilibsuite/vscode-wpilib/releases/download/v${release_version}/vscode-wpilib-${release_version}.vsix"
echo "Installing WPILib extension ${release_version} for project year ${project_year}."
wget -q "${release_url}" -O "${vsix}"

find "${EXTENSIONS_DIR}" -mindepth 1 -maxdepth 1 -type d \
	-name "${EXTENSION_ID}-*" -exec rm -rf -- {} +
"/app/vscodium-web/bin/codium-server" \
	--install-extension "${vsix}" \
	--extensions-dir "${EXTENSIONS_DIR}" \
	--do-not-include-pack-dependencies \
	--force \
	>/dev/null

installed_version="$(
	find "${EXTENSIONS_DIR}" -mindepth 1 -maxdepth 1 -type d \
		-name "${EXTENSION_ID}-*" -print -quit \
		| sed -n "s#^.*/${EXTENSION_ID}-##p"
)"
if [[ "${installed_version}" != "${release_version}" ]]; then
	echo "WPILib extension installation produced ${installed_version:-no version}; expected ${release_version}." >&2
	exit 1
fi
