#!/bin/sh
# coderunner — dispatching CLI entrypoint for the control-plane image.
#
# Installed at /usr/local/bin/coderunner by the Dockerfile. Reached two ways:
#   1. As the image ENTRYPOINT: `docker compose run --rm control <subcommand>`
#      (CMD defaults to "serve", so a bare `docker compose up`/`run` boots the
#      server; `run --rm control backup` etc. replace CMD with a subcommand).
#   2. Directly on PATH inside a running container: `docker compose exec
#      control coderunner <subcommand>` — `exec` bypasses the image
#      ENTRYPOINT entirely, so this form only works because the script is
#      also installed as a normal executable on PATH, not because it's the
#      ENTRYPOINT.
#
# Every branch below `exec`s into `bun` (or, for the passthrough case, the
# given command), replacing this shell as PID 1 so signals from `docker stop`
# go straight to the real process.
set -eu

cd /app

usage() {
	cat <<'EOF'
Usage: coderunner <subcommand> [args...]

Subcommands:
  serve                    Run pending DB migrations, then start the control plane (default).
  backup [args]            Back up the database, allowlist, and workspace projects.
  restore <dir> [args]     Restore state from a backup created by `backup`.
  allowlist <cmd> [args]   Manage the email/domain allowlist (list/add/remove).
  users <cmd> [args]       Manage user roles (list/promote/demote).
  audit-prune [args]       Prune audit log entries older than a given date.
  rebuild-workspaces       Remove managed workspace containers and clear their leases.
  update-server            Run the admin-triggered self-update helper (needs host mounts).
  cleanup [args]           Remove stopped managed containers.
  migrate [apply|status]   Run or check the status of database migrations.
  help                     Show this message.

Anything else is exec'd as-is, e.g. `coderunner bash` for a shell.
EOF
}

# Normalize so $1 always exists (defaulting to "serve") before any branch
# below unconditionally shifts it off — `shift` with zero positional params
# is an error under `set -e`.
if [ $# -eq 0 ]; then
	set -- serve
fi

case "$1" in
serve)
	shift
	bun apps/control/src/migrate.ts apply
	exec bun apps/control/src/main.ts
	;;
backup)
	shift
	exec bun scripts/backup.ts "$@"
	;;
restore)
	shift
	exec bun scripts/restore.ts "$@"
	;;
allowlist)
	shift
	exec bun scripts/allowlist.ts "$@"
	;;
users)
	shift
	exec bun scripts/users.ts "$@"
	;;
audit-prune)
	shift
	exec bun scripts/audit-prune.ts "$@"
	;;
rebuild-workspaces)
	shift
	exec bun scripts/rebuild-workspaces.ts "$@"
	;;
update-server)
	shift
	exec bun scripts/update-server.ts "$@"
	;;
cleanup)
	shift
	exec bun scripts/cleanup-containers.ts "$@"
	;;
migrate)
	shift
	exec bun apps/control/src/migrate.ts "$@"
	;;
help | --help | -h)
	usage
	;;
*)
	exec "$@"
	;;
esac
