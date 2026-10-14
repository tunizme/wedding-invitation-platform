# Validation guide

Use existing Node24/pnpm tooling and project-managed PostgreSQL/S3/browser infrastructure. Do not expose runtime secrets in evidence.

1. Run owning app typecheck/lint/unit tests after each story: `pnpm typecheck:web`, `pnpm typecheck:api`, `pnpm lint:web`, `pnpm lint:api`, `pnpm test:web`, `pnpm test:api`.
2. Apply migration to isolated test schema through existing API integration fixture; run editor-document migration/contracts on PostgreSQL. Fixture teardown drops only its owned schema and releases connections.
3. Build each app independently: `pnpm build:web`, `pnpm build:api`.
4. Use existing builder/responsive/auth validation runners, with their documented bounded timeouts/owned-process cleanup, plus editor-document browser suite. New acceptance suite must not change live templates.
5. Pilot: admin creates500 design and saves/publishes; customer adds album/audio/content, publishes; guest opens at320/375/390/500 and1440, submits form/wish/like; owner reads/approves; preview writes nothing. Use fresh editor-document/content2 fixtures; verify prior editor-document snapshot after failed publication. Existing-data compatibility is not an acceptance gate.

Expected: no horizontal overflow, same widget state across resize, one stored retry, pending wishes private, owner-only responses and static self-contained thumbnail. A check is only PASS after execution evidence is recorded; task checkboxes are not test evidence.

## Operational contract

There is one500 editor. Create-template requests contain metadata only; a `schemaVersion` selector is rejected. Old draft authoring is rejected, the conversion endpoint is removed, and neither environment flag can select another editor. Low-level schema identifiers are internal implementation details. Apply migrations explicitly before starting the API.

Destructive local reset: stop the local API/publication worker, then run `pnpm --filter @wedding/api invitations:reset:local --delete-all-invitation-data --port=55432`. This permanently deletes ALL local templates, invitations, publications, responses, presets and media, including objects recorded in storage; it preserves user/authentication tables. The command refuses non-development or non-loopback databases. A private cleanup manifest allows storage cleanup retry after partial failure. Restart the API afterward. The user explicitly authorized this reset; it was executed, preserving7 accounts and deleting3 stored objects.

Audio remains MP3 without transcoding, <=20MiB and <=600000ms, stored with the same durable-write/reference lifecycle as images. Image batches cap at15; per-file waiting/uploading/success/failure and aggregate progress are shown. Internal media search uses name and media kind; presets also carry categories. The packaged font catalog contains Noto Sans and Noto Serif, normal/italic at400/700 with Vietnamese subsets. No runtime font-provider request or foreign artwork is required.

Backups are private to account/template in IndexedDB, admitted for at most24h, purged on logout/account change, and never delete a newer edit when an older save completes. Browser-storage opening has a5s deadline. Interaction limits use HMAC source identities and5 writes/10min; hourly retention processes at most5000 rows per table per pass. Raw addresses and response contents are never logged. Owner responses and wish moderation are separate endpoints; supporting admin receives no form/RSVP answer endpoint.

## Cinelove capability comparison

