---
sidebar_position: 3
title: Local Deployment
sidebar_label: Local Deployment (Recommended)
---

# Local Deployment

Run CodeRunner on one machine and let students connect over your local network.
This is the simplest deployment: it needs no cloud account, domain, or TLS
certificate.

For an all-in-one public deployment with automated infrastructure and HTTPS,
see [Google Cloud Deployment](./gcloud.md).

## Prerequisites

Install **Docker Engine 24+ with the Compose plugin** and **Git**. The published
images include the control plane, web app, AdvantageScope Lite, PathPlanner,
and student development environment, so you do not need Bun or the build
toolchain.

For 3–5 students, plan for at least 4 CPU cores, 16 GB RAM, and 20 GB free disk.
For larger groups, see [Capacity and Sizing](../operating/capacity.md). Both
x86-64 and arm64 hosts are supported.

:::tip[Native Linux or WSL2 is strongly recommended]

For WSL2, keep the checkout and `data` directory in the Linux filesystem, not
under `/mnt/c`. Docker Desktop on macOS and native Windows works, but its
filesystem bridge makes the bind-mounted student workspaces noticeably slower.

:::

Before continuing, choose at least one sign-in method: register a GitHub or
Google OAuth app as described in [OAuth Credentials](./oauth-credentials.md),
or enable the optional username/password sign-in (`CODERUNNER_USERNAME_PASSWORD=true`).

## 1. Clone and configure

```bash
git clone https://github.com/mathewdunne/CodeRunner.git CodeRunner
cd CodeRunner
cp .env.example .env
```

Open `.env` and set at minimum:

```bash
# Generate with: openssl rand -hex 32
BETTER_AUTH_SECRET=<random-string>

# The address students will open. Replace this example with the host's LAN IP.
BETTER_AUTH_URL=http://192.168.1.50:4000

# Configure at least one OAuth provider.
GITHUB_CLIENT_ID=<your-github-client-id>
GITHUB_CLIENT_SECRET=<your-github-client-secret>
# GOOGLE_CLIENT_ID=<your-google-client-id>
# GOOGLE_CLIENT_SECRET=<your-google-client-secret>
#
# OR enable username/password sign-in instead of (or alongside) OAuth:
# CODERUNNER_USERNAME_PASSWORD=true

# Comma-separated coach/admin emails.
CODERUNNER_ADMIN_EMAIL=you@yourteam.org

# REQUIRED on Linux and WSL2. Run this and paste the number it prints:
#   stat -c '%g' /var/run/docker.sock
CODERUNNER_DOCKER_GID=<docker-socket-group-id>
```

`CODERUNNER_DOCKER_GID` **must be set on Linux and WSL2**, including Docker
Desktop's WSL2 integration, or the control plane cannot manage student
containers. Omit it on Docker Desktop for macOS and native Windows.

OAuth callback URLs must match `BETTER_AUTH_URL`. Use `localhost` only when the
browser is on the host machine; use the host's LAN IP when students connect from
other devices. Always replace the default `BETTER_AUTH_SECRET` outside demo use.

Student projects and the database are stored in `./data`. To use another disk,
set `CODERUNNER_HOST_DATA_DIR` to an absolute host path.

The control container defaults to uid:gid `1000:1000`. On Linux or WSL2, check
the data directory with `stat -c '%u:%g' ./data`; set `CODERUNNER_UID` and
`CODERUNNER_GID` only if its non-root owner differs. Leave both unset for the
usual `1000:1000` owner and on Docker Desktop for macOS or native Windows. See
the [Configuration Reference](../reference/configuration.md#docker-compose-deployment)
for non-standard layouts.

:::warning[Keep the data directory owned by the control user]

Do not delete the `data` directory itself. Docker may recreate a missing bind
mount directory as root, preventing the non-root control plane from writing to
it. To reset a deployment, delete only the directory's contents. Create a
relocated data directory before starting CodeRunner and give it the ownership
described above.

:::

See `.env.example` for every optional setting.

## 2. Start and verify

```bash
docker compose up -d
curl http://localhost:4000/healthz
docker compose ps
```

The first start downloads several gigabytes because the workspace image
contains Java and WPILib. In `docker compose ps`, the control service should
become `healthy`.

:::note[Why `workspace-template` exits]

Docker Compose may report that `workspace-template` exited with code 0. This is
expected: it is a short-lived helper that pulls the multi-gigabyte
workspace image during startup, so the first student does not have to wait for
it to download when they log in. The control plane starts a separate workspace
container from that image when needed.

:::

Students can then open `http://<your-LAN-IP>:4000/`.

## 3. Sign in and allow students

Sign in with an address listed in `CODERUNNER_ADMIN_EMAIL`. At startup that
address is added to the allowlist, and its account becomes an admin on first
sign-in. From the admin panel you can manage workspaces and other users.

Other users must match an allowlist entry before OAuth sign-in can complete.
Add an individual address or a whole domain:

```bash
docker compose exec control coderunner allowlist add student@frcteam.org
docker compose exec control coderunner allowlist add frcteam.org
```

To promote another coach after they have signed in once:

```bash
docker compose exec control coderunner users promote coach@frcteam.org
```

See the [CLI reference](../reference/cli-reference.md) for list, remove, and
demote commands.

## Updating CodeRunner to a new release

:::important[Use these steps for every new CodeRunner release]

An update replaces every student's workspace container with one on the new
workspace image, which disconnects active editor sessions and stops running
simulations. Schedule a time when no students are active, then complete every
step below.

:::

### 1. Choose the new version

Set `CODERUNNER_TAG` in `.env` to the new release tag, for example:

```bash
CODERUNNER_TAG=v2.5.0
```

If you intentionally track `latest`, leave the existing value unchanged.

### 2. Pull the new images and restart the control plane

```bash
docker compose pull
docker compose up -d
```

`up -d` restarts the control plane on the new release. It then recreates each
student's workspace container on the new workspace image the next time that
student connects. No `rebuild-workspaces` step is needed.
Student project files are bind-mounted and survive.
### 3. Verify the update

```bash
curl http://localhost:4000/healthz
docker compose ps
```

The health check should succeed and the control service should be `healthy`.

## Routine restarts

For routine lifecycle operations:

```bash
docker compose stop    # student containers keep running
docker compose up -d   # restart and reconcile student containers
docker compose down    # remove the control container and network
```

:::warning[Do not remove orphans while students are active]

`docker compose down --remove-orphans` and Portainer's **Remove stack** can
also stop and remove live student workspace containers. Plain
`docker compose down` does not remove them.

:::

## Network safety

This local deployment uses plain HTTP by default. Keep it on a trusted team LAN
or hotspot you control, or put an HTTPS reverse proxy in front of it. For a
complete cloud setup with the infrastructure and Caddy already configured, see
[Google Cloud Deployment](./gcloud.md).
