---
sidebar_position: 2
title: Backups
---

# Backups

A CodeRunner backup captures the only state that cannot be regenerated: the
SQLite database and each student's project files. Everything else (Gradle
caches, editor state, run logs) is recreated automatically when a student's
container next starts.

## What matters

| Path | Contains | Back up? |
|---|---|---|
| `data/app.db` | User roster, sign-in methods, workspaces, sessions, port leases, audit log | **Yes** |
| `data/allowlist.json` | Domain rules permitted to sign in (legacy person entries are imported into the DB at startup) | **Yes** |
| `data/users/*/project/` | Student Java source code | **Yes** |
| `data/users/*/assets/` | Per-workspace AdvantageScope assets | **Yes** |
| `data/users/*/home/` | Gradle cache, editor state, VS Code user data | No (regenerated) |
| `data/users/*/jdtls-data/` | Java language server index | No (regenerated) |
| `data/users/*/logs/` | Build and run log history | No (transient) |

Team robot project work in particular should be pushed to GitHub regularly.
The server backup is not a substitute for version control. See
[Team Import](../lessons/team-import.md) for how students commit and push from
their workspace.

::::note[Containerized deployments]

`backup`/`restore` run inside the control container via the `coderunner` CLI,
which sees the data directory at `/data`:

```bash
docker compose exec control coderunner backup
docker compose run --rm control restore <backup-dir>
```

`run --rm` works even while the control plane is stopped, which is normal
before a `restore`. Backups land in `/data/backups/...` — i.e. under your
`CODERUNNER_HOST_DATA_DIR` on the host. A `<backup-dir>` passed to `restore`
must be a path **inside** `/data` (the container can't see arbitrary host
paths). On the VM, prefix with `cd /opt/coderunner && sudo`. The `bun run
backup` / `bun run restore` forms below apply to a from-source host checkout;
the paths and options are identical.

::::

## Creating a backup

```bash
bun run backup
```

This creates a timestamped snapshot under `data/backups/YYYY-MM-DD-HHmmss/`
with the following layout:

```
data/backups/2026-05-16-151038/
  app.db                         SQLite online-backup snapshot
  allowlist.json                 copy of the allowlist
  workspaces/
    <workspaceId>/
      project.tar.gz             student source tree
      assets.tar.gz              (if assets/ exists)
```

The database snapshot uses SQLite's online backup API, so it is safe to run
while the control plane is up; you get a consistent view of committed state.
For project archives, prefer to take the backup when no students are actively
saving files, or stop the control plane first if consistency matters.

### Backup options

```bash
# Write the backup to a custom location
bun run backup -- --output /path/to/backup

# Legacy mode: skip DB and allowlist, archive project files only
bun run backup -- --projects-only
```

## Restoring from a backup

Stop the control plane before restoring (`docker compose stop control`, or
`Ctrl+C` for a host run), then:

```bash
bun run restore -- <backup-dir>
```

This restores the database, allowlist, and every workspace's project and
assets. Restore is destructive: existing files at the destination are
overwritten.

### Restore options

```bash
# Preview what would be restored without writing anything
bun run restore -- <backup-dir> --dry-run

# Restore a single workspace only (implies --skip-db and --skip-allowlist)
bun run restore -- <backup-dir> --workspace ws_abc123

# Keep the current database; restore only project files
bun run restore -- <backup-dir> --skip-db

# Keep the current allowlist
bun run restore -- <backup-dir> --skip-allowlist

# Skip per-workspace assets/; restore project files only
bun run restore -- <backup-dir> --skip-assets
```

Legacy backups created with `--projects-only` or by older versions of the
backup script restore only per-workspace project files; `--skip-db` and
`--skip-allowlist` are no-ops for those since the backup does not include them.

## Recommended cadence

- **Daily** during active classroom use (before class or at end of day).
- **Before** any Docker image rebuild or host OS update.
- **Before** running `restore`, back up the current state first in case you
  need to roll back.

## Moving an instance between machines

To migrate a local deployment to the cloud VM (or to a new machine):

```bash
# On the source machine, stop the control plane and create a backup
bun run backup

# Copy the backup to the destination
rsync -a data/backups/<timestamp>/ user@newhost:/path/to/coderunner/data/backups/<timestamp>/

# On the destination, with the control plane stopped
bun run restore -- data/backups/<timestamp>
bun run start
```

For the Google Cloud deployment, the data disk holds all runtime state and
persists independently of the VM. The seasonal teardown procedure covers how to
snapshot and restore the data disk across seasons; see
[Seasonal Teardown](./seasonal-teardown.md).
