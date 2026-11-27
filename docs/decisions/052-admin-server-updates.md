# 052 — Admin UI server updates (tags and branches)

## Decision

Admins can update a running CodeRunner deployment from **Admin → Update** in
the browser. The tab shows the running image's repository/commit/version, the
host checkout path, and selectable tags and branches from that repository. A
tag pulls the prebuilt GHCR control and workspace images; a branch checks out
and locally builds both images from the host's own git checkout. Either way,
workspace containers are recreated and the control container is replaced on
the new image.

The documented `docker compose pull && docker compose up -d` flow remains
valid and is still what the hosted Deploy workflow uses. The UI adds a path
for self-hosted sites — especially forks tracking their own branches — without
SSH access to the VM.

## Why

The control plane already owns the Docker socket and the bind-mounted data
directory, but not a host-side git checkout. Rather than mount the checkout
into the long-lived control container, update work runs in a short-lived
privileged sibling container started from the *currently running* control
image. It mounts the host repo (discovered from the running container's
`com.docker.compose.project.working_dir` label, or set with
`CODERUNNER_UPDATE_REPO_DIR`) and the host data dir at their host paths, then
finishes with the same `docker compose up -d` an operator would run.

That keeps the normal deployment surface small: the control image gains `git`,
a pinned Compose plugin, and a `coderunner update-server` subcommand, but the
normal `serve` process never mounts the repo. The helper is an admin-only,
one-shot container; by the time it finishes, Compose has already replaced the
control container.

## Flow

1. `GET /admin/server-update` inspects the control container and reads OCI
   provenance labels (`org.opencontainers.image.source`, `.revision`,
   `.version`). Local builds through `scripts/image.ts` now add those labels
   too, so branches report a commit. Tags/branches are listed from the GitHub
   API (optionally authenticated with `GITHUB_TOKEN`/`GH_TOKEN`) for the repo
   in the `source` label.
2. `POST /admin/server-update` validates the ref against that list, then writes
   `data/server-update.json` and starts the helper container. The job file is
   in the bind-mounted data dir so the *replacement* control process can report
   the result after the restart.
3. The helper fetches origin, checks out the branch (`git checkout --force -B
   <ref> origin/<ref>`), pulls or builds both images, updates
   `CODERUNNER_TAG`/`CODERUNNER_IMAGE_NS` in the host `.env`, removes managed
   workspace containers and clears their leases, then runs plain
   `docker compose up -d` from the host checkout. Compose recreates the control
   container from the same compose files an operator uses, so there is no
   parallel hand-built container definition to keep in sync.
4. The new control process pins the new workspace image ID. Separate from this
   update, stale workspace containers are recycled lazily on adoption (decision
   046); the explicit `rebuild-workspaces` step here makes the roll immediate
   as requested.

## Security and limits

- Both endpoints are behind `requireAdmin`; starting an update is audited as
  `server.update`. The helper is effectively root-with-Docker-socket, so admin
  access already implies host control — the tab makes that explicit in its
  confirmation dialog.
- Refs come from the GitHub API, and only refs present in that list are
  accepted. The API is cached for 60 seconds and degrades to a read-only tab
  (with an error message) when rate-limited or when the image has no GitHub
  `source` label.
- Self-updates require a Compose-managed checkout with a working_dir label or
  `CODERUNNER_UPDATE_REPO_DIR`. From-source dev/start runs use the process
  working directory instead, and derive their displayed repo, commit, tag,
  and image namespace from that checkout's git remote/HEAD plus the same
  `.env` Bun already loads. That makes the tab show real data in dev without
  any extra setup, but it stays read-only: there is no Compose-managed control
  container to restart. A plain `docker run` deployment has no known host repo
  path and also stays read-only; those sites keep using the CLI flow.
- Demo mode returns a canned, read-only status (sample repo, commit, refs, and
  steps) so the tab can be explored without a deployment. `POST` is rejected
  with 403, and the page explains that no server changes will be made.
- Branch builds use the helper's *starting* image's `coderunner` CLI, so a
  single update cannot depend on code from the branch being deployed. The next
  update runs from the newly built image.
- The helper runs as root so it can write to checkouts such as `/root/coderunner`
  and reach the Docker socket. Files it checks out or edits may therefore be
  root-owned on the host; sites that need strict ownership should use the
  manual flow instead.
- The control image ships a pinned Docker Compose plugin so the helper can run
  `docker compose up -d`. The first upgrade to this version must still be done
  with the CLI flow below, which installs an image that has the plugin; after
  that, browser updates work.
- Compose files are not rewritten beyond the two image env values, so unusual
  custom Compose files may need the manual flow. `--remove-orphans` is
  deliberately not passed: workspace containers are labelled into the Compose
  project and would be removed along with live student workspaces.