Reference: authenticated editor-template inspection recorded during planning; public [templates](https://cinelove.me/templates) rechecked2026-10-12. `template/thiep-cuoi-32` was unavailable through the text web tool on recheck; native geometry comes from the earlier browser inspection, not from that failed request. No reference account credentials or artwork are retained here.

| Inspected reference capability | Feature008 implementation | Deliberate difference |
|---|---|---|
| Single native500 canvas, scaled mobile | editor-document native500, height500–16000, state-preserving scaled host | One editor; no legacy authoring or conversion flow |
| Contextual text/image/shape/background tools | tool rail, contextual properties, layers, direct text edit, geometry and grid snapping | Cinelove reference layout with original platform identity |
| Lock/hide/group/clipboard/history/align | validated commands, copied group/action identity remapping, undo/redo | Visible controls supplement keyboard/drag |
| Image crop/mask/flip | non-destructive numeric crop, masks and flip options | Numeric crop controls rather than reference crop gesture |
| Stock, fonts, music, presets and templates | internal image/decoration/background/audio libraries, local fonts, versioned reusable presets and template import | No third-party stock/provider catalog; original platform assets only |
| Calendar/countdown/map/QR/RSVP | existing widgets reused by editor-document | Existing owner-only RSVP contract retained |
| Album/carousel/video/call/reminder/guest/form | advanced nodes, customer media/contact fields, click-to-load YouTube, tel and ICS, transient URL guest name | Optional public carousel autoplay with pause, focus/hover suspension and live reduced-motion handling; editor/capture stay static |
| Entrance/continuous effects/particles | fade/slide/scale/flip, float/pulse, particles, pause control and reduced motion | Static trusted capture |
| Envelope/music/autoscroll/bottom toolbar | public presentation and explicit user controls | Music requires user interaction |
| Temporary save/share/language | serialized1500ms autosave, scoped recovery/conflict copy, published metadata, vi/en widget controls | Authored text stays unchanged |
| Wishes/likes | moderated public wish book, idempotent browser likes and owner/admin moderation audit | No guest-list or analytics module |

## Repeatable verification

- `node scripts/editor-api.mjs`: owned PostgreSQL/S3 editor-document contracts, public projection, moderation/privacy/idempotency/likes, MP3 and downgrade guards. Set `EDITOR_TEST_ENV` to an existing private runtime environment file when the default `.artifacts/responsive/runtime.env` is absent.
- `node scripts/editor-api.mjs --all-builder`: current builder contract/integration suites plus immutable migration-history tests; owned schema/storage cleanup;240s overall deadline.
- `node scripts/responsive-product.mjs run editor`: synthetic actors, explicit migrations, independent builds, real API/publication worker, health readiness, Chromium/Firefox/WebKit;850s overall deadline and owned cleanup.
- App-owned commands remain `pnpm lint:web`, `pnpm lint:api`, `pnpm typecheck:web`, `pnpm typecheck:api`, `pnpm test:web`, `pnpm --filter @wedding/api exec vitest run --configLoader runner --project unit`, `pnpm build:web`, `pnpm build:api`.

Executed evidence after the single-editor/layout revision (2026-10-12):

- Web unit tests: **561/561**,58 files (`.artifacts/manual/web-tests.log`). Includes server-normalized save state, key-order-independent recovery acknowledgement and protection of newer local edits.
- API unit tests: **112/112**,16 files (`.artifacts/manual/api-unit.log`). The obsolete fallback-flag test was removed with that flag.
- PostgreSQL builder contract/integration tests: **151/151**,25 files (`.artifacts/manual/all-builder-api.log`). Existing authoring contracts now assert the single500 path and rejection of old layouts/selectors. Migration/history primitives remain covered internally.
- Real browser pilot: **3/3**,Chromium/Firefox/WebKit (`.artifacts/manual/single-editor-browser.log`,run `6fabaff276c2464c92a1e33877f0045e`). Includes library collapse/reopen, no version selector, save/reopen with no false recovery, actual failed-save recovery, mobile focus restoration, customer-owned album upload, real publication,320/375/390/500/1440 scaling, envelope, reduced motion/pause, form privacy, likes and wish moderation.
- Both app lint checks and root app-owned typechecks passed. The real-stack runner independently built web/API, explicitly migrated PostgreSQL, passed readiness and reported owned process/schema/storage cleanup PASS.
- Local screenshot/geometry check at1670px: canvas500,rail84,library334,properties340; canvas x624 expanded/x457 collapsed,y118; no horizontal page overflow. Screenshots: `.artifacts/manual/studio-expanded.png`, `studio-collapsed.png`, `studio-background.png`, `studio-images.png`.
- Local reset:7 accounts retained,0 old templates,0 old invitations/media; one fresh manual fixture remains. Reset guards reject a missing destructive flag and production environment. The reset is bounded to120s overall with10s SQL and15s storage request limits; an incomplete storage cleanup retains a private retry manifest.

User scope revision: the local invitation/template/media reset was explicitly authorized and executed. No production deployment occurred.

## Single-editor layout acceptance

The text web tool could not read `/editor/new-blank`; a real anonymous browser redirected to Cinelove login. The four user-supplied screenshots are therefore the authoritative layout reference for this refinement. Implemented: single64px header,84px left icon rail,334px collapsible library, centered500px white canvas on gray workspace,340px right customization/share preview, floating zoom, background color/image tabs, palette/gradients and image dropzone. Editor styles are scoped; the rest of the platform retains its design system. Original artwork/account data from Cinelove are not copied.

Both old authoring implementations were removed: `template-editor.tsx` and the section editor UI/CSS are deleted; `invitation-editor.tsx` is the single implementation. Existing owner/publication race tests were ported to the single editor.

## Source cleanup verification (2026-10-12)

One editor remains: `editor/invitation-editor.tsx`, `document/editor-document.ts`, `editor/editor-commands.ts`, `editor/draft-recovery.ts`, `renderer/canvas-renderer.tsx` and `renderer/canvas-capture.tsx`. API owns its independent `domain/editor-document.ts`. Legacy authoring/section renderer/capture modules and their exclusive tests are removed; primitive validation, resolution, widgets and geometry gesture handling remain shared. Prototype authoring points to the production editor rather than offering another implementation.

Persisted schema3/renderer3, content data1/2, `/api/v1` and packaged font asset identifiers remain stable. They are wire/storage identifiers, not selectable editors. Historical migrations and their dedicated constraint tests remain; the test fixture restores the current constraints after each historical check. No additional local invitation reset is needed for this source refactor.

Evidence after cleanup: API unit87/87; PostgreSQL contract/integration133/133 (20 suites); web521/521 (52 suites); real editor pilot Chromium/Firefox/WebKit3/3 with isolated schema/storage/process cleanup; prototype authoring link and scaled guest state2/2; bounded validation-runner unit8/8. Legacy-only tests were retired with the removed implementations. Root typecheck and independent web/API lint pass; the real browser runner builds both apps independently. `scripts/responsive-cases.json` now selects current document, authoring, renderer and publication checks. Logs are under `.artifacts/manual/cleanup-*`.


## Session merge and continuation — 2026-10-13 (Linux)

Imported all 50 files from `/home/tunizme/Workspace/session-2026-10-13` over the existing Feature 008 working tree. The source directory is a file overlay, not a Git branch, so this is a working-tree integration. Files outside the overlay, including existing source deletions, were retained. No commit or remote push was created. Pre-merge recovery archive, tracked patch, Git status and per-file SHA-256 manifest: `.artifacts/session-merge-2026-10-13/before/` (also retained at `/tmp/wedding-pre-session-merge-20261013-175524/`).

Applied the additive `AssetLibraryCategories20261013000100` migration to the existing local `wedding_local` database on port 55432. The prior ExpandedInvitationEditor migration was already applied. No invitation reset or source-machine database import was performed. Windows helper scripts are retained under `.artifacts/local/`; Linux uses the existing PostgreSQL/MinIO tooling. No dependency versions changed.

| Phase 11 area | Current implementation and verification | Still outstanding |
|---|---|---|
| Editing operations | Cut/paste, context menu, strike, triangle, color controls, height stepper, layer search, borders/text shadows. Menu now focuses actions, handles arrows/Home/End/Escape, restores focus and stays within viewport. Real browser test covers cut/paste and Escape selection retention. | Exhaustive demonstration of all operations and final effects/layers screenshots |
| Calendar/countdown | Calendar variants; countdown orientation, gap and frame color. Zero gap stays zero. Browser verifies saved options after reload. | Calendar second-day display and direct date/time controls |
| Contact/reminder | Icon visibility and button/text colors; description/location/all-day reminder. All-day ICS now uses the event time zone, including year boundaries; timed UTC instants remain exact. Unit tests and browser persistence checks added. | Icon size/color, reminder end date and event image |
| RSVP | Configurable name/submit labels and submit colors; browser verifies persistence. | Attendance label and remaining form/input colors |
| Carousel | Public autoplay/pause, transitions, focus/hover suspension, reactive reduced motion and animation cleanup. Tests cover all render modes and interruption. | Actual public autoplay demonstration in the three-browser pilot |
| Library | Categories and filtered API paging; preset filtering now happens server-side. Template covers use authenticated scoped object URLs, revoked on cleanup; sample-photo labels are Vietnamese. | Admin tagging UI, grouping and catalog completeness |
| Music/page effects | Imported trim/icon styles/colors and page entrance presets. | Full playback/animation acceptance and visual evidence |

The session report's Windows results are historical evidence. This machine uses MinIO; its builder contract/integration suite passes all 133 tests, including the two storage-policy tests that failed on the source machine's SeaweedFS. Task checkboxes T040/T041/T042/T044/T047 were reopened because their full acceptance descriptions exceed the implemented or demonstrated scope.

Verification logs for this integration are copied under `.artifacts/session-merge-2026-10-13/`. The browser runner uses an isolated schema, storage prefix and synthetic accounts and reports cleanup PASS. The catalog download directory `.artifacts/library-seed` and its 166 source-machine database rows were not transferred or seeded here.


Final executed evidence:

- Web: **539/539**, 56 suites (`web-unit.log`).
- API unit: **90/90**, 15 suites (`api-unit.log`).
- PostgreSQL/MinIO builder contract/integration: **133/133**, 20 suites (`api-contract-integration.log`).
- Browser: **6/6**, two scenarios each on Chromium/Firefox/WebKit; run `a9f35a811f38467fb6d79023a149757b` (`browser.log`). Scenarios cover existing publication/guest/owner behavior and Phase 11 controls with save/reload. Subsequent template-cover changes passed dedicated authenticated-fetch/object-URL-cleanup tests and the final web build; this browser run predates that isolated cover-fetch correction.
- Script tests: **75 passed, 2 skipped, 0 failed** (`script-tests.log`). Replaced obsolete references to deleted resolver tests with independently serialized native500 FE/API parity, including optional presentation fields.
- Web/API typecheck, lint and production builds: **PASS**. `git diff --check`: **PASS**.
- Additive local migration: **PASS** (`local-migrations.log`). Isolated browser/API schema and storage cleanup: **PASS**.

Final tests protect carousel focus/hover pauses, live reduced motion, animation cancellation, all-day calendar timezone/year-boundary handling, contact styles, keyboard menu navigation/focus return, authenticated cover cleanup, category pagination, strict optional API fields, and independent FE/API resolution parity. They do not imply completion of the outstanding scope listed above.
