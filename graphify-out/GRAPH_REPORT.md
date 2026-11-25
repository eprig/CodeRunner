# Graph Report - CodeRunner  (2026-11-26)

## Corpus Check
- 473 files · ~312,737 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 36 file(s) not represented in the graph (top: (none) 22, .lock 3, .example 2)

## Summary
- 3751 nodes · 7925 edges · 232 communities (201 shown, 31 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 360 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `249ccde7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- classrooms.ts
- WorkspacePage.tsx
- workspace-routes.ts
- src/app.ts
- DriverStation.tsx
- runs.ts
- admin-routes.ts
- imports.ts
- src/index.ts
- helpers.ts
- cn
- storage.ts
- vitest
- website/package.json
- contracts.ts
- scripts
- ref_react
- local-docker-runtime-provider.ts
- fixtures/app.ts
- auth/auth.ts
- WorkspaceId
- LocalDockerRuntimeProvider
- ref_node_path
- ControlsPanel.tsx
- control
- Terms of Service
- extension.ts
- deploy
- gcloud.md
- java-tooling.spec.ts
- Users.tsx
- config.ts
- fixtures/runtime.ts
- logging.ts
- biome.json
- package.json
- HalSimBridge
- utils.ts
- preview.ts
- PreviewPane.tsx
- control/package.json
- websocket.ts
- caddy
- preview-project.ts
- build-ascope-lite.ts
- compilerOptions
- backup.ts
- index.test.ts
- Robot.java
- with
- components.json
- app/types.ts
- self-inspect.ts
- decisions/README.md
- steps
- metrics.ts
- Nt4AutoChooserBridge
- SimPaneSwitcher.tsx
- compilerOptions
- Decisions
- Decisions
- One-time bootstrap
- devDependencies
- nt4-auto.ts
- dependencies
- card.tsx
- 036-vscodium-web-migration.md
- Day-to-Day Operations
- fixtures/types.ts
- Decisions
- Authoring Lesson Modules
- rebuild-workspaces.test.ts
- classroom-admin.test.ts
- Teardown
- Classroom Join Codes — Design
- ControlApp
- auth.test.ts
- gradle-cache-prune.test.ts
- halsim.ts
- Decision 011: V2 Editor Spike — openvscode-server with redhat.java and WPILib
- Decision
- @playwright/test
- name
- compilerOptions
- migrate.ts
- AccountPage.tsx
- V2 Code Container (`coderunner-workspace`)
- FAQ
- with
- Project Preview implementation plan
- ref_bun_sqlite
- fetch-dist.ts
- sim-api.test.ts
- stop-sim.sh
- Decision
- Decisions
- Cloudflare Offline Page
- File Structure
- jobs
- merge
- web/package.json
- theme-provider.tsx
- coderunner-debug/package.json
- Security Model
- 024 — Bound Per-Workspace Container Memory
- 036 — Editor migration: openvscode-server → VSCodium reh-web
- OAuth Credentials
- Troubleshooting
- Configuration Reference
- contracts/package.json
- restore.ts
- verify-ascope.ts
- metadata.ts
- src/runtime.ts
- Decisions
- ReconnectingWsBridge
- SwitchProjectDialog.test.tsx
- useAdminPoll
- Classrooms.tsx
- 049 — User roster and additive sign-in methods
- Local Deployment
- Monitoring
- auth0.test.ts
- Data model
- In-process fake servers
- AllianceToggle.tsx
- Mode
- [[path]].ts
- Decision
- Decision 013: V2 Acceptance Pass
- Decisions
- 006 - Multi-tenancy spike findings
- Test tiers
- Capacity and Sizing
- CLI Reference
- DriverStationPage
- env
- contents
- steps
- Decision
- FakeSocket
- Architecture
- The Workspace Container
- Decision
- Decisions
- Decisions
- Development Servers
- Importing a Team Project
- Grafana Cloud (Optional)
- Interface agreement (must match the pathplanner-web spec verbatim)
- deploy.yml
- extension-reconciliation.test.ts
- FakeWebSocket
- scripts
- AuditLog.tsx
- MemoryStorage
- FakeSocket
- Decision 022: Skip Docker smoke tier and import/backup-restore E2E tests
- 041 — Project Preview (Markdown + generated HTML reports)
- flattenLessonModules
- 005 - Java LSP MVP integration
- Backups
- Startup Gradle cache pruning — design
- ports.ts
- .start
- main.ts
- FakeWebSocket
- write_files
- 016 — Imported project simulation compatibility
- Workspace Image
- CodeRunner
- Using CodeRunner
- steps
- tag
- dependencies
- image.ts
- 043 — Classroom join codes
- preview.test.ts
- control/tsconfig.json
- AdminApp.tsx
- coderunner-debug/tsconfig.json
- Decision
- 032 — Canonical Image Naming
- 035 — Multi-Arch Images and CI/Release/Deploy Workflow Split
- 050 — Account sign-in method management
- Deployment Overview
- How Lessons Work
- deploy-cloudflare
- preflight
- contracts/tsconfig.json
- scripts/tsconfig.json
- Website
- preview-token.ts
- block-devices.ts
- web/tsconfig.json
- sim-scripts.test.ts
- start-sim.sh
- 028 — Demo mode for zero-config local tryout
- 029 — Lessons & Modules
- 040 — SELinux container mounts
- 049 — Prune idle workspace Gradle caches at startup
- 050 — Repo-sourced lesson modules
- 010 - Gradle project cache isolation for sim and LSP
- deploy
- default-deny.test.ts
- Hello, World
- 046 — Recycle workspace containers on an older image
- Quick Start (Installation)
- Task 1: Deploy-files contracts
- verify
- outputs
- tsconfig.json
- Main
- reconcile-extensions.sh
- entrypoint.sh
- sidebars.ts
- @fontsource-variable/geist@^5.2.8
- @frc-coderunner/contracts@workspace:*
- next-themes
- react-icons
- tw-animate-css@^1.4.0
- @vitest/coverage-v8@^4.1.6
- coderunner-debug/README.md
- run-sim.sh
- advantagescope/README.md
- typecheck.ts

## God Nodes (most connected - your core abstractions)
1. `WorkspaceId` - 105 edges
2. `cn()` - 90 edges
3. `createApp()` - 65 edges
4. `AppStorage` - 59 edges
5. `LocalDockerRuntimeProvider` - 54 edges
6. `test` - 47 edges
7. `scripts` - 47 edges
8. `Button()` - 42 edges
9. `loginAs()` - 41 edges
10. `withApp()` - 38 edges

## Surprising Connections (you probably didn't know these)
- `Task 2: Deploy-files handlers and workspace routes` --references--> `seedDeployTree()`  [INFERRED]
  docs/superpowers/plans/2026-08-30-pathplanner-integration.md → apps/control/src/__tests__/deploy-files.test.ts
- `Consequences` --references--> `isOpenFileInsideRoot()`  [INFERRED]
  docs/decisions/041-project-preview.md → apps/control/src/app/assets.ts
- `Student surface` --references--> `sessionResponse()`  [INFERRED]
  docs/superpowers/specs/2026-09-30-classroom-join-codes-design.md → apps/control/src/app/responses.ts
- `Task 5: Full regression gate` --references--> `ControlApp`  [INFERRED]
  docs/superpowers/plans/2026-08-24-vscodium-web-migration.md → apps/control/src/app/types.ts
- `Guest identity` --references--> `slugFromEmail()`  [INFERRED]
  docs/superpowers/specs/2026-09-30-classroom-join-codes-design.md → apps/control/src/auth/auth.ts

## Import Cycles
- 2-file cycle: `apps/control/src/catalog.ts -> apps/control/src/imports.ts -> apps/control/src/catalog.ts`

## Communities (232 total, 31 thin omitted)

### Community 0 - "classrooms.ts"
Cohesion: 0.06
Nodes (62): AdminClassroomContext, ClassroomJoinContext, classroomView(), handleAdminClassroomRoute(), log, AuditActor, AuditEventInput, AuditLogQuery (+54 more)

### Community 1 - "WorkspacePage.tsx"
Cohesion: 0.05
Nodes (54): DemoBanner(), EditorPane(), EditorPaneProps, ScopePane, useAutoChoosers(), EditorReachability, EditorStatus, useEditorReachability() (+46 more)

### Community 2 - "workspace-routes.ts"
Cohesion: 0.08
Nodes (57): collectFiles(), deployFileDeleteResponse(), deployFilesSnapshotResponse(), deployFileWriteResponse(), DeployWorkspace, findDeepestExistingAncestor(), HAS_PROC_SELF_FD, INVALID_PATH_ERROR (+49 more)

### Community 3 - "src/app.ts"
Cohesion: 0.08
Nodes (50): applySecurityHeaders(), AssetManifest, contentTypeFor(), handleUploadAsset(), HAS_PROC_SELF_FD, isInsideDirectory(), isOpenFileInsideRoot(), pathplannerResponse() (+42 more)

### Community 4 - "DriverStation.tsx"
Cohesion: 0.08
Nodes (50): AutoPanel(), AutoPanelProps, EmptyState(), preferredChooser(), TileHeader(), ControlsPanelProps, DriverStation(), DriverStationProps (+42 more)

### Community 5 - "runs.ts"
Cohesion: 0.06
Nodes (35): consumeLines(), defaultRunCommandFactory(), dockerRunScript(), lineLooksReady(), log, randomRunId(), RunCommand, RunCommandContext (+27 more)

### Community 6 - "admin-routes.ts"
Cohesion: 0.09
Nodes (52): AdminRouteContext, forgetLegacyIdentity(), handleAdminRoute(), log, selfEditResponse(), createProjectArchive(), directorySizeBytes(), walk() (+44 more)

### Community 7 - "imports.ts"
Cohesion: 0.07
Nodes (27): BundledCatalogSource, CatalogManifest, CatalogSource, findModuleOrThrow(), IMAGE_CATALOG_DIR, log, parseCatalogRepo(), RemoteCatalogSource (+19 more)

### Community 8 - "src/index.ts"
Cohesion: 0.04
Nodes (54): AdminActionResponse, adminActionResponseSchema, AdminStatusResponse, adminStatusResponseSchema, AdminWorkspaceStatus, adminWorkspaceStatusSchema, authProviderSchema, AuthProvidersResponse (+46 more)

### Community 9 - "helpers.ts"
Cohesion: 0.11
Nodes (30): AuditLogEntry, DEMO_SLUG, DEMO_USER_ID, GithubImportContext, expireRunningStatusCache(), fakeContainerFor(), stopFakeContainer(), adminCookie() (+22 more)

### Community 10 - "cn"
Cohesion: 0.09
Nodes (38): isSimRunMode(), readStoredMode(), RUN_MODES, SimButton(), SimButtonProps, SimControlsBlock(), TONE_CLASSES, LayoutMenu() (+30 more)

### Community 11 - "storage.ts"
Cohesion: 0.06
Nodes (27): retirePreviousSession(), adminStatusResponse(), setAllowlistPath(), Auth, DEMO_EMAIL, DEMO_NAME, getDemoSession(), isAllowedWebSocketOrigin() (+19 more)

### Community 12 - "vitest"
Cohesion: 0.06
Nodes (31): BigButton(), BigButtonProps, EnableDisableRow(), EnableDisableRowProps, TONE_ACTIVE, IDELayout(), IDELayoutProps, PaneButton() (+23 more)

### Community 13 - "website/package.json"
Cohesion: 0.05
Nodes (49): @docusaurus/core, @docusaurus/faster, @docusaurus/module-type-aliases, @docusaurus/preset-classic, @docusaurus/tsconfig, @docusaurus/types, @mdx-js/react, prism-react-renderer (+41 more)

### Community 14 - "contracts.ts"
Cohesion: 0.08
Nodes (39): MODE_CLASSES, MODE_LABELS, ModeColumnProps, CatalogBlock, catalogContainsModule(), countCatalogModules(), folderPathKey(), groupCatalogBlocks() (+31 more)

### Community 15 - "scripts"
Cohesion: 0.04
Nodes (47): scripts, allowlist:add, allowlist:list, allowlist:remove, audit:prune, backup, build, build:ascope (+39 more)

### Community 16 - "ref_react"
Cohesion: 0.07
Nodes (25): react-router@^7.15.0, App(), router, PathPlannerPane, PathPlannerPaneProps, Toaster(), TooltipProvider(), digitsOnly() (+17 more)

### Community 17 - "local-docker-runtime-provider.ts"
Cohesion: 0.13
Nodes (34): parseDockerStatsLine(), parsePercent(), defaultDockerRunner(), dockerError(), dockerPortBindError(), inspectContainer(), inspectContainers(), runDocker() (+26 more)

### Community 18 - "fixtures/app.ts"
Cohesion: 0.18
Nodes (12): makeScriptedRunCommandFactory(), AppOptions, defaultRunCommandFactory, preallocatePort(), test, cookieHeader(), loginAs(), LoginOpts (+4 more)

### Community 19 - "auth/auth.ts"
Cohesion: 0.11
Nodes (35): addAllowlistEntry(), AllowlistData, AllowlistKind, EMPTY, emptyAllowlist(), isEmailAllowed(), isUsernameAllowed(), isValidUsername() (+27 more)

### Community 20 - "WorkspaceId"
Cohesion: 0.10
Nodes (7): runtimeFromLease(), ExecResult, WorkspaceRuntime, WorkspaceRuntimeProvider, MockWorkspaceRuntimeProvider, Future Work (Deferred), WorkspaceId

### Community 21 - "LocalDockerRuntimeProvider"
Cohesion: 0.15
Nodes (4): statusFromLease(), LocalDockerRuntimeProvider, CodeContainerStatus, WorkspaceRow

### Community 22 - "ref_node_path"
Cohesion: 0.06
Nodes (15): MANIFEST, proxyOpts, catalogRoot, repoRoot, repoRoot, targets, dryRun, main() (+7 more)

### Community 23 - "ControlsPanel.tsx"
Cohesion: 0.12
Nodes (30): BINDING_GROUPS, Bumper(), clamp(), ControlsPanel(), DpadArm(), FaceButton(), GamepadVisualizer(), isInteractiveTarget() (+22 more)

### Community 24 - "control"
Cohesion: 0.06
Nodes (34): driver, name, container_name, env_file, environment, group_add, healthcheck, image (+26 more)

### Community 25 - "Terms of Service"
Cohesion: 0.06
Nodes (31): Bundled third-party software, CodeRunner, Lesson content, Licenses, Modifications, What this means for you, Changes to this policy, Children's privacy (+23 more)

### Community 26 - "extension.ts"
Cohesion: 0.11
Nodes (27): claimDebugRun(), DEBUG_SESSION_NAME, DebugMarker, isPortListening(), isPositiveInteger(), isProcessAlive(), parseDebugMarker(), readTextFile() (+19 more)

### Community 27 - "deploy"
Cohesion: 0.06
Nodes (32): runs-on, steps, concurrency, cancel-in-progress, group, environment, needs, permissions (+24 more)

### Community 29 - "java-tooling.spec.ts"
Cohesion: 0.09
Nodes (30): Control plane container privileges, 031 — Containerized Control Plane, Addendum — non-root control container, Consequences, Context, Status, 034 — Demo mode portability on Docker Desktop, Consequences (+22 more)

### Community 30 - "Users.tsx"
Cohesion: 0.12
Nodes (26): AddUserResponse, displayEmail(), EditUserResponse, fetchDomains(), fetchUsers(), generateTemporaryPassword(), UserRow, Users() (+18 more)

### Community 31 - "config.ts"
Cohesion: 0.12
Nodes (25): ControlConfig, ControlConfigInput, defaultContainerUser(), defaultDataDir, defaultHalsimPortRange, defaultSimPortRange, defaultVscodePortRange, DISABLED_DISK_LIMIT_VALUES (+17 more)

### Community 32 - "fixtures/runtime.ts"
Cohesion: 0.12
Nodes (8): Task 5: Mocked E2E — menu sends the right request, AppFixtures, seedRuntimeRunning(), seedWorkspaceProject(), WorkspacePage, Deps, openWorkspace(), pathplannerLoads()

### Community 33 - "logging.ts"
Cohesion: 0.11
Nodes (26): ANSI, colorize(), configureLogging(), createJsonSink(), createSink(), defaultLogFormat(), formatAttrs(), formatAttrValue() (+18 more)

### Community 34 - "biome.json"
Cohesion: 0.07
Nodes (28): source, assist, actions, enabled, css, parser, files, includes (+20 more)

### Community 35 - "package.json"
Cohesion: 0.09
Nodes (28): description, devDependencies, @biomejs/biome@2.4.15, fast-check@^4.8.0, @playwright/test@^1.65.0, @types/bun@^1.3.1, @types/react@^19.2.7, @types/react-dom@^19.2.3 (+20 more)

### Community 36 - "HalSimBridge"
Cohesion: 0.12
Nodes (11): defaultSnapshot(), HalSimBridge, HalSimBridgeUnavailableError, upstreamUrlFor(), Decision 018: Gamepad Input via HALSim WebSocket, Files Touched, Future Work (Deferred), Summary (+3 more)

### Community 37 - "utils.ts"
Cohesion: 0.13
Nodes (21): CodeStatus, CodeStatusPill(), TONES, codeStatusFromRun(), ConsoleLine(), ConsolePanel(), ConsolePanelProps, ConsoleViewport() (+13 more)

### Community 38 - "preview.ts"
Cohesion: 0.13
Nodes (24): ASSET_CONTENT_TYPES, discoverDocuments(), documentCsp(), documentKindFor(), errorDocument(), log, documentShell(), escapeHtml() (+16 more)

### Community 39 - "PreviewPane.tsx"
Cohesion: 0.11
Nodes (18): matchesQuery(), PreviewFrame, PreviewPane(), PreviewPaneProps, PreviewPlaceholder(), PreviewPlaceholderProps, splitPath(), Doc (+10 more)

### Community 40 - "control/package.json"
Cohesion: 0.10
Nodes (24): dependencies, better-auth@^1.6.10, @frc-coderunner/contracts@workspace:*, @logtape/logtape@^2.0.7, markdown-it@^15.0.2, prom-client@^15.1.3, devDependencies, @types/markdown-it@^14.2.0 (+16 more)

### Community 41 - "websocket.ts"
Cohesion: 0.11
Nodes (15): log, WebSocketHandlerContext, upstreamEndpoints(), DEFAULT_PORT, GamepadLease, GamepadLeaseResolver, GamepadMessageOutcome, GamepadSessions (+7 more)

### Community 42 - "caddy"
Cohesion: 0.08
Nodes (24): command, image, networks, restart, volumes, depends_on, image, networks (+16 more)

### Community 43 - "preview-project.ts"
Cohesion: 0.12
Nodes (10): PreviewProjectOptions, RED_PIXEL_PNG, reportClassHtml(), reportCss(), reportIndexHtml(), reportJs(), seedPreviewProject(), write() (+2 more)

### Community 44 - "build-ascope-lite.ts"
Cohesion: 0.14
Nodes (23): applyAdvantageScopePatches(), ascopeRoot, CommandResult, patchDir, patchFiles(), repoRoot, run(), ascopeLiteStatic (+15 more)

### Community 45 - "compilerOptions"
Cohesion: 0.08
Nodes (23): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+15 more)

### Community 46 - "backup.ts"
Cohesion: 0.11
Nodes (21): Alternatives considered, Consequences, Context, Decision 023: Metrics and observability via Prometheus + Grafana Cloud, Status, Alternatives considered, App-side stays vendor-neutral, Consequences (+13 more)

### Community 47 - "index.test.ts"
Cohesion: 0.10
Nodes (22): allianceStationSchema, autoChooserPatchSchema, bridgeConnectionSchema, containerStateSchema, deployFilePathSchema, deployFilesSnapshotResponseSchema, driverStationPatchSchema, dsModeSchema (+14 more)

### Community 48 - "Robot.java"
Cohesion: 0.10
Nodes (5): Robot Starter, Running it, Where the code lives, Robot, RobotContainer

### Community 49 - "with"
Cohesion: 0.09
Nodes (23): with, build-args, build-contexts, bun-version-file, cache-from, cache-to, context, fetch-depth (+15 more)

### Community 50 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 51 - "app/types.ts"
Cohesion: 0.10
Nodes (15): AppSocket, GamepadSocketData, HalSimSocketData, ImportSocketData, LessonLoadSocketData, Nt4SocketData, PROXY_PENDING_LIMIT, RunSocketData (+7 more)

### Community 52 - "self-inspect.ts"
Cohesion: 0.15
Nodes (16): inspectContainerOrThrow(), isContainerRunning(), DEFAULT_NETWORKS, deriveComposeProject(), deriveContainerUser(), deriveHostDataDir(), deriveNetwork(), inspectFailureMessage() (+8 more)

### Community 53 - "decisions/README.md"
Cohesion: 0.10
Nodes (16): 033 — Workspace Disk Read Limit, Alternatives considered, Consequences, Context, Decision, Status, 039 — PathPlanner integration, Consequences (+8 more)

### Community 54 - "steps"
Cohesion: 0.10
Nodes (20): concurrency, cancel-in-progress, group, jobs, verify, name, on, pull_request (+12 more)

### Community 55 - "metrics.ts"
Cohesion: 0.12
Nodes (18): activeWorkspaces, DockerStatsPollerOptions, log, containerCpuPercent, containerMemoryPercent, containerStartBuckets, containerStartDuration, httpBuckets (+10 more)

### Community 56 - "Nt4AutoChooserBridge"
Cohesion: 0.15
Nodes (5): decodeMsgPack(), encodeMsgPack(), Nt4AutoChooserBridge, Nt4AutoChooserUnavailableError, upstreamUrlFor()

### Community 57 - "SimPaneSwitcher.tsx"
Cohesion: 0.20
Nodes (15): asTab(), readStoredTab(), SimPanePanels(), SimPanePanelsProps, SimPaneTab, SimPaneTabs(), SimPaneTabSelector(), SimPaneTabsProps (+7 more)

### Community 58 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+11 more)

### Community 59 - "Decisions"
Cohesion: 0.10
Nodes (19): 001 — Sim container architecture, 1. Missing `WPILibNewCommands.json` vendor dep, 2. Dockerfile `|| true` swallowed gradle build failure, 3. Image size came in at 2.25 GB, not the 1.0–1.4 GB plan estimate, 4. Wrapper-zip warning is cosmetic, Context, Decisions, `eclipse-temurin:17-jdk-jammy` base image (+11 more)

### Community 60 - "Decisions"
Cohesion: 0.10
Nodes (19): 002 — AdvantageScope Lite hosted standalone, 1. `spawnSync(npmCmd, [...], { shell: false })` returns exit `null` on Windows, 2. AS Lite ships a `lite/static/` directory inside the submodule with `index.html` and `popups.css`, 3. Git symlinks under `lite/static/` checked out as 9-byte text files on Windows, 4. AS Lite expects `GET /assets` and `GET /assets/<name>/<file>` server routes, 5. AS submodule's `postinstall` is heavy, 6. AS upstream prints `npm audit` warnings about transitive vulns, AdvantageScope as a git submodule pinned to a release tag (+11 more)

### Community 61 - "One-time bootstrap"
Cohesion: 0.10
Nodes (20): 10. Become the first admin, 1. Create and configure the GCP project, 2. Create the Terraform state bucket, 3. Configure Terraform variables, 4. Apply Terraform, 5. Populate Secret Manager, 6. Add a DNS A record, 7. Reset the VM to render config (+12 more)

### Community 62 - "devDependencies"
Cohesion: 0.11
Nodes (19): devDependencies, jsdom@^29.1.1, @testing-library/jest-dom@^6.9.1, @testing-library/react@^16.3.2, @types/node@^24.12.0, @types/react@^19.2.14, @types/react-dom@^19.2.3, typescript@~5.9.3 (+11 more)

### Community 63 - "nt4-auto.ts"
Cohesion: 0.21
Nodes (16): chooserRoots(), chooserSortKey(), displayKey(), isChooser(), normalizeTopicName(), Nt4AutoChooserBridgeOptions, Nt4AutoEntry, nt4Log (+8 more)

### Community 64 - "dependencies"
Cohesion: 0.11
Nodes (18): dependencies, @base-ui/react@^1.4.1, class-variance-authority@^0.7.1, clsx@^2.1.1, lucide-react@^1.14.0, react@^19.2.4, react-resizable-panels@^4.11.0, shadcn@^4.7.0 (+10 more)

### Community 65 - "card.tsx"
Cohesion: 0.19
Nodes (14): AdminStatus, CapacityEditor(), Dashboard(), fetchStatus(), DiskUsage, fetchWorkspaceData(), formatBytes(), Workspaces() (+6 more)

### Community 66 - "036-vscodium-web-migration.md"
Cohesion: 0.12
Nodes (12): Consequences, Context, Decision, Decision 026: Editor Default Theme, Status, 037 — Workspace cache aliases, extension pins, and trust, 1. Share the primed Gradle distribution with WPILib projects, 2. Prevent gallery resolution from replacing pinned VSIXs (+4 more)

### Community 67 - "Day-to-Day Operations"
Cohesion: 0.11
Nodes (18): Adding a domain, Adding a user, Admin API break-glass, Audit log, Between sessions, Checking and adjusting the cap at runtime, Container concurrency cap, Day-to-Day Operations (+10 more)

### Community 68 - "fixtures/types.ts"
Cohesion: 0.13
Nodes (10): startFakeHalsim(), FakeNt4Handle, FakeNt4Options, startFakeNt4(), startFakeVscode(), AppFixture, FakeHalsimHandle, FakeVscodeHandle (+2 more)

### Community 69 - "Decisions"
Cohesion: 0.12
Nodes (16): 003 — Minimal web shell, 1. Headless preview screenshot hangs when AS Lite iframe is loading, 2. Orphaned Vite child after `TaskStop` on the npm wrapper, 3. `WARNING:StorageManager: settings timeout, using defaults` in the console, 4. AS Lite tab-controls panel was clipped (initial layout), AS Lite via iframe to `http://localhost:8080`, not bundled, Context, Decisions (+8 more)

### Community 70 - "Authoring Lesson Modules"
Cohesion: 0.12
Nodes (17): Authoring Lesson Modules, Example curriculum, Folder fields, Module fields, Organizing modules into folders, `plain-java`, Publishing, Repository layout (+9 more)

### Community 71 - "rebuild-workspaces.test.ts"
Cohesion: 0.18
Nodes (11): clearContainerLeases(), dbPathFromEnv(), DockerCommandResult, DockerRunner, main(), parseContainerNames(), rebuildWorkspaces(), RebuildWorkspacesOptions (+3 more)

### Community 72 - "classroom-admin.test.ts"
Cohesion: 0.19
Nodes (9): ClassroomView, joinGuest(), GuestUser, joinedGuest(), startClassroom(), allCookiesFrom(), classroomJoinRequest(), openRunSocket() (+1 more)

### Community 73 - "Teardown"
Cohesion: 0.12
Nodes (16): Restore in the fall, Seasonal Teardown, Step 1. Point the data disk at your snapshot, Step 1. Take a manual snapshot of the data disk, Step 2. Apply, Step 2. Verify the snapshot is READY before deleting anything, Step 3. Delete the VM (this also deletes the boot disk), Step 3. If you released the static IP (+8 more)

### Community 74 - "Classroom Join Codes — Design"
Cohesion: 0.12
Nodes (15): Admin surface, Agreed requirements, Approach, Classroom Join Codes — Design, Docs, Error handling summary, Guest identity, Join flow (+7 more)

### Community 75 - "ControlApp"
Cohesion: 0.13
Nodes (12): ControlApp, 1. Why not Better Auth `testUtils`, 2. Auth-callback path tests are deferred, 3. Browser-heavy specs use `test.fixme`, not deletion, 4. HTTP-driven specs preferred over DOM-driven specs where possible, 5. Decisions on smaller details, Decision 021: Testing suite implementation — deviations from TESTING-PLAN.md, Files Touched (+4 more)

### Community 76 - "auth.test.ts"
Cohesion: 0.20
Nodes (7): ControlAppOptions, CreateBeforeHook, createAdvantageScopeDist(), createCatalogDir(), createWebDist(), exists(), waitFor()

### Community 77 - "gradle-cache-prune.test.ts"
Cohesion: 0.20
Nodes (12): GradleCachePruneOptions, GradleCachePruneResult, listDirs(), log, pruneIdleGradleCaches(), removePruned(), boot(), gradleDir() (+4 more)

### Community 78 - "halsim.ts"
Cohesion: 0.15
Nodes (12): BridgeEntry, DEFAULT_DRIVER_STATION, DriverStationState, HalSimBridgeOptions, HalSimBridgeSnapshot, HalSimMessage, JoystickWireState, log (+4 more)

### Community 79 - "Decision 011: V2 Editor Spike — openvscode-server with redhat.java and WPILib"
Cohesion: 0.13
Nodes (15): Auto-import on Tab (additionalTextEdits), Container boots and serves (:3000), Ctrl-click into library source (jdt:// URI), Decision 011: V2 Editor Spike — openvscode-server with redhat.java and WPILib, Decisions, Docker Hub vs GitHub Releases, Extensions installed, How to Run (+7 more)

### Community 80 - "Decision"
Cohesion: 0.13
Nodes (14): Browser API behavior, Context, Decision, Decision 015 — HALSim WebSocket Control Protocol, DriverStation message (`type: "DriverStation"`, `device: ""`), Future hooks, Joystick message (`type: "Joystick"`, `device: "<N>"`), Message envelope (+6 more)

### Community 81 - "@playwright/test"
Cohesion: 0.13
Nodes (3): AdminPage, LoginPage, @playwright/test

### Community 82 - "name"
Cohesion: 0.25
Nodes (15): needs, runs-on, steps, steps, build-control-amd64, validate, steps, steps (+7 more)

### Community 83 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, esModuleInterop, exactOptionalPropertyTypes, isolatedModules, lib, module, moduleResolution, noEmit (+6 more)

### Community 84 - "migrate.ts"
Cohesion: 0.26
Nodes (12): config, db, log, AppliedMigrationRow, applyMigrations(), ensureMigrationTable(), listAppliedMigrations(), loadMigrations() (+4 more)

### Community 85 - "AccountPage.tsx"
Cohesion: 0.23
Nodes (13): AccountPage(), changePassword(), disconnectProvider(), linkProvider(), removePassword(), replaceTemporaryPassword(), runAction(), setupPasswordSignIn() (+5 more)

### Community 86 - "V2 Code Container (`coderunner-workspace`)"
Cohesion: 0.14
Nodes (13): Bind mounts, Build, Environment variables, Example run, First-Run Behavior, Image Size, Labels, Published ports (+5 more)

### Community 87 - "FAQ"
Cohesion: 0.14
Nodes (14): Can CodeRunner run offline or without internet?, Can I build, debug, or start a simulation from the WPILib extension?, Can I write my own lessons?, Can students accidentally break each other's work?, Can students push code to GitHub?, Do students need accounts? What if I just want to try it?, FAQ, How much does cloud hosting cost? (+6 more)

### Community 88 - "with"
Cohesion: 0.14
Nodes (14): with, accountId, apiToken, bun-version-file, command, packageManager, password, project_id (+6 more)

### Community 89 - "Project Preview implementation plan"
Cohesion: 0.14
Nodes (13): 1. Prove the report delivery model, 2. Add contracts and read-only delivery, 3. Add Preview UI, 4. Validate the complete workflow, 5. Document and finish, Acceptance criteria, Existing integration points, Goal and agreed UX (+5 more)

### Community 90 - "ref_bun_sqlite"
Cohesion: 0.14
Nodes (9): args, beforeIndex, beforeMs, countResult, db, dryRun, [command, email], db (+1 more)

### Community 91 - "fetch-dist.ts"
Cohesion: 0.29
Nodes (11): DistDownload, downloadAndExtract(), run(), withScratch(), artifacts, downloadUrl(), main(), repoRoot (+3 more)

### Community 92 - "sim-api.test.ts"
Cohesion: 0.24
Nodes (4): RunCommandFactory, announceChooser(), encodeMsgPack(), FakeWebSocket

### Community 93 - "stop-sim.sh"
Cohesion: 0.26
Nodes (11): clear_sim_files(), current_process_group(), is_running_process(), process_state(), process_tree_groups(), process_tree_pids(), send_signal_to_groups(), send_signal_to_pids() (+3 more)

### Community 94 - "Decision"
Cohesion: 0.15
Nodes (12): 100 MB size cap, 6 imports per hour rate limit, Backup before import, Clone inside the container, not the host, Consequences, Context, Decision, Decision 016 — Project Import Strategy (+4 more)

### Community 95 - "Decisions"
Cohesion: 0.15
Nodes (12): 009 - LSP reconnect, bridge serialization, and startup throttling, Context, Decision 1: Browser LSP client auto-reconnects with bounded backoff, Decision 2: Bridge serializes JDT LS spawns, Decision 3: Orchestrator-level LSP startup throttle, Decision 4: Cap proxy pending-message buffers, Decision 5: NT4 subprotocol mismatch is fail-fast, not silent, Decision 6: AS Lite in-iframe timeout banner (+4 more)

### Community 96 - "Cloudflare Offline Page"
Cohesion: 0.15
Nodes (13): 1. Add the origin A record, 2. Verify the Caddyfile has the origin vhost, 3. Bootstrap the Cloudflare Pages project, 4. Set `BACKEND_ORIGIN` as a Pages secret, 5. Add the custom domain in Cloudflare, 6. Add GitHub Actions variables, Cloudflare Offline Page, Disabling Cloudflare mode (+5 more)

### Community 97 - "File Structure"
Cohesion: 0.15
Nodes (13): Background — verified findings, File Structure, Follow-up disposition (closed 2026-08-26), Global Constraints, Out of scope, Task 1: Swap the base image and editor launch, Task 2: Scope `init-frc-setup`'s ownership pass to what it actually creates, Task 3: Build the image and verify the editor serves under the base path (+5 more)

### Community 98 - "jobs"
Cohesion: 0.15
Nodes (12): concurrency, cancel-in-progress, group, env, CONTROL_IMAGE, PATHPLANNER_DIST_TAG, WORKSPACE_IMAGE, jobs (+4 more)

### Community 99 - "merge"
Cohesion: 0.17
Nodes (13): GH_TOKEN, PRERELEASE, TAG, merge, release, env, needs, runs-on (+5 more)

### Community 100 - "web/package.json"
Cohesion: 0.17
Nodes (11): better-auth@^1.6.10, react-dom@^19.2.4, tailwindcss@^4.2.1, better-auth, react-dom, license, name, private (+3 more)

### Community 101 - "theme-provider.tsx"
Cohesion: 0.21
Nodes (10): disableTransitionsTemporarily(), getSystemTheme(), isTheme(), ResolvedTheme, Theme, THEME_VALUES, ThemeProvider(), ThemeProviderContext (+2 more)

### Community 102 - "coderunner-debug/package.json"
Cohesion: 0.17
Nodes (11): activationEvents, description, displayName, engines, vscode, extensionKind, license, main (+3 more)

### Community 103 - "Security Model"
Cohesion: 0.17
Nodes (12): Admin role, Audit log, Authentication, Container isolation, Demo mode, Per-workspace access enforcement, Preview isolation, Roster and domain rules (+4 more)

### Community 104 - "024 — Bound Per-Workspace Container Memory"
Cohesion: 0.17
Nodes (10): 024 — Bound Per-Workspace Container Memory, Consequences, Context, Decision, Status, 025 — Detach the Simulation JVM from Gradle, Consequences, Context (+2 more)

### Community 105 - "036 — Editor migration: openvscode-server → VSCodium reh-web"
Cohesion: 0.17
Nodes (12): 036 — Editor migration: openvscode-server → VSCodium reh-web, 1. VSCodium `reh-web`, not `code-server`, 2. Stay on the LinuxServer base image, 3. The editor keeps container port 3000, 4. Settings and extension paths do not move, 5. Workspace trust: diagnosed, not fixed, Consequences, Context (+4 more)

### Community 106 - "OAuth Credentials"
Cohesion: 0.17
Nodes (12): 1. Add the people and domains that may sign in, 2. Promote the first admin, Bootstrapping the first admin, Manual bootstrap and later changes, OAuth Credentials, Register a GitHub OAuth app, Register a Google OAuth client, Set up Auth0 (+4 more)

### Community 107 - "Troubleshooting"
Cohesion: 0.17
Nodes (12): Build times out, Container won't start, Control plane can't reach the Docker socket (permission denied), Control plane can't write /data (SQLITE_READONLY / read-only data dir), Control plane crashes or becomes unresponsive, Disk full, OAuth login fails, PathPlanner does not load or misses external edits (+4 more)

### Community 108 - "Configuration Reference"
Cohesion: 0.17
Nodes (12): Admin and Metrics, Auth and OAuth, Configuration Reference, Demo mode and the `--demo` flag, How environment is loaded, Idle Management, Lessons Catalog, Logging (+4 more)

### Community 109 - "contracts/package.json"
Cohesion: 0.18
Nodes (11): dependencies, zod@^4.1.13, exports, license, name, private, scripts, typecheck (+3 more)

### Community 110 - "restore.ts"
Cohesion: 0.32
Nodes (11): Args, dirExists(), discoverWorkspaces(), fileExists(), main(), parseArgs(), restoreArchive(), restoreDb() (+3 more)

### Community 111 - "verify-ascope.ts"
Cohesion: 0.26
Nodes (11): ascopeRoot, assert(), createCatalogDir(), distDir, exists(), patchDir, repoRoot, runGit() (+3 more)

### Community 112 - "metadata.ts"
Cohesion: 0.24
Nodes (9): configMountType(), containerAttachedToNetwork(), containerHasPublishedPorts(), isLoopbackHost(), publishedPortFor(), v2LabelsMatch(), workspaceHomePath(), CODE_NAME_PREFIX (+1 more)

### Community 113 - "src/runtime.ts"
Cohesion: 0.20
Nodes (5): ExecOptions, ManagedWorkspaceRuntime, WorkspaceRuntimeCommand, WorkspaceRuntimeExit, ContainerState

### Community 114 - "Decisions"
Cohesion: 0.18
Nodes (10): upgrade(), 004 - Backend wiring for save and run, Context, Custom WebSocket sender, no new dependency, Decisions, Host backend plus Docker CLI, Minimal endpoints and run protocol, One-command dev stack without Docker Compose (+2 more)

### Community 116 - "SwitchProjectDialog.test.tsx"
Cohesion: 0.18
Nodes (8): @testing-library/user-event@^14.6.1, BASE_MODULES, MockEntry, MockModule, { mockModules }, renderDialog(), startSwap, @testing-library/user-event

### Community 117 - "useAdminPoll"
Cohesion: 0.27
Nodes (8): useAdminPoll(), onVisibilityChange(), startPolling(), stopPolling(), ContainerRow, Containers(), fetchContainers(), Task 9: Admin Classrooms tab

### Community 118 - "Classrooms.tsx"
Cohesion: 0.24
Nodes (8): Classroom, ClassroomGuest, Classrooms(), ClassroomsData, DURATIONS, fetchClassrooms(), formatTime(), CardHeader()

### Community 119 - "049 — User roster and additive sign-in methods"
Cohesion: 0.18
Nodes (9): Consequences, Context, Decision, Decision 014 — Better Auth Integration, 049 — User roster and additive sign-in methods, Consequences, Context, Decision (+1 more)

### Community 120 - "Local Deployment"
Cohesion: 0.18
Nodes (11): 1. Choose the new version, 1. Clone and configure, 2. Pull the new images and restart the control plane, 2. Start and verify, 3. Sign in and allow students, 3. Verify the update, Local Deployment, Network safety (+3 more)

### Community 121 - "Monitoring"
Cohesion: 0.18
Nodes (11): Authentication, Capturing a session, Container and system state, Control-plane logs, Grafana Cloud, Health endpoint, Log verbosity, Monitoring (+3 more)

### Community 123 - "Data model"
Cohesion: 0.20
Nodes (8): getSession(), 044 — Auth0 SSO, Decision, Validation, 048 — Auth0 roles from RBAC permissions, Decision, Validation, Data model

### Community 124 - "In-process fake servers"
Cohesion: 0.33
Nodes (8): createPathPlannerDist(), In-process fake servers, connectGamepad(), disconnectGamepad(), installGamepadShim(), setGamepadAxes(), setGamepadButton(), seedRuntimeMissing()

### Community 125 - "AllianceToggle.tsx"
Cohesion: 0.27
Nodes (8): AllianceToggle(), AllianceToggleProps, Side, SIDE_ACTIVE, SIDE_EDGE, SIDE_STATION, sideOf(), AllianceStation

### Community 126 - "Mode"
Cohesion: 0.20
Nodes (6): Constants, Mode, REAL, REPLAY, SIM, Main

### Community 127 - "[[path]].ts"
Cohesion: 0.29
Nodes (7): Env, fetch(), isProxiedPath(), onRequest(), PagesFunctionContext, serviceUnavailable(), TOP_LEVEL_PROXIED

### Community 128 - "Decision"
Cohesion: 0.20
Nodes (9): Base image: `gitpod/openvscode-server:1.105.1`, Consequences, Context, Decision, Decision 012: V2 Code Image — Base Image and Extension Strategy, Direct launch base path handling, Extension cache seeding pattern, Extensions: download at build time (+1 more)

### Community 129 - "Decision 013: V2 Acceptance Pass"
Cohesion: 0.20
Nodes (9): Automated Verification, Comparison with V1, Decision, Decision 013: V2 Acceptance Pass, Host Capacity (10 students), Manual Verification, Measurements, Per-Container Resource Usage (+1 more)

### Community 130 - "Decisions"
Cohesion: 0.20
Nodes (10): 017 — Migrate code container to linuxserver/openvscode-server, Bind mount target changes from /home/frc to /config, Context, Decisions, Layered s6-overlay: additive, not replacement, Migration Notes, Runtime PUID/PGID instead of build-time --user, Sim scripts remain independent of s6 (+2 more)

### Community 131 - "006 - Multi-tenancy spike findings"
Cohesion: 0.20
Nodes (9): 006 - Multi-tenancy spike findings, Context, Follow-up risks deferred to V1, Q1: NT4 routing under multi-tenancy, Q2: Resource cost at N concurrent users, Q3: JDT LS topology - per-user or shared, Q4: Session identity and backend routing, Q5: Container lifecycle latency (+1 more)

### Community 132 - "Test tiers"
Cohesion: 0.20
Nodes (10): `bun run e2e`: Playwright mocked tier, `bun run e2e:security`: security E2E tests, `bun run e2e:workspace-java`: real Java workspace smoke, `bun run test`: control-plane unit and integration tests, `bun run verify`: full CI gate, Debugging helpers, First-time setup, Playwright project names (+2 more)

### Community 133 - "Capacity and Sizing"
Cohesion: 0.20
Nodes (10): Capacity and Sizing, Checking disk usage, Cleaning up, Concurrency cap, Container disk read cap, Container memory cap, Disk growth, Host sizing guidance (+2 more)

### Community 134 - "CLI Reference"
Cohesion: 0.20
Nodes (10): Backup and Restore, Build, CLI Reference, Containerized ops: the `coderunner` CLI, Database, Docker Images and Containers, Docs Site, Quality and Tests (+2 more)

### Community 136 - "env"
Cohesion: 0.22
Nodes (10): env, env, DEPLOY_SA, GCP_PROJECT, GCP_ZONE, GH_TOKEN, TAG, VM_NAME (+2 more)

### Community 137 - "contents"
Cohesion: 0.24
Nodes (10): permissions, needs, permissions, runs-on, permissions, build-control-arm64, permissions, contents (+2 more)

### Community 138 - "steps"
Cohesion: 0.20
Nodes (10): needs, runs-on, steps, strategy, arch, platform, runner, build-workspace (+2 more)

### Community 139 - "Decision"
Cohesion: 0.22
Nodes (9): parseBoolean(), Admin bootstrap: `CODERUNNER_ADMIN_EMAIL`, Bind-mount path translation, `coderunner` — a dispatching CLI, not raw scripts, Decision, docker compose is the run surface, Networking: a shared Docker network, not host ports, One image, built once (+1 more)

### Community 141 - "Architecture"
Cohesion: 0.22
Nodes (9): Architecture, How a Run works, How PathPlanner files flow, How Preview reads documents, How telemetry flows, Persistence and data layout, The single front door, What the control plane does (+1 more)

### Community 142 - "The Workspace Container"
Cohesion: 0.22
Nodes (9): Capacity limit, Classroom-density memory defaults, Container labels, Container ports, First-run behavior, How student data persists, Idle auto-stop, The Workspace Container (+1 more)

### Community 143 - "Decision"
Cohesion: 0.22
Nodes (8): 038 — Java tooling compatibility, extension reconciliation, and real-image smoke, Add a targeted real-container smoke, Consequences, Context, Decision, Keep separate tooling and project JDKs, Pin a compatible Java extension matrix, Reconcile managed extensions on every container start

### Community 144 - "Decisions"
Cohesion: 0.22
Nodes (8): 007 - V1 sim container orchestration, Context, Decisions, Docker labels are adopted back into SQLite, Lazy ensure, visible status, Loopback-only published ports, Runtime cache seed, UID/GID strategy

### Community 145 - "Decisions"
Cohesion: 0.22
Nodes (8): 008 - V1 LSP container and Bun-native bridge, Browser LSP client extended for multi-file projects, Bun-native bridge instead of `vscode-ws-jsonrpc`, `container_leases` lease state split, Context, Decisions, Generic `ContainerOrchestrator`, Mounts mirror the sim image

### Community 146 - "Development Servers"
Cohesion: 0.22
Nodes (9): Code style and CI gates, Control plane: `bun run dev:control`, Database migrations, Demo mode, Development Servers, First-time setup, Repo layout, The two dev servers (+1 more)

### Community 147 - "Importing a Team Project"
Cohesion: 0.22
Nodes (9): Constraints and limits, How to do an import, Importing a Team Project, Pushing and pulling after import, Running an imported project, Switching away discards the workspace, What a team import is for, What the import does (+1 more)

### Community 148 - "Grafana Cloud (Optional)"
Cohesion: 0.22
Nodes (9): Alloy config location, Dashboards, Getting your credentials, Grafana Cloud (Optional), Populating GCP Secret Manager, Prerequisites, Service management, Starter LogQL queries (+1 more)

### Community 149 - "Interface agreement (must match the pathplanner-web spec verbatim)"
Cohesion: 0.22
Nodes (8): Global Constraints, Interface agreement (must match the pathplanner-web spec verbatim), Out of scope (recorded, do not implement), PathPlanner Integration (CodeRunner side) Implementation Plan, Task 4: Metrics route templating, Task 5: Packaging — fetch-dist artifact and control-image stage, Task 6: Web-shell UI components (written + tested, NOT wired), Task 7: Decision log, docs pointer, and final verification

### Community 150 - "deploy.yml"
Cohesion: 0.22
Nodes (8): concurrency, cancel-in-progress, group, env, CONTROL_IMAGE, WORKSPACE_IMAGE, jobs, name

### Community 151 - "extension-reconciliation.test.ts"
Cohesion: 0.25
Nodes (6): ExtensionRecord, fixture(), reconcileScript, record(), repoRoot, temporaryRoots

### Community 153 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, preview, test, test:coverage, test:watch, typecheck

### Community 154 - "AuditLog.tsx"
Cohesion: 0.39
Nodes (7): AuditEntry, AuditLog(), AuditLogResponse, AuditRow(), formatJson(), truncate(), CardTitle()

### Community 157 - "Decision 022: Skip Docker smoke tier and import/backup-restore E2E tests"
Cohesion: 0.25
Nodes (7): Broad Docker smoke tier — not implemented, Consequences, Context, Decision, Decision 022: Skip Docker smoke tier and import/backup-restore E2E tests, Import and backup/restore tests — updated after lessons rework, Status

### Community 158 - "041 — Project Preview (Markdown + generated HTML reports)"
Cohesion: 0.25
Nodes (7): 041 — Project Preview (Markdown + generated HTML reports), Alternatives rejected, Consequences, Context, Decision, Tested compatibility boundary, The blocking constraint we found first

### Community 159 - "flattenLessonModules"
Cohesion: 0.25
Nodes (7): 051 — Nested module folders in the project picker, Consequences, Context, Decision, Ordering, Validation, flattenLessonModules()

### Community 160 - "005 - Java LSP MVP integration"
Cohesion: 0.25
Nodes (7): 005 - Java LSP MVP integration, Context, Decisions, Local WPILib-aware JDT LS image, Package and Vite choices, Plain Monaco client with direct LSP requests, Verification

### Community 161 - "Backups"
Cohesion: 0.25
Nodes (8): Backup options, Backups, Creating a backup, Moving an instance between machines, Recommended cadence, Restore options, Restoring from a backup, What matters

### Community 162 - "Startup Gradle cache pruning — design"
Cohesion: 0.25
Nodes (7): Approaches, Builder's calls (made by Claude, correctable), Decided behaviour, Goals, Non-goals, Startup Gradle cache pruning — design, Why

### Community 163 - "ports.ts"
Cohesion: 0.29
Nodes (3): allocatePortFromRange(), portIsFree(), ContainerRole

### Community 164 - ".start"
Cohesion: 0.29
Nodes (5): Global Constraints, Review Focus, Startup Gradle Cache Pruning Implementation Plan, Task 2: Prune module, Task 3: Wire into boot, docs, decision log

### Community 165 - "main.ts"
Cohesion: 0.29
Nodes (6): configInput, demoFlag, log, port, server, enableDefaultMetrics()

### Community 167 - "write_files"
Cohesion: 0.29
Nodes (6): runcmd, write_files, content, owner, path, permissions

### Community 168 - "016 — Imported project simulation compatibility"
Cohesion: 0.29
Nodes (6): 016 — Imported project simulation compatibility, Context, Decisions, Gradle init script for headless simulation override, Upgrade libstdc++6 via Ubuntu toolchain PPA, Verification

### Community 169 - "Workspace Image"
Cohesion: 0.29
Nodes (7): Building the image locally, Editor acceptance smoke, Image size, Pulling from GHCR, Refreshing running student containers, When to rebuild, Workspace Image

### Community 170 - "CodeRunner"
Cohesion: 0.29
Nodes (7): CodeRunner, How to use CodeRunner, Lessons and team projects, Next steps, Self-hosted and modest to run, Video walkthrough, What students get

### Community 171 - "Using CodeRunner"
Cohesion: 0.29
Nodes (7): Console lessons, Explore more, Get started, PathPlanner, Preview, Robot lessons and imported projects, Using CodeRunner

### Community 172 - "steps"
Cohesion: 0.52
Nodes (7): steps, steps, steps, id, name, run, uses

### Community 173 - "tag"
Cohesion: 0.29
Nodes (7): tag, on, workflow_dispatch, description, required, type, inputs

### Community 174 - "dependencies"
Cohesion: 0.29
Nodes (7): dependencies, fflate@^0.8.3, react@^19.2.1, react-dom@^19.2.1, react, react-dom, fflate

### Community 175 - "image.ts"
Cohesion: 0.29
Nodes (5): [command, kind], dockerfiles, image, Kind, subprocess

### Community 176 - "043 — Classroom join codes"
Cohesion: 0.33
Nodes (5): clientIp(), 043 — Classroom join codes, Alternatives rejected, Constraints, Context

### Community 177 - "preview.test.ts"
Cohesion: 0.40
Nodes (3): workspaceProjectPath(), seedProject(), write()

### Community 178 - "control/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, tsBuildInfoFile, extends, include, ../../tsconfig.base.json

### Community 179 - "AdminApp.tsx"
Cohesion: 0.53
Nodes (4): AdminApp(), AdminLayout(), Tab, tabs

### Community 180 - "coderunner-debug/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, lib, extends, include, ../../../tsconfig.base.json

### Community 181 - "Decision"
Cohesion: 0.33
Nodes (5): 020 - Workspace runtime provider boundary, Consequences, Context, Decision, Status

### Community 182 - "032 — Canonical Image Naming"
Cohesion: 0.33
Nodes (5): 032 — Canonical Image Naming, Consequences, Context, Decision, Status

### Community 183 - "035 — Multi-Arch Images and CI/Release/Deploy Workflow Split"
Cohesion: 0.33
Nodes (5): 035 — Multi-Arch Images and CI/Release/Deploy Workflow Split, Consequences, Context, Decision, Status

### Community 184 - "050 — Account sign-in method management"
Cohesion: 0.33
Nodes (5): 050 — Account sign-in method management, Consequences, Context, Decision, Validation

### Community 185 - "Deployment Overview"
Cohesion: 0.33
Nodes (6): Choose a deployment route, Cloudflare Offline Page (advanced, optional), Deployment Overview, Google Cloud Deployment (advanced), Local Deployment (recommended), What both need

### Community 186 - "How Lessons Work"
Cohesion: 0.33
Nodes (6): Bundled catalog (default, zero-config), How Lessons Work, Remote catalog (your own lessons repo), The two bundled demo modules, Two catalog sources, one menu, What happens when a student loads a lesson

### Community 187 - "deploy-cloudflare"
Cohesion: 0.33
Nodes (6): if, needs, permissions, runs-on, deploy-cloudflare, contents

### Community 188 - "preflight"
Cohesion: 0.33
Nodes (6): preflight, tag, packages, outputs, permissions, runs-on

### Community 189 - "contracts/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, tsBuildInfoFile, extends, include, ../../tsconfig.base.json

### Community 190 - "scripts/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, tsBuildInfoFile, extends, include, ../tsconfig.base.json

### Community 191 - "Website"
Cohesion: 0.33
Nodes (5): Build, Deployment, Installation, Local Development, Website

### Community 192 - "preview-token.ts"
Cohesion: 0.60
Nodes (4): mintPreviewToken(), PREVIEW_TOKEN_TTL_SECONDS, sign(), verifyPreviewToken()

### Community 193 - "block-devices.ts"
Cohesion: 0.50
Nodes (3): ListBlockDevicesOptions, listWorkspaceDiskLimitDevices(), log

### Community 194 - "web/tsconfig.json"
Cohesion: 0.40
Nodes (4): compilerOptions, paths, files, references

### Community 196 - "start-sim.sh"
Cohesion: 0.40
Nodes (4): HALSIMWS_HOST, HALSIMWS_PORT, start-sim.sh script, SIM_PROJECT_ROOT

### Community 197 - "028 — Demo mode for zero-config local tryout"
Cohesion: 0.40
Nodes (4): 028 — Demo mode for zero-config local tryout, Constraints, Context, Why synthetic over real sessions

### Community 198 - "029 — Lessons & Modules"
Cohesion: 0.40
Nodes (4): 029 — Lessons & Modules, Consequences, Context, Implementation decisions

### Community 199 - "040 — SELinux container mounts"
Cohesion: 0.40
Nodes (4): 040 — SELinux container mounts, Consequences, Context, Decision

### Community 200 - "049 — Prune idle workspace Gradle caches at startup"
Cohesion: 0.40
Nodes (4): 049 — Prune idle workspace Gradle caches at startup, Context, Decision, Not done

### Community 201 - "050 — Repo-sourced lesson modules"
Cohesion: 0.40
Nodes (4): 050 — Repo-sourced lesson modules, Consequences, Context, Decision

### Community 202 - "010 - Gradle project cache isolation for sim and LSP"
Cohesion: 0.40
Nodes (4): 010 - Gradle project cache isolation for sim and LSP, Context, Decisions, Implications

### Community 203 - "deploy"
Cohesion: 0.40
Nodes (5): needs, permissions, runs-on, deploy, id-token

### Community 205 - "Hello, World"
Cohesion: 0.50
Nodes (3): Hello, World, Running it, Try stuff

### Community 207 - "046 — Recycle workspace containers on an older image"
Cohesion: 0.50
Nodes (3): 046 — Recycle workspace containers on an older image, Consequences, Decision

### Community 208 - "Quick Start (Installation)"
Cohesion: 0.50
Nodes (4): Deploy for a team, Prerequisites, Quick Start (Installation), Start CodeRunner

### Community 209 - "Task 1: Deploy-files contracts"
Cohesion: 0.50
Nodes (4): Task 1: Deploy-files contracts, DeployFile, DeployFilesSnapshotResponse, DeployFilesWriteResponse

### Community 210 - "verify"
Cohesion: 0.50
Nodes (4): verify, needs, permissions, runs-on

### Community 211 - "outputs"
Cohesion: 0.50
Nodes (4): prerelease, tag, tag_sha, outputs

### Community 212 - "tsconfig.json"
Cohesion: 0.50
Nodes (3): extends, include, ./tsconfig.base.json

## Knowledge Gaps
- **15 isolated node(s):** `RFC-7230`, `RFC-1918`, `RFC-7230`, `RFC-9110`, `../../tsconfig.base.json` (+10 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1649 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Configuration Reference` connect `Configuration Reference` to `gcloud.md`, `java-tooling.spec.ts`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Are the 15 inferred relationships involving `createApp()` (e.g. with `fetch()` and `stopWorkspace()`) actually correct?**
  _`createApp()` has 15 INFERRED edges - model-reasoned connections that need verification._
- **What connects `RFC-7230`, `RFC-1918`, `RFC-7230` to the rest of the system?**
  _15 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `classrooms.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05661005661005661 - nodes in this community are weakly interconnected._
- **Why does `ControlConfig` connect `config.ts` to `src/app.ts`, `admin-routes.ts`, `imports.ts`, `storage.ts`, `Configuration Reference`, `auth/auth.ts`, `ref_node_path`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Should `WorkspacePage.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.04972972972972973 - nodes in this community are weakly interconnected._
- **Why does `Notes on .env.example vs config.ts` connect `Configuration Reference` to `config.ts`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._