# 052 — Admin UI server updates; `:latest` is what the server runs

## Decision

**Admin → Update** is the primary way to update a self-hosted CodeRunner. An
admin picks a release tag or a branch from one searchable list; a release
checks out its tag and pulls the prebuilt GHCR images, a branch checks out the
branch and builds both images on the server. Compose then recreates the
control container, and student workspaces roll to the new image as they
reconnect (decision 046).

**`:latest` means "what this server runs", and `docker compose up -d` deploys
the local images.** The compose files keep their `${CODERUNNER_TAG:-latest}`
default. The updater pulls a release as `…:v2.5.0` (or builds a branch as
`…:branch-dev`), then re-tags those images as `…:latest` and runs
`docker compose up -d`, which recreates any container whose image changed. A
later hand-run `docker compose up -d` therefore redeploys exactly what is
running, and building a branch by hand (`bun run docker:build:*`, which tags
`:latest`) followed by `up -d` deploys it. `docker compose pull` keeps its
usual meaning: fetch the newest published release into `:latest`.

**Legacy mode.** `CODERUNNER_TAG` in `.env` still overrides `latest`. That
covers deployments that followed the old docs, and the GCE VM, whose
`render-env.sh` and Deploy workflow write the line. The updater never *adds*
version lines to `.env`. When the line exists, it rewrites that one line in
place and does not re-tag, so Compose runs the versioned tag directly. The tab
labels such deployments "Legacy setup".

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

A local `:latest` was chosen over two alternatives:

- **Pinning each release's tag as the compose default** (a release-prep commit
  per release, checked by CI). Tried and dropped: on a branch checkout the
  compose file still names the last release, so a hand-run
  `docker compose up -d` silently switched a branch build back to that
  release. Operators expect `up -d` to run what is on the machine.
- **Writing the tag to `.env` on every update.** Works, but makes `.env` (an
  operator-owned secrets file) carry deployment state.

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
   - asks Compose which images the stack runs (`docker compose config`,
     normally `…:latest`) and records their image IDs, using the running
     control container's own image ID (passed by the control plane) for the
     control image;
   - for a tag, `docker pull`s `…:<tag>` for both images; for a branch, runs
     `bun run docker:build:*` as `…:branch-<slug>`;
   - re-tags those images as the names Compose runs (or, in legacy mode,
     rewrites the `.env` line), runs `docker compose up -d`, and waits up to
     4 minutes for the control container's healthcheck.

   Compose calls use the control container's own
   `com.docker.compose.project`, `.project.config_files`, and `.service`
   labels, so they target the stack the operator started, `-f` flags
   included.
5. Failures:
   - **Before Compose ran** (fetch, pull, or build): only the checkout is
     restored, and the job says "The server was not changed".
   - **The new control container is unhealthy:** the helper re-tags the
     previous image IDs (or restores `.env`), restores the checkout, and runs
     `docker compose up -d` again.

   Only after a healthy start does it remove the replaced images' versioned
   tags (e.g. `…:v2.4.0`; never a `:latest`) and run `docker image prune -f`.
   Other tagged images are left alone.
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
  cannot depend on code from the branch being deployed.
- The helper runs as root, so files it checks out may be root-owned on the
  host.
- The control image ships git plus pinned static downloads of the Docker CLI,
  buildx, and Compose (each checked against a SHA-256), not binaries copied out
  of a `docker:*-cli` image, so building it pulls no extra base image. Without
  buildx, `docker build` falls back to the legacy builder: it leaves
  `TARGETARCH` empty, which fails the control Dockerfile, shares no build
  cache, and uploads the whole context. The helper refuses branch builds
  without buildx. The first upgrade to a version with this tab, and the first
  branch build from an image without buildx, must be done by hand or via a
  release.
- Branch and hand builds skip the AdvantageScope compile (the emsdk image plus
  ~30 minutes) whenever an identical build exists. `scripts/ascope-prebuilt.ts`
  hashes the inputs as they are on disk (submodule commit, `patches/`, the two
  build scripts, the `ascope-build` stage text) and looks for
  `.cache/ascope-dist/<key>/`. Failing that, it finds a release (origin, then
  upstream `mathewdunne/CodeRunner`) whose tagged commit has the same key and
  downloads its `ascope-dist.tar.gz`. `scripts/image.ts` passes the match as
  `--build-context ascope-dist=…`, so BuildKit never pulls emsdk. With no match
  it compiles, then saves the result under `.cache/` so a later
  `docker builder prune` doesn't force another compile.
  `CODERUNNER_ASCOPE_PREBUILT=0` always compiles. Uncommitted edits inside the
  submodule always compile. The PathPlanner stage runs on the `oven/bun`
  image the build already uses, instead of a separate `debian` image.

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
- **While running:** who started it, then the elapsed time beside one
  overall progress bar. The bar estimates progress from the step states,
  weighted per release or branch, plus the running step's own signals:
  BuildKit's `[stage n/m]` counter, which image is downloading, or the health
  wait. It never moves backwards, and the raw step text is its tooltip. A
  collapsible command log keeps the detail. A failed poll during the restart shows
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
