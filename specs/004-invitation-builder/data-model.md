# Data Model: Invitation Builder

**Spec**: [spec.md](spec.md) | **Document shapes**: [contracts/document-format.md](contracts/document-format.md)

PostgreSQL is authoritative. UUID PKs, UTC `timestamptz`, positive integer revisions, application-validated JSONB with DB checks for top-level shape/size. All writes use parameterized SQL/TypeORM transactions; no schema synchronization. IDs in this document are internal UUIDs unless explicitly called a public slug.

## Relationships

```text
users ──< invitation_templates ──< template_design_revisions
users ──< invitations >────────── template_design_revisions
                 ├── draft_wedding_data / published_wedding_data
                 ├──< rsvp_responses
                 └──< invitation_assisted_actions
assets <── explicit reference tables ── templates/revisions/invitations/jobs
publication_jobs ──> one template OR invitation candidate
```

WeddingData is a value object stored in invitation snapshots, not a customer-wide mutable record. RenderContext and resolved scene are projections, not customer-editable entities.

## Tables

### invitation_templates

| Field | Type / rule |
|-------|-------------|
| id | UUID PK |
| name | varchar(120), trim, nonempty |
| category | varchar(64), trim, nonempty; free-text category, no taxonomy module |
| tags | JSONB array of ≤20 unique strings, each 1–32 characters |
| sort_order | integer, default 0, ±1,000,000 |
| cover_asset_id | nullable FK assets, explicit metadata cover override; null uses generated thumbnail |
| status | DRAFT / PUBLISHED / UNPUBLISHED |
| draft_document | JSONB TemplateDesign v1, ≤1 MiB |
| draft_sample_data | JSONB sample WeddingData, ≤256 KiB; never copied from customer records |
| edit_version | integer default 1; increment on draft/metadata/publication/availability mutation |
| published_revision_id | nullable FK template_design_revisions |
| created_by | FK users, authenticated ADMIN at creation |
| created_at, updated_at | timestamptz |

Index `(status, sort_order, id)` for catalog; name search is escaped case-insensitive substring. DRAFT has no published revision; PUBLISHED/UNPUBLISHED require one. Published pointer must refer to a revision of this template; enforce with composite FK `(id,published_revision_id)` to `(template_id,id)` after creating both tables. Draft is the editor source even when a published revision exists. Metadata is catalog information, not customer design content; changing catalog metadata does not mutate a revision's design.

### template_design_revisions

| Field | Type / rule |
|-------|-------------|
| id, template_id | UUID PK; FK template |
| revision_number | positive integer, unique `(template_id, revision_number)` |
| schema_version | integer = 1 |
| document | immutable JSONB TemplateDesign |
| sample_data | immutable JSONB sample WeddingData |
| document_hash | SHA-256 canonical document |
| renderer_contract_version | integer = 1 |
| thumbnail_asset_id | non-null FK assets after staged artifact is READY |
| created_by, created_at | authenticated publisher FK; timestamp |

Unique `(template_id,id)` supports pointer integrity. No update/delete API. DB trigger rejects UPDATE/DELETE of revision rows; migrations can explicitly drop the trigger for a disposable rollback. Retain immutable refs for as long as revision exists; no revision deletion workflow in MVP. Current thumbnail is generated cover; `cover_asset_id` overrides only catalog display.

### invitations

| Field | Type / rule |
|-------|-------------|
| id | UUID PK |
| owner_user_id | immutable FK users, CUSTOMER validated at create |
| design_revision_id | immutable FK template_design_revisions |
| draft_wedding_data | JSONB ≤256 KiB; structural validation on save |
| published_wedding_data | nullable JSONB immutable until next successful publish |
| published_scene | nullable JSONB ResolvedScene; excludes unused/private fields |
| status | DRAFT / PUBLISHED / UNPUBLISHED |
| public_slug | nullable unique UUID, generated at first successful publish; immutable once set |
| public_version | integer default 0; increments on successful publish only |
| published_has_visible_rsvp | boolean default false, derived from scene at publish |
| edit_version | integer default 1; increment on data save, publish and unpublish |
| rsvp_open | boolean default true; independent of design/data/publication |
| control_version | integer default 1; increment only on actual RSVP open/close change |
| created_by, updated_by | actor FK users, distinct from owner |
| created_at, updated_at, published_at | timestamps; published_at nullable |

