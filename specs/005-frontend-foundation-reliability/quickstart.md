# Quickstart / Validation: Frontend Foundation & Reliability

Đây là implementation/run guide cho [spec](spec.md) và [contracts](contracts/session-boundaries.md). Runner, fixed inventories, standalone packaging và US1–US4 suites đã được implement. Trạng thái nghiệm thu hiện tại nằm trong [verification](verification.md); missing suite/tooling MUST fail actionable, không silently skip hoặc claim PASS. Các checkpoint cũ trong verification được giữ làm lịch sử.

**Historical baseline outcome2026-10-10:**85/85 tasks complete;005 converged. Full `--phase all` PASS at `run-8Sonwh` (267 unit,480 independent web,459 browser,18 standalone; publication/health/owned cleanup PASS). IAM/auth-transition/builder compatibility PASS; developer migrations8/8 applied,005 adds none. Historical checkpoints below are retained; see [verification](verification.md) for commands, source fingerprints and failures.

**Current extension outcome2026-10-11:**101/101 tasks complete;005 converged. Full `--phase all` PASS at `run-XjtXMT`:292 selected unit,534 independent web,519 browser,18 standalone; publication/owned cleanup PASS. IAM US10 and builder US4 compatibility PASS. See verification.md for retained failures, commands and limitations.

## Prerequisites / Gate Entry

