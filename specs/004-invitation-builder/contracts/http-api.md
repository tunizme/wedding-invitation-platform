# Invitation Builder HTTP and UI Contracts v1

Base `/api/v1`. This document is normative for DTOs, generated Swagger/OpenAPI and contract tests introduced during implementation. Existing IAM endpoints/semantics remain unchanged. Document/data types are in [document-format.md](document-format.md); transaction rules in [../data-model.md](../data-model.md).

## Common rules

- Auth uses existing Bearer access tokens. Guest routes are explicitly public; default is protected. `ADMIN` never implies owner permission. Customer resource mismatch returns the same 404 as nonexistent resource; wrong role returns 403, missing/invalid authentication 401.
- `id`, revision ID, asset ID, operation ID, public slug and request keys are UUIDs. Invalid syntax →400. No route accepts bucket names, storage endpoints, object keys, filesystem paths, renderer URLs, raw HTML or role claims.
- Mutations to a resource require `{expectedVersion:positiveInt}` matching editVersion; mismatch →409 `VERSION_CONFLICT`. RSVP control instead uses `{expectedControlVersion:positiveInt,open:boolean}`. Return current version only to a caller authorized for the resource. Do not merge changes silently.
- POST creation returns 201; normal GET/PATCH/action returns 200; DELETE asset returns 204; publish enqueue returns 202 + `Location` for operation polling. No 200 “success” response before persistence. Publish operation completion is distinct from enqueue success.
- List envelope `{items: T[], nextCursor: string|null}`; `limit` default 20, range 1–100. Opaque base64url cursor contains last sort fields and ID, validated strictly; owner lists newest first; template catalog `(sortOrder,id)` ascending. `q` ≤120, category ≤64, tags filter one exact tag, asset kind allowlisted. No total-count requirement.
- JSON reject unknown fields. Draft save replaces the complete document/data snapshot, not arbitrary nested patches. Metadata PATCH only allows listed metadata keys. Omitted metadata fields stay unchanged.
- All builder JSON/public pages/scoped assets use `Cache-Control: no-store`; never publicly cache a response that bypasses publication checks. `X-Content-Type-Options:nosniff` on files. Public pages use `noindex,nofollow` in MVP (discovery/SEO is outside scope, not access control).
- CORS keeps exact configured frontend origin/credentials; add DELETE and `Idempotency-Key` to explicit allowlists; expose Retry-After and Location. No wildcard origin. Existing IAM CSRF behavior is unchanged. RSVP has no cookie-authorized identity; unguessable slug/key is not proof of guest identity.
- Body bounds: template writes 1.5 MiB including document+sample/metadata, invitation data 272 KiB including envelope, RSVP 8 KiB, multipart upload 10 MiB file + bounded fields. Route-aware parsers must avoid the current default JSON parser rejecting a valid design first; retain existing IAM body limits and test them.

### Response shapes

```text
TemplateSummary = {id,name,category,tags,status,sortOrder,coverUrl:null|string,
                   publishedRevisionId:null|UUID,editVersion,createdAt,updatedAt}
TemplateDetail = TemplateSummary + {draftDocument,draftSampleData,coverAssetId,createdBy}
TemplateChoice = {id,name,category,tags,coverUrl:string,publishedRevisionId}
InvitationSummary = {id,status,publicUrl:null|string,publicVersion,editVersion,
                     controlVersion,rsvpOpen,createdAt,updatedAt}
InvitationDetail = InvitationSummary + {ownerId,createdBy,designRevisionId,
                     draftWeddingData,templateName,document,formFields}
AssetSummary = {id,name,kind,mimeType,byteSize,width,height,createdAt,previewUrl}
Operation = {id,status:"PENDING"|"RUNNING"|"SUCCEEDED"|"FAILED",createdAt,
             result:null|{resourceId,editVersion,revisionId?:UUID,
                          publicVersion?:number,publicUrl?:string},
             error:null|{code,issues:Issue[]}}
Issue = {path:string,nodeId?:UUID,code:string}   // no rejected private values
Receipt = {receiptId:UUID,acceptedAt:ISO8601Instant}
RsvpItem = Receipt + {name,attendance,partySize,message}
```

Protected invitation document is read-only input for preview; returning it grants no mutation capability. `formFields` contains catalog field IDs, labels, types, limits and required/optional metadata derived by server, not executable UI definitions. `coverUrl` and asset previewUrl are server-generated contextual endpoints.