Asset references are relational, not a duplicate JSON column. CHECK: PUBLISHED/UNPUBLISHED require slug, public snapshot/scene and positive public_version; DRAFT requires no published snapshot and version 0. Public slug and design/owner immutability are enforced by DB trigger. Index `(owner_user_id, created_at DESC, id DESC)`, unique slug. No invoice/order association or invitation hard-delete endpoint.

### assets

| Field | Type / rule |
|-------|-------------|
| id | UUID PK |
| scope | TEMPLATE / CUSTOMER / SYSTEM_THUMBNAIL |
| owner_user_id | FK users; template assets owned by uploading admin, customer assets owned by target customer; null only for system thumbnails |
| uploaded_by | FK users; admin assistance preserves actual actor |
| assistance_invitation_id | nullable FK invitation, limits admin-created customer asset access to that invitation |
| name | safe display label ≤120 chars, never an object key or filesystem path |
| kind | IMAGE / DECORATION / BACKGROUND / THUMBNAIL |
| object_key | opaque immutable S3 object key relative to configured prefix, unique, no client segments or provider URL; bucket/endpoint configured outside rows |
| mime_type | image/webp for uploads; image/png for generated covers |
| byte_size, width, height | positive integer metadata of stored normalized bytes |
| sha256 | integrity hash, no cross-owner deduplication |
| status | READY / DELETING / DELETED |
| created_at, deleted_at | timestamps |

Upload pipeline normalizes bytes in bounded memory/temporary scratch, creates a storage write intent, then PutObject to its unique immutable key before committing READY metadata and the intent together. No filesystem rename or object-store/SQL atomic transaction is assumed. Failed/ambiguous uploads return no usable asset ID; fenced cleanup handles abandoned objects. See [storage.md](contracts/storage.md) for deadlines and recovery. Hard byte deletion is retried after status DELETING; a deleted tombstone remains to make retries deterministic. Admin can reuse TEMPLATE assets but only original uploader may delete an unreferenced template asset. SYSTEM_THUMBNAIL has no user deletion endpoint.

### asset_storage_writes

Durable write intents fence upload/cleanup races, including unpublished thumbnail attempts. Created by the core migration before any PutObject. Fields: `id UUID PK`, `object_key UNIQUE`, `lease_token UUID`, `status WRITING/COMMITTED/ABANDONED`, `deadline_at`, `created_at`, `cleaned_at nullable`, `asset_id nullable FK assets`, `job_id nullable FK publication_jobs ON DELETE SET NULL`, `job_lease_token nullable UUID`. Add the optional job FK in the publication-jobs migration. Index `(status,deadline_at)`.

Writer finalization locks the intent after resource/job/asset locks, verifies WRITING, token and deadline, and commits asset metadata plus COMMITTED atomically. Thumbnail finalization additionally verifies current job lease. Cleanup claims expired intents as ABANDONED before deleting; it cannot delete COMMITTED objects. No network calls while holding DB locks. Abandoned tombstones retain their keys for bounded periodic deletion retries, including late completion of an ambiguous PutObject. Detailed lifecycle in [storage.md](contracts/storage.md).

### Explicit reference tables

All references use FK with RESTRICT, not cascade deletion of asset bytes. PK is the listed target + slot + asset ID where a slot is present.

| Table | Columns / role |
|-------|----------------|
| template_draft_asset_refs | template_id FK, asset_id FK; assets in draft, fallback and sample data; metadata cover also protected by its direct FK |
| template_revision_asset_refs | revision_id FK, asset_id FK; immutable design/fallback/sample assets; thumbnail also has direct FK |
| invitation_asset_refs | invitation_id FK, slot DRAFT/PUBLISHED, asset_id FK; full saved data references, including currently invisible data, protect deletion |
| publication_job_asset_refs | job_id FK, asset_id FK; pins captured candidate while job is pending/running |

Public delivery derives a smaller visible asset set from published_scene; a retained reference alone does not grant public access. Updating a draft and replacing its refs is one transaction. Metadata cover assignment also locks its asset and requires READY; tombstone deletion explicitly checks direct cover/thumbnail FK usages as well as every ref table, since a FK alone does not prevent status changes. Duplicate template reuses safe TEMPLATE asset IDs and creates its own refs; customer assets never enter a template. Assisted draft saves may only introduce customer assets already referenced by this invitation or uploaded specifically for it; knowing an unrelated customer asset ID never grants support access. Invitation creation pins referenced design revision, not mutable template draft.