- Requirements checklist đã reviewed; generate tasks rồi `speckit-analyze`, không implement khi mandatory/CRITICAL/HIGH findings unresolved. B01 đã có explicit approval theo [MASTER](../../docs/design/MASTER.md#approved-change-b01--functional-input-boundary) và [evidence](verification.md#b01--design-approval); actual rendered boundary/state evidence is tracked in verification.md; full runtime acceptance, final analysis/convergence PASS at `run-8Sonwh` and verification.md.
- Task generation và initial analysis đã hoàn tất; 006 final acceptance đã verified; T001 align actual CSP-1 consumers và re-run analysis trước implementation entry. Documentation remediation không tự đóng HIGH finding.
- Node24, pnpm12.3.4, installed locked dependencies, Docker/Compose cho package gate; browsers/runtime matching Playwright1.63.0. Đọc repository README/environment examples, không echo secrets.
- Existing IAM/builder integration dùng disposable PostgreSQL17 target và private MinIO test bucket/credentials. Không dùng production/customer data hoặc fallback `DATABASE_URL`.
- Test env names: `IAM_TEST_DATABASE_URL`; `BUILDER_TEST_DATABASE_URL`; `BUILDER_TEST_S3_ENDPOINT`, `BUILDER_TEST_S3_REGION`, `BUILDER_TEST_S3_BUCKET`, `BUILDER_TEST_S3_ACCESS_KEY_ID`, `BUILDER_TEST_S3_SECRET_ACCESS_KEY`, `BUILDER_TEST_S3_FORCE_PATH_STYLE`. Cấu hình theo feature004 guide; không commit actual values.
- Native browsers, hoặc existing Linux Docker browser mode `BUILDER_TEST_BROWSER_MODE=docker` với matching image `wedding-builder-playwright:1.63.0`. `infra/playwright/Dockerfile` dùng installed playwright-core context, không repo root; theo existing documented setup.
- Platform local-font assets/licenses đã acquired/reviewed trong implementation. Package build không download fonts từ Google; existing Noto invitation assets không sửa.

Setup hạ tầng local khi cần cho verification:

```bash
pnpm install --frozen-lockfile
pnpm infra:up
pnpm builder:storage:init
```

Commands có install/network/infra effects phải theo execution permissions thực tế. `infra:up`/storage init là explicit shared-local setup; runners không tự reset infrastructure. Test runner apply **existing migrations trên owned disposable schema**, không migrate developer DB hoặc tạo migration mới.

## Current Commands — Đã tồn tại

Run từ repository root, với bounded command timeout; local checks tự run một lần sau change, không repeat rộng hơn nếu không có failure/new change.

```bash
pnpm format:check:web
pnpm lint:web
pnpm typecheck:web
pnpm test:web
pnpm build:web
pnpm test:scripts
pnpm scope:check
```

Compatibility evidence cho shared account/builder paths, sau disposable test prerequisites:

```bash
pnpm validate:iam --phase US10
pnpm validate:builder --story US4
```

IAM US10: hard deadline15min, cumulative account/session/profile/Admin management coverage. Builder US4: hard deadline25min, cumulative authoring/bindings/assets/publication/Customer/public/browser coverage. Separate reports giữ outcome/cleanup status, không coi unit PASS đủ cho browser. Builder `--phase invitations` không small selector: hiện maps US5/assistance dependency closure, không dùng thay US4.

Nếu backend application unchanged, không claim đã sửa backend. API independent baseline checks SHOULD được ghi compatibility evidence khi preparing PR; khi fixture/integration surface affected, required API checks và real PostgreSQL integration chạy theo constitution:

```bash
pnpm format:check:api
pnpm lint:api
pnpm typecheck:api
pnpm test:api
pnpm build:api
pnpm health
```

`pnpm health` cần running healthy local stack, không tự khởi động. New runner health check dùng owned app ports/config, không assume shared development services. CI MUST bổ sung applicable suites vào existing checks, không bỏ IAM/builder gates hoặc deploy.

Final acceptance SHOULD run alone when investigating native storage/focus failures. On Linux laptops subject to suspend, wrap the bounded command with `systemd-inhibit --what=sleep --mode=block --why="Bounded frontend validation"`; the inhibitor releases at command exit and does not change system sleep policy. Restart only the owned browser service after host suspend/restart; retain interrupted/failed reports and verify exact owned cleanup before replacing them. Optional `FRONTEND_TEST_STORAGE_DIAGNOSTICS=1` reports native error names/timing and fixed infrastructure categories only; diagnostics never replace fixed acceptance or change storage deadlines.

Concurrent browser acceptance runs MUST use separate browser-service endpoints/processes. Do not share one `FRONTEND_TEST_BROWSER_WS` across concurrent keyboard/focus runs or diagnostics; run sequentially when only one service is available. Each runner still owns its distinct schema, prefix and app ports. Stop only the browser services created for that session.

## Frontend Acceptance Commands

Root script `validate:frontend` gọi `scripts/frontend-validate.mjs`. App tests ở `apps/web`, API fixtures ở owning API; reuse exported builder `withOwnedResources`/`freePort`, không copy business logic vào root.

| Selector          | Hard budget gồm cleanup | Required coverage                                                                                                                             |
| ----------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `--phase unit`    | 10min                   | Web format/lint/typecheck/unit/build; identity/client/coordinator/primitive/form regressions; runner deadline/cleanup tests                   |
| `--phase browser` | 20min                   | Owned API/web + disposable fixtures; principal transitions, adopted journeys, modal lifecycle, widths; browser critical cases across engines  |
| `--phase package` | 15min                   | Build actual standalone image, owned container/port; static inventory/hash, real font readiness, public/capture isolation và injected failure |
| `--phase all`     | 45min                   | Union feature suites once, package/browser/static và owned full-stack health; no silently skipped scenarios                                   |

### Explicit Stage Selection

Không có `--through`: mỗi phase MUST require full-feature phase manifest, kể cả khi implementation còn thiếu suites. Optional `--through US1|US2|US3|US4|US5|US6|US7|US8|US9|US10` chỉ hợp lệ với `unit/browser/package`, chọn dependency closure cố định tới story đó; không chọn theo file discovery/task completion. Order là US1→US2→US3→US4→US5→US6→US7→US8→US9→US10. Manifest/filtering phải explicit tại file/test-case level khi cùng suite có expectations được thêm ở later story.

- Report MUST có `coverage: PARTIAL`, requested phase/through, selected stories/required suites và missing coverage, kể cả `--through US4`; staged result không full acceptance PASS.
- Unit stage chạy existing web checks/build + required feature regressions của selected closure; existing suites không bị xóa để né failures. Browser stage chạy selected closure trên owned fixtures/engines/widths.
- Package capability bắt đầu US2: `--phase package --through US1` MUST fail actionable trước provisioning. Through US2 require existing invitation fonts/output; through US3/US4 thêm platform fonts/style-isolation expectations. Không silently omit required stage expectations.
- `--phase all` MUST reject mọi `--through` và require full acceptance registry. Default full-phase command thiếu suite/file phải fail; không tự downgrade thành PARTIAL.
- Hard budgets/30s cleanup reserve không đổi theo stage. Staged checkpoints là incremental evidence, không thay default/full final gates.

Incremental commands với fixed dependency closures:

```bash
pnpm validate:frontend --phase unit --through US1
pnpm validate:frontend --phase browser --through US1
pnpm validate:frontend --phase browser --through US2
pnpm validate:frontend --phase package --through US2
pnpm validate:frontend --phase unit --through US3
pnpm validate:frontend --phase browser --through US3
pnpm validate:frontend --phase package --through US3
pnpm validate:frontend --phase unit --through US4
pnpm validate:frontend --phase browser --through US4
```

Existing cumulative IAM US10/builder US4 gates là separate compatibility runs, không cộng vào45min rồi silently cut suites. All selector không thay separate regression evidence. Budgets fail khi prerequisites/work quá thời gian, không convert timeout thành skipped PASS.

Sau khi tooling tasks đã implement mới có thể chạy:

```bash
pnpm validate:frontend --phase unit
pnpm validate:frontend --phase browser
pnpm validate:frontend --phase package
pnpm validate:frontend --phase all
```

New `apps/web/playwright.frontend.config.ts` discover `e2e/frontend-foundation`; existing `playwright.config.ts` chỉ discover invitation-builder, MUST không dùng để claim new cases chạy. New config single worker/retries0/test timeout30s, critical cases Chromium/Firefox/WebKit; broader viewport/journey matrix Chromium. Runtime env reuse explicit test targets trên; runner-generated ports/URLs/seeds/private payloads nằm owned scratch, sanitized reports dưới `.artifacts/frontend-foundation/<run-id>/`.

## IAM Dependency Gate

006 final acceptance is verified at `run-Lt4lxU`; T001 aligns CSP-1 consumers and re-analysis before005 code. Existing subscribe/snapshots/end-admission and transport remain authoritative;005 adds no coordinator/backend/migration. Broad private-state/browser/package acceptance remains pending and planned commands are not runtime evidence.

## T003 — Installed tooling review (2026-10-08)

Node24.21.0, pnpm12.3.4, Next16.3.5, React19.3.0, Playwright1.63.0 verified locally. Read installed Next guides `11-css`, `13-fonts`, `03-layouts-and-pages` and standalone `output` under `apps/web/node_modules/next/dist/docs/`. CSS Modules/local-font class ownership remains approved; global styles survive navigation, root requires html/body, standalone does not copy public/static automatically. Native dialog remains the selected surface; actual cross-engine lifecycle tests belong to T048–056. No alternate dependency installed.

## T005 — Executable acceptance registry và staging (2026-10-09)

Registry thực thi nằm trong `scripts/frontend-validate.mjs` (export `registry`, `selection`, `assertInventory`, `expectedCases`); fixed case inventory ở `scripts/frontend-cases.json`, một mục mỗi suite với test-case name (thêm `story` khi một suite nhận expectation ở story sau). Thiếu suite hoặc inventory hoặc case thì phase fail trước khi provision; `--through` chỉ chọn dependency closure cố định, report luôn `coverage: PARTIAL`; `all` từ chối `--through`.

| Phase     | Budget (gồm 30s cleanup reserve) | Prerequisites trên máy chạy                                                                                                                                |
| --------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit`    | 10 phút                          | Node 24, pnpm 12.3.4, installed lockfile. Không cần DB/Docker.                                                                                             |
| `browser` | 20 phút                          | `IAM_TEST_DATABASE_URL`, `BUILDER_TEST_DATABASE_URL`, `BUILDER_TEST_S3_*` (MinIO test bucket), Playwright 1.63.0 browsers hoặc `FRONTEND_TEST_BROWSER_WS`. |
| `package` | 15 phút                          | Docker daemon + root-context image build, free ports; chỉ từ `--through US2`.                                                                              |
| `all`     | 45 phút                          | Union của ba phase trên, full registry, không `--through`.                                                                                                 |

Owned resources: schema `iam_test_*`/builder disposable do `withOwnedResources` tạo và chỉ drop schema của chính run; ports từ `freePort`; scratch seed `FRONTEND_TEST_SEED` mode `0600`; artifacts sanitized dưới `.artifacts/frontend-foundation/<run-id>/` (chỉ case metadata và status, không cookie/token/seed payload). Runner không reset infrastructure dùng chung và không tự migrate DB developer.

Trạng thái máy công ty Windows (2026-10-09): `unit` chạy được; `browser` và `package` **BLOCKED tại máy này** vì không có Docker/MinIO (`BUILDER_TEST_S3_*`) — không được thu hẹp inventory hay đánh dấu PASS thay thế; chạy trên Linux có Docker.

## Acceptance Scenarios / Expected Outcomes

### Historical Windows checkpoints — 2026-10-09

`scripts/frontend-cases.json` now contains the fixed US1 unit inventory, including the template-owner, asset-library-owner and customer-form-owner suites. `pnpm.cmd validate:frontend --phase unit --through US1` PASS at `.artifacts/frontend-foundation/run-PL67TV/` (165 selected tests; full web 425/425; format/lint/typecheck/build/scope PASS). Coverage is PARTIAL; T012 browser suite and T025 browser acceptance remain pending. On Windows PowerShell use `pnpm.cmd` when execution policy rejects the `pnpm.ps1` shim; worker-based commands require the execution permissions available in the session.

The Windows checkpoint lacked Docker/storage. Home Linux continuation now has PostgreSQL/MinIO and matching Docker browsers: US1 browser75/75, US2 browser93/93 and US2 package12/12 PASS. Follow verification.md for current full acceptance status.

US2 package runner builds `apps/web/Dockerfile` from the repository root with the owned API URL baked into the client bundle. It starts `apps/web/server.js` from that image with no source mount, uses the Linux host network with one owned free port, and reaches the loopback-only disposable API at its owned port; it removes only its named container and image tag. The package gate is production-image evidence. A local `next start` check cannot substitute for it because that check would read the host's `public` directory. Run `pnpm validate:frontend --phase package --through US2` on a machine with Docker daemon, the explicit disposable database/storage targets listed above, and Playwright browsers or `FRONTEND_TEST_BROWSER_WS`. Review `summary.json`, `package.json`, and `owned/*/cleanup.json` together; discovery or unit results alone do not establish font delivery from the image.

US2 local checkpoint: `pnpm.cmd validate:frontend --phase unit --through US2` PASS/PARTIAL at `.artifacts/frontend-foundation/run-hvntqX/` (168 selected cases; full web 428). Browser/package have not run. `browser --through US2` also requires the outstanding US1 `principal-isolation.spec.ts` because the fixed closure is cumulative.

US3 local checkpoint: `pnpm.cmd validate:frontend --phase unit --through US3` PASS/PARTIAL at `.artifacts/frontend-foundation/run-rogbJp/` (197 selected cases; full web 432). Browser/package have not run. US3 adds the pinned platform typefaces to the production image checks and viewport/style isolation cases. Use the same explicit Docker/database/storage/browser prerequisites above; browser and package evidence remain separate from unit PASS.

### 1. Principal isolation — SC-001–002

Seed owned Customer A/B và Admin A/B; dùng real login/peer-session transition trong browser. Delay responses tại test boundary, không sửa production business rules. Test:

- Same-role/different-role switch; logout/login; A→B→A khi screen mở; delayed list/detail/error/page append, new-account reload thất bại.
- Draft A dirty; switch B; delayed save/upload/publish poll completion; stale next-step request/navigation; pending401/refresh/logout/password/profile.
- Auth-cookie races: refresh A pending→login B; logout A pending→login B; stale login/onboarding completion; pending password-change response với newer account. Delay actual response handling trong controlled browser harness; kiểm real browser cookie effects, không chỉ mocked store.
- Credential renewal cùng principal/resource khi có valid unsaved values; reload/filter/resource changes có independent generations.

Expected: zero old private records/drafts/status/assets được render/commit/retry trong B; epoch fence ngăn old A khi quay lại A. No request replay với B credentials, no late session write/clear B, no merged pages/query. Same-owner renew giữ form values. Existing explicit logout confirmation giữ; forced peer switch dispose old dirty source. Không assert server rollback cho request đã dispatch.

Sau mỗi auth race, subsequent reload/renew MUST vẫn đúng expected account hoặc explicit safe recovery theo reviewed U1 policy, không fallback A/silently clear B/false authenticated success. Policy ownership/outcomes đã định nghĩa trong [session contract](contracts/session-boundaries.md); T001 vẫn phải review completed/verified 006 handoff và U1-B evidence trước code. Required matrix thêm:

| Case                                            | Expected evidence                                                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Cross-tab contention / queued superseded intent | Existing006 server intent/transactional refresh lease authority; stale queued request không dispatch                       |
| Nested refresh                                  | Existing006 single-flight/IDB refresh lease, không second lock/deadlock; same-owner one-retry rule                         |
| Lock acquisition timeout                        | `NOT_DISPATCHED`; request chưa gửi                                                                                         |
| Timeout/abort sau dispatch                      | `UNCERTAIN`; no false success, no automatic replay/new writer coi context clean; reviewed persistent recovery hoặc BLOCKED |
| Tab close/context loss                          | Lock release không là cookie-safety proof; kiểm pending writer/recovery boundary                                           |
| No Web Locks                                    | Transactional IndexedDB/server authority on two tabs; Web Locks optional, no support downgrade                             |
| OAuth callback gần refresh/login/logout         | Existing full-navigation server-bound intent; actual cookie/reload/current-attempt evidence                                |

Chỉ dùng recovery đã chứng minh/explicitly approve; không giảm browser/journey scope để PASS. Không treat aborted fetch/store fence là proof late Set-Cookie prevented; cookie/token values không nằm report.

### 2. Public/capture và package — SC-003–004

Build Docker image từ root context; unique tag/container name/owned free port. Chạy image production `apps/web/server.js`, không thay bằng `next start` hoặc mount source assets. Runner cấp web/API env theo existing validated configuration, dùng actual published fixture.

1. Manifest và mỗi required Noto WOFF2 URL có bytes/hash/MIME đúng. Platform local fonts từ `.next/static` load được; không external font network fallback.
2. Render scene có cả Noto IDs, 400/700 normal/italic và Vietnamese/Latin samples `AgẮệỹ`; kiểm decode/face-specific readiness, không chỉ HTTP200/family regular.
3. Anonymous direct public, authenticated product→public và direct capture: không email/logout/product chrome; không `/auth/csrf`/refresh/peer listeners/dirty guard side effects trên isolated surface. Same published scene appearance/fonts tương đương; time-dependent content kiểm theo same current rules.
4. Block required font/italic face hoặc image: ready false/truthful error, no false publish. Existing API publication failure regression giữ previous revision. No draft fallback khi invitation unpublished/unavailable.

Reuse existing `renderer-fit.spec.ts`, `font-readiness.test.ts`, `asset-failure.test.tsx`, API `publication-races.spec.ts`. Package static checks bổ sung cho existing gates, không thay validation contracts.

### 3. Initial foundations — SC-005–006

Đi qua toàn initial screen inventory trong [platform contract](contracts/platform-ui.md), cả successful/invalid/loading/empty/failure states. Review actual token/font/radius/spacing/shadow/control mapping và field/general error distinction; generic registration/recovery vẫn safe, milestones persistent.

Viewports360/375/390/430/768/1440; keyboard-only, long Vietnamese labels/errors, reduced-motion, password manager/paste. Text zoom200% cần actual text enlargement/manual browser evidence; deviceScaleFactor không substitute. Expected: no chrome overflow/focus obscured, accessible linked labels/errors, usable targets/status text. Contrast đo actual pairings không round threshold; B01 approval không thay actual rendered boundary/state evidence; thiếu evidence không PASS.

Same supported invitation scene và Admin canvas trước/sau style adoption: computed template font/palette/authored geometry/pinned design unchanged. Không sửa small renderer controls/reflow ngoài scope để làm toàn-product accessibility PASS.

### 4. Media lifecycle / Customer restriction — SC-007–008

Open library từ TemplateEditor và BindingPanel, dùng Tab/Shift+Tab/Escape/close/selection; test repeated mount/unmount và removed trigger. Search/filter/mine/more/upload success/failure trên desktop/mobile sheet, background inert và return focus/safe fallback. Owner switch khi upload/search/more pending không chọn stale asset vào new design.

Expected: header/close/recovery reachable, containment/return focus đúng, authorized operations unchanged. Customer image editing chỉ data reference; no Admin library/design controls. Customer save payload/pinned design không thay layout/style/binding/colors/fonts/section order/visibility/crop; missing optional data giữ004 authored gaps, timeline data order không layer order. Existing Admin authoring actions vẫn hoạt động.

## Deadlines / Cleanup Contract

New runner hard deadline tính từ start, reserve30s shutdown/cleanup; work deadline = hard deadline−30s. Individual commands dùng remaining work budget, request timeouts bounded, browser case≤30s. Success/error/handled signals/work timeout đều stop new work và terminate **owned** processes/writers trước resource deletion.

Cleanup chỉ owned schema/object prefix/scratch/ports/browser contexts/package container; không drop shared bucket/database, delete volumes, run `infra:reset`, stop unrelated services/processes hoặc wipe shared Docker cache. Image cleanup chỉ ephemeral tag của run, không global prune. Stop streams/writers trước cleanup; retry không bắt đầu sau deadline.

Reports giữ sanitized run IDs/assertions/viewport/engine/source revision và cleanup status. Không secrets/tokens/proofs/seed/private user payloads; artifacts screenshots phải disposable identities và được kiểm trước share. Cleanup thiếu/unknown inventory→nonzero `cleanup: FAILED`, liệt kê safe remaining resource IDs; tests PASS không che cleanup fail. SIGKILL/host shutdown không guaranteed cleanup.

## Evidence / Handoff — SC-009

US1–US3 converge continuation: the frontend runner now starts the existing test-only OAuth provider/API harness on an owned loopback port. Its per-test rate-limit reset, unique account fixtures and in-memory email-proof lookup support the real account journeys; no production endpoint was added. The delivery proxy holds actual upstream responses, including cookie-writing responses, before browser delivery. Never replace this with mocked Set-Cookie evidence.

US2 browser/package setup also runs the existing API publication-races integration suite and requires the exact font-failure, missing-image and prior-public-pointer cases in `publication.json`. The US2 unit stage explicitly includes face-specific font-readiness regressions. Existing builder US4 compatibility/renderer-fit execution remains required at T034/T074. Browser and standalone stages reuse the same owned frontend origin; the development server is stopped before the package container binds that port.

On Linux with Docker, supply the explicit disposable test database/storage variables documented above, then run browser `--through US1`, `--through US2`, `--through US3`, package `--through US2`, `--through US3`, and the existing builder US4 compatibility command. Record each actual result and owned cleanup before closing T025/T034/T047/T074. Current home execution/results supersede the Windows DEFERRED/NOT RUN checkpoints; see verification.md.

Mỗi report MUST map FR/SC và audit finding, command/elapsed time/result/cleanup. Distinguish satisfied outcome, unreproduced static risk, deferred out-of-scope và blocked approval; không mark finding resolved bằng docs/mock only. Không claim whole platform MASTER/WCAG/release-ready. Tasks trace và cross-artifact analysis required trước `speckit-implement`.

## Extension US5–US7 validation (2026-10-11)

Active feature: `.specify/feature.json` points to005. Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks`. Existing baseline commands/budgets/owned cleanup remain in force.

US5 first: `pnpm --filter @wedding/web test tests/foundation-page.test.tsx tests/frontend-foundation/product-shell.test.tsx tests/frontend-foundation/surface-boundaries.test.tsx`, then web typecheck/lint/build. Manually/browser verify360/1440 header/avatar/footer and public/capture exclusion. This is partial extension evidence.

US6/US7: add actual-backend product-experience browser cases to fixed runner inventory before closing story tasks; run frontend browser/package and affected builder/IAM compatibility gates. Use disposable seeded published templates and customer invitations, never prototype fixtures as backend evidence. New tests must cover errors/identity changes and failed publication, not just happy-path screenshots. Record commands/counts/status/cleanup in verification.md; missing evidence remains unchecked.

The extension registers `US5`, `US6` and `US7`; the complete fixed registry is US1–US7. Default `--phase all` still requires the entire registry. To inspect the catalog/demo/workspace increment independently, use `pnpm validate:frontend --phase browser --story US6` or `--phase unit --story US6`; substitute `US7` for editor validation. The explicit story selector is accepted only for unit/browser and ALWAYS reports PARTIAL, with the omitted stories listed; it is not final feature acceptance. Browser inventory requires all11 US6 cases and9 US7 cases on Chromium, Firefox and WebKit. Use a reachable explicit disposable database and test storage identity; credentials from old local runs may be stale. `FRONTEND_TEST_BROWSER_WS` may point to the existing Playwright server when host WebKit libraries are absent. Do not reset developer services or substitute mock API responses for these cases.

For an isolated three-engine browser service, set `BUILDER_TEST_BROWSER_MODE=docker` before invoking the frontend runner. The runner starts the existing pinned Playwright image under its own run ID, supplies its WebSocket endpoint to the browser tests and removes only that container in owned cleanup. A supplied `FRONTEND_TEST_BROWSER_WS` remains supported when this mode is absent. Do not run concurrent acceptance workloads against one browser server; retain failed native-storage evidence and rerun the bounded gate with independent infrastructure rather than enabling retries.

US7 is implemented with dedicated `product-editor.spec.ts` acceptance. Runs including US7 build and start the owned production Next application so real publication capture keeps the strict CSP. The publication worker is enabled only for the API browser harness, not for fixture/race integration tests. Manual save, uncertain-publication recovery, real conflict/owner transitions and RSVP remain required. T100/T101 are complete after the current source passed the complete gate and compatibility checks at `run-XjtXMT`; consult verification.md for actual results.

## Extension US8–US10 validation (2026-10-12)

The extension registers `US8`, `US9` and `US10`; the complete fixed registry is US1–US10 and default `--phase all` still requires all of it. Case inventory for `prototype-parity.spec.ts` is pinned by name in `scripts/frontend-cases.json` (US8: Customer local date; US9: guided Admin creation ×2 widths and native duplicate; US10: mapped Admin geometry ×2 widths). `--story US8|US9|US10` is accepted only for unit/browser and ALWAYS reports PARTIAL; it is not feature acceptance and does not close T110–T113.

Without Docker (Windows, no admin): start portable PostgreSQL and a SeaweedFS S3 server, then set `IAM_TEST_DATABASE_URL`, `BUILDER_TEST_DATABASE_URL` and the `BUILDER_TEST_S3_*` identity (see the local environment notes; never commit these). Example staged run: `pnpm validate:frontend --phase browser --story US9`. The `package` phase still needs a real Docker daemon.

Date control contract: the Customer editor shows `Ngày và giờ tổ chức` (`datetime-local`) interpreted in the event's IANA zone and emits an ISO value with the local offset (for example `2026-12-21T18:30:00+07:00`), not UTC `Z`. Browsers differ in whether the field's `value` keeps `:00`; browser assertions accept both. Playwright `fill` for this field takes `yyyy-MM-ddTHH:mm`.

Test authoring notes learned from staged runs: fill an edit only after the form can register it (retry until `Có thay đổi chưa lưu` shows) because the save button stays disabled while the form is not dirty; exclude `#__next-route-announcer__` when asserting product `role="alert"` messages.
