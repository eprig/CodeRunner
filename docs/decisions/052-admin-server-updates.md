# 052 — Admin UI server updates, versioned by the git checkout

## Decision

**Admin → Update** is the primary way to update a self-hosted CodeRunner. An
admin picks a release tag or a branch from one searchable list; a release
checks out its tag and pulls the prebuilt GHCR images, a branch checks out the
branch and builds both images on the server. Compose then recreates the
control container, and student workspaces roll to the new image as they
reconnect (decision 046).

**The deployed version is the git checkout, not `.env`.** Each release commit
pins its own image tag as the `${CODERUNNER_TAG:-…}` default in
`docker-compose.yml` (`bun run release:prepare vX.Y.Z`), and `release.yml`
refuses a tag whose compose file pins anything else. So the manual update is
plain git plus Compose, with no file to edit:

```bash
git fetch --tags && git checkout v2.6.0
docker compose pull && docker compose up -d
```

The UI does exactly this, so the browser and terminal paths cannot drift.

**Legacy mode.** `CODERUNNER_TAG` in `.env` still overrides the checkout. That
covers deployments that followed the old docs, and the GCE VM, whose
`render-env.sh` and Deploy workflow write the line. The updater never *adds*
version lines to `.env`. When the line already exists, it rewrites that one
line in place, so the operator's own `docker compose up -d` (or a GCE reboot)
stays on the deployed version. The tab labels such deployments "Legacy setup"
and explains how to switch. Release tags from before pinning pin `latest`; the
updater still deploys them correctly by exporting `CODERUNNER_TAG` for its own
Compose calls, and its log notes that a later plain `up -d` would run `latest`.