### publication_jobs

| Field | Type / rule |
|-------|-------------|
| id | UUID PK |
| template_id / invitation_id | exactly one non-null FK (CHECK XOR) |
| requested_by | FK users; owner/ADMIN authorization at enqueue and final commit |
| request_key | UUID from Idempotency-Key, unique `(requested_by, request_key)` |
| request_hash | hash of resource kind/id and expectedVersion; changed request with same key →409 |
| expected_edit_version | candidate source version |
| candidate_document, candidate_data | captured immutable JSONB; scope-protected, cleared at terminal state |
| candidate_hash | SHA-256 of canonical inputs including asset hashes and renderer contract version |
| status | PENDING / RUNNING / SUCCEEDED / FAILED |
| attempts | integer 0–2 |
| lease_owner, lease_expires_at | nullable opaque UUID/timestamp; final commit requires matching valid lease |
| created_at, deadline_at, completed_at | deadline = created +90 s; completed nullable |
| result_revision_id / result_public_version | nullable successful result, no private rendered payload |
| error_code, issues | allowlisted failure code and bounded safe node/field issues |
| staged_thumbnail_key | nullable lease/attempt-specific opaque artifact key for cleanup; never returned to clients |

Partial unique indexes allow only one PENDING/RUNNING job per template or invitation. Queue admission uses a PostgreSQL advisory transaction lock to enforce ≤12 active+pending records globally for this API installation. Worker claims up to two jobs with `FOR UPDATE SKIP LOCKED`, sets a 45 s lease; isolated browser execution ≤30 s. Worker death: expire/reclaim once within total deadline; original lease cannot finalize, fail or clear refs belonging to the reclaimed operation. Every terminal transition compares status and exact lease token; the deadline reaper locks the job and takes terminalization ownership atomically. A stale worker may only delete its own unreferenced attempt files. Deadline/exhausted attempts yields FAILED and removes job refs. Terminal payloads clear immediately, receipts retained 24 h then deleted. No update/delete API for jobs.

### rsvp_responses

| Field | Type / rule |
|-------|-------------|
| id | UUID PK, receipt ID |
| invitation_id | FK invitations |
| request_key | UUID, unique `(invitation_id,request_key)` |
| payload_hash | SHA-256 of normalized name/attendance/partySize/message |
| name | 1–120 Unicode characters after trim |
| attendance | ATTENDING / DECLINED |
| party_size | integer 1–20 if ATTENDING, exactly 0 if DECLINED (CHECK) |
| message | plain text, 0–1,000 Unicode characters |
| source_hash | nullable bytea, HMAC of invitation ID + normalized socket address using builder rate secret |
| created_at | timestamp |

Index `(invitation_id,created_at DESC,id DESC)` for owner list and `(invitation_id,source_hash,created_at)` for rolling limit. Check character lengths and nonempty name in DB as well as boundary validation. Clear source_hash after 24 h; no raw IP stored. Responses and request-key receipts are retained until a future explicit retention/deletion feature; no automatic wedding-date deletion. Payload replay returns only `{receiptId,acceptedAt}`, not the name/message.

### invitation_assisted_actions

UUID id; actor_user_id FK; owner_user_id FK; invitation_id FK; action CREATE/SAVE/PUBLISH/UNPUBLISH/RSVP_OPEN/RSVP_CLOSE/ASSET_UPLOAD/ASSET_DELETE; occurred_at; request_id; result CHANGED/NO_CHANGE; resource_version; nullable asset_id FK assets. Asset actions record asset_id and the observed unchanged invitation edit_version; upload/delete alone do not modify draft or its version. Audit contains no WeddingData, bank info, asset bytes or RSVP content. Append in the same transaction as each successful assisted mutation, including publish finalization; audit failure rolls back. Existing IAM audit action checks are left untouched.

## State transitions and validation

| Resource | Transition | Rule |
|----------|------------|------|
| Template | create → DRAFT | schema-valid blank root, initial sample dataset, version 1 |
| Template | any → PUBLISHED | validated candidate + immutable revision + thumbnail; CAS edit_version |
| Template | PUBLISHED → UNPUBLISHED | immediately remove from selection catalog, retain revisions |
| Template | save in any state | change draft/metadata + edit_version only; existing revision remains |
| Invitation | create → DRAFT | lock/recheck template is PUBLISHED and selected current revision; owner immutable |
| Invitation | any → PUBLISHED | trusted validation + new public snapshot/scene + visible refs, public_version +1 |
| Invitation | PUBLISHED → UNPUBLISHED | public content/assets/NEW RSVP denied after commit; keep snapshots and URL |
| Invitation | save in any state | replace draft only, increment edit_version |
| RSVP control | OPEN ↔ CLOSED | immediate transaction; increment control_version, never reset on publish |

