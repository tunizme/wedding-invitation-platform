# Quickstart and Validation: Invitation Builder

**Purpose**: Prove the feature against [spec.md](spec.md) and [contracts](contracts/http-api.md). This is a future implementation/run guide. At planning completion the new commands, migrations, pages and tests below do **not** exist yet; no product PASS is claimed.

## Prerequisites and setup

- Node 24, pnpm 12.3.4, Docker Compose, Linux browser runtime dependencies. Follow repository README for separate app `.env` files and existing IAM setup.
- MinIO server/client images pinned by digest in Compose during setup; private development bucket and separate disposable test bucket provisioned explicitly, with scoped non-root application credentials.
- Disposable PostgreSQL 17 database for tests. Never use a customer/production database. `BUILDER_TEST_DATABASE_URL` is required by the new runner; it must not fall back to `DATABASE_URL`.
- Implementation adds pinned `@playwright/test@1.63.0` to web dev dependencies and `playwright@1.63.0` to API runtime dependencies; sharp/Craft/Moveable/qrcode versions match research. API also adds an exact pinned `@aws-sdk/client-s3` version at T002. Commit lockfile and browser-image/package compatibility.
- Bundled licensed font files and fixtures, documented bank catalog snapshot, enough writable disk for temporary assets/browser contexts. Public map network can be offline during automated acceptance; QR generation requires no service credentials.

Run from repository root after the tooling task has been implemented:

```bash
pnpm install --frozen-lockfile
pnpm --filter @wedding/web exec playwright install --with-deps chromium firefox webkit
pnpm --filter @wedding/api exec playwright install --with-deps chromium
env POSTGRES_PORT=55432 pnpm infra:up
pnpm builder:storage:init
```

The install commands may need normal host package/network permissions. API production container must include matching Chromium/dependencies as part of its independent build; never download a different browser at application startup.

## New environment contract

API-owned variables, added to `apps/api/.env.example` and validated without echoing values:

| Name | Default / purpose |
|------|-------------------|
| `BUILDER_S3_ENDPOINT` | custom MinIO origin, e.g. http://127.0.0.1:9000; omit for standard AWS S3 endpoint resolution |
| `BUILDER_S3_REGION` | required; local MinIO uses us-east-1 |
| `BUILDER_S3_BUCKET` | required pre-provisioned private bucket |
| `BUILDER_S3_PREFIX` | required environment namespace, e.g. development/; never supplied by a request |
| `BUILDER_S3_FORCE_PATH_STYLE` | strict boolean; true for local MinIO, false for standard AWS S3 |
| `BUILDER_S3_ACCESS_KEY_ID` / `BUILDER_S3_SECRET_ACCESS_KEY` | paired API-only MinIO app credentials; omit both to use AWS SDK default credential chain/IAM role |
| `BUILDER_S3_SESSION_TOKEN` | optional, only with explicit temporary credentials |
| `BUILDER_RENDER_ORIGIN` | required fixed http(s) web origin, e.g. `http://127.0.0.1:3000`; no path/query/fragment/credentials |
| `BUILDER_RATE_HMAC_KEY` | required separate secret, ≥32 random bytes encoded as base64; never NEXT_PUBLIC |

Use existing `FRONTEND_ORIGIN` for public share links (`/i/{slug}`); do not use the possibly internal render origin. Defaults/bounds for queue/timeouts/files are constants from contracts, not unbounded environment tuning. Keep IAM key/config namespaces separate. Renderer unreachable is a job error, not failure to start unrelated IAM endpoints.

Web server-only variable `API_INTERNAL_BASE_URL` is added for public SSR fetches, e.g. `http://127.0.0.1:3001/api/v1`; validate at runtime when needed, never require API connectivity during web build. Browser retains `NEXT_PUBLIC_API_BASE_URL`. No render signing secret is needed because the harness serves no private data; API injects it directly into isolated browser memory.

