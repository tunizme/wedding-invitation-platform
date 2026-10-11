# Quickstart: Validation for feature007

**Status**: Implemented; all gate PASS run2c029359-159b-4910-af0c-1e8e6cea0bda. See validation.md for regression evidence and rollout.md before enabling writers.

## Prerequisites and baseline

Use Node24 and pnpm12.3.4, committed lockfile, project local PostgreSQL/MinIO/email infra and safe documented env examples. Read README and feature004/005/006 quickstarts for exact service/env ownership; never print or commit real credentials. Playwright browsers/test fixtures must be provisioned by tooling tasks before browser gates. Settle current modified working tree baseline before implementation; do not discard it.

Current commands (run from repository root):

```bash
pnpm install --frozen-lockfile
pnpm infra:up
pnpm --filter @wedding/api migration:run
pnpm dev
```

For fresh validation use runner-owned test database/assets/users. Migration command requires correctly configured DATABASE_URL and provisioned services. Manual dev is long-running, stop only the process started for this validation. Do not run infra:reset or revert constraints against a database containing v2 data.

Existing independent checks, each bounded externally by CI/runner:

```bash
pnpm format:check:web
pnpm lint:web
pnpm typecheck:web
pnpm test:web
pnpm build:web
pnpm format:check:api
pnpm lint:api
pnpm typecheck:api
pnpm test:api
pnpm --filter @wedding/api test:contract
pnpm --filter @wedding/api test:integration
pnpm build:api
pnpm health
pnpm test:scripts
```

Contract/integration commands require real PostgreSQL and existing builder fixture setup as documented in004, including runner-selected env/asset service. Existing `pnpm validate:builder` and `pnpm validate:frontend` runners provide integration/browser regression evidence with their documented environment; do not invent an env-free run. Keep auth-transition regression where touched, following006 quickstart.

## Feature runner

`scripts/responsive-validate.mjs` implements the following commands. Product/persistence gates require explicit disposable PostgreSQL and separate test storage configuration (`BUILDER_TEST_DATABASE_URL`, all `BUILDER_TEST_S3_*`, development `BUILDER_S3_*` for separation checks). Supply an ignored env file with `RESPONSIVE_TEST_ENV`; never commit credentials. Set `RESPONSIVE_TEST_BROWSER_MODE=docker` for a provisioned pinned browser image, or `native` after installing Playwright browsers/system dependencies.

```bash
node scripts/responsive-validate.mjs --phase prototype
node scripts/responsive-validate.mjs --phase contracts
node scripts/responsive-validate.mjs --phase persistence
node scripts/responsive-validate.mjs --phase rendering --story US1
node scripts/responsive-validate.mjs --phase rendering --story US2
node scripts/responsive-validate.mjs --phase publication
node scripts/responsive-validate.mjs --phase authoring
node scripts/responsive-validate.mjs --phase all
```

Runner owns setup/readiness/fixtures/timeouts/teardown, fail for missing prerequisites, and report individual gates. Phase budgets: prototype/contracts10min, persistence/rendering-story/publication/authoring15min each, all45min; job90s/capture30s. Results include run ID, versions, actual container width, issue codes, timing, assertions and cleanup; use synthetic data in optional screenshots. Timeout/error performs cleanup in finally and returns nonzero. Cleanup only run-owned rows, staged objects and spawned processes; no shared infra reset.

## End-to-end scenarios and expected results