`TemplateDetail` inherits nullable `coverUrl` from `TemplateSummary`. Cover selection uses `cover_asset_id` when configured, otherwise the retained published revision's thumbnail; if neither exists, return `coverUrl:null`. A null cover renders a local UI placeholder and triggers no image request. Published catalog choices always have a cover because publication requires a generated thumbnail. Non-null cover URLs use `/templates/{id}/cover`; authorization and current availability are checked again on every image request, not only when generating the URL.

## Admin template endpoints

All routes below require ADMIN.

| Method/path | Request | Result / semantics |
|-------------|---------|--------------------|
| GET `/admin/templates` | q/category/tag/status/limit/cursor | TemplateSummary list |
| POST `/admin/templates` | `{name,category,tags?:[],sortOrder?:0}` | TemplateDetail with default blank design/sample fixture, version 1 |
| GET `/admin/templates/{id}` | — | TemplateDetail |
| PATCH `/admin/templates/{id}` | `{expectedVersion,name?,category?,tags?,sortOrder?,coverAssetId?:UUID\|null}` | updated TemplateDetail; cover must be authorized TEMPLATE asset |
| PATCH `/admin/templates/{id}/draft` | `{expectedVersion,document,sampleData}` | new editVersion + full detail; structure-valid incomplete designs allowed |
| POST `/admin/templates/{id}/duplicate` | `{expectedVersion,name}` | new TemplateDetail; copy current draft and sample, not history/public pointer |
| POST `/admin/templates/{id}/publish` | `{expectedVersion}` + Idempotency-Key | Operation; capture saved draft, validate/render/thumbnail then atomically publish |
| POST `/admin/templates/{id}/unpublish` | `{expectedVersion}` | TemplateDetail; DRAFT without prior publication →409 `NOT_PUBLISHED`; repeated UNPUBLISHED is a no-op only without an active republish job; otherwise advance editVersion to invalidate that candidate |

Metadata updates require same expectedVersion as draft writes. Catalog reflects metadata edits immediately; immutable design revision used by invitations never changes. Thumbnail comes from current published revision unless cover override is set. Missing font/image/overflow blocks publication, not a valid draft save.

## Customer template selection and invitations

These routes require CUSTOMER.

| Method/path | Request | Result / semantics |
|-------------|---------|--------------------|
| GET `/templates` | q/category/tag/limit/cursor | currently PUBLISHED TemplateChoice list |
| GET `/templates/{id}/revisions/{revisionId}` | — | read-only `{id,revisionId,document,sampleData,formFields}` for current published revision only; existing invitation uses its own endpoint |
| GET `/invitations` | limit/cursor | owned InvitationSummary list |
| POST `/invitations` | `{templateId,designRevisionId}` | InvitationDetail, owner from principal; lock/recheck template available/current revision |
| GET `/invitations/{id}` | — | owned InvitationDetail, including its pinned document even if template unavailable |
| PATCH `/invitations/{id}/draft` | `{expectedVersion,weddingData}` | InvitationDetail; replace draft only |
| POST `/invitations/{id}/publish` | `{expectedVersion}` + Idempotency-Key | Operation; publication validates latest saved candidate; first success generates fixed `/i/{UUID}` |
| POST `/invitations/{id}/unpublish` | `{expectedVersion}` | InvitationSummary; DRAFT →409, UNPUBLISHED no-op only without active republish; otherwise advance editVersion to invalidate it |
| PATCH `/invitations/{id}/rsvp-state` | `{expectedControlVersion,open}` | `{controlVersion,rsvpOpen}` immediate; does not publish draft or change editVersion |
| GET `/invitations/{id}/rsvps` | limit/cursor | owned RsvpItem list, newest first |

Save/publish never accepts owner, design revision changes, public slug or public-version override. API form validation checks owned assets and all supplied values even if unused; publish only projects needed fields. UI retains dirty data on errors and renders safe field paths; unresolved version conflict offers reload after a discard warning, no automatic overwrite.

## Admin assistance

ADMIN only; resource policy permits full invitation read/data editing for support, but never RSVP response reads. Search/select customers through existing IAM admin customer endpoints; only ACTIVE CUSTOMER is eligible for assisted creation/mutation. Recheck active actor/target under transaction as described in data model.

| Method/path | Request | Result |
|-------------|---------|--------|
| GET `/admin/customers/{customerId}/invitations` | limit/cursor | target customer summaries |
| POST `/admin/customers/{customerId}/invitations` | `{templateId,designRevisionId}` | InvitationDetail owned by target, createdBy actual admin |
| GET `/admin/invitations/{id}` | — | InvitationDetail for support |
| PATCH `/admin/invitations/{id}/draft` | same as customer | audited saved detail |
| POST `/admin/invitations/{id}/publish` | expectedVersion + key | audited final publish via Operation |
| POST `/admin/invitations/{id}/unpublish` | expectedVersion | audited summary |
| PATCH `/admin/invitations/{id}/rsvp-state` | expectedControlVersion + open | audited control state |

