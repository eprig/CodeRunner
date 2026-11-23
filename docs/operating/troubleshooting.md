---
sidebar_position: 6
title: Troubleshooting
---

# Troubleshooting

## Container won't start

**Symptom.** A student's workspace shows "starting" indefinitely, or the
container status is "error". The admin panel shows no running container for
that workspace.

**Cause.** Docker is not running, or the workspace image is missing.

**Fix.**

```bash
# Confirm Docker is running
docker info

# Check whether the workspace image exists
docker images | grep coderunner-workspace

# If missing, pull both images (control + workspace)
docker compose pull

# From-source host checkout: pull or build the workspace image directly
bun run docker:pull:workspace    # or docker:build:workspace to build locally
```

In **port mode** (the host dev loop, or a `docker compose` deployment with
`FRC_CONTAINER_NETWORK` explicitly unset), check for port conflicts: if all
ports in `SIM_PORT_RANGE` or `VSCODE_PORT_RANGE` are in use, container startup
fails. Verify the ranges are not overlapping with other services on the host.
Defaults are `25810–25899` (sim NT4) and `33000–33099` (codium-server).
This does not apply to **network mode** — the default for `docker compose`
deployments — where workspace containers publish no host ports at all; see
[decision 031](https://github.com/mathewdunne/CodeRunner/blob/main/docs/decisions/031-containerized-control-plane.md).

After the image is present and Docker is healthy, the student's container will
start on their next workspace open.

---

## Control plane can't reach the Docker socket (permission denied)

**Symptom.** The `control` container crash-loops. The logs show
`permission denied` while connecting to `/var/run/docker.sock`, and no workspace
containers ever start.

**Cause.** The control container runs as a non-root user and needs the group
that owns the socket added as a supplementary group to reach it.
`CODERUNNER_DOCKER_GID` does not match that group. This is a Linux and WSL2
problem: the `0` default matches Docker Desktop's root-owned socket on macOS and
native Windows, but Linux and WSL2 own the socket by their `docker` group
instead — including under Docker Desktop's WSL2 integration.

**Fix.** Look up the host's real `docker` group gid and set it in `.env`:

```bash
stat -c '%g' /var/run/docker.sock     # e.g. 999
```

```bash
# in .env
CODERUNNER_DOCKER_GID=999
```

Then recreate the container to pick up the corrected `group_add`:

```bash
docker compose up -d control
```

---

## Control plane can't write /data (SQLITE_READONLY / read-only data dir)

**Symptom.** The `control` container fails at startup (or on the first write)
with `SQLITE_READONLY: attempt to write a readonly database`, or logs an error
about being unable to write under `/data`.

**Cause.** The bind-mounted `./data` (or files inside it) is not owned by the
`CODERUNNER_UID:CODERUNNER_GID` the control container runs as. This is typically
leftover `root:root` files from a pre-non-root deployment that ran the control
plane as root, or a `./data` that Docker recreated root-owned after the
directory was deleted.

**Fix.** Confirm the ownership matches the configured uid:gid (default
`1000:1000`), then reclaim it on the host:

```bash
ls -ln data                           # check the owner uid/gid
stat -c '%g' /var/run/docker.sock     # (for the docker gid, if also affected)

# Reclaim the data dir for the control container's uid:gid (adjust to yours)
sudo chown -R 1000:1000 data
```

Then restart the control plane (`docker compose up -d control`). Never delete
the `./data` directory itself — Docker would recreate it root-owned and this
failure would return.

---

## Build times out

**Symptom.** A run shows "failed" after approximately 90 seconds with no
obvious error. The problem typically occurs on the student's first build of a
new project.

**Cause.** The Gradle build exceeded `RUN_BUILD_TIMEOUT_MS` (default: 90000 ms,
i.e. 90 seconds). Cold-cache first builds can legitimately take 2–3 minutes on
slower hosts.

**Fix.** Increase the timeout in your `.env`:

```bash
RUN_BUILD_TIMEOUT_MS=180000
```

Restart the control plane for the change to take effect. Subsequent builds are
much faster because Gradle's incremental cache (in `data/users/*/home/`) is
warm.

---

## Sim doesn't start after a successful build

**Symptom.** The build succeeds (the console shows Gradle output), but the run
stays in "building" for 30 seconds and then fails.

**Cause.** The WPILib simulator process did not report readiness within
`SIM_STARTUP_TIMEOUT_MS` (default: 30000 ms).

**Fix.** Increase the startup timeout:

```bash
SIM_STARTUP_TIMEOUT_MS=60000
```

If this happens consistently for one student, check the container logs:

```bash
docker logs coderunner-workspace-<hex> --tail 100
```

(The container name is `coderunner-workspace-` followed by the workspace id's
hex suffix, with the `ws_` prefix dropped.)

Look for the simulator failing to bind its HALSim port. If `HALSIM_PORT_RANGE`
ports are exhausted, restart the control plane or stop idle containers to free
leases. This only applies in port mode — network-mode deployments don't lease
host ports for workspace containers, so exhaustion here means
`MAX_ACTIVE_CONTAINERS` instead (see below).

---

## PathPlanner does not load or misses external edits

**PathPlanner shows a 503.** Its web artifact is missing. In a source checkout,
run `bun run fetch:pathplanner`, which downloads it and reports why if it
cannot. Published control images always carry it — the release build fails
rather than shipping without it — so in a Compose deployment pull and recreate
the control container. A locally built image can legitimately be missing it:
`bun run docker:build:control` downloads the artifact best-effort, so rebuild
once the external PathPlanner release is reachable again.

**An edit made in VSCodium does not appear.** Reload the page. 
External file changes are not synchronized into an open PathPlanner session.

---

## OAuth login fails

**Symptom.** Students see an OAuth error page, a "not authorized" flash, or
are silently redirected back to the login page.

**Cause: wrong callback URL.** The OAuth app registration does not include
the actual host URL. Fix by ensuring the callback URL registered with GitHub
or Google matches `BETTER_AUTH_URL`:

- GitHub: `<BETTER_AUTH_URL>/api/auth/callback/github`
- Google: `<BETTER_AUTH_URL>/api/auth/callback/google`

`BETTER_AUTH_URL` must be the externally reachable base URL of the control
plane (for example `https://coderunner.yourteam.ca`). On a local deployment
it is `http://<host-ip>:4000`.

**Cause: email not on the roster or an allowed domain.** GitHub/Google
sign-in checks the Better Auth `user` roster and the domain rules in
`data/allowlist.json`. Check and add:

```bash
bun run allowlist:list
bun run allowlist:add student@gmail.com
# or allow a whole domain
bun run allowlist:add yourteam.org
```

On a containerized deployment run these inside the control container instead
(`cd /opt/coderunner && sudo` on the VM):
`docker compose exec control coderunner allowlist list|add <email-or-domain>`.

Adding an email creates/reuses a roster row. With username/password enabled it
also prints a one-time temporary password that the student must change at first
sign-in.

**Cause: empty roster and domain list.** If there is no roster row and no
allowed domain, everyone is blocked. Confirm with `bun run allowlist:list` and
add at least one entry.

---

## Port range exhausted

This applies to **port mode** only (the host dev loop, or a `docker compose`
deployment with `FRC_CONTAINER_NETWORK` explicitly unset). Network mode — the
default for `docker compose` deployments — never leases host ports for
workspace containers, so it can't hit this failure; its concurrency limit is
`MAX_ACTIVE_CONTAINERS` alone (see [Capacity](./capacity.md)).

**Symptom.** Container startup fails with a log message about no free ports, or
many students get "server at capacity" even when the concurrency cap has not
been reached.

**Cause.** All ports in `SIM_PORT_RANGE`, `VSCODE_PORT_RANGE`, or
`HALSIM_PORT_RANGE` are leased (or stale leases were not cleaned up).

**Fix.** Each range supports 90 concurrent leases by default (e.g.
`25810–25899`). If you have more than 90 simultaneous students, expand the
ranges:

```bash
SIM_PORT_RANGE=25810-25999
VSCODE_PORT_RANGE=33000-33199
HALSIM_PORT_RANGE=34000-34199
```

Stale leases can accumulate if containers were stopped without the control
plane running. Restart the control plane; startup reconciles Docker container
state against the database and releases stale leases.

---

## Disk full

**Symptom.** File saves fail, builds fail with I/O errors, or container startup
fails. `df -h /` shows the data partition at or near 100%.

**Cause.** Gradle caches, run logs, and Docker image layers have grown to fill
the disk.

**Fix.** Free space in order of safety:

```bash
# 1. Prune run logs (safest, often largest single contributor)
find data/users/*/logs/runs -name "*.log" -delete

# 2. Prune stopped managed containers and their layers
bun run docker:cleanup
docker system prune -f
docker builder prune -f

# 3. Prune Gradle caches for all workspaces (stop containers first)
for dir in data/users/*/; do
  rm -rf "$dir/home"
  mkdir -p "$dir/home"
done
```

Never delete `data/users/*/project/`; that is student source code. If space
is critically low, back up project files first:

```bash
bun run backup
```

---

## Control plane crashes or becomes unresponsive

**Symptom.** The browser shows disconnected. `docker compose ps` shows the
`control` container unhealthy or restarting, or its logs show a fatal error.

**Cause.** An unhandled exception, OOM on the host, or a corrupt database.

**Fix.** Restart the control plane and check its logs (prefix with
`cd /opt/coderunner && sudo` on the VM):

```bash
docker compose restart control
docker compose logs --tail 100 control
```

On startup the control plane reconnects to existing containers via Docker
labels, reconciles container state with the database, and resumes the idle
sweep. Student files and running containers are preserved across restarts.

---

## Student workspace is at capacity (503)

**Symptom.** A student sees a "Server at capacity" toast when
opening their workspace. Other students with running containers are unaffected.

**Cause.** The active container count has reached `MAX_ACTIVE_CONTAINERS`.

**Fix.** Check the admin panel or the admin API for current vs. maximum
container count. If idle containers have not yet been stopped, wait for the
idle sweep (or reduce `IDLE_STOP_MINUTES`). If the load is legitimate and the
host has headroom, raise the cap at runtime without restarting:

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  -X POST -H "Content-Type: application/json" \
  -d '{"value": 15}' \
  http://localhost:4000/admin/config/max-active-containers
```

Verify host memory and CPU before raising the cap further; see
[Capacity](./capacity.md) for sizing guidance.