MinIO owns the persistent object volume; API has no durable asset volume. `builder:storage:init` receives separate development/test credentials from local configuration or CI secrets and provisions two private buckets and two scoped non-root identities. Test identity access is restricted to its bucket under `tests/`; it cannot access the development bucket. Root env remains orchestration-only. Do not copy secrets into fixtures/commands/logs.

The runner requires these test variables, documented in the API-owned env example and exported by the local shell or injected by CI before provisioning/validation:

| Variable | Rule |
|----------|------|
| `BUILDER_TEST_S3_ENDPOINT` | Required MinIO origin, e.g. http://127.0.0.1:9000 |
| `BUILDER_TEST_S3_REGION` | Required; local us-east-1 |
| `BUILDER_TEST_S3_BUCKET` | Required; different from configured development bucket |
| `BUILDER_TEST_S3_ACCESS_KEY_ID` | Required separate test identity |
| `BUILDER_TEST_S3_SECRET_ACCESS_KEY` | Required test identity secret |
| `BUILDER_TEST_S3_FORCE_PATH_STYLE` | Required strict boolean; local true |

Missing/invalid values fail fast with variable names only. Runner maps these six values to `BUILDER_S3_*` only in child processes, clears inherited `BUILDER_S3_SESSION_TOKEN`, and generates `BUILDER_S3_PREFIX=tests/<uuid>/` itself. It never uses a caller-supplied test prefix, development credentials or AWS default credential chain. Parent environment remains unchanged; local scratch uses an owned temporary directory.

For manual development, after copying/configuring the existing per-app env files and adding the variables above, explicitly run new migrations and start the stack:

```bash
pnpm --filter @wedding/api migration:run
pnpm dev
```

Migration command uses configured development `DATABASE_URL`; it is not run automatically at API startup. Health must report web/API/DB ready without circular dependency on headless rendering. Use existing verified Customer and Admin accounts or existing IAM registration/admin bootstrap workflow; do not add production test-auth endpoints.

Storage init is an explicit local/CI provisioning command implemented during setup, bounded to 60 seconds. It creates only configured development/test buckets and scoped identities; it never resets existing objects. Root bootstrap credentials belong to infrastructure and never enter the API environment. See [storage.md](contracts/storage.md) for AWS migration and storage failure acceptance.

## Bounded validation commands to implement first

New `pnpm validate:builder --phase <phase>` or `--story <story>` root script orchestrates commands only; business fixtures/test helpers live under their owning app. It generates ephemeral test IAM/builder configuration using API-owned helpers, migrates a unique `builder_test_<uuid>` schema and allocates a unique object prefix, temporary scratch and free ports. Required storage tests use real MinIO, not filesystem mocks; API/web unit checks and builds remain independently runnable. It must not silently skip missing required suite files.

| Phase | Coverage | Overall deadline |
|-------|----------|------------------|
| setup | schema/corpus tests, safe config/scope-check, MinIO provisioning/readiness/private buckets, production React/Moveable compatibility probe | 5 min |
| foundation | setup + migrations, storage, policies, reference deletion and scoped reads | 10 min |
| editor | foundation + properties/history/binding/widget tests, renderer harness, zoom/rotated gesture browser tests | 15 min |
| templates | editor + real Chromium jobs/thumbnail/publication races | 20 min |
| invitations | templates + US4 + US5 + US6 control dependency; owner/admin form flows, fixed URL and draft/public state | 25 min |
| rsvp | invitations + new/retry/close/rate-limit/access/race scenarios | 30 min |
| all | all above + separate app checks/builds, IAM regression, public browser matrix, performance/health | 45 min |

Story selectors verify increments in implementation order, US4 → US6 → US5. Full `invitations` and `rsvp` phase gates run only after US5 is complete; story selectors do not reduce their required coverage.

| Selector | Required coverage | Overall deadline |
|----------|-------------------|------------------|
| `--story US1` | setup + foundation + US1 | 15 min |
| `--story US2` | setup + foundation + US1 + US2; equivalent to editor | 15 min |
| `--story US3` | preceding coverage + US3; equivalent to templates | 20 min |
| `--story US4` | templates + owner/customer/public US4; excludes admin-assistance suites | 25 min |
| `--story US6` | US4 dependency closure + owner/public RSVP US6; excludes admin-assistance suites | 30 min |
| `--story US5` | US6 dependency closure + US5, including Admin RSVP control | 30 min |