Unpublish of an already UNPUBLISHED resource is a no-op only when there is no active publication job. If a republish job is active, increment edit_version to invalidate its captured candidate even if availability is already UNPUBLISHED; apply this rule to templates and invitations. RSVP control with unchanged value is a no-op. Validate expected version in every case; assisted no-ops still audit. Repeated publication with a new key creates a new revision/public version even if content unchanged. Same job request key returns same operation result during receipt retention.

Saved drafts may omit required business fields or overflow, but cannot contain wrong types, unsupported schema, unknown properties, invalid references or oversized payloads. Required/fallback/visibility/fit validation gates publication. JSON canonicalization sorts object keys, preserves array order, disallows non-finite numbers and hashes normalized values; raw client hashes never authorize publication.

## Transaction boundaries and lock order

1. Resource mutations authenticate first. For assisted mutations, lock actor and target user rows in UUID order and verify ACTIVE ADMIN / ACTIVE CUSTOMER. Then lock template or invitation root. Customer ordinary session behavior follows IAM; ownership always reads persisted FK.
2. If needed, lock publication job after resource root. Lock referenced asset rows in UUID order before adding/removing refs. Storage write-intent locks come last, after resource/job/assets; no network requests while holding these locks. Upload/delete ref checks share those locks; deletion never locks resource roots after asset locks, avoiding reverse-order deadlock.
3. Publication enqueue authenticates/authorizes the resource, then looks up requester/request_key and returns a matching receipt before version, active-job or queue checks. For a new key, lock resource, check expectedVersion, validate structure/reference authorization and captures document/data/assets. It does not change public pointers. Rendering holds no database transaction open.
4. Finalization rechecks actor policy, matching lease, deadline, edit_version, referenced assets READY and hash identity, then commits public pointers, refs, thumbnail metadata, job result and audit together. Conflicts or failures retain old publication. After rollback, a fenced failure transaction may mark FAILED and release refs only if status and lease token still belong to that worker; never delete another attempt artifact.
5. For RSVP submission lock invitation. First inspect request key: same normalized payload returns existing receipt, even after closure; mismatched payload →409. New request requires PUBLISHED + published_has_visible_rsvp + rsvp_open. Read `clock_timestamp()` once after acquiring the row lock (not transaction-start `now()`), use it for created_at and count accepted source_hash records in `(acceptedAt-10min,acceptedAt]`; deny sixth with Retry-After based on oldest qualifying receipt. Insert within this transaction. Replay never updates acceptedAt/source_hash or extends retention. Close/unpublish locks the same row; commit orders acceptance.
6. Public response and asset delivery verify current PUBLISHED/current public_version at authorization time. A request authorized before unpublish may finish; requests authorized after commit fail. Previously downloaded bytes cannot be recalled. No shared HTTP cache bypasses the check.

## Migration, retention and rollback

- Add ordered TypeORM migrations for templates/assets/write intents/revisions and FKs, invitations/refs, publication jobs, RSVP/audit. Handle cyclic FK creation explicitly after both base tables exist; registry imports must include new entities/migrations. Existing IAM tables are not rewritten.
- FK/check/index tests use real PostgreSQL. Apply from empty schema with all prior migrations and from IAM-only baseline; re-run migration:run is a no-op. Revert only in disposable test schema, dropping triggers/FKs before reverse table order. Production rollback is not part of this command.
- Worker cleanup every minute, max 100 rows/objects per batch: expired job payloads/refs, 24 h terminal job receipts, 24 h source hashes, ABANDONED write-intent objects older than one hour and DELETING asset retries. Use write-intent ownership/fencing and scoped object keys; never sweep/delete unrelated bucket objects. Local scratch cleanup only touches API-owned temporary files.
- Published content, template revisions, RSVP and assistance audit have no user-facing deletion/TTL in this MVP. Private data stays access-controlled. Durable availability requires coordinated PostgreSQL + object-store backups before a production release; no deployment or backup automation is added by this feature plan.
