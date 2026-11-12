#!/usr/bin/env bash
# Two-phase simulation runner. Invoked by start-sim.sh under setsid.
#
# Phase 1: run the project-compatible external Java simulation task. GradleRIO
# builds the project, extracts JNI natives, and writes a descriptor describing
# the runnable simulation. Because the
# task is not a JavaExec, Gradle exits cleanly once it finishes.
#
# Phase 2: read the descriptor, set HALSim env vars and library paths, then
# `exec java -jar` so this shell becomes the robot JVM. Because the PID
# survives exec, the caller's pid_file remains valid for the entire sim
# lifetime — Gradle is no longer in memory while the simulation runs.
#
# See docs/decisions/025-detach-sim-from-gradle.md.
#
# Modes (7th arg): run (default), debug (JDWP agent + $HOME/sim-debug.json),
# build (gradle build only). See docs/decisions/045-sim-debugging.md.

set -euo pipefail

if [[ "$#" -lt 6 ]]; then
  echo "Usage: $0 <project_root> <gradle_cache_dir> <max_workers> <gradle_jvmargs> <robot_jvmargs> <init_script> [run|debug|build]" >&2
  exit 64
fi

project_root="$1"
gradle_cache="$2"
gradle_max_workers="$3"
gradle_jvmargs="$4"
robot_jvmargs="$5"
init_script="$6"
sim_mode="${7:-run}"

case "$sim_mode" in
  run|debug|build) ;;
  *)
    echo "Unknown sim mode: $sim_mode" >&2
    exit 64
    ;;
esac

debug_port=5005
debug_marker="$HOME/sim-debug.json"

cd "$project_root"

init_args=()
if [[ -f "$init_script" ]]; then
  init_args=(--init-script "$init_script")
fi

gradle_task="simulateExternalJavaRelease"
descriptor_name="release_java.json"
gradle_build_file=""
for candidate in "$project_root/build.gradle" "$project_root/build.gradle.kts"; do
  if [[ -f "$candidate" ]]; then
    gradle_build_file="$candidate"
    break
  fi
done
if [[ -n "$gradle_build_file" ]] && grep -q 'org\.wpilib\.GradleRIO' "$gradle_build_file"; then
  # GradleRIO 2027 uses the unified external Java simulation task and writes
  # build/sim/java.json. Older edu.wpi.first projects use the release-specific
  # task and release_java.json.
  gradle_task="simulateExternalJava"
  descriptor_name="java.json"
fi
if [[ "$sim_mode" == "build" ]]; then
  gradle_task="build"
fi

# Gradle normally prints BUILD FAILED itself; say it explicitly so a killed or
# OOM'd Gradle still fails the run (the control plane greps for it).
./gradlew \
  --no-daemon \
  --no-watch-fs \
  "--max-workers=$gradle_max_workers" \
  --console=plain \
  --project-cache-dir "$gradle_cache" \
  "-Dorg.gradle.jvmargs=$gradle_jvmargs" \
  "${init_args[@]}" \
  writeSimulationClasspath "$gradle_task" || {
  gradle_status=$?
  echo "BUILD FAILED: Gradle exited with code $gradle_status" >&2
  exit "$gradle_status"
}

if [[ "$sim_mode" == "build" ]]; then
  exit 0
fi

descriptor="$project_root/build/sim/$descriptor_name"
if [[ ! -f "$descriptor" ]]; then
  echo "BUILD FAILED: sim descriptor was not produced at $descriptor" >&2
  exit 1
fi

robot_jar="$(find "$project_root/build/libs" -maxdepth 1 -type f -name '*.jar' \
  ! -name '*-sources.jar' ! -name '*-javadoc.jar' -print -quit 2>/dev/null || true)"
if [[ -z "$robot_jar" ]]; then
  echo "BUILD FAILED: no robot JAR under $project_root/build/libs" >&2
  exit 1
fi

main_class="$(jq -r '.[0].mainClassName // empty' "$descriptor")"
classpath_file="$project_root/build/sim/classpath.txt"

lib_dir="$(jq -r '.[0].libraryDir // empty' "$descriptor")"

# The init script removes halsim_gui and halsim_ds_socket from the
# simulationRelease config, so their libs are never extracted. The descriptor
# still lists them, so filter by what actually exists on disk.
halsim_extensions="$(
  jq -r '.[0].extensions[]? | select(.defaultEnabled == true) | .libName' "$descriptor" \
    | while IFS= read -r ext; do
        if [[ -n "$ext" && -f "$ext" ]]; then
          printf '%s\n' "$ext"
        fi
      done | paste -sd: -
)"

if [[ -n "$lib_dir" ]]; then
  export LD_LIBRARY_PATH="${lib_dir}${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}"
  export DYLD_LIBRARY_PATH="${lib_dir}${DYLD_LIBRARY_PATH:+:${DYLD_LIBRARY_PATH}}"
  export DYLD_FALLBACK_LIBRARY_PATH="${lib_dir}${DYLD_FALLBACK_LIBRARY_PATH:+:${DYLD_FALLBACK_LIBRARY_PATH}}"
fi
if [[ -n "$halsim_extensions" ]]; then
  export HALSIM_EXTENSIONS="$halsim_extensions"
fi

read -r -a robot_jvmargs_array <<<"$robot_jvmargs"
java_args=("${robot_jvmargs_array[@]}")
if [[ -n "$lib_dir" ]]; then
  java_args+=("-Djava.library.path=$lib_dir")
fi

if [[ "$sim_mode" == "debug" ]]; then
  # Loopback only: in network mode workspaces share a Docker network, and an
  # attached debugger can run arbitrary code in this JVM. quiet=y: the agent's
  # "Listening for transport" banner goes through C stdio, and wpiutil's fmt
  # then aborts ("negative value") writing to the same piped stdout while
  # loading HAL extensions.
  java_args+=("-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=127.0.0.1:${debug_port},timeout=120000,quiet=y")
  echo "Waiting up to 120s for the editor's debugger to attach on port ${debug_port}..."
  # $$ survives exec, so this is the robot JVM's pid (and sim.pid's).
  printf '{"port":%s,"pid":%s}\n' "$debug_port" "$$" >"$debug_marker"
fi

if [[ -n "$main_class" && -f "$classpath_file" ]]; then
  classpath="$(cat "$classpath_file")"
  exec java "${java_args[@]}" -cp "$classpath" "$main_class"
fi

exec java "${java_args[@]}" -jar "$robot_jar"
