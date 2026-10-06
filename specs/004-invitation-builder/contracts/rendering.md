# Rendering, Publication and Asset Contract v1

Boundary: API owns authorization, typed resolution and persistence. Web owns display components and browser measurement. No frontend-supplied screenshot or validation boolean authorizes publication. Wire shapes: [document-format.md](document-format.md); state/locks: [../data-model.md](../data-model.md).

## Editor and pure renderer

- Craft owns persisted nodes/history; Moveable manages only transient gesture geometry. At gesture end a single action commits complete geometry; cancellation restores view. Pointer coordinates map through inverse canvas scale, not Moveable control zoom alone. Resize of rotated elements preserves the intended opposite anchor in canonical coordinates. Numeric properties and layer commands use the same mutation layer.
- Locked elements cannot rename, edit, reorder, delete, duplicate or transform until unlock. Hidden elements stay selectable from layers but do not appear on canvas preview/public. Multi-select/group/nesting are rejected, not partially enabled.
- Layer order derives from ROOT.nodes. Bring-forward/backward swaps adjacent indices; front/back moves to array end/start. No independent persisted z-index. Decoration/Shape properties use fixed schema; never style object spreading from arbitrary JSON.
- Shared display components consume resolved props/context. Editor wrappers alone use Craft hooks. Client-only editor loads through a Client Component dynamic boundary. Static public content can server-render; countdown/RSVP/map behavior hydrates in bounded client components. No Craft/Moveable code is imported into the public route dependency graph.
- Canvas is 390 canonical px wide, scaled uniformly with a wrapper of matching scaled dimensions; at desktop it is centered, never expanded above 1×. Preview and public have identical sizing math. Controls/hit targets are outside saved document. Property input and layer selection supply keyboard alternatives.

## Empty web harness

Route `/internal/invitation-renderer` serves a blank, noindex, no-store page containing only trusted renderer code and bundled font references. It accepts no query payload, postMessage, authentication tokens or user-directed URL. Public access to this empty shell reveals no document or private data. Browser script surface:

```text
window.invitationRenderer.version = 1
window.invitationRenderer.render({
  candidateHash, scene: ResolvedScene,
  context: {mode:"capture",asOf,assetUrls},
  states: "publication-validation"
}) -> Promise<{
  version:1,candidateHash,ready:boolean,
  issues:{nodeId?:UUID,path:string,code:string}[],
  captureRect:{x:0,y:0,width:390,height:520},
  hasVisibleRsvp:boolean
}>
```

This is a browser-internal interface called only by API-controlled Playwright `page.evaluate`, not an HTTP endpoint returning reports supplied by users. API compares version/hash and expected RSVP presence; API-generated candidateHash is not accepted from a customer request. The harness cannot save data, send RSVP or navigate to customer links. Scene renderer supports an explicit fixed asOf clock for cover determinism.

API creates a new isolated browser context per job with DPR 1, viewport 390×780, reduced motion and fixed locale vi-VN. Do not inject IAM access tokens/cookies. Intercept `/__render-assets/{assetId}` on the trusted web origin and fulfill from preauthorized immutable AssetStore bytes; unknown IDs fail. Allow harness HTML, exact Next static assets and bundled versioned font paths only. Block external domains, service workers, arbitrary routes, file URLs, redirects, popups and downloads. CSP should prohibit unexpected scripts/frames; map frames are disabled in capture.

Production API container includes pinned Chromium and system libraries through Playwright's documented installation, runs non-root with sandbox-capable environment; do not silently fall back to disabling sandbox. Test this container path. API/web builds do not contact each other; publication worker contact is a runtime configured dependency. Harness schema version remains backward compatible for v1 published scenes; future incompatible version requires coordinated contract revision.

## Deterministic measurement

