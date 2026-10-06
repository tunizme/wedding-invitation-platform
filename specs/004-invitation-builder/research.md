# Research: Invitation Builder

**Date**: 2026-10-01 | **Spec**: [spec.md](spec.md)

Research resolves the design choices deferred by specify/clarify. Decisions below are engineering choices, not claims that implementation or load tests have passed. Repository baseline: Node 24, pnpm 12.3.4, TypeScript 5.9.3, Next 16.3.5, React/React DOM 19.3.0, Nest 11.2.5, TypeORM 0.3.31, PostgreSQL 17, Vitest 4.1.11. Installed packages/lockfile were inspected; retain these existing versions.

## R1 — Craft.js and Moveable ownership

**Decision**: Add exact `@craftjs/core@0.2.12` and `react-moveable@0.56.0` to web. Craft owns durable document/history; Moveable owns transient geometry interaction. Commit x/y/width/height/rotation together with one `setProp` at gesture completion. Cancel restores the prior visual state without a history entry. Do not attach Craft drag connectors to the same element. Freeze save/publish while a gesture is active.

**Rationale**: Craft 0.2.12 explicitly declares React 19 support. Moveable has no equivalent application-specific compatibility evidence; a bounded production-build integration test is required before the full editor. Throttling history by time does not ensure one undo per long gesture.

**Alternatives considered**: Craft-only positioning lacks the desired geometry handles; a second persistent editor store creates divergent undo/save state; intermediate `history.ignore()` writes risk incorrect undo origins. No React downgrade is authorized.