There is no admin RSVP list endpoint. ADMIN requests to customer RSVP routes return 403. Assisted saves can reference customer assets already used by that invitation or uploaded specifically for it, never arbitrary assets from the same customer. Upload/delete audits include assetId and observed invitation editVersion without incrementing that version. Owner cannot be supplied in mutation bodies; target on admin-create path is looked up server-side. Assistance banner identifies target customer, and successful actions record actor/owner/action/version in the same transaction. Audit failure prevents the mutation.

## Publication operations

`GET /publication-operations/{operationId}` returns Operation to its requesting actor only, after resource authorization. Guest denied; other actors 404. Poll once per second until terminal, stop after 90 seconds and show safe retry/status action. On refresh the initiating UI can recover from `GET /publication-operations?resourceKind=TEMPLATE|INVITATION&resourceId=UUID&limit=20` restricted to requester, newest first.

Idempotency-Key required for publish, UUID. After resource authorization, look up the actor/key before checking current expectedVersion, queue or active jobs. Same actor/key + identical resource/version returns original Operation even when successful publication has since incremented editVersion; different request →409 `IDEMPOTENCY_CONFLICT`. Existing active operation for resource with another key →409 `PUBLICATION_IN_PROGRESS`. Full queue →503 `RENDER_QUEUE_FULL` + Retry-After 5. Existing public snapshot remains active while queued. Terminal job errors are read through 200 Operation envelopes; enqueue validation/auth errors use HTTP Problem Details. A failed operation is retried with a new key after correcting input; do not automatically replay a failed receipt as new work. Terminal operation retention 24 h is documented to clients.

## Assets

| Method/path | Access / request | Result |
|-------------|------------------|--------|
| GET `/admin/template-assets` | ADMIN; q/kind/mine/limit/cursor | reusable TEMPLATE AssetSummary list; mine filters uploadedBy |
| POST `/admin/template-assets` | ADMIN; multipart file/name/kind | ready TEMPLATE AssetSummary |
| GET `/assets` | CUSTOMER; q/kind/limit/cursor | own CUSTOMER assets only |
| POST `/assets` | CUSTOMER; multipart file/name/kind=IMAGE | ready CUSTOMER asset; owner from principal |
| GET `/assets/{id}/content` | authenticated scope check | normalized bytes; admin sees template assets, customer sees own customer assets |
| DELETE `/assets/{id}` | original template uploader or customer owner, unreferenced READY | 204; referenced →409 `ASSET_IN_USE` |
| POST `/admin/invitations/{id}/assets` | ADMIN assisting; multipart file/name/kind=IMAGE | CUSTOMER asset owned by target, assistance_invitation_id set, audit |
| GET `/admin/invitations/{id}/assets` | ADMIN assisting; q/limit/cursor | assets already referenced by this invitation or uploaded specifically for it |
| GET `/admin/invitations/{id}/assets/{assetId}/content` | ADMIN scoped to same list above | bytes; no browse of target's entire private library |
| DELETE `/admin/invitations/{id}/assets/{assetId}` | ADMIN; only unreferenced assisted upload for this invitation | audited 204; never delete customer's other uploads |
| GET `/templates/{id}/cover` | ADMIN in any template state; CUSTOMER only when currently PUBLISHED; Guest denied by protected-route rules | metadata cover override, else retained published revision thumbnail; missing cover or template unavailable to Customer →404; no-store |
| GET `/templates/{id}/revisions/{revisionId}/assets/{assetId}` | authenticated template selection or owner of pinned invitation; ADMIN template management | only TEMPLATE/thumbnail refs authorized for that revision |
| GET `/public/invitations/{slug}/releases/{version}/assets/{assetId}` | Guest; PUBLISHED and current version; visible asset set membership | bytes, no-store; unavailable →404 |

Uploads and downloads pass through API; browser receives neither storage credentials nor bucket/presigned URLs. API streams authorized bytes from private MinIO via the S3-compatible AssetStore; no redirect to storage. Template preview uses scoped template draft asset access for ADMIN. Customer preview uses protected customer content plus pinned template revision assets. A ready upload not yet saved may be removed by its owner; draft save then checks it still exists. A saved reference prevents deletion even if currently hidden. Replacing image produces a new asset ID, not mutation of original bytes. Font assets are versioned bundled public web resources without customer content.

## Public scene and RSVP