Run the union of dependency suites once per selector, fail fast if a required file is missing, and apply the same isolated resources and cleanup rules to story and phase gates.

Each story/phase budget includes 30 seconds reserved for shutdown and cleanup:

```text
hardDeadline = startedAt + phaseBudget
workDeadline = hardDeadline - 30 seconds
```

For setup's 5-minute budget, workload gets at most 4 minutes 30 seconds. Individual commands use the remaining work budget; browser execution remains at most 30 seconds. On success/error/handled signal/workDeadline, stop new work and terminate only owned child processes, writers and streams before deleting resources. Shutdown and cleanup together get at most `min(30 seconds, hardDeadline - now)`.

Drop only the owned schema, delete only objects under the owned test prefix, remove owned scratch and release ports; never delete a shared bucket/MinIO volume, reset the developer DB or stop unrelated infrastructure. Each storage request including retries gets at most `min(10 seconds, remaining cleanup budget)`; no retry starts after the cleanup deadline. Total phase/story deadlines above remain unchanged.

If cleanup is incomplete, exit nonzero and record `cleanup: FAILED` even if tests passed, including test bucket/prefix, remaining owned resources (or unknown inventory when listing fails) and sanitized reason. Save safe run identifiers early and reports separately; never include secrets/private payloads. SIGKILL or host shutdown cannot guarantee cleanup. The runner must not claim cleanup success when it could not stop writers or verify removal.

Example execution after exporting all six test storage variables above and provisioning the matching identities/buckets (database credential below is the repository local-only default):

```bash
env BUILDER_TEST_DATABASE_URL=postgresql://wedding_local:local-development-only@127.0.0.1:55432/wedding_local BUILDER_TEST_S3_BUCKET=wedding-builder-test pnpm validate:builder --phase setup
env BUILDER_TEST_DATABASE_URL=postgresql://wedding_local:local-development-only@127.0.0.1:55432/wedding_local BUILDER_TEST_S3_BUCKET=wedding-builder-test pnpm validate:builder --phase all
```

Per-app checks remain independently runnable:

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
pnpm build:api
```

PostgreSQL contract/integration tests and real browser flows run through isolated builder validation rather than assuming those per-app checks prove the feature end-to-end. CI adds the new suites to the four existing jobs; it must not remove IAM suites to shorten runtime.

## Acceptance scenarios

### 1. Compatibility and authoring

Create a template with each of ten element types; set every applicable property from document-format matrix. Save/open/duplicate, rename/reorder/lock/hide layers. Drag/resize rotated elements at zoom 0.5/1/2; gesture undo returns exactly to previous geometry, redo restores final state; cancel creates no history. StrictMode mount/unmount does not duplicate handlers. Protected editor builds in production and public route contains no Craft/Moveable bundle imports.

Expected: serialized canonical document round-trips, layer order and asset references preserved; unknown nested nodes/types/props/URLs are rejected. Save failure/version conflict preserves current UI changes and server version. No warning-free claim until actual browser evidence exists.

### 2. Binding and dynamic widgets

Use two sample datasets plus missing, wrong-type, long Vietnamese text, multi-event timezone and empty timeline fixtures. Optional element without usable data/fallback disappears without moving anything; fallback restores display; manual hide remains hidden. Required input missing blocks publish. Preview does not persist sample data or submit RSVP. Check Gregorian calendar, expired countdown, Map card/link and timeline array order.

Expected: client resolver and API resolver produce matching scenes for shared corpus; four public widths preserve document and fit. Test every RSVP state, longest supported countdown and max timeline fixture, not only initial happy path.

### 3. Assets and publication

Upload accepted raster files, alpha decoration and each unsupported/malformed/oversized/multiframe input. Verify orientation, metadata removal, bounds and no external fetch. Race deletion against save/reference addition. Publish a valid template; poll Operation to success and inspect top cover. Change draft while capture is paused: final publication must conflict. Inject renderer/font/image/storage failure, timeout, full queue and worker death/reclaim.

Expected: old public revision remains intact on every failure; no failed upload becomes referenceable; stale job cannot finalize; published references prevent file deletion; private candidate payloads are cleared after terminal status. External maps never run during capture. Verify template unpublish prevents new selection while existing pinned drafts/public invitations still work.

### 4. Customer and admin-assisted invitations

Customer A creates from catalog, enters WeddingData, publishes and shares generated URL. Edit draft: Guest still sees old public content until successful republish. URL stays identical across rename/unpublish/republish. Admin creates for A: A owns it and actual Admin is recorded; Customer B cannot access it. Admin can read/edit only supported invitation context and scoped assets; Admin cannot list RSVP.

Expected: no owner/actor confusion, no access through forged body fields, no private data in public scene. Unused WeddingData, invisible photos and bank data omitted from scene cannot be downloaded via guessed asset URLs. Every accepted assisted mutation commits audit or fails entirely.

### 5. RSVP concurrency and access

Guest submits attending/declined data; owner sees one receipt. Repeat same key/payload after simulated connection loss and after closing/unpublish: only prior receipt returns. Same key/different payload fails. New keys with same name are distinct. Six new accepted attempts from one source within rolling ten minutes: sixth denied with Retry-After; replay is not counted again. Test window boundary and multiple source identities with controlled server-side fixtures.

Pause submission transaction and race close/unpublish; assert commit ordering. Open/close through owner and Admin takes effect without publishing draft, preserves responses, and emits assistance audit when appropriate. Other owners/Guest/Admin cannot read private response lists. Stale public page cannot bypass new closed state.

### 6. Private file and public availability

Fetch current release asset successfully, unpublish, then request scene and asset again: unavailable. Old public_version URLs fail after republish, even if bytes retained for another reference. Client already holding bytes is outside revocation scope. Check no-store, anonymous MinIO GetObject/ListBucket denial, no browser presigned URLs, unauthenticated storage-path denial, MIME nosniff, exact-origin CORS and safe errors. Token/RSVP/account payloads must not appear in application logs.

### 7. QR and integration acceptance

Decode the official provider example independently to check TLV/CRC understanding; compare local producer to a reviewed static/no-amount fixture, then decode generated image back to identical payload. Manually scan one supported account QR with two bank apps and verify destination; do not execute a transfer. Record app/date/catalog version without real account values in committed evidence. Test Map blocked/offline while venue/address/directions link and RSVP remain usable.

### 8. Measurable outcomes and migrations

Measure on Linux 4 vCPU/8 GiB, production builds, pinned Chromium, local PostgreSQL/MinIO, warm assets/fonts, no network throttling. Record actual hardware/browser/package versions. Fixture: 100 primitive elements +10 widgets (110 total); also smoke max 200/30. Run 20 warm-up +100 measured property/selection interactions, 20 saved-template opens; nearest-rank p95 against ≤200 ms/≤3 s. Archive timing summaries and fixture hashes. Browser correctness across Chromium/Firefox/WebKit at 360/390/768/1440, no horizontal page overflow.

Separately time the spec's human workflows: Admin sample creation ≤15 min, prepared Customer invitation ≤10 min, Guest RSVP ≤60 s. Automated browser durations are not substitutes for those usability observations. Verify additive migrations from empty and IAM-only schemas, repeat-run no-op, disposable reverse/forward round-trip and untouched IAM authorization/session tests.

## Evidence and completion

Implementation creates `validation-results.md` recording command, revision, environment, counts/durations, PASS/FAIL, cleanup result, failures repaired and remaining manual evidence. Failed compatibility/QR/overflow evidence blocks the corresponding milestone; update design rather than claiming success. Planning validates documents only and does not supply these results.

No production deployment, provider-account creation or real invitation publication is performed by this guide automatically. Local fixtures and test runtime are disposable. Production PostgreSQL/object-store backup/restore and reverse-proxy trust configuration belong to explicit deployment readiness, not a claim made by these local tests.
