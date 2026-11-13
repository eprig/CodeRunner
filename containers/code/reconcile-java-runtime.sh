#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${1:-/workspace/project}"
MACHINE_SETTINGS="${HOME}/data/Machine/settings.json"
PROJECT_SETTINGS="${PROJECT_DIR}/.vscode/settings.json"
DEFAULT_JAVA_HOME="/usr/lib/jvm/jdk-17"
PROJECT_JAVA_HOME="${DEFAULT_JAVA_HOME}"
PROJECT_JAVA_RUNTIME="JavaSE-17"

requires_java_25=false
if [[ -f "${PROJECT_DIR}/build.gradle" ]] &&
	grep -Eq 'JavaVersion\.VERSION_25|sourceCompatibility[[:space:]]*=[[:space:]]*25|targetCompatibility[[:space:]]*=[[:space:]]*25' \
		"${PROJECT_DIR}/build.gradle"; then
	requires_java_25=true
fi

if [[ "${requires_java_25}" == true && ! -x /usr/lib/jvm/jdk-25/bin/java ]]; then
	echo "Java 25 is required by ${PROJECT_DIR}/build.gradle but is missing from this workspace image." >&2
	exit 1
fi

if [[ "${requires_java_25}" == true ]]; then
	PROJECT_JAVA_HOME="/usr/lib/jvm/jdk-25"
	PROJECT_JAVA_RUNTIME="JavaSE-25"
fi

mkdir -p "$(dirname "${MACHINE_SETTINGS}")" "$(dirname "${PROJECT_SETTINGS}")"
for settings_file in "${MACHINE_SETTINGS}" "${PROJECT_SETTINGS}"; do
	[[ -s "${settings_file}" ]] || printf '{}\n' > "${settings_file}"
	tmp_settings="$(mktemp)"
	jq \
		--arg projectJavaHome "${PROJECT_JAVA_HOME}" \
		--arg projectJavaRuntime "${PROJECT_JAVA_RUNTIME}" \
		--arg managedJavaHome "/usr/lib/jvm/jdk-25" \
		'
		. | ."java.import.gradle.java.home" = $projectJavaHome
		| if $projectJavaRuntime == "JavaSE-25"
		  then ."java.jdt.ls.java.home" = $projectJavaHome
		  elif ."java.jdt.ls.java.home" == $managedJavaHome
		  then del(."java.jdt.ls.java.home")
		  else .
		  end
		| ."java.configuration.runtimes" = [
			{
				"name": "JavaSE-17",
				"path": "/usr/lib/jvm/jdk-17",
				"default": ($projectJavaRuntime == "JavaSE-17")
			},
			{
				"name": "JavaSE-21",
				"path": "/usr/lib/jvm/jdk-21"
			},
			{
				"name": "JavaSE-25",
				"path": "/usr/lib/jvm/jdk-25",
				"default": ($projectJavaRuntime == "JavaSE-25")
			}
		]
		' "${settings_file}" > "${tmp_settings}"
	mv "${tmp_settings}" "${settings_file}"
done

echo "Configured ${PROJECT_JAVA_RUNTIME} (${PROJECT_JAVA_HOME}) for ${PROJECT_DIR}."