- `GET /public/invitations/{slug}` → `{publicVersion,scene,context}` where scene is ResolvedScene and context includes current rsvpOpen, asOf and generated visible asset URLs. No raw WeddingData/design/bindings/owner/audit. Only currently PUBLISHED is accessible; otherwise 404 with generic unavailable page. Web page `/i/{slug}` fetches `no-store` and renders without editor bundles. Response explicitly excludes drafts.
- `GET /public/invitations/{slug}/rsvp-state` → `{open:boolean,available:boolean}` only for PUBLISHED invitations. available indicates actual visible RSVP; no count/name/receipt data. Widget fetches on focus, before enabling submission and every 30 s while page is visible. Close effect is enforced at write commit regardless of polling lag. Closed state replaces form without changing frame or erasing already entered client values until navigation.
- `POST /public/invitations/{slug}/rsvps` with Idempotency-Key UUID and `{name,attendance:"ATTENDING"|"DECLINED",partySize,message?:""}` →201 Receipt for new acceptance, 200 same Receipt for replay. Validate name 1–120 chars, attending integer 1–20 including sender, declined exactly 0, message ≤1000 plain-text chars. Declined UI sets partySize 0.
- Generate request key per user submit action and retain it with that submitted payload while outcome is uncertain. Network retry reuses key. Editing payload or deliberately submitting a new response after success creates a new key. No name-based identity/deduplication and no edit-response endpoint.
- Under invitation lock, check existing key before public/open/rate checks. Matching replay may succeed after unpublish/close and returns only prior minimal receipt. New request on unpublished/nonexistent →404; visible public page with closed/no widget →409 `RSVP_CLOSED`. Same key/different normalized payload →409 `IDEMPOTENCY_CONFLICT`.
- Limit accepted new inserts to 5 per rolling ten minutes for HMAC(socket-source,invitation); sixth →429 + Retry-After seconds. Trust proxy remains false as in IAM; direct socket peer is authoritative. A later reverse-proxy deployment must explicitly configure trusted proxy identities, not trust arbitrary X-Forwarded-For. General infrastructure DoS controls are not supplied by this business limiter.

## Errors

Problem envelope: `{type:"about:blank",title,status,code,requestId,issues?:Issue[]}`. Extend current allowlist without reflecting raw errors. Max 100 issues; path/node IDs are safe, never submitted names/account numbers/message text. Return 400 for malformed structure, 413 for body/file bounds, 415 for unsupported MIME, 422 for typed/document/business validation, 409 for versions/idempotency/reference state, 503 for storage/render availability, 429 for limits. Runtime exceptions remain generic 500.

Known builder codes: `DOCUMENT_INVALID`, `UNSUPPORTED_SCHEMA`, `BINDING_INVALID`, `REQUIRED_DATA_MISSING`, `CONTENT_OVERFLOW`, `ASSET_UNAVAILABLE`, `ASSET_IN_USE`, `UPLOAD_INVALID`, `VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `TEMPLATE_UNAVAILABLE`, `NOT_PUBLISHED`, `PUBLICATION_IN_PROGRESS`, `RSVP_CLOSED`, `RENDER_QUEUE_FULL`, `RENDER_UNAVAILABLE`, `RENDER_TIMEOUT`, `RENDER_VERSION_MISMATCH`, `FONT_UNAVAILABLE`, `STORAGE_UNAVAILABLE`. Publication failures preserve prior public state and stored draft; UI never falsely shows publish success.

## Web routes and UX boundary

| Route | Audience / purpose |
|-------|--------------------|
| `/admin/templates`, `/admin/templates/new`, `/admin/templates/{id}/edit` | ADMIN catalog/editor |
| `/templates` | CUSTOMER selects published template |
| `/invitations`, `/invitations/{id}/edit`, `/invitations/{id}/rsvps` | CUSTOMER list/data form/owner responses |
| `/admin/customers/{customerId}/invitations`, `/admin/invitations/{id}/edit` | ADMIN assistance, no RSVP list link |
| `/i/{slug}` | public invitation |
| `/internal/invitation-renderer` | empty versioned harness, accepts no data from URL or messages |

Each protected route renders pending/auth/error/empty states; permission is still enforced by API. Save and publish are separate controls; publish first requires saved current version and ends active gestures. Preserve unsaved local form/editor state through refresh-token recovery; do not automatically retry mutations with changed payload/version. Keyboard alternatives: select via layers, edit x/y/size/rotation numerically, move layer via buttons, Delete only outside form inputs, Ctrl/Cmd-Z undo in editor context. Vietnamese labels, visible focus and associated field errors; do not trap input shortcuts for canvas. Plain-text XSS payloads display inertly. Forms/RSVP remain usable at 360 px. No link to Later functions that pretends they work.