1. Resolve scene and candidate asset/font list before rendering. Validate all requested asset hashes and existence; no URL fetching from wedding data.
2. Load each used font face explicitly and require successful load/check; await `document.fonts.ready`, image `.decode()` and ready render frames. A settled readiness promise without intended faces is failure. Missing required asset/font fails publication with safe node/path issue.
3. Text uses pre-wrap/word-break rules shared with public. Compare actual content scroll size to inner frame allowing ≤1 canonical px rounding. Check transformed box corners against canvas; decorative shadow blur may extend outside the element but is clipped by the canvas and does not create page horizontal scroll. Image object-fit cover is intentional cropping and is not text overflow.
4. Only visible resolved nodes participate in required/fit checks. Validate Calendar's full month, Timeline with actual entries, Countdown worst-case formatted digits and expired state, RSVP open/error/submitting/success/closed states. Dynamic status labels reserve fixed geometry; errors cannot push following elements. User-entered RSVP inputs use native scroll within controls, not expanding card height.
5. Map capture renders fixed-size venue/address/directions card and reserved map rectangle, without tile requests; public uses same rectangle plus lazy iframe. External map uptime does not determine publish success. QR always renders local code, white quiet zone and account/name text.
6. If any issue or timeout occurs, do not capture/publish. Otherwise restore the normal frozen scene and widget states after probing every variant, await readiness again, and capture top 390×520 PNG with animations disabled and deterministic sample timestamp; if canvas shorter than 520 fill remaining area with its background. Long-page capture is intentionally excluded.

Template capture uses fixture sample clock `2026-01-01T00:00:00Z`; sample wedding fixture is future relative to that clock. Invitation capture uses enqueue-time asOf, also exercises fixed state variants. Immutable font registry prevents old revisions changing due to replacing font bytes. Renderer bug fixes must run v1 golden corpus; changes intentionally altering old output require versioning, not silently reinterpretation.

## Publication protocol

1. **Enqueue**: authenticate/authorize resource, then replay a matching requester/Idempotency-Key receipt before version, active-job or queue checks. For a new key, lock resource, compare expected edit version, validate document/data types and asset scopes, resolve candidate scene, create bounded operation and job references. Publish applies saved draft only. Duplicate Idempotency-Key returns existing receipt; resource active-job conflict is explicit.
2. **Claim**: API worker claims pending DB row with a lease, at most two jobs active. Browser execution ≤30 s, entire job deadline ≤90 s. UI polls the persisted Operation. DB never holds a lock while browser/network work runs.
3. **Capture**: call trusted harness, validate report, stage generated cover bytes for template publish under a job/lease-specific key. Invitation publish uses overflow validation but does not generate a public long screenshot/thumbnail. Validate candidate hashes again before finalization.
4. **Commit**: lock root, re-authorize requester, verify captured edit version and live job lease/deadline, lock all referenced assets READY. Insert immutable template revision + thumbnail metadata or install invitation public snapshot/scene/refs. Allocate slug only on first successful invitation publication. Increment proper versions; never overwrite current rsvpOpen/controlVersion. Commit audit and operation success atomically.
5. **Failure/recovery**: conflict/overflow/missing font/storage/renderer failure preserves all current public pointers. Only the worker still owning matching RUNNING status/lease may mark failed, clear candidate private data and release job refs. The deadline reaper locks/takes terminalization ownership. Stale workers may remove only their own unreferenced attempt artifacts and must not clear a successor's candidate, refs or thumbnail. Expired worker lease may retry once within deadline. A worker with stale lease cannot commit. Retry after a terminal failure creates a new operation key.

Template status PUBLISHED selects current published revision. Saving new draft does not change selection. Unpublish stops new selection but does not invalidate existing invitations, including drafts. Customer create checks selected revision is still current and template available transactionally; otherwise return TEMPLATE_UNAVAILABLE and ask selection refresh.

Unpublish or immediate RSVP close during a queued invitation publish is not lost: unpublish increments editVersion so candidate commit conflicts, including a repeat unpublish on an UNPUBLISHED resource that has an active republish job; close changes controlVersion only and final publish preserves its latest value. Multiple admin/customer updates use the same CAS rules. Invite control/version scopes are independent intentionally, not two sources of truth for one field.

## File lifecycle and delivery

