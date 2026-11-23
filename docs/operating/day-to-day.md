---
sidebar_position: 1
title: Day-to-Day Operations
---

# Day-to-Day Operations

This page covers the routine tasks a mentor performs during an active season:
starting and stopping the app, managing who can sign in, and keeping an eye on
what the system is doing.

::::note[Running ops commands]

The maintenance commands in this page (`allowlist`, `users`, `audit-prune`,
`backup`, `restore`) run **inside the control container** via the `coderunner`
CLI:

```bash
docker compose exec control coderunner <subcommand> <args>
```

Use `docker compose run --rm control <subcommand> <args>` instead for a
one-off command while the control plane is stopped (e.g. `restore`). On the
Google Cloud VM the compose project lives in `/opt/coderunner` and needs
`sudo` (`cd /opt/coderunner && sudo docker compose exec -T control …`). On a
from-source host checkout with Bun you can instead use the `bun run <name>`
aliases shown in `package.json`. The examples below use the `bun run` short form;
substitute the `docker compose exec control coderunner <subcommand>` form for a
containerized deployment.

::::

## Starting and stopping

Both the local and Google Cloud deployments run the control plane as a docker
compose service. From the compose directory (the repo root locally, or
`/opt/coderunner` on the VM):

```bash
docker compose up -d        # start (runs DB migrations first, then serves)
docker compose stop         # stop the control plane
docker compose restart control
docker compose ps           # status — control should be "healthy"
docker compose logs -f control
```

Students connect to `http://<host-ip>:4000/` (or `https://<your-domain>/` behind
Caddy on the VM). Student workspace containers keep running after the control
plane stops and are reconciled automatically when it starts again. `restart:
unless-stopped` brings the stack back after a host reboot.

### Stopping workspace containers

Containers are not stopped when the control plane stops. To stop all running
student workspace containers:

```bash
# Stop and remove only stopped/exited managed containers
bun run docker:cleanup

# Force-stop all currently running managed containers
docker stop $(docker ps -q --filter label=frc-sim.managed=true)
```