**Evidence**: [Craft manifest](https://raw.githubusercontent.com/prevwong/craft.js/main/packages/core/package.json), [Craft changelog](https://raw.githubusercontent.com/prevwong/craft.js/main/packages/core/CHANGELOG.md), [Craft actions/history](https://craft.js.org/docs/api/useEditor/), [Moveable manifest](https://raw.githubusercontent.com/daybrush/moveable/master/packages/react-moveable/package.json), [Moveable API](https://daybrush.com/moveable/release/latest/doc/Moveable.html). Read the installed Next lazy-loading guide: `ssr:false` belongs in a Client Component; editor is dynamically imported from that boundary. Public rendering must not import Craft/Moveable.

## R2 — Document format and canonical coordinates

**Decision**: Application-owned schema v1 wraps allowlisted Craft serialized nodes through an explicit adapter (UUID node creation, ROOT parent-null normalization); one ROOT and flat children only. ROOT child order is the sole z-order. Use 390 canonical CSS px width; initial height 1,600, allowed 390–12,000. Limit 200 elements including 30 widgets and 1 MiB document JSON. Public scale is `min(availableWidth / 390, 1)`; the wrapper reserves scaled height. Zoom 25–200% is editor-only. Element rotation origin is center; canvas transform origin is top-left.

**Rationale**: Mobile-sized coordinates keep public forms usable at phone widths and avoid duplicating layouts. Application validation prevents deserializing arbitrary component types, styles or executable payloads. Limits are MVP budgets to test, not measured capacity.

**Evidence**: Craft [node creation](https://raw.githubusercontent.com/prevwong/craft.js/main/packages/core/src/utils/createNode.ts) defaults generated IDs/ROOT parent null; [serialization](https://raw.githubusercontent.com/prevwong/craft.js/main/packages/core/src/utils/serializeNode.tsx) does not itself enforce this application contract.

**Alternatives considered**: A second normalized layout tree creates adapter drift; arbitrary nested Craft canvases create grouping/reflow scope not approved for MVP; desktop artboard scaling produces tiny phone controls.

## R3 — Binding, optional elements and public projection

**Decision**: Fixed typed WeddingData catalog, explicit event IDs and binding field names; no eval, templates-as-code or arbitrary object paths. Resolve supplied value, then explicit fallback. Missing essential inputs hide an optional element as a whole, preserving its frame; required elements block publication. Wrong types remain errors. Manual hide wins over resolved visibility. Optional auxiliary inputs (e.g. bank transfer message) may be empty without hiding the widget.

**Rationale**: This encodes the first clarification and lets server validation and customer forms use the same declared catalog. API returns a resolved public scene containing only visible content and required assets, never the full customer snapshot, owner data or editor document.

**Alternatives considered**: Dynamic expressions enlarge execution/validation scope; publishing all WeddingData leaks unused private fields; moving later elements contradicts fixed-height canvas.

## R4 — Authoritative publication and thumbnail

**Decision**: API-owned `playwright@1.63.0` runs its pinned Chromium against a fixed web-owned empty render harness. Node injects a captured candidate directly into the page; no user-provided URL, auth token in query, public validation callback or private-document download endpoint. Intercept allowlisted asset requests and fulfill from authorized AssetStore bytes. Browser outbound traffic permits only the configured web origin's harness/static/versioned-font paths; reject redirects/off-origin requests. Capture uses the same web display components as public and editor.

Await explicitly requested font faces, `document.fonts.ready`, successful image decoding and renderer-ready. Measure visible text/content overflow and rotated bounds, including RSVP error/success/closed states and countdown worst-case digit frames. Cover is top 390×520 PNG (pad background if canvas shorter), not a long thumbnail. Map is a venue card during capture; external tiles are not a publication dependency. Freeze sample time for repeatable covers. Two active jobs, ten pending, 30-second execution timeout and 90-second total deadline per publish operation.

**Rationale**: User-browser screenshots cannot establish trustworthy overflow validation. No root shared business package or web-source import into API is needed: web and API build/test independently with fixtures/adapters; actual publication requires both running. Renderer outage leaves saved drafts/public state intact and fails the operation with a retryable code.

**Alternatives considered**: Client screenshots allow forged reports; parallel server HTML rendering drifts in fonts/layout; unbounded inline HTTP capture exhausts resources. API uses PostgreSQL publication jobs and a worker in the existing process, not another service/broker.

**Evidence**: [Playwright release](https://github.com/microsoft/playwright/releases/tag/v1.63.0), [screenshot API](https://playwright.dev/docs/api/class-page#page-screenshot), [font loading specification](https://drafts.csswg.org/css-font-loading/). Compatibility and real rendering remain implementation validation gates, not completed research experiments.

## R5 — Assets and fonts

**Decision**: User-approved MinIO private bucket behind a provider-neutral `AssetStore` using AWS SDK v3 `@aws-sdk/client-s3`; one API instance in MVP. Compose owns MinIO persistence; application code uses the S3 API subset in [storage.md](contracts/storage.md), not MinIO-specific SDK/admin APIs. SDK version and MinIO server/client images are verified and pinned before integration tests at T002. This decision supersedes the earlier filesystem choice. Upload JPEG/PNG/static WebP only, ≤10 MiB, ≤25 megapixels, each edge ≤10,000 px. Decode with `sharp@0.35.5`, reject multi-frame, auto-orient, strip metadata, resize longest edge to ≤4,096 and encode WebP preserving alpha. No external image URL import, SVG/GIF or font upload. Decoration uses alpha images; Shape uses built-in primitives.

Bundle licensed Noto Sans and Noto Serif regular/bold/italic/bold-italic Vietnamese-capable WOFF2 faces with stable versioned IDs and checksums. Font bytes and license notices are committed during implementation. Do not replace bytes behind an existing ID; no runtime font-provider dependency.

Asset metadata and reference sets are persisted transactionally. Public asset requests are scoped to a currently published invitation and current release or catalog thumbnail, with `no-store`; permanent unauthenticated storage URLs are not exposed. Asset deletion locks/checks references and tombstones the asset before byte deletion. Staging/orphan cleanup is bounded and cannot delete referenced bytes.

**Rationale**: MinIO meets the explicitly requested storage choice and lets the same S3 adapter target AWS later; provider URLs/credentials remain outside documents. Scoped access supports unpublish semantics. Raster re-encoding narrows active-content and EXIF leakage risks.

**Alternatives considered**: API-local durable files were rejected by the user in favor of MinIO. Public bucket or browser presigned URLs bypass immediate lifecycle checks and are excluded. Arbitrary SVG/font uploads remain excluded. PostgreSQL and object-store backups must be coordinated before production use; horizontal scale is not claimed. Moving to AWS requires copying and verifying existing objects under identical keys as well as changing configuration; it is not a zero-data-migration promise.

**Evidence**: [AWS SDK v3 S3 client](https://github.com/aws/aws-sdk-js-v3/blob/main/clients/client-s3/README.md), [AWS credentials](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials.html), [MinIO S3 API compatibility](https://docs.min.io/aistor/developers/s3-api-compatibility/) (API reference; validate the selected MinIO distribution/image with real integration tests), [sharp release](https://github.com/lovell/sharp/releases/tag/v0.35.5), [input options](https://sharp.pixelplumbing.com/api-constructor/), [security notes](https://sharp.pixelplumbing.com/security/).

## R6 — Map and QR Bank

**Decision**: Venue has validated coordinates. Render a lazy OpenStreetMap iframe built from coordinates, plus permanently visible venue/address and a Google Maps directions link. No raw iframe/URL input, API key or geocoding in MVP. Failure of the cross-origin map does not block the thiệp or RSVP; do not rely on detecting iframe errors.

QR uses local NAPAS account-transfer profile encoding (TLV lengths + CRC16) and `qrcode@1.5.4`; no account lookup, transfer execution or remote QR request. Bundle a reviewed bank BIN snapshot from Casso's catalog. Allowlisted BIN is six digits; account is a string of 6–19 digits preserving leading zeroes; recipient display name 5–50 Unicode characters; optional message ≤25 ASCII letters/digits/spaces; no amount field. Reject unsupported input instead of silently truncating. Recipient name is displayed beside the QR and is not asserted to be verified or encoded by the transfer profile.

**Rationale**: Public pages need neither paid credentials nor per-view requests disclosing account details to a QR provider. OSM is best-effort without SLA. Bank interoperability must be validated against provider vectors and by scanning with two bank apps without transferring money.

**Alternatives considered**: Provider-generated QR adds availability/privacy dependency; broad third-party codecs with silent input normalization obscure validation. Full certification is not claimed: authoritative Casso examples are golden vectors, not NAPAS certification.

**Evidence**: [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/), [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started), [VietQR generation example](https://www.vietqr.io/generate/), [bank catalog](https://www.vietqr.io/danh-sach-api/api-danh-sach-ma-ngan-hang/), [qrcode manifest](https://raw.githubusercontent.com/soldair/node-qrcode/master/package.json).

## R7 — Snapshot publication and concurrency

**Decision**: Immutable template revisions, mutable template draft, immutable invitation design FK, and separate draft/public WeddingData. Every edit uses an integer expected version. Capture a publish candidate, render without holding DB locks, then lock/recheck version, actor policy, assets and publication-job lease before committing pointers/references/audit atomically. Version conflict discards staged output and never overwrites newer work. URL is a random UUID generated at first successful publish and fixed thereafter, per clarification.

New RSVP insertion, open/close, publish and unpublish all lock the same invitation row. Commit is the effect boundary. Existing request-key replay with same normalized payload returns only the prior receipt even after close/unpublish; different payload with that key returns 409. New attempts require public + visible widget + open, after locking. Accepted new responses count against a rolling 5/10-minute per-source/per-invitation limit; source is HMAC of the socket address, not client-forwarded headers. Duplicate replay consumes no new slot.

**Rationale**: This gives a testable linearization point for close/unpublish and keeps retry distinct from new submission. Separate `controlVersion` for RSVP avoids unrelated draft conflicts; publication never resets `rsvpOpen`.

**Alternatives considered**: Read-then-insert without a shared lock allows late responses; a fixed time bucket can admit ten responses around a boundary; template pointers without immutable revisions mutate existing invitations.

**Evidence**: [PostgreSQL 17 explicit locks](https://www.postgresql.org/docs/17/explicit-locking.html). Existing IAM contract explicitly requires resource policies and does not grant ADMIN implicit owner bypass.

## R8 — Validation environment, recovery and observability

**Decision**: No production deployment in this feature. Reference performance run: Linux x86-64, 4 vCPU/8 GiB RAM, pinned Chromium, local PostgreSQL/MinIO, production web/API builds, no network throttling, assets warm. Test 100 primitive elements +10 widgets (110 total), maximum-size fixture separately. Browser correctness matrix includes Chromium/Firefox/WebKit at public widths 360/390/768/1440; editor Chrome/Edge desktop and zoom 0.5/1/2. Use 20 warm-up + 100 measured interactions and 20 saved-template opens; report environment and p95 against spec budgets, not real-world SLA.

Structured events record operation IDs, actor/resource UUIDs, duration, result code and validation counts; never WeddingData, raw RSVP, bank/account text, raw IP, document bodies or render payloads. Monitor publish queue depth, timeout/conflict/failure counts, asset failures and RSVP 429 counts. Workers recover expired leases, clean their own temporary artifacts, and bound retries; existing application health stays independent of web renderer availability. Renderer availability is a publish-operation dependency, not an API startup circular dependency.

**Alternatives considered**: Defining production uptime/backup SLAs without a hosting scope invents requirements; unbounded jobs/retries make local validation unreliable. Business data retention/deletion workflows are not introduced here; transient jobs and source hashes have explicit TTL in the data model.

## Phase 0 completion

All design unknowns have decisions. Required implementation evidence remains: React/Moveable compatibility, real Chromium/font/widget fit, upload limits, QR golden/decode/manual scans, PostgreSQL race tests and performance measurements. Failures block the affected implementation milestone and require a documented design revision; they are not reported as passed by this research.