The only `.env` settings the feature reads are both optional:
`CODERUNNER_UPDATE_REPO_DIR` (only when Compose's project dir is not the
checkout) and `GITHUB_TOKEN` (only to raise GitHub's rate limit).

## Why

The control plane already owns the Docker socket and the bind-mounted data
directory, but not the host checkout. Rather than mount the checkout into the
long-lived control container, update work runs in a short-lived privileged
sibling container started from the *currently running* control image. It
mounts the host repo (from the control container's
`com.docker.compose.project.working_dir` label, or
`CODERUNNER_UPDATE_REPO_DIR`) and the host data dir at their host paths. The
helper outlives the control container it replaces, which is what lets it watch
the new one start and roll back.

Versioning by checkout was chosen over two alternatives:

- **A wrapper script that derives the tag from `git describe`.** No release
  process change, but a plain `docker compose up -d` would fall back to
  `latest`, and the script becomes a second entry point to keep in sync.
- **Version stored in the data dir by the control plane.** Makes the UI the
  only safe update path; git commands would no longer describe what runs.

The cost is a release-prep commit per release, enforced by CI.

## Flow

1. `GET /admin/server-update` inspects the control container and reads OCI
   provenance labels (`org.opencontainers.image.source`, `.revision`,
   `.version`); local builds through `scripts/image.ts` add them too. Tags and
   branches come from the GitHub API for the `source` repo, cached per repo for
   five minutes (failures for 30 s; **Check for updates** forces a refresh at
   most every 15 s), because the page polls and anonymous access is 60
   requests/hour. Tags are sorted newest release first. The response also
   carries the running commit's title/author/date, whether `.env` pins the
   version, the last job (including who started it), and how many students
   are active (running workspace containers inside the idle cutoff, plus
   active builds).
2. `GET /admin/server-update/ref?kind=&ref=` describes the selected version:
   its commit, its GitHub release (name, notes, date, prerelease), and a
   compare against the running commit (ahead/behind/diverged with the newest
   commits). It is fetched on selection, not on every poll, and cached.
3. `POST /admin/server-update` refuses with 409 while a job is active,
   validates the ref against the listed refs, writes `data/server-update.json`,
   and starts the helper. The job file sits in the bind-mounted data dir so the
   *replacement* control process can report the result.
4. The helper:
   - checks that the host dir is a git checkout and records HEAD and `.env`;
   - fetches origin and checks out the ref: a tag detached at its commit, or a
     branch with `git checkout --force -B <ref> origin/<ref>` plus `git
     submodule update --init --recursive`, since the control build compiles
     the pinned `vendor/AdvantageScope`;
   - asks Compose which images the checked-out stack runs (`docker compose
     config` with `CODERUNNER_TAG=<tag>`);
   - for a tag, runs `docker compose pull`; for a branch, runs `bun run
     docker:build:*` with those exact image names (tag `branch-<slug>`);
   - updates a legacy `.env` pin if one exists, runs `docker compose up -d`,
     and waits up to 4 minutes for the control container's healthcheck.

   Compose calls use the control container's own
   `com.docker.compose.project`, `.project.config_files`, and `.service`
   labels, so they target the stack the operator started, `-f` flags
   included.
5. Failures:
   - **Before Compose ran** (fetch, pull, or build): only the checkout and
     `.env` are restored, and the job says "The server was not changed".
   - **The new control container is unhealthy:** the helper restores both and
     runs `docker compose up -d` with the previous tag.

   Only after a healthy start does it remove the two image tags it replaced
   (the running control image and `CODE_IMAGE`, passed in by the control
   plane) and run `docker image prune -f`. Other tagged images are left alone.
6. Student workspace containers are not Compose services. They roll lazily
   when the new control process pins the new workspace image ID (decision
   046); the updater does not run `rebuild-workspaces`.

## Security and limits

- Both endpoints are behind `requireAdmin`; starting an update is audited as
  `server.update`, and the job records the admin's email. The helper is
  effectively root with the Docker socket, so admin access already implies
  host control; the confirmation dialog says who will be disconnected.
- Only refs listed by the GitHub API are accepted.
- An active job whose `coderunner-updater-<id>` container no longer exists
  (after a 30-second startup grace) is marked failed on the next status read,
  so a host reboot or `docker kill` cannot lock the tab.
- The helper gets `--security-opt label=disable`, the same SELinux exemption
  as the Compose control service (decision 040).
- Self-updates need a Compose-managed git checkout. From-source dev runs show
  their checkout's git data read-only; a plain `docker run` deployment, or the
  GCE VM (compose files copied, not cloned), keeps its own update tooling.
  Demo mode shows canned, read-only data.
- Branch builds use the helper's *starting* image's updater, so one update
  cannot depend on code from the branch being deployed. A branch checkout's
  compose file still pins the last release. The helper exports the branch tag
  for its own Compose calls, but a later manual `docker compose up -d` returns
  to that release, and the page says so.
- The helper runs as root, so files it checks out may be root-owned on the
  host.
- The control image ships git and a pinned Compose plugin. The first upgrade to
  a version with this tab must be done by hand.
- `--remove-orphans` is deliberately not passed: workspace containers are
  labelled into the Compose project and would be removed.

## UI

The tab shows only what an admin acts on:

- **Running now:** the version (release or branch), the commit title, author,
  and age, and "Update available" or "Up to date".
- **Repository and server checkout:** where versions come from and which
  directory is switched.
- **Last update:** who ran it, when, how long it took, and the result.
- **Choose a version:** one searchable dropdown with Releases and Branches
  sections, labelled Current and Latest. For the selection it shows the
  release notes, what changes relative to what's running (with downgrades
  called out), the deployed commit, and what the update will do and roughly
  how long it takes.
- **Interruptions:** how many students are active and how many builds are
  running.
- **While running:** a spinner with the step, elapsed time, and who started
  it, plus a collapsible command log. A failed poll during the restart shows
  "Reconnecting…" instead of an error, and a Reload prompt appears once the
  server runs a new commit.

Registry namespaces and image names are not shown.

## Alternatives considered

- **Watchtower or a registry-polling sidecar.** Handles tags only, cannot roll
  back on a failed healthcheck, and takes updates out of the admin's hands.
- **A host-side agent (systemd unit or webhook listener).** Survives the
  control container being replaced, but adds a host install step and breaks
  the "everything is `docker compose`" deployment of decision 031.
- **Prebuilt branch images from CI.** Considered and deferred: branches build
  on the server, and only release tags pull prebuilt images.