You can also stop a single workspace's container via the admin API (see
[Admin API break-glass](#admin-api-break-glass) below).

### Between sessions

You do not need to stop containers manually between class sessions. The idle
sweep stops containers automatically after students have been inactive for the
configured timeout. The default is 30 minutes (`IDLE_STOP_MINUTES`); the cloud
VM deployment uses 10 minutes. Containers are reconciled on the next session
without any student-visible data loss.

---

## Managing who can sign in

People are Better Auth `user` rows — the **roster** — and domains remain in
`data/allowlist.json`. GitHub/Google sign-in requires either a roster row for
that email or an allowed domain. Users with only a domain rule get a roster row
on first sign-in. Auth0 users are vetted by Auth0 instead. An empty roster and
empty domain list blocks everyone except Auth0 guests.

### Viewing the roster and domains

In the admin panel, open **Users**. The CLI prints both lists:

```bash
bun run allowlist:list
```

Users marked **Pending** have not finished enrollment: they have a coach-set
temporary password to change, or they have no login method yet.

### Adding a user

Use **Admin → Users → Add user** to open a labelled sheet and supply a username,
email, or both. You can also set the display name. New users are students;
promote an existing user from the Users table when needed. The temporary
password field is required: click **Generate** to fill a random password, edit
it if you like, and use the eye button to show or hide it. The password is shown
once after creation; the user must change it at first sign-in. They enter it
twice on the account page — the old password is never requested there, so
signing in with Google after a reset works too.
The sheet only creates new users — adding an existing username or email shows a
conflict. Each row's Actions dropdown has icon commands for editing the display
name, username, and email, resetting the password, promoting/demoting, and
removal. Admins get an **Admin** badge next to their name; the signed-in admin's
row has no actions and cannot be changed through these endpoints because that
would bypass the account-page safeguards. Identity sheets require at least one
credential, and editing does not reset a password or move a workspace. A blank
display name in the edit sheet leaves the current one in place. Pending is a badge
for users still onboarding; resetting a password for an established email user
instead shows a **Password reset** badge, because they still have a working
sign-in method. **Domains** at the top of the page opens the Allowed email
domains sheet.

Equivalent CLI forms:

```bash
# Create/reuse one user; prints a one-time password when password auth is enabled
bun run allowlist:add user student
bun run allowlist:add student@frcteam.org
bun run allowlist:add email student@frcteam.org
bun run allowlist:add username student
```

### Adding a domain

Domains permit GitHub/Google sign-ins from any address at that domain. They do
not create a roster row until the person signs in:

```bash
bun run allowlist:add frcteam.org
```

### Removing an entry

```bash
# Remove a pending roster row
bun run allowlist:remove old-member@frcteam.org

# Remove a domain rule
bun run allowlist:remove frcteam.org
```

Removing an active user (one with a workspace) is an Admin → Users operation so
the workspace deletion is explicit. Roster changes take effect immediately. The
control plane also watches `data/allowlist.json` and picks up domain edits
without a restart. Legacy email/username entries in that file are imported into
the roster once at startup and then removed from the file.

---

## Managing user roles

The **first** admin is best bootstrapped without any exec step: set
`CODERUNNER_ADMIN_EMAIL` (comma-separated) in `.env` before the first startup
and those identities are provisioned in the roster with the admin role (an
existing account is promoted at the next startup). See
[OAuth Credentials](../deploying/oauth-credentials.md). The commands here are for
ongoing role changes after that.

After a coach or mentor signs in for the first time they are a regular user.
Promote them to admin so they can access the admin panel and use the admin API:

```bash
# List all users (shows ID, name, email, role, workspace slug)
bun run users:list

# Grant admin role (the user must already exist in the DB)
bun run users:promote coach@frcteam.org

# Remove admin role
bun run users:demote coach@frcteam.org
```

Admins can also promote and demote users from the admin panel in the browser.
The system prevents demoting the last remaining admin.

---

## Running a classroom session

For a meeting, open **Admin → Classrooms**, choose how long the session will
run, and click **Start classroom**. Share the code or join link with students.
They can join with their name, without being added to the allowlist.

Ask students to choose **Leave** before handing a computer to someone else.
This signs them out and frees a container slot. When the meeting is over, click
**End now**. The classroom also ends when its time runs out; either way, its
guest accounts and projects are deleted.

A classroom can have up to 60 guests. The container limit applies to running
workspaces; see [Capacity](./capacity.md) when planning for simultaneous use.

## Container concurrency cap

The system limits how many workspace containers can run simultaneously to
prevent the host from being overloaded when many students sign in at once. The
default cap is **10** (`MAX_ACTIVE_CONTAINERS`).

When a student tries to open their workspace and the cap has been reached, they
see a toast: "Server at capacity. Your coach has been notified. Please try
again in a few minutes." Students with already-running containers are
unaffected.

### Checking and adjusting the cap at runtime

You can read and change the cap without restarting the control plane:

```bash
# Read current effective cap
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:4000/admin/config/max-active-containers

# Set cap to 15
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  -X POST -H "Content-Type: application/json" \
  -d '{"value": 15}' \
  http://localhost:4000/admin/config/max-active-containers
```

The runtime override is stored in the database and takes precedence over the
environment variable until changed again. The admin panel also shows the current
cap and active container count with an inline editor.

---

## Audit log

All admin actions (promoting users, stopping containers, modifying the
allowlist, changing the concurrency cap) are recorded in the audit log.

### What is logged

| Action | Trigger |
|---|---|
| `user.promote` | Promoting a user to admin |
| `user.demote` | Demoting an admin |
| `user.delete` | Deleting a user and their workspace |
| `user.password-reset` | Issuing a new temporary password for a user |
| `container.stop` | Stopping a workspace's containers |
| `container.restart-code` | Restarting a workspace's code container |
| `workspace.backup` | Creating an operator workspace backup |
| `workspace.restore` | Restoring a workspace from a backup |
| `allowlist.add` | Adding a roster user or domain rule |
| `allowlist.remove` | Removing a roster user or domain rule |
| `config.max-active-containers` | Changing the container concurrency cap |
| `classroom.create` | Starting a classroom |
| `classroom.end` | Ending a classroom early ("End now") |
| `classroom.cleanup` | Deleting an ended or expired classroom's guests (system) |
| `classroom.guest_join` | A guest joining or rejoining a classroom |

Each entry records the timestamp, the acting user (ID and email), the action,
the target (kind and ID), and optional metadata.

### Viewing the audit log

The admin panel has an "Audit Log" tab with filters by actor, action, and time
range.

Via the API:

```bash
# Latest entries
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:4000/admin/audit-log

# Filter by action prefix
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:4000/admin/audit-log?action=user&limit=50"

# Filter by actor email (substring match)
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:4000/admin/audit-log?actor=coach"

# Paginate using the smallest id from the previous page as cursor
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:4000/admin/audit-log?before=42&limit=25"
```

### Pruning old entries

Audit entries accumulate indefinitely. Prune them periodically:

```bash
# Remove all entries before a date
bun run audit:prune -- --before 2026-01-01

# Preview without deleting
bun run audit:prune -- --before 2026-01-01 --dry-run
```

Running this monthly is a reasonable cadence for a classroom deployment.

---

## Admin API break-glass

If `ADMIN_TOKEN` is set in your environment, you can call admin endpoints
directly with a bearer token. This is useful for scripting and for
bootstrapping before the first admin user has signed in.

```bash
# Overall system status: workspaces, container states, active builds
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:4000/admin/status | jq .

# Stop one workspace's containers
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  -X POST \
  http://localhost:4000/admin/workspaces/<workspaceId>/stop-containers

# Restart one workspace's code container
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  -X POST \
  http://localhost:4000/admin/workspaces/<workspaceId>/restart-code
```

If `ADMIN_TOKEN` is not set, admin endpoints require a signed-in admin session
cookie. The token is optional and intended as a break-glass mechanism, not as
the primary admin interface.