1. **Compatibility/migration (US4)**: Seed v1 database fixtures before upgrade; migrate; read/edit/publish v1 and v2. Verify byte/hash/version preservation for old snapshots, direct SQL rejects unsupported/mismatched pair, guarded down refuses v2 without side effects.
2. **Render matrix (US1)**: Pilot has hero, wedding info, Image grid and RSVP. Record viewport AND invitation host width360/375/390/430/767/768/900/1024/1440. Assert SC001 width rules, centered root, no horizontal overflow/clipped functional content. Desktop window with host390 stays mobile. Repeat Chromium/Firefox/WebKit; canonical trusted publication uses Chromium.
3. **Parity (US2)**: Same revision/data/asOf/assets/width in mandatory Customer preview/public; Admin preview/public390/900 bổ sung trong authoring gate. Production demo/popup mới ngoài phạm vi. Compare resolved content/order and corresponding DOM rects tolerance1px after readiness. Distinguish mode-specific public RSVP interactivity from preview disabled simulation. Frozen countdown/asOf prevents false mismatch.
4. **Intrinsic content (US1)**: Long Vietnamese names/story/addresses, optional missing fields,0/1/2/3/many Image leaves within limits. Sections reflow; RSVP errors/unavailable/rate-limit messages fit. Delayed fonts/images eventually pass; broken required asset fails publication and preserves old snapshot.
5. **State/accessibility (US1/US2)**: Fill RSVP then resize767↔768; assert input values/focus retained and one submit causes one logical receipt. Traverse controls by keyboard, show focus; text-only zoom200% (not only deviceScaleFactor), reduced motion and target size. If existing popup/lightbox state is integrated, assert close/Escape/return focus across resize.
6. **Authoring (US3)**: Admin creates v2, reorders sections, configures grid/typography/artwork, binds data, undo/redo, save/reload and duplicate with remapped IDs. Preview390/900 and publish. Customer creates invitation from this revision, changes data and publishes. Customer design fields reject; template republish never changes pinned design.
7. **Publication/races (US4)**: Both canonical widths/state variants pass; fail desktop only, readiness, hash/width/version mismatch, deadline, lease loss and stale candidate. Assert atomicity, old snapshot preservation, staged cleanup and current-release asset rules. Nested/fallback/hidden authored references retained while needed; hidden/pruned/unreferenced assets denied in public allowlist. Không có desktop-only asset IDs.
8. **Manual conversion (US3/US4)**: Copy one legacy template to separate v2 draft, explicitly author sections, reuse authorized assets/bindings, inspect both layouts and publish as new revision/template. Legacy invitation remains pinned/rendered unchanged. No automatic migration by y-coordinate.

## Evidence and readiness

Trace each gate to FR/SC in spec and contracts. Report unsupported/failed scenarios honestly. Update UI-DESIGN/README only after implementation verification and any required design review; MASTER is not edited by this plan. The checked pilot was exported from real Admin authoring. Local test-host evidence is distinct from real Next/Nest/PostgreSQL/MinIO publication journeys; both are required by the all gate.

## Gate membership and test-host lifecycle

T005 pins web-owned dev-only Vite8.3.0; T006 creates loopback test host under `apps/web/e2e/responsive-host/` and smoke-tests with a stub after provisioning. T007 injects prototype; prototype gate T008 runs before schemas/capture2. T028 switches host to shared production renderer; US1 rendering gate requires no publication or production capture global. Host exposes preview/public context only to local tests and uses intercepted synthetic RSVP responses. Close host/browser on every exit; no Next app route or production test controls.

Persistence gate: T031 migration/reference suites only, no T032/T033 publication tests. Publication gate: complete pipeline, T032/T033/T045 including trusted legacy/V2 globals, full canonical passes and atomicity. Rendering US2 gate: mandatory Customer preview/public production parity at common widths360/375/390; missing surfaces/cases fail. Bare rendering runs both US1+US2 after both prerequisites exist. Authoring gate adds mandatory Admin preview/public390/900. Test-host popup is container-policy coverage only, not a production discovery claim.

## Browser provisioning and local evidence

The existing pinned image can be built without installing browser libraries on the host:

```bash
docker build -f infra/playwright/Dockerfile -t wedding-builder-playwright:1.63.0 apps/web/node_modules/playwright-core
RESPONSIVE_TEST_ENV=.artifacts/responsive/runtime.env RESPONSIVE_TEST_BROWSER_MODE=docker node scripts/responsive-validate.mjs --phase all
```

Use the installed Playwright-core directory as Docker context; resolve the pnpm symlink if Docker requires it. CI uses native browsers with installed system dependencies. The local ignored runtime.env selects existing PostgreSQL55432 and MinIO9000 with separate test identity/bucket. Runners allocate random SQL schemas/storage prefixes, actors and ports and verify teardown; they never reset shared infrastructure. Reports under `.artifacts/responsive/` contain case status, timings and cleanup, with per-browser publication timing evidence.

Optional impacted regression wrapper: `node scripts/responsive-regression.mjs` for auth and `node scripts/responsive-regression.mjs --frontend` for frontend. It uses the ignored responsive/runtime.env and auth-transition/persistent.env and allocates an owned Docker browser. These files must be provisioned locally; the wrapper is not an env-free CI command.

Runtime limits:40 sections,200 leaves,30 widgets,1MiB authored document,256KiB WeddingData1,12000px natural scene height. Required font/image readiness and layout validation run at390 and900 before final390px thumbnail; capture30s, lease45s and immutable job90s are unchanged. A failed layout/readiness/publication preserves the previous public snapshot.
