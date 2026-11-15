# V2 Code Container (`coderunner-workspace`)

Merged per-student container for V2. Combines VSCodium reh-web (`codium-server`) + Java IDE + WPILib support in a single image using the linuxserver.io base (Ubuntu 24.04, s6-overlay).

## What's Inside

| Component | Version | License | Purpose |
|---|---|---|---|
| Base image | linuxserver/vscodium-web:1.126.04524-ls35 | GPL-3.0 | Ubuntu 24.04, s6-overlay, codium-server, PUID/PGID |
| VSCodium reh-web (`codium-server`) | 1.126.04524 (from base) | MIT | Browser-based VS Code editor |
| Project JDK | Temurin 17.0.15+6 / 25.0.5+8 | GPL-2.0 w/ Classpath Exception | Gradle, Java compilation, and robot simulation; Java 25 projects select JDK 25 |
| Tooling JDK | Temurin 21.0.12.1+1 | GPL-2.0 w/ Classpath Exception | Java language server runtime |
| redhat.java | 1.55.0 | EPL-2.0 | Java language support (JDT LS) |
| vscode-wpilib | Project-year release | BSD-3-Clause | WPILib project tooling selected from `.wpilib/wpilib_preferences.json` |
| Java Extension Pack | 0.31.1 | MIT | Debugger, test runner, Maven/Gradle, project manager |
| Spotless Gradle | 1.2.1 | MIT | Code formatting via Spotless |
| Gradle cache | Primed from template | BSD-3-Clause (WPILib) | Fast first builds (~seconds vs ~minutes) |

Required notices for all of the above are in [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md), which ships inside the image at `/usr/share/coderunner/`.

The runtime seeds conservative memory defaults for classroom density:

- Fresh workspaces default to the VS Code `Default Dark Modern` theme through Remote/Machine settings.
- JDT LS runs on the dedicated Java 21 installation required by current Java
  Debug/JDT bundles, discovered through `JDK_HOME`. The
  `java.jdt.ls.java.home` setting is deliberately unset because WPILib treats
  it as the project JDK. `JAVA_HOME`, WPILib builds, Gradle import, project
  compilation, and robot simulation remain on Java 17; projects declare Java
  17 source/target.
- JDT LS defaults to `-Xmx512m` instead of the WPILib-generated `-Xmx8G`.
- The VS Code Gradle Build Server path is disabled by default; JDT LS still imports Gradle projects through the Java extension.
- Gradle runs are bounded by `/config/.gradle/gradle.properties`: `-Xmx384m`, no daemon, no VFS watching, and two workers. Those limits are deliberately not duplicated into the editor's `java.import.gradle.*` settings, which reject them (decision 037).
- Simulation runs pass `--no-watch-fs` and `--max-workers=2` on the `start-sim.sh` command line.
- The robot simulation JVM is capped at `-Xmx256m` unless `ROBOT_SIM_JVMARGS` overrides it.

## Build

```bash
bun run docker:build:workspace
```

Tags the image as `${CODERUNNER_IMAGE_NS:-ghcr.io/mathewdunne}/coderunner-workspace:${CODERUNNER_TAG:-latest}` —
the same name docker compose and the control plane resolve, so a local build is
used directly. Override the full name with the `CODE_IMAGE` env var.

## Runtime Contract

### Bind mounts

| Host path | Container path | Purpose |
|---|---|---|
| `data/users/<workspaceId>/project` | `/workspace/project` | Student code (authoritative) |
| `data/users/<workspaceId>/home` | `/config` | Gradle cache, editor state, extensions |

### Published ports

| Container port | Purpose |
|---|---|
| 3000 | codium-server (HTTP + WebSocket) — overrides the base image's 8000 |
| 3300 | HALSim WebSocket server |
| 5810 | NT4 (NetworkTables, for AdvantageScope) |

All must be published on `127.0.0.1` only (loopback). The control plane proxy is the sole browser-facing endpoint.

### Labels

```
frc-sim.managed=true
frc-sim.version=v2
frc-sim.role=code
frc-sim.workspace=<workspaceId>
frc-sim.image-id=<image ID>
```

The control plane recreates a container whose `frc-sim.image-id` (from
`docker image inspect --format '{{.Id}}'`) differs from the image ID it looked
up at startup, or that has no such label.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `PUID` | Yes | User ID for file permissions (matches host UID) |
| `PGID` | Yes | Group ID for file permissions (matches host GID) |
| `VSCODE_BASE_PATH` | Yes behind proxy | Reverse proxy base path, e.g. `/u/<slug>/vscode/` |
| `CODERUNNER_JDT_LS_VMARGS` | No | Overrides the seeded Java language-server VM args |
| `CODERUNNER_GRADLE_JVMARGS` | No | Overrides the seeded Gradle daemon/import VM args |
| `GRADLE_SIM_JVMARGS` | No | Overrides the Gradle daemon VM args for `start-sim.sh` |
| `GRADLE_MAX_WORKERS` | No | Overrides the Gradle worker cap for `start-sim.sh` |
| `ROBOT_SIM_JVMARGS` | No | Overrides the robot JavaExec VM args applied by `sim-headless.init.gradle` |

### Example run

```bash
docker run -d \
  --name coderunner-workspace-<hex> \
  --label frc-sim.managed=true \
  --label frc-sim.version=v2 \
  --label frc-sim.role=code \
  --label frc-sim.workspace=<workspaceId> \
  --label frc-sim.image-id=<image ID> \
  -v "$PWD/data/users/<workspaceId>/project:/workspace/project" \
  -v "$PWD/data/users/<workspaceId>/home:/config" \
  -p 127.0.0.1:<vscodePort>:3000 \
  -p 127.0.0.1:<simPort>:5810 \
  -p 127.0.0.1:<halsimPort>:3300 \
  -e PUID=$(id -u) \
  -e PGID=$(id -g) \
  -e VSCODE_BASE_PATH=/u/<slug>/vscode/ \
  --memory=2560m \
  ghcr.io/mathewdunne/coderunner-workspace:latest
```

(`--name` drops the `ws_` prefix from `<workspaceId>`; the label, volume paths,
and `VSCODE_BASE_PATH` still use the full workspace id / slug.)

## s6-overlay Services

The container uses s6-overlay for process supervision. The upstream `linuxserver/vscodium-web` image provides the base services; we add FRC-specific layers:

- **`init-vscodium-web`** (upstream): Creates `/config` dirs, fixes permissions, configures sudo.
- **`init-frc-setup`** (ours, oneshot): Seeds the Gradle cache, reconciles CodeRunner-managed extensions, validates the project mount, and fixes permissions.
- **`svc-vscodium-web`** (upstream, run script overridden): Launches `codium-server` as `abc` user with health check, custom extensions/data dirs, port 3000, and server-base-path.

## First-Run Behavior

On first start with an empty `/config`, the init script:

1. Copies the primed Gradle cache from `/opt/frc-gradle-cache/` into `/config/.gradle/`.
2. Installs the CodeRunner-managed VS Code extensions from
   `/opt/frc-extensions-cache/` into `/config/extensions/`.
3. Seeds `/config/data/Machine/settings.json` with the bounded Java/Gradle
   defaults and dark theme. Gradle daemon memory stays in
   `/config/.gradle/gradle.properties`; it is intentionally not duplicated in
   `java.import.gradle.{jvmArguments,arguments}`, which the editor extensions
   pass through Tooling API build launchers that reject these daemon options.

Subsequent starts skip the Gradle copy, but reconcile the nine CodeRunner-managed
extension IDs to the versions baked into the current image. Superseded managed
directories and manifest entries are replaced; unrelated student-installed
extensions are preserved. Settings migration also runs on later starts so existing imported WPILib
projects with `java.jdt.ls.vmargs` set to `-Xmx8G` are lowered to the container
default. It also removes the former CodeRunner
`java.import.gradle.{jvmArguments,arguments}` seeds from existing Machine
settings and from projects where they still have CodeRunner-provided values.

## Sim Scripts

- `/usr/local/bin/start-sim.sh` — Thin launcher invoked by the run queue via `docker exec`. Validates the mount, then `setsid`s `run-sim.sh` and records the subshell PID.
- `/usr/local/bin/run-sim.sh` — Two-phase runner. Phase 1: `./gradlew simulateExternalJavaRelease`, which builds the project, extracts JNI natives, writes `build/sim/release_java.json`, and exits. Phase 2: parse the descriptor and `exec java -jar` so this PID becomes the robot JVM. Gradle is no longer in memory while the simulation runs. See decision 025.
- `/usr/local/bin/stop-sim.sh` — Stops the sim process tree gracefully (SIGTERM, then SIGKILL after 10s).

## Image Size

Built image size: ~2.65 GiB (uncompressed). Includes both JDKs (~600 MB), the
VSCodium reh-web runtime, 9 VS Code extensions, and the single primed
Gradle/WPILib dependency-cache layer (~1.2 GiB).
