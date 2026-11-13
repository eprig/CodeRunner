---
sidebar_position: 3
title: The Workspace Container
---

# The Workspace Container

Each student gets their own Docker container: one per workspace, started on
demand when they open the IDE, stopped automatically when they have been idle
for a configurable period. This page explains what is inside that container and
how the control plane manages it.

The authoritative reference for the container's runtime contract (bind mounts,
published ports, labels, environment variables, and first-run behavior) is the
[container README on GitHub](https://github.com/mathewdunne/CodeRunner/blob/main/containers/code/README.md).

## What is inside the image

The image (`ghcr.io/mathewdunne/coderunner-workspace:latest` by default,
overridden via `CODE_IMAGE`) is
built on [linuxserver/vscodium-web](https://github.com/linuxserver/docker-vscodium-web)
(Ubuntu 24.04 with s6-overlay process supervision) and adds the following on
top:

| Component | Version |
|---|---|
| VSCodium reh-web (`codium-server`) | 1.126.04524 |
| Adoptium Temurin project JDK | 17.0.15+6 and 25.0.5+8 (x64/aarch64) |
| Adoptium Temurin JDT LS JDK | 21.0.12.1+1 (x64/aarch64) |
| redhat.java (JDT Language Server) | 1.55.0 |
| vscode-wpilib (WPILib extension) | Matches the project's `.wpilib/wpilib_preferences.json` year |
| Java Extension Pack | 0.31.1 (members pinned individually) |
| Spotless Gradle | 1.2.1 |
| GitHub CLI (`gh`) | latest stable at image build time |
| Gradle + WPILib dependency cache | pre-primed at build time |
| Bundled lesson catalog | baked in at `/opt/frc-catalog/` |

The total uncompressed image size is approximately 2.65 GiB, including both
JDKs and roughly 1.2 GiB for the single primed Gradle and WPILib
dependency-cache layer that makes first builds take seconds rather than
minutes.

## Classroom-density memory defaults

Running one container per student on shared hardware requires conservative JVM
settings. The image seeds the following defaults at first start:

- **JDT Language Server** capped at `-Xmx512m` (the WPILib extension default
  of `-Xmx8G` is intentionally replaced).
- **Gradle daemon/import** runs with `-Xms64m -Xmx384m`, `--max-workers=2`,
  and `--no-watch-fs`.
- **Robot simulation JVM** capped at `-Xmx256m`.
- The VS Code **Gradle Build Server** path (`java.gradle.buildServer.enabled`)
  is disabled; JDT LS still imports Gradle projects, removing roughly 700 MiB
  of duplicated Gradle infrastructure from the measured peak.
- Projects declaring `JavaVersion.VERSION_25` automatically use the bundled
  JDK 25 for Gradle, editor imports, and simulation; other projects continue
  to use JDK 17.

All of these defaults are environment-overridable at container launch time
(see the container README for the full variable list).

The control plane enforces a **hard memory cap** on every container via
Docker's `--memory` flag. The default is `4096m`, controlled by the
`CODE_MEMORY_LIMIT` environment variable on the control plane. Disk reads are
capped per block device via `--device-read-bps` (default `64mb`, controlled by
`CODE_DISK_READ_LIMIT`) so one container cannot saturate host disk throughput.

## How student data persists

Student files live on the **host** under `data/users/<workspaceId>/` and are
bind-mounted into the container at known paths:

| Host path | Container path | Contents |
|---|---|---|
| `data/users/<id>/project` | `/workspace/project` | Student source code (authoritative) |
| `data/users/<id>/home` | `/config` | Gradle cache, editor state, VS Code extensions |

Because the mounts outlive any individual container, a student's work survives
the container being stopped, restarted, or recreated. See
[Architecture](./architecture.md) for the full data layout on the host.

## Container ports

Three ports are used inside the container:

| Container port | Purpose |
|---|---|
| 3000 | codium-server (HTTP + WebSocket) — overrides the base image's 8000 |
| 3300 | HALSim WebSocket server (robot enable/disable and mode) |
| 5810 | NT4 NetworkTables server (telemetry) |

How the control plane reaches them depends on deployment mode:

- **Port mode** (the host dev loop, `bun run dev:control`): each container's
  ports are published on the **host loopback interface** (`127.0.0.1`) only,
  never on a public network interface. The control plane allocates host-side
  port numbers from configurable ranges (defaults: `33000–33099` for the
  editor, `25810–25899` for NT4, `34000–34099` for HALSim) and records the
  assignments in its SQLite database.
- **Network mode** (the default for `docker compose` deployments): containers
  publish **no** host ports at all. They join a shared Docker network and the
  control plane proxies to them by container name over Docker's internal DNS.
  Concurrency here is bounded by `MAX_ACTIVE_CONTAINERS` rather than by the
  size of a port range — see [Capacity](../operating/capacity.md).

Either way, the browser never connects to these ports directly; all traffic is
proxied through the control plane's single public port.

## Container labels

Every managed container carries Docker labels that the control plane uses to
identify and reconcile containers across restarts:

```
frc-sim.managed=true
frc-sim.version=v2
frc-sim.role=code
frc-sim.workspace=<workspaceId>
frc-sim.image-id=<workspace image ID when created>
```

When a workspace is next used (for example after a control-plane restart), if
the control plane finds an existing container with matching labels and the
right port shape for the current mode — loopback-bound ports in port mode,
attached to the workspace network with no published ports in network mode — it
adopts it rather than creating a new one. A container
without matching labels, or whose port shape belongs to the other mode, is
removed and replaced (this is also how a leftover from a prior deployment mode
gets recreated after a cutover). A container whose `frc-sim.image-id` differs
from the workspace image ID the control plane looked up at startup is also
replaced. This is how an update moves students onto the new workspace image.

## First-run behavior

On the first start of a fresh workspace (empty `/config` bind mount), an init
script runs before the editor starts:

1. Copies the primed Gradle cache from `/opt/frc-gradle-cache/` into
   `/config/.gradle/`.
2. Installs the pre-bundled CodeRunner-managed VS Code extensions from
   `/opt/frc-extensions-cache/` into `/config/extensions/`, then replaces
   `vscode-wpilib` with the latest release for the project's
   `.wpilib/wpilib_preferences.json` year.
3. Seeds bounded Java/Gradle settings and the dark theme into the editor's
   Remote/Machine configuration.

On subsequent starts the Gradle copy is skipped. The extension step selectively
reconciles only CodeRunner-managed IDs, then updates `vscode-wpilib` to the
project year's release, preserving unrelated student-installed extensions. A
settings-migration step also lowers
any legacy `-Xmx8G` JDT LS setting that may have been imported from a WPILib
project.

## Idle auto-stop

The control plane's idle manager checks every 60 seconds (configurable via
`IDLE_CHECK_INTERVAL_MS`) and stops containers whose workspace has not received
a heartbeat within the idle window. The default idle window is **30 minutes**,
controlled by the `IDLE_STOP_MINUTES` environment variable. Stopped containers
are not removed; they are restarted the next time the student opens their
workspace.

## Capacity limit

The control plane refuses to start a new container when the number of running
containers would exceed `MAX_ACTIVE_CONTAINERS` (default: `10`). Students who
hit the limit receive an error rather than causing resource exhaustion on the
host. See [Capacity](../operating/capacity.md) for tuning guidance.