- Configured private MinIO bucket/prefix is accessed only by API through the S3-compatible AssetStore in [storage.md](storage.md). Generate opaque immutable keys, never use uploaded names as keys. Pipeline validates signature, decode pixel bounds/frame count and normalization, then confirmed PutObject plus fenced write-intent/READY commit; no rename semantics. Local temporary files are scratch only. Enforce decoder timeout 10 s, max two concurrent decodes and max ten pending; excess →503 STORAGE_UNAVAILABLE with Retry-After.
- Disallow SVG/GIF/animated WebP/fonts, remote imports and extension-only MIME checks. Resource type does not grant trust: Admin uploads use same validation. Keep checksum and immutable content; normalization strips EXIF/location metadata.
- Customer owns customer images, even when admin uploads for an invitation. Admin assistance can read assets referenced by that invitation or specifically uploaded to it, not browse all customer images. Protected frontend previews fetch with Bearer authorization then use revocable object URLs; do not put access tokens in image query strings. Public previews use scoped no-store asset URLs.
- Draft/public/revision/job references prevent deletion. Delete locks asset, verifies direct FK and ref-table usage, marks DELETING, commits, removes bytes, then marks DELETED; failure retries cleanup. Never delete a file before winning the DB reference check. Concurrent ref insertion and metadata-cover assignment lock the same asset and reject non-READY state. Check direct cover/thumbnail FK usages explicitly before tombstoning; FK constraints alone only prevent deletion of rows.
- Public assets require current published invitation version and visible-scene membership. Template selection assets require valid authenticated selection/pinned access. No anonymous bucket policy, public object URL, presigned browser URL or redirect exposes storage; API streams authorized bytes. Unpublish stops authorization for future requests; downloaded bytes cannot be recalled.
- Keep orphan-object cleanup bounded and use storage write-intent fencing to distinguish abandoned uploads from committed objects. Cleanup first checks intent ownership and metadata/reference state. Retain previous public data asset refs only while they remain referenced by another snapshot/revision; old public URL/version access always fails once replaced.

## Map and bank integrations

OpenStreetMap iframe is generated from lat/lng with a small bounded bbox around venue; use sandbox allowing only behavior required for viewing, lazy loading, attribution and strict frame-src policy. Always show address/directions link because cross-origin iframe failures cannot be reliably detected. Directions URL uses Google Maps documented `api=1` destination coordinates, URL-encoded by application. No raw iframe, embed URL or HTML field.

Local bank QR encoder is a narrow pure function producing account-transfer payload. Implementation must document exact TLV profile using reviewed Casso sample: payload-format 00=01, point-of-initiation 01=11 (static/no amount), merchant-account 38 with GUID `A000000727`, consumer-account subfields bank BIN/account and service `QRIBFTTA`, currency 53=704, country 58=VN, optional additional-data purpose, terminal CRC field 63 length 04. Compute byte lengths, CRC16-CCITT-FALSE over payload including `6304`; reject any input not representable by selected profile. AccountName is display text, not a verified encoded identity. This is provider-example-compatible design, not a certification claim.

Independently decode the official Casso example to verify TLV/CRC parsing; that example uses dynamic initiation (01=12) and an amount, so it is not an exact expected output for this static/no-amount producer. Use a separate reviewed 01=11/no-amount vector for exact producer comparison; image decode test confirms payload round-trip. Do not add amount support just to match the provider example. Two real bank-app scans confirm displayed destination without executing payment before declaring QR acceptance passed. Bank catalog snapshot includes source date/license review and changes through reviewed updates; rendering an existing revision never does live catalog replacement or account lookup.

## Required failure tests

- Renderer offline, wrong contract version, font load false, image decode failure, browser crash/timeout, queue saturation, failed artifact write and expired lease leave public state unchanged.
- Tampered URL/document/type/style fails before browser navigation; attempted external requests/file reads are blocked and logged only as safe codes.
- Change draft, unpublish or delete/replace asset while validation runs; final commit respects captured version/references and never serves half-updated content.
- Close/unpublish races with new RSVP; committed receipt replay after closure returns only receipt; changed payload with same key fails; no quota consumed twice.
- Preview/publish parity on Vietnamese long text, rotated boxes, all widget state variants, optional hidden nodes and four public widths. API never accepts a client-side “valid” flag.
