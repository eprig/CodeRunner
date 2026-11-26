# Graph Report - CodeRunner  (2026-11-26)

## Corpus Check
- 473 files · ~312,849 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 36 file(s) not represented in the graph (top: (none) 22, .lock 3, .example 2)

## Summary
- 3751 nodes · 7929 edges · 244 communities (208 shown, 36 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 360 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `972b7cc6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- src/index.ts
- classrooms.ts
- admin-routes.ts
- workspace-routes.ts
- helpers.ts
- src/app.ts
- preview.ts
- Button
- website/package.json
- ref_react
- scripts
- WorkspacePage.tsx
- storage.ts
- local-docker-runtime-provider.ts
- fixtures/app.ts
- SimControlsBlock.tsx
- auth/auth.ts
- WorkspaceId
- App.tsx
- LocalDockerRuntimeProvider
- nt4-auto.ts
- control
- cn
- Terms of Service
- extension.ts
- deploy
- AccountPage.tsx
- IDELayout.tsx
- fixtures/runtime.ts
- Classroom Join Codes — Design
- logging.ts
- contracts.ts
- biome.json
- gcloud.md
- package.json
- ControlsPanel.tsx
- vitest
- config.ts
- SwitchProjectDialog.tsx
- PreviewPane.tsx
- ref_node_path
- app/types.ts
- catalog.ts
- caddy
- java-tooling.spec.ts
- preview-project.ts
- build-ascope-lite.ts
- compilerOptions
- backup.ts
- extension-reconciliation.test.ts
- Robot.java
- with
- middleware.ts
- components.json
- self-inspect.ts
- HalSimBridge
- SimPaneSwitcher.tsx
- steps
- compilerOptions
- Decisions
- Decisions
- One-time bootstrap
- metrics.ts
- RunManager
- devDependencies
- utils.ts
- Importing a Team Project
- halsim.ts
- dependencies
- Day-to-Day Operations
- fixtures/types.ts
- Decisions
- Authoring Lesson Modules
- rebuild-workspaces.test.ts
- imports.ts
- decisions/README.md
- Teardown
- ControlApp
- gamepad.ts
- gradle-cache-prune.test.ts
- ImportManager
- runs.ts
- classroom-admin.test.ts
- useGamepad.ts
- Decision
- @playwright/test
- name
- compilerOptions
- migrate.ts
- V2 Code Container (`coderunner-workspace`)
- Configuration Reference
- FAQ
- with
- Project Preview implementation plan
- ref_bun_sqlite
- sim-api.test.ts
- stop-sim.sh
- Security Model
- Decision
- Decisions
- Cloudflare Offline Page
- jobs
- merge
- File Structure
- web/package.json
- theme-provider.tsx
- useGamepadChannel.ts
- useProjectSwap.ts
- coderunner-debug/package.json
- 024 — Bound Per-Workspace Container Memory
- 036 — Editor migration: openvscode-server → VSCodium reh-web
- OAuth Credentials
- Troubleshooting
- contracts/package.json
- restore.ts
- verify-ascope.ts
- metadata.ts
- src/runtime.ts
- gamepad.test.ts
- Decisions
- ReconnectingWsBridge
- LoginPage.tsx
- 052 — User roster and additive sign-in methods
- Local Deployment
- Monitoring
- main.ts
- auth0.test.ts
- Data model
- In-process fake servers
- AllianceToggle.tsx
- Mode
- [[path]].ts
- Decision 011: V2 Editor Spike — openvscode-server with redhat.java and WPILib
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
- useEditorReachability.ts
- FakeSocket
- Architecture
- The Workspace Container
- 030 — Control-Plane Hardening Pass
- Decision
- Decisions
- Decisions
- Development Servers
- Grafana Cloud (Optional)
- deploy.yml
- FakeWebSocket
- scripts
- FakeSocket
- Decision 018: Gamepad Input via HALSim WebSocket
- Decision 022: Skip Docker smoke tier and import/backup-restore E2E tests
- 037 — Workspace cache aliases, extension pins, and trust
- 041 — Project Preview (Markdown + generated HTML reports)
- flattenLessonModules
- 005 - Java LSP MVP integration
- File Structure
- Startup Gradle cache pruning — design
- ports.ts
- .start
- write_files
- 016 — Imported project simulation compatibility
- Workspace Image
- CodeRunner
- Using CodeRunner
- steps
- tag
- dependencies
- image.ts
- preview.test.ts
- control/tsconfig.json
- ModeColumn.tsx
- coderunner-debug/tsconfig.json
- Decision
- 032 — Canonical Image Naming
- 033 — Workspace Disk Read Limit
- 035 — Multi-Arch Images and CI/Release/Deploy Workflow Split
- Deployment Overview
- How Lessons Work
- deploy-cloudflare
- preflight
- contracts/tsconfig.json
- scripts/tsconfig.json
- Website
- block-devices.ts
- RateLimitError
- web/tsconfig.json
- sim-scripts.test.ts
- start-sim.sh
- Spike Results
- Decision 026: Editor Default Theme
- 028 — Demo mode for zero-config local tryout
- 029 — Lessons & Modules
- 039 — PathPlanner integration
- 040 — SELinux container mounts
- 049 — Prune idle workspace Gradle caches at startup
- 050 — Repo-sourced lesson modules
- 010 - Gradle project cache isolation for sim and LSP
- VSCodium-web Editor Migration Implementation Plan
- deploy
- CodeRunner
- capacity.test.ts
- default-deny.test.ts
- Hello, World
- 045 — Sim debugging and run modes
- 046 — Recycle workspace containers on an older image
- Quick Start (Installation)
- verify
- outputs
- release-workflow.test.ts
- tsconfig.json
- auth-demo.test.ts
- RunServerMessage
- slug.property.test.ts
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

## Communities (244 total, 36 thin omitted)

### Community 0 - "src/index.ts"
Cohesion: 0.03
Nodes (75): Task 1: Deploy-files contracts, AdminActionResponse, adminActionResponseSchema, AdminStatusResponse, adminStatusResponseSchema, AdminWorkspaceStatus, adminWorkspaceStatusSchema, allianceStationSchema (+67 more)

### Community 1 - "classrooms.ts"
Cohesion: 0.06
Nodes (54): AdminClassroomContext, ClassroomJoinContext, classroomView(), log, AuditActor, AuditEventInput, AuditLogQuery, AuthCallbacks (+46 more)

### Community 2 - "admin-routes.ts"
Cohesion: 0.08
Nodes (58): AdminRouteContext, forgetLegacyIdentity(), handleAdminRoute(), log, selfEditResponse(), createProjectArchive(), directorySizeBytes(), walk() (+50 more)

### Community 3 - "workspace-routes.ts"
Cohesion: 0.09
Nodes (54): collectFiles(), deployFileDeleteResponse(), deployFilesSnapshotResponse(), deployFileWriteResponse(), DeployWorkspace, findDeepestExistingAncestor(), HAS_PROC_SELF_FD, INVALID_PATH_ERROR (+46 more)

### Community 4 - "helpers.ts"
Cohesion: 0.11
Nodes (29): ControlAppOptions, AuditLogEntry, GithubImportContext, CreateBeforeHook, adminCookie(), seedDeployTree(), cookieFrom(), createAdvantageScopeDist() (+21 more)

### Community 5 - "src/app.ts"
Cohesion: 0.08
Nodes (46): applySecurityHeaders(), AssetManifest, contentTypeFor(), handleUploadAsset(), HAS_PROC_SELF_FD, isInsideDirectory(), isOpenFileInsideRoot(), pathplannerResponse() (+38 more)

### Community 6 - "preview.ts"
Cohesion: 0.05
Nodes (52): dependencies, better-auth@^1.6.10, @frc-coderunner/contracts@workspace:*, @logtape/logtape@^2.0.7, markdown-it@^15.0.2, prom-client@^15.1.3, devDependencies, @types/markdown-it@^14.2.0 (+44 more)

### Community 7 - "Button"
Cohesion: 0.09
Nodes (43): AdminApp(), AdminLayout(), Tab, tabs, useAdminPoll(), onVisibilityChange(), startPolling(), stopPolling() (+35 more)

### Community 8 - "website/package.json"
Cohesion: 0.05
Nodes (49): @docusaurus/core, @docusaurus/faster, @docusaurus/module-type-aliases, @docusaurus/preset-classic, @docusaurus/tsconfig, @docusaurus/types, @mdx-js/react, prism-react-renderer (+41 more)

### Community 9 - "ref_react"
Cohesion: 0.10
Nodes (39): ControlsPanelProps, VisualizerProps, DriverStation(), DriverStationProps, shouldIgnoreKeyboardTarget(), SimControlsBlockProps, commsToneFromConnections(), JoystickStatus (+31 more)

### Community 10 - "scripts"
Cohesion: 0.04
Nodes (47): scripts, allowlist:add, allowlist:list, allowlist:remove, audit:prune, backup, build, build:ascope (+39 more)

### Community 11 - "WorkspacePage.tsx"
Cohesion: 0.08
Nodes (33): DemoBanner(), EditorPane(), PathPlannerPane, PathPlannerPaneProps, ScopePane, useRunChannel(), ScopeStatus, useScopeHandshake() (+25 more)

### Community 12 - "storage.ts"
Cohesion: 0.08
Nodes (20): retirePreviousSession(), loadAllowlist(), Auth, IdleManager, IdleManagerOptions, log, AppStorage, ensureWorkspaceFiles() (+12 more)

### Community 13 - "local-docker-runtime-provider.ts"
Cohesion: 0.13
Nodes (34): parseDockerStatsLine(), parsePercent(), defaultDockerRunner(), dockerError(), dockerPortBindError(), inspectContainer(), inspectContainers(), runDocker() (+26 more)

### Community 14 - "fixtures/app.ts"
Cohesion: 0.18
Nodes (12): makeScriptedRunCommandFactory(), AppOptions, defaultRunCommandFactory, preallocatePort(), test, cookieHeader(), loginAs(), LoginOpts (+4 more)

### Community 15 - "SimControlsBlock.tsx"
Cohesion: 0.11
Nodes (31): isSimRunMode(), readStoredMode(), RUN_MODES, SimButton(), SimControlsBlock(), TONE_CLASSES, LayoutMenu(), Topbar() (+23 more)

### Community 16 - "auth/auth.ts"
Cohesion: 0.11
Nodes (34): addAllowlistEntry(), AllowlistData, AllowlistKind, EMPTY, emptyAllowlist(), isEmailAllowed(), isSyntheticEmail(), isUsernameAllowed() (+26 more)

### Community 17 - "WorkspaceId"
Cohesion: 0.10
Nodes (7): runtimeFromLease(), ExecResult, WorkspaceRuntime, WorkspaceRuntimeProvider, MockWorkspaceRuntimeProvider, Future Work (Deferred), WorkspaceId

### Community 18 - "App.tsx"
Cohesion: 0.08
Nodes (22): react-router@^7.15.0, App(), router, IconRail(), IconRailButton(), IconRailButtonProps, IconRailProps, RailTab (+14 more)

### Community 19 - "LocalDockerRuntimeProvider"
Cohesion: 0.15
Nodes (4): statusFromLease(), LocalDockerRuntimeProvider, CodeContainerStatus, WorkspaceRow

### Community 20 - "nt4-auto.ts"
Cohesion: 0.11
Nodes (20): chooserRoots(), chooserSortKey(), decodeMsgPack(), displayKey(), encodeMsgPack(), isChooser(), normalizeTopicName(), Nt4AutoChooserBridge (+12 more)

### Community 21 - "control"
Cohesion: 0.06
Nodes (34): driver, name, container_name, env_file, environment, group_add, healthcheck, image (+26 more)

### Community 22 - "cn"
Cohesion: 0.12
Nodes (28): AddUserResponse, displayEmail(), EditUserResponse, fetchDomains(), fetchUsers(), generateTemporaryPassword(), UserRow, Users() (+20 more)

### Community 23 - "Terms of Service"
Cohesion: 0.06
Nodes (31): Bundled third-party software, CodeRunner, Lesson content, Licenses, Modifications, What this means for you, Changes to this policy, Children's privacy (+23 more)

### Community 24 - "extension.ts"
Cohesion: 0.11
Nodes (27): claimDebugRun(), DEBUG_SESSION_NAME, DebugMarker, isPortListening(), isPositiveInteger(), isProcessAlive(), parseDebugMarker(), readTextFile() (+19 more)

### Community 25 - "deploy"
Cohesion: 0.06
Nodes (32): runs-on, steps, concurrency, cancel-in-progress, group, environment, needs, permissions (+24 more)

### Community 26 - "AccountPage.tsx"
Cohesion: 0.09
Nodes (24): @testing-library/user-event@^14.6.1, BASE_MODULES, MockEntry, MockModule, { mockModules }, renderDialog(), startSwap, guest (+16 more)

### Community 27 - "IDELayout.tsx"
Cohesion: 0.09
Nodes (17): IDELayout(), IDELayoutProps, PaneButton(), FakeResizeObserver, useSplit(), read(), ResizableHandle(), ResizablePanel() (+9 more)

### Community 28 - "fixtures/runtime.ts"
Cohesion: 0.12
Nodes (8): Task 5: Mocked E2E — menu sends the right request, AppFixtures, seedRuntimeRunning(), seedWorkspaceProject(), WorkspacePage, Deps, openWorkspace(), pathplannerLoads()

### Community 29 - "Classroom Join Codes — Design"
Cohesion: 0.07
Nodes (23): clientIp(), ClassroomSweeper, sweeperFor(), 043 — Classroom join codes, Alternatives rejected, Constraints, Context, Decision (+15 more)

### Community 30 - "logging.ts"
Cohesion: 0.11
Nodes (26): ANSI, colorize(), configureLogging(), createJsonSink(), createSink(), defaultLogFormat(), formatAttrs(), formatAttrValue() (+18 more)

### Community 31 - "contracts.ts"
Cohesion: 0.12
Nodes (24): AutoPanel(), AutoPanelProps, EmptyState(), preferredChooser(), TileHeader(), readError(), VALID_RESPONSE, useAutoChoosers() (+16 more)

### Community 32 - "biome.json"
Cohesion: 0.07
Nodes (28): source, assist, actions, enabled, css, parser, files, includes (+20 more)

### Community 34 - "package.json"
Cohesion: 0.09
Nodes (28): description, devDependencies, @biomejs/biome@2.4.15, fast-check@^4.8.0, @playwright/test@^1.65.0, @types/bun@^1.3.1, @types/react@^19.2.7, @types/react-dom@^19.2.3 (+20 more)

### Community 35 - "ControlsPanel.tsx"
Cohesion: 0.15
Nodes (25): BINDING_GROUPS, Bumper(), clamp(), ControlsPanel(), DpadArm(), FaceButton(), GamepadVisualizer(), isInteractiveTarget() (+17 more)

### Community 36 - "vitest"
Cohesion: 0.10
Nodes (18): BigButton(), BigButtonProps, EnableDisableRow(), EnableDisableRowProps, TONE_ACTIVE, SimButtonProps, VALID_STATUS, useContainerStatus() (+10 more)

### Community 37 - "config.ts"
Cohesion: 0.13
Nodes (22): ControlConfig, ControlConfigInput, defaultContainerUser(), defaultDataDir, defaultHalsimPortRange, defaultSimPortRange, defaultVscodePortRange, DISABLED_DISK_LIMIT_VALUES (+14 more)

### Community 38 - "SwitchProjectDialog.tsx"
Cohesion: 0.15
Nodes (21): CatalogBlock, catalogContainsModule(), countCatalogModules(), folderPathKey(), groupCatalogBlocks(), CatalogTree(), CatalogTreeProps, KindTag() (+13 more)

### Community 39 - "PreviewPane.tsx"
Cohesion: 0.12
Nodes (17): matchesQuery(), PreviewFrame, PreviewPane(), PreviewPaneProps, PreviewPlaceholder(), PreviewPlaceholderProps, splitPath(), Doc (+9 more)

### Community 40 - "ref_node_path"
Cohesion: 0.13
Nodes (14): proxyOpts, repoRoot, targets, DistDownload, downloadAndExtract(), run(), withScratch(), artifacts (+6 more)

### Community 41 - "app/types.ts"
Cohesion: 0.10
Nodes (17): AppSocket, GamepadSocketData, HalSimSocketData, ImportSocketData, LessonLoadSocketData, Nt4SocketData, PROXY_PENDING_LIMIT, RunSocketData (+9 more)

### Community 42 - "catalog.ts"
Cohesion: 0.12
Nodes (10): BundledCatalogSource, CatalogManifest, CatalogSource, findModuleOrThrow(), IMAGE_CATALOG_DIR, log, parseCatalogRepo(), RemoteCatalogSource (+2 more)

### Community 43 - "caddy"
Cohesion: 0.08
Nodes (24): command, image, networks, restart, volumes, depends_on, image, networks (+16 more)

### Community 44 - "java-tooling.spec.ts"
Cohesion: 0.13
Nodes (22): 031 — Containerized Control Plane, Addendum — non-root control container, Consequences, Context, Status, 034 — Demo mode portability on Docker Desktop, Consequences, Context (+14 more)

### Community 45 - "preview-project.ts"
Cohesion: 0.12
Nodes (10): PreviewProjectOptions, RED_PIXEL_PNG, reportClassHtml(), reportCss(), reportIndexHtml(), reportJs(), seedPreviewProject(), write() (+2 more)

### Community 46 - "build-ascope-lite.ts"
Cohesion: 0.14
Nodes (23): applyAdvantageScopePatches(), ascopeRoot, CommandResult, patchDir, patchFiles(), repoRoot, run(), ascopeLiteStatic (+15 more)

### Community 47 - "compilerOptions"
Cohesion: 0.08
Nodes (23): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+15 more)

### Community 48 - "backup.ts"
Cohesion: 0.11
Nodes (21): Alternatives considered, Consequences, Context, Decision 023: Metrics and observability via Prometheus + Grafana Cloud, Status, Alternatives considered, App-side stays vendor-neutral, Consequences (+13 more)

### Community 49 - "extension-reconciliation.test.ts"
Cohesion: 0.09
Nodes (16): catalogRoot, repoRoot, dryRun, main(), _repoRoot, run(), dockerfile, initScript (+8 more)

### Community 50 - "Robot.java"
Cohesion: 0.10
Nodes (5): Robot Starter, Running it, Where the code lives, Robot, RobotContainer

### Community 51 - "with"
Cohesion: 0.09
Nodes (23): with, build-args, build-contexts, bun-version-file, cache-from, cache-to, context, fetch-depth (+15 more)

### Community 52 - "middleware.ts"
Cohesion: 0.12
Nodes (19): DEMO_EMAIL, DEMO_NAME, getDemoSession(), isAllowedWebSocketOrigin(), isLoopbackHost(), log, normalizeHost(), requireSession() (+11 more)

### Community 53 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 54 - "self-inspect.ts"
Cohesion: 0.15
Nodes (16): inspectContainerOrThrow(), isContainerRunning(), DEFAULT_NETWORKS, deriveComposeProject(), deriveContainerUser(), deriveHostDataDir(), deriveNetwork(), inspectFailureMessage() (+8 more)

### Community 55 - "HalSimBridge"
Cohesion: 0.18
Nodes (5): defaultSnapshot(), HalSimBridge, HalSimBridgeUnavailableError, upstreamUrlFor(), Files Touched

### Community 56 - "SimPaneSwitcher.tsx"
Cohesion: 0.19
Nodes (16): asTab(), readStoredTab(), SimPanePanels(), SimPanePanelsProps, SimPaneTab, SimPaneTabs(), SimPaneTabSelector(), SimPaneTabsProps (+8 more)

### Community 57 - "steps"
Cohesion: 0.10
Nodes (20): concurrency, cancel-in-progress, group, jobs, verify, name, on, pull_request (+12 more)

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

### Community 62 - "metrics.ts"
Cohesion: 0.12
Nodes (17): activeWorkspaces, DockerStatsPollerOptions, log, containerCpuPercent, containerMemoryPercent, containerStartBuckets, containerStartDuration, httpBuckets (+9 more)

### Community 64 - "devDependencies"
Cohesion: 0.11
Nodes (19): devDependencies, jsdom@^29.1.1, @testing-library/jest-dom@^6.9.1, @testing-library/react@^16.3.2, @types/node@^24.12.0, @types/react@^19.2.14, @types/react-dom@^19.2.3, typescript@~5.9.3 (+11 more)

### Community 65 - "utils.ts"
Cohesion: 0.18
Nodes (13): CodeStatus, CodeStatusPill(), TONES, codeStatusFromRun(), ConsoleLine(), ConsolePanel(), ConsolePanelProps, ConsoleViewport() (+5 more)

### Community 66 - "Importing a Team Project"
Cohesion: 0.11
Nodes (17): Constraints and limits, How to do an import, Importing a Team Project, Pushing and pulling after import, Running an imported project, Switching away discards the workspace, What a team import is for, What the import does (+9 more)

### Community 67 - "halsim.ts"
Cohesion: 0.13
Nodes (14): BridgeEntry, DEFAULT_DRIVER_STATION, DriverStationState, HalSimBridgeOptions, HalSimBridgeSnapshot, HalSimMessage, HalSimWebSocketFactory, JoystickWireState (+6 more)

### Community 68 - "dependencies"
Cohesion: 0.11
Nodes (18): dependencies, @base-ui/react@^1.4.1, class-variance-authority@^0.7.1, clsx@^2.1.1, lucide-react@^1.14.0, react@^19.2.4, react-resizable-panels@^4.11.0, shadcn@^4.7.0 (+10 more)

### Community 69 - "Day-to-Day Operations"
Cohesion: 0.11
Nodes (18): Adding a domain, Adding a user, Admin API break-glass, Audit log, Between sessions, Checking and adjusting the cap at runtime, Container concurrency cap, Day-to-Day Operations (+10 more)

### Community 70 - "fixtures/types.ts"
Cohesion: 0.13
Nodes (10): startFakeHalsim(), FakeNt4Handle, FakeNt4Options, startFakeNt4(), startFakeVscode(), AppFixture, FakeHalsimHandle, FakeVscodeHandle (+2 more)

### Community 71 - "Decisions"
Cohesion: 0.12
Nodes (16): 003 — Minimal web shell, 1. Headless preview screenshot hangs when AS Lite iframe is loading, 2. Orphaned Vite child after `TaskStop` on the npm wrapper, 3. `WARNING:StorageManager: settings timeout, using defaults` in the console, 4. AS Lite tab-controls panel was clipped (initial layout), AS Lite via iframe to `http://localhost:8080`, not bundled, Context, Decisions (+8 more)

### Community 72 - "Authoring Lesson Modules"
Cohesion: 0.12
Nodes (17): Authoring Lesson Modules, Example curriculum, Folder fields, Module fields, Organizing modules into folders, `plain-java`, Publishing, Repository layout (+9 more)

### Community 73 - "rebuild-workspaces.test.ts"
Cohesion: 0.18
Nodes (11): clearContainerLeases(), dbPathFromEnv(), DockerCommandResult, DockerRunner, main(), parseContainerNames(), rebuildWorkspaces(), RebuildWorkspacesOptions (+3 more)

### Community 74 - "imports.ts"
Cohesion: 0.16
Nodes (13): CatalogLoadContext, ImportContext, ImportSend, log, normalizeCatalogModuleRepo(), ParsedImportUrl, parseGitHubUrl(), RateLimitEntry (+5 more)

### Community 75 - "decisions/README.md"
Cohesion: 0.13
Nodes (11): 042 — Collapsible workspace panes, Decision, Validation, 053 — Account sign-in method management, Consequences, Context, Decision, Validation (+3 more)

### Community 76 - "Teardown"
Cohesion: 0.12
Nodes (16): Restore in the fall, Seasonal Teardown, Step 1. Point the data disk at your snapshot, Step 1. Take a manual snapshot of the data disk, Step 2. Apply, Step 2. Verify the snapshot is READY before deleting anything, Step 3. Delete the VM (this also deletes the boot disk), Step 3. If you released the static IP (+8 more)

### Community 77 - "ControlApp"
Cohesion: 0.13
Nodes (12): ControlApp, 1. Why not Better Auth `testUtils`, 2. Auth-callback path tests are deferred, 3. Browser-heavy specs use `test.fixme`, not deletion, 4. HTTP-driven specs preferred over DOM-driven specs where possible, 5. Decisions on smaller details, Decision 021: Testing suite implementation — deviations from TESTING-PLAN.md, Files Touched (+4 more)

### Community 78 - "gamepad.ts"
Cohesion: 0.19
Nodes (9): DEFAULT_PORT, GamepadLeaseResolver, GamepadMessageOutcome, GamepadSessions, GamepadStatus, halsimTarget(), log, SessionState (+1 more)

### Community 79 - "gradle-cache-prune.test.ts"
Cohesion: 0.20
Nodes (12): GradleCachePruneOptions, GradleCachePruneResult, listDirs(), log, pruneIdleGradleCaches(), removePruned(), boot(), gradleDir() (+4 more)

### Community 80 - "ImportManager"
Cohesion: 0.37
Nodes (3): ImportError, ImportManager, safeCatalogSubdir()

### Community 81 - "runs.ts"
Cohesion: 0.15
Nodes (13): runBuildDuration, runsTotal, consumeLines(), defaultRunCommandFactory(), dockerRunScript(), lineLooksReady(), log, randomRunId() (+5 more)

### Community 82 - "classroom-admin.test.ts"
Cohesion: 0.20
Nodes (10): ClassroomView, joinGuest(), GuestUser, joinedGuest(), startClassroom(), allCookiesFrom(), classroomJoinRequest(), exists() (+2 more)

### Community 83 - "useGamepad.ts"
Cohesion: 0.21
Nodes (9): listConnectedGamepads(), makeLabel(), FakePad, useGamepad(), UseGamepadResult, clamp(), dpadToPov(), gamepadFrameToWpilib() (+1 more)

### Community 84 - "Decision"
Cohesion: 0.13
Nodes (14): Browser API behavior, Context, Decision, Decision 015 — HALSim WebSocket Control Protocol, DriverStation message (`type: "DriverStation"`, `device: ""`), Future hooks, Joystick message (`type: "Joystick"`, `device: "<N>"`), Message envelope (+6 more)

### Community 85 - "@playwright/test"
Cohesion: 0.13
Nodes (3): AdminPage, LoginPage, @playwright/test

### Community 86 - "name"
Cohesion: 0.25
Nodes (15): needs, runs-on, steps, steps, build-control-amd64, validate, steps, steps (+7 more)

### Community 87 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, esModuleInterop, exactOptionalPropertyTypes, isolatedModules, lib, module, moduleResolution, noEmit (+6 more)

### Community 88 - "migrate.ts"
Cohesion: 0.26
Nodes (12): config, db, log, AppliedMigrationRow, applyMigrations(), ensureMigrationTable(), listAppliedMigrations(), loadMigrations() (+4 more)

### Community 89 - "V2 Code Container (`coderunner-workspace`)"
Cohesion: 0.14
Nodes (13): Bind mounts, Build, Environment variables, Example run, First-Run Behavior, Image Size, Labels, Published ports (+5 more)

### Community 90 - "Configuration Reference"
Cohesion: 0.14
Nodes (14): Admin and Metrics, Auth and OAuth, Configuration Reference, Demo mode and the `--demo` flag, Docker and Containers, Docker Compose deployment, How environment is loaded, Idle Management (+6 more)

### Community 91 - "FAQ"
Cohesion: 0.14
Nodes (14): Can CodeRunner run offline or without internet?, Can I build, debug, or start a simulation from the WPILib extension?, Can I write my own lessons?, Can students accidentally break each other's work?, Can students push code to GitHub?, Do students need accounts? What if I just want to try it?, FAQ, How much does cloud hosting cost? (+6 more)

### Community 92 - "with"
Cohesion: 0.14
Nodes (14): with, accountId, apiToken, bun-version-file, command, packageManager, password, project_id (+6 more)

### Community 93 - "Project Preview implementation plan"
Cohesion: 0.14
Nodes (13): 1. Prove the report delivery model, 2. Add contracts and read-only delivery, 3. Add Preview UI, 4. Validate the complete workflow, 5. Document and finish, Acceptance criteria, Existing integration points, Goal and agreed UX (+5 more)

### Community 94 - "ref_bun_sqlite"
Cohesion: 0.14
Nodes (9): args, beforeIndex, beforeMs, countResult, db, dryRun, [command, email], db (+1 more)

### Community 95 - "sim-api.test.ts"
Cohesion: 0.24
Nodes (4): RunCommandFactory, announceChooser(), encodeMsgPack(), FakeWebSocket

### Community 96 - "stop-sim.sh"
Cohesion: 0.26
Nodes (11): clear_sim_files(), current_process_group(), is_running_process(), process_state(), process_tree_groups(), process_tree_pids(), send_signal_to_groups(), send_signal_to_pids() (+3 more)

### Community 97 - "Security Model"
Cohesion: 0.15
Nodes (13): Admin role, Audit log, Authentication, Container isolation, Control plane container privileges, Demo mode, Per-workspace access enforcement, Preview isolation (+5 more)

### Community 98 - "Decision"
Cohesion: 0.15
Nodes (12): 100 MB size cap, 6 imports per hour rate limit, Backup before import, Clone inside the container, not the host, Consequences, Context, Decision, Decision 016 — Project Import Strategy (+4 more)

### Community 99 - "Decisions"
Cohesion: 0.15
Nodes (12): 009 - LSP reconnect, bridge serialization, and startup throttling, Context, Decision 1: Browser LSP client auto-reconnects with bounded backoff, Decision 2: Bridge serializes JDT LS spawns, Decision 3: Orchestrator-level LSP startup throttle, Decision 4: Cap proxy pending-message buffers, Decision 5: NT4 subprotocol mismatch is fail-fast, not silent, Decision 6: AS Lite in-iframe timeout banner (+4 more)

### Community 100 - "Cloudflare Offline Page"
Cohesion: 0.15
Nodes (13): 1. Add the origin A record, 2. Verify the Caddyfile has the origin vhost, 3. Bootstrap the Cloudflare Pages project, 4. Set `BACKEND_ORIGIN` as a Pages secret, 5. Add the custom domain in Cloudflare, 6. Add GitHub Actions variables, Cloudflare Offline Page, Disabling Cloudflare mode (+5 more)

### Community 101 - "jobs"
Cohesion: 0.15
Nodes (12): concurrency, cancel-in-progress, group, env, CONTROL_IMAGE, PATHPLANNER_DIST_TAG, WORKSPACE_IMAGE, jobs (+4 more)

### Community 102 - "merge"
Cohesion: 0.17
Nodes (13): GH_TOKEN, PRERELEASE, TAG, merge, release, env, needs, runs-on (+5 more)

### Community 103 - "File Structure"
Cohesion: 0.17
Nodes (10): RunJob, File Structure, Global Constraints, Review Focus, Sim Debugging and Run Modes Implementation Plan, Task 2: Container scripts — per-mode Gradle task, JDWP agent, marker cleanup, Task 6: CodeRunner debug extension — auto-attach, Task 7: Real-image verification (+2 more)

### Community 104 - "web/package.json"
Cohesion: 0.17
Nodes (11): better-auth@^1.6.10, react-dom@^19.2.4, tailwindcss@^4.2.1, better-auth, react-dom, license, name, private (+3 more)

### Community 105 - "theme-provider.tsx"
Cohesion: 0.21
Nodes (10): disableTransitionsTemporarily(), getSystemTheme(), isTheme(), ResolvedTheme, Theme, THEME_VALUES, ThemeProvider(), ThemeProviderContext (+2 more)

### Community 106 - "useGamepadChannel.ts"
Cohesion: 0.20
Nodes (10): statesEqual(), useGamepadChannel(), UseGamepadChannelReturn, Why a dedicated WebSocket from browser to control plane, Consequences, Context, Decision, Decision 019: Keyboard Input Mode (+2 more)

### Community 107 - "useProjectSwap.ts"
Cohesion: 0.20
Nodes (10): endpointFor(), INITIAL_STATE, ProjectSwapKind, ProjectSwapState, ProjectSwapStatus, Listener, useProjectSwap(), UseProjectSwapReturn (+2 more)

### Community 108 - "coderunner-debug/package.json"
Cohesion: 0.17
Nodes (11): activationEvents, description, displayName, engines, vscode, extensionKind, license, main (+3 more)

### Community 109 - "024 — Bound Per-Workspace Container Memory"
Cohesion: 0.17
Nodes (10): 024 — Bound Per-Workspace Container Memory, Consequences, Context, Decision, Status, 025 — Detach the Simulation JVM from Gradle, Consequences, Context (+2 more)

### Community 110 - "036 — Editor migration: openvscode-server → VSCodium reh-web"
Cohesion: 0.17
Nodes (12): 036 — Editor migration: openvscode-server → VSCodium reh-web, 1. VSCodium `reh-web`, not `code-server`, 2. Stay on the LinuxServer base image, 3. The editor keeps container port 3000, 4. Settings and extension paths do not move, 5. Workspace trust: diagnosed, not fixed, Consequences, Context (+4 more)

### Community 111 - "OAuth Credentials"
Cohesion: 0.17
Nodes (12): 1. Add the people and domains that may sign in, 2. Promote the first admin, Bootstrapping the first admin, Manual bootstrap and later changes, OAuth Credentials, Register a GitHub OAuth app, Register a Google OAuth client, Set up Auth0 (+4 more)

### Community 112 - "Troubleshooting"
Cohesion: 0.17
Nodes (12): Build times out, Container won't start, Control plane can't reach the Docker socket (permission denied), Control plane can't write /data (SQLITE_READONLY / read-only data dir), Control plane crashes or becomes unresponsive, Disk full, OAuth login fails, PathPlanner does not load or misses external edits (+4 more)

### Community 113 - "contracts/package.json"
Cohesion: 0.18
Nodes (11): dependencies, zod@^4.1.13, exports, license, name, private, scripts, typecheck (+3 more)

### Community 114 - "restore.ts"
Cohesion: 0.32
Nodes (11): Args, dirExists(), discoverWorkspaces(), fileExists(), main(), parseArgs(), restoreArchive(), restoreDb() (+3 more)

### Community 115 - "verify-ascope.ts"
Cohesion: 0.26
Nodes (11): ascopeRoot, assert(), createCatalogDir(), distDir, exists(), patchDir, repoRoot, runGit() (+3 more)

### Community 116 - "metadata.ts"
Cohesion: 0.24
Nodes (9): configMountType(), containerAttachedToNetwork(), containerHasPublishedPorts(), isLoopbackHost(), publishedPortFor(), v2LabelsMatch(), workspaceHomePath(), CODE_NAME_PREFIX (+1 more)

### Community 117 - "src/runtime.ts"
Cohesion: 0.20
Nodes (5): ExecOptions, ManagedWorkspaceRuntime, WorkspaceRuntimeCommand, WorkspaceRuntimeExit, ContainerState

### Community 118 - "gamepad.test.ts"
Cohesion: 0.25
Nodes (4): GamepadLease, FakeWebSocket, setupBridgeAndSocket(), WORKSPACE_ID

### Community 119 - "Decisions"
Cohesion: 0.18
Nodes (10): upgrade(), 004 - Backend wiring for save and run, Context, Custom WebSocket sender, no new dependency, Decisions, Host backend plus Docker CLI, Minimal endpoints and run protocol, One-command dev stack without Docker Compose (+2 more)

### Community 121 - "LoginPage.tsx"
Cohesion: 0.24
Nodes (8): friendlyAuthError(), LoginPage(), submitUsernamePassword(), OAuthButton(), OAuthButtonProps, PROVIDER_BUTTONS, AuthProvider, authProvidersResponseSchema

### Community 122 - "052 — User roster and additive sign-in methods"
Cohesion: 0.18
Nodes (9): Consequences, Context, Decision, Decision 014 — Better Auth Integration, 052 — User roster and additive sign-in methods, Consequences, Context, Decision (+1 more)

### Community 123 - "Local Deployment"
Cohesion: 0.18
Nodes (11): 1. Choose the new version, 1. Clone and configure, 2. Pull the new images and restart the control plane, 2. Start and verify, 3. Sign in and allow students, 3. Verify the update, Local Deployment, Network safety (+3 more)

### Community 124 - "Monitoring"
Cohesion: 0.18
Nodes (11): Authentication, Capturing a session, Container and system state, Control-plane logs, Grafana Cloud, Health endpoint, Log verbosity, Monitoring (+3 more)

### Community 125 - "main.ts"
Cohesion: 0.22
Nodes (9): parseLogLevelOrThrow(), defaultLogLevel(), parseLogLevelEnv(), configInput, demoFlag, log, port, server (+1 more)

### Community 127 - "Data model"
Cohesion: 0.20
Nodes (8): getSession(), 044 — Auth0 SSO, Decision, Validation, 048 — Auth0 roles from RBAC permissions, Decision, Validation, Data model

### Community 128 - "In-process fake servers"
Cohesion: 0.33
Nodes (8): createPathPlannerDist(), In-process fake servers, connectGamepad(), disconnectGamepad(), installGamepadShim(), setGamepadAxes(), setGamepadButton(), seedRuntimeMissing()

### Community 129 - "AllianceToggle.tsx"
Cohesion: 0.27
Nodes (8): AllianceToggle(), AllianceToggleProps, Side, SIDE_ACTIVE, SIDE_EDGE, SIDE_STATION, sideOf(), AllianceStation

### Community 130 - "Mode"
Cohesion: 0.20
Nodes (6): Constants, Mode, REAL, REPLAY, SIM, Main

### Community 131 - "[[path]].ts"
Cohesion: 0.29
Nodes (7): Env, fetch(), isProxiedPath(), onRequest(), PagesFunctionContext, serviceUnavailable(), TOP_LEVEL_PROXIED

### Community 132 - "Decision 011: V2 Editor Spike — openvscode-server with redhat.java and WPILib"
Cohesion: 0.20
Nodes (10): Decision 011: V2 Editor Spike — openvscode-server with redhat.java and WPILib, Decisions, Docker Hub vs GitHub Releases, How to Run, Resource Baseline, Spike Dockerfile, Summary, Versions Pinned (+2 more)

### Community 133 - "Decision"
Cohesion: 0.20
Nodes (9): Base image: `gitpod/openvscode-server:1.105.1`, Consequences, Context, Decision, Decision 012: V2 Code Image — Base Image and Extension Strategy, Direct launch base path handling, Extension cache seeding pattern, Extensions: download at build time (+1 more)

### Community 134 - "Decision 013: V2 Acceptance Pass"
Cohesion: 0.20
Nodes (9): Automated Verification, Comparison with V1, Decision, Decision 013: V2 Acceptance Pass, Host Capacity (10 students), Manual Verification, Measurements, Per-Container Resource Usage (+1 more)

### Community 135 - "Decisions"
Cohesion: 0.20
Nodes (10): 017 — Migrate code container to linuxserver/openvscode-server, Bind mount target changes from /home/frc to /config, Context, Decisions, Layered s6-overlay: additive, not replacement, Migration Notes, Runtime PUID/PGID instead of build-time --user, Sim scripts remain independent of s6 (+2 more)

### Community 136 - "006 - Multi-tenancy spike findings"
Cohesion: 0.20
Nodes (9): 006 - Multi-tenancy spike findings, Context, Follow-up risks deferred to V1, Q1: NT4 routing under multi-tenancy, Q2: Resource cost at N concurrent users, Q3: JDT LS topology - per-user or shared, Q4: Session identity and backend routing, Q5: Container lifecycle latency (+1 more)

### Community 137 - "Test tiers"
Cohesion: 0.20
Nodes (10): `bun run e2e`: Playwright mocked tier, `bun run e2e:security`: security E2E tests, `bun run e2e:workspace-java`: real Java workspace smoke, `bun run test`: control-plane unit and integration tests, `bun run verify`: full CI gate, Debugging helpers, First-time setup, Playwright project names (+2 more)

### Community 138 - "Capacity and Sizing"
Cohesion: 0.20
Nodes (10): Capacity and Sizing, Checking disk usage, Cleaning up, Concurrency cap, Container disk read cap, Container memory cap, Disk growth, Host sizing guidance (+2 more)

### Community 139 - "CLI Reference"
Cohesion: 0.20
Nodes (10): Backup and Restore, Build, CLI Reference, Containerized ops: the `coderunner` CLI, Database, Docker Images and Containers, Docs Site, Quality and Tests (+2 more)

### Community 141 - "env"
Cohesion: 0.22
Nodes (10): env, env, DEPLOY_SA, GCP_PROJECT, GCP_ZONE, GH_TOKEN, TAG, VM_NAME (+2 more)

### Community 142 - "contents"
Cohesion: 0.24
Nodes (10): permissions, needs, permissions, runs-on, permissions, build-control-arm64, permissions, contents (+2 more)

### Community 143 - "steps"
Cohesion: 0.20
Nodes (10): needs, runs-on, steps, strategy, arch, platform, runner, build-workspace (+2 more)

### Community 144 - "Decision"
Cohesion: 0.22
Nodes (9): parseBoolean(), Admin bootstrap: `CODERUNNER_ADMIN_EMAIL`, Bind-mount path translation, `coderunner` — a dispatching CLI, not raw scripts, Decision, docker compose is the run surface, Networking: a shared Docker network, not host ports, One image, built once (+1 more)

### Community 145 - "useEditorReachability.ts"
Cohesion: 0.33
Nodes (5): EditorPaneProps, EditorReachability, EditorStatus, useEditorReachability(), EDITOR_STATE_HEADER

### Community 147 - "Architecture"
Cohesion: 0.22
Nodes (9): Architecture, How a Run works, How PathPlanner files flow, How Preview reads documents, How telemetry flows, Persistence and data layout, The single front door, What the control plane does (+1 more)

### Community 148 - "The Workspace Container"
Cohesion: 0.22
Nodes (9): Capacity limit, Classroom-density memory defaults, Container labels, Container ports, First-run behavior, How student data persists, Idle auto-stop, The Workspace Container (+1 more)

### Community 149 - "030 — Control-Plane Hardening Pass"
Cohesion: 0.22
Nodes (8): 030 — Control-Plane Hardening Pass, Consequences, Context, Correctness fixes, Decision, Performance, Security, Status

### Community 150 - "Decision"
Cohesion: 0.22
Nodes (8): 038 — Java tooling compatibility, extension reconciliation, and real-image smoke, Add a targeted real-container smoke, Consequences, Context, Decision, Keep separate tooling and project JDKs, Pin a compatible Java extension matrix, Reconcile managed extensions on every container start

### Community 151 - "Decisions"
Cohesion: 0.22
Nodes (8): 007 - V1 sim container orchestration, Context, Decisions, Docker labels are adopted back into SQLite, Lazy ensure, visible status, Loopback-only published ports, Runtime cache seed, UID/GID strategy

### Community 152 - "Decisions"
Cohesion: 0.22
Nodes (8): 008 - V1 LSP container and Bun-native bridge, Browser LSP client extended for multi-file projects, Bun-native bridge instead of `vscode-ws-jsonrpc`, `container_leases` lease state split, Context, Decisions, Generic `ContainerOrchestrator`, Mounts mirror the sim image

### Community 153 - "Development Servers"
Cohesion: 0.22
Nodes (9): Code style and CI gates, Control plane: `bun run dev:control`, Database migrations, Demo mode, Development Servers, First-time setup, Repo layout, The two dev servers (+1 more)

### Community 154 - "Grafana Cloud (Optional)"
Cohesion: 0.22
Nodes (9): Alloy config location, Dashboards, Getting your credentials, Grafana Cloud (Optional), Populating GCP Secret Manager, Prerequisites, Service management, Starter LogQL queries (+1 more)

### Community 155 - "deploy.yml"
Cohesion: 0.22
Nodes (8): concurrency, cancel-in-progress, group, env, CONTROL_IMAGE, WORKSPACE_IMAGE, jobs, name

### Community 157 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, preview, test, test:coverage, test:watch, typecheck

### Community 159 - "Decision 018: Gamepad Input via HALSim WebSocket"
Cohesion: 0.25
Nodes (7): Decision 018: Gamepad Input via HALSim WebSocket, Future Work (Deferred), Safety: disable on disconnect, Summary, Why a single controller on port 0 for v1, Why HALSim WS, not the FRC DS UDP protocol, Why hand-rolled SVG, not a library

### Community 160 - "Decision 022: Skip Docker smoke tier and import/backup-restore E2E tests"
Cohesion: 0.25
Nodes (7): Broad Docker smoke tier — not implemented, Consequences, Context, Decision, Decision 022: Skip Docker smoke tier and import/backup-restore E2E tests, Import and backup/restore tests — updated after lessons rework, Status

### Community 161 - "037 — Workspace cache aliases, extension pins, and trust"
Cohesion: 0.25
Nodes (7): 037 — Workspace cache aliases, extension pins, and trust, 1. Share the primed Gradle distribution with WPILib projects, 2. Prevent gallery resolution from replacing pinned VSIXs, 3. Disable workspace trust in the hosted workbench, 4. Keep Gradle daemon limits out of editor build arguments, 5. Close the workspace-image build follow-ups, Browser-owned settings finding

### Community 162 - "041 — Project Preview (Markdown + generated HTML reports)"
Cohesion: 0.25
Nodes (7): 041 — Project Preview (Markdown + generated HTML reports), Alternatives rejected, Consequences, Context, Decision, Tested compatibility boundary, The blocking constraint we found first

### Community 163 - "flattenLessonModules"
Cohesion: 0.25
Nodes (7): 051 — Nested module folders in the project picker, Consequences, Context, Decision, Ordering, Validation, flattenLessonModules()

### Community 164 - "005 - Java LSP MVP integration"
Cohesion: 0.25
Nodes (7): 005 - Java LSP MVP integration, Context, Decisions, Local WPILib-aware JDT LS image, Package and Vite choices, Plain Monaco client with direct LSP requests, Verification

### Community 165 - "File Structure"
Cohesion: 0.25
Nodes (8): File Structure, Task 1: Swap the base image and editor launch, Task 2: Scope `init-frc-setup`'s ownership pass to what it actually creates, Task 3: Build the image and verify the editor serves under the base path, Task 4: Verify Java reaches Standard Mode; fix workspace trust only if it does not, Task 5: Full regression gate, Task 6: Update license notices and documentation, Task 7: Record decision log 036

### Community 166 - "Startup Gradle cache pruning — design"
Cohesion: 0.25
Nodes (7): Approaches, Builder's calls (made by Claude, correctable), Decided behaviour, Goals, Non-goals, Startup Gradle cache pruning — design, Why

### Community 167 - "ports.ts"
Cohesion: 0.29
Nodes (3): allocatePortFromRange(), portIsFree(), ContainerRole

### Community 168 - ".start"
Cohesion: 0.29
Nodes (5): Global Constraints, Review Focus, Startup Gradle Cache Pruning Implementation Plan, Task 2: Prune module, Task 3: Wire into boot, docs, decision log

### Community 169 - "write_files"
Cohesion: 0.29
Nodes (6): runcmd, write_files, content, owner, path, permissions

### Community 170 - "016 — Imported project simulation compatibility"
Cohesion: 0.29
Nodes (6): 016 — Imported project simulation compatibility, Context, Decisions, Gradle init script for headless simulation override, Upgrade libstdc++6 via Ubuntu toolchain PPA, Verification

### Community 171 - "Workspace Image"
Cohesion: 0.29
Nodes (7): Building the image locally, Editor acceptance smoke, Image size, Pulling from GHCR, Refreshing running student containers, When to rebuild, Workspace Image

### Community 172 - "CodeRunner"
Cohesion: 0.29
Nodes (7): CodeRunner, How to use CodeRunner, Lessons and team projects, Next steps, Self-hosted and modest to run, Video walkthrough, What students get

### Community 173 - "Using CodeRunner"
Cohesion: 0.29
Nodes (7): Console lessons, Explore more, Get started, PathPlanner, Preview, Robot lessons and imported projects, Using CodeRunner

### Community 174 - "steps"
Cohesion: 0.52
Nodes (7): steps, steps, steps, id, name, run, uses

### Community 175 - "tag"
Cohesion: 0.29
Nodes (7): tag, on, workflow_dispatch, description, required, type, inputs

### Community 176 - "dependencies"
Cohesion: 0.29
Nodes (7): dependencies, fflate@^0.8.3, react@^19.2.1, react-dom@^19.2.1, react, react-dom, fflate

### Community 177 - "image.ts"
Cohesion: 0.29
Nodes (5): [command, kind], dockerfiles, image, Kind, subprocess

### Community 178 - "preview.test.ts"
Cohesion: 0.40
Nodes (3): workspaceProjectPath(), seedProject(), write()

### Community 179 - "control/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, tsBuildInfoFile, extends, include, ../../tsconfig.base.json

### Community 180 - "ModeColumn.tsx"
Cohesion: 0.40
Nodes (5): MODE_CLASSES, MODE_LABELS, ModeColumn(), ModeColumnProps, DsMode

### Community 181 - "coderunner-debug/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, lib, extends, include, ../../../tsconfig.base.json

### Community 182 - "Decision"
Cohesion: 0.33
Nodes (5): 020 - Workspace runtime provider boundary, Consequences, Context, Decision, Status

### Community 183 - "032 — Canonical Image Naming"
Cohesion: 0.33
Nodes (5): 032 — Canonical Image Naming, Consequences, Context, Decision, Status

### Community 184 - "033 — Workspace Disk Read Limit"
Cohesion: 0.33
Nodes (6): 033 — Workspace Disk Read Limit, Alternatives considered, Consequences, Context, Decision, Status

### Community 185 - "035 — Multi-Arch Images and CI/Release/Deploy Workflow Split"
Cohesion: 0.33
Nodes (5): 035 — Multi-Arch Images and CI/Release/Deploy Workflow Split, Consequences, Context, Decision, Status

### Community 186 - "Deployment Overview"
Cohesion: 0.33
Nodes (6): Choose a deployment route, Cloudflare Offline Page (advanced, optional), Deployment Overview, Google Cloud Deployment (advanced), Local Deployment (recommended), What both need

### Community 187 - "How Lessons Work"
Cohesion: 0.33
Nodes (6): Bundled catalog (default, zero-config), How Lessons Work, Remote catalog (your own lessons repo), The two bundled demo modules, Two catalog sources, one menu, What happens when a student loads a lesson

### Community 188 - "deploy-cloudflare"
Cohesion: 0.33
Nodes (6): if, needs, permissions, runs-on, deploy-cloudflare, contents

### Community 189 - "preflight"
Cohesion: 0.33
Nodes (6): preflight, tag, packages, outputs, permissions, runs-on

### Community 190 - "contracts/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, tsBuildInfoFile, extends, include, ../../tsconfig.base.json

### Community 191 - "scripts/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, tsBuildInfoFile, extends, include, ../tsconfig.base.json

### Community 192 - "Website"
Cohesion: 0.33
Nodes (5): Build, Deployment, Installation, Local Development, Website

### Community 193 - "block-devices.ts"
Cohesion: 0.50
Nodes (3): ListBlockDevicesOptions, listWorkspaceDiskLimitDevices(), log

### Community 195 - "web/tsconfig.json"
Cohesion: 0.40
Nodes (4): compilerOptions, paths, files, references

### Community 197 - "start-sim.sh"
Cohesion: 0.40
Nodes (4): HALSIMWS_HOST, HALSIMWS_PORT, start-sim.sh script, SIM_PROJECT_ROOT

### Community 199 - "Spike Results"
Cohesion: 0.40
Nodes (5): Auto-import on Tab (additionalTextEdits), Container boots and serves (:3000), Ctrl-click into library source (jdt:// URI), Extensions installed, Spike Results

### Community 200 - "Decision 026: Editor Default Theme"
Cohesion: 0.40
Nodes (5): Consequences, Context, Decision, Decision 026: Editor Default Theme, Status

### Community 201 - "028 — Demo mode for zero-config local tryout"
Cohesion: 0.40
Nodes (4): 028 — Demo mode for zero-config local tryout, Constraints, Context, Why synthetic over real sessions

### Community 202 - "029 — Lessons & Modules"
Cohesion: 0.40
Nodes (4): 029 — Lessons & Modules, Consequences, Context, Implementation decisions

### Community 203 - "039 — PathPlanner integration"
Cohesion: 0.40
Nodes (4): 039 — PathPlanner integration, Consequences, Context, Decision

### Community 204 - "040 — SELinux container mounts"
Cohesion: 0.40
Nodes (4): 040 — SELinux container mounts, Consequences, Context, Decision

### Community 205 - "049 — Prune idle workspace Gradle caches at startup"
Cohesion: 0.40
Nodes (4): 049 — Prune idle workspace Gradle caches at startup, Context, Decision, Not done

### Community 206 - "050 — Repo-sourced lesson modules"
Cohesion: 0.40
Nodes (4): 050 — Repo-sourced lesson modules, Consequences, Context, Decision

### Community 207 - "010 - Gradle project cache isolation for sim and LSP"
Cohesion: 0.40
Nodes (4): 010 - Gradle project cache isolation for sim and LSP, Context, Decisions, Implications

### Community 208 - "VSCodium-web Editor Migration Implementation Plan"
Cohesion: 0.40
Nodes (5): Background — verified findings, Follow-up disposition (closed 2026-08-26), Global Constraints, Out of scope, VSCodium-web Editor Migration Implementation Plan

### Community 209 - "deploy"
Cohesion: 0.40
Nodes (5): needs, permissions, runs-on, deploy, id-token

### Community 210 - "CodeRunner"
Cohesion: 0.40
Nodes (5): CodeRunner, Development, Documentation, License, Quick Start

### Community 211 - "capacity.test.ts"
Cohesion: 0.83
Nodes (3): expireRunningStatusCache(), fakeContainerFor(), stopFakeContainer()

### Community 213 - "Hello, World"
Cohesion: 0.50
Nodes (3): Hello, World, Running it, Try stuff

### Community 215 - "045 — Sim debugging and run modes"
Cohesion: 0.50
Nodes (3): 045 — Sim debugging and run modes, Consequences, Decision

### Community 216 - "046 — Recycle workspace containers on an older image"
Cohesion: 0.50
Nodes (3): 046 — Recycle workspace containers on an older image, Consequences, Decision

### Community 217 - "Quick Start (Installation)"
Cohesion: 0.50
Nodes (4): Deploy for a team, Prerequisites, Quick Start (Installation), Start CodeRunner

### Community 218 - "verify"
Cohesion: 0.50
Nodes (4): verify, needs, permissions, runs-on

### Community 219 - "outputs"
Cohesion: 0.50
Nodes (4): prerelease, tag, tag_sha, outputs

### Community 221 - "tsconfig.json"
Cohesion: 0.50
Nodes (3): extends, include, ./tsconfig.base.json

## Knowledge Gaps
- **15 isolated node(s):** `RFC-7230`, `RFC-1918`, `RFC-7230`, `RFC-9110`, `../../tsconfig.base.json` (+10 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1646 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Configuration Reference` connect `Configuration Reference` to `gcloud.md`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Are the 15 inferred relationships involving `createApp()` (e.g. with `fetch()` and `stopWorkspace()`) actually correct?**
  _`createApp()` has 15 INFERRED edges - model-reasoned connections that need verification._
- **What connects `RFC-7230`, `RFC-1918`, `RFC-7230` to the rest of the system?**
  _15 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.03496503496503497 - nodes in this community are weakly interconnected._
- **Why does `ControlConfig` connect `config.ts` to `admin-routes.ts`, `src/app.ts`, `catalog.ts`, `storage.ts`, `auth/auth.ts`, `Configuration Reference`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Should `classrooms.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06241519674355495 - nodes in this community are weakly interconnected._
- **Why does `Notes on .env.example vs config.ts` connect `Configuration Reference` to `config.ts`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._