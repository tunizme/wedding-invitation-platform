# Contract: HTTP compatibility and authorization

Reuse current versioned REST routes, statuses, pagination and auth policies; do not add a customer design endpoint or route for viewport selection. The API base version remains v1; embedded design/scene discriminator selects supported document contract.

| Existing surface | Feature007 change | Preserved behavior |
| --- | --- | --- |
| Admin template create/get/draft save | document union1/2; sample_data1; strict dispatch | Admin-only, expected edit version/CAS, existing payload fields/errors |
| Admin template duplicate | duplicate same schema; v2 IDs remapped throughout maps/order | new independent draft; cover/assets authorization preserved |
| Template publish/job polling | candidate document version-aware; layout/section diagnostics additive for v2 | idempotency, attempts/deadline/status/error envelope, old report fields |
| Catalog/revision projection | discriminated document2 and existing sample_data1 | filtering/cursor/cover/thumbnail, immutable revision visibility |
| Customer invitation create/get | pinned revision may contain design2 | owner authorization and pinning semantics |
| Customer draft save | no wire data change; weddingData1 only | layout/style/binding fields rejected, expectedVersion/conflict |
| Invitation publish/public get | published scene pair(1,1)|(2,2) | stable URL, draft/public split, unpublish, publicVersion/no-store |
| Asset delivery | nested v2 allowlist union layouts | signed/private/current-release access rules and unused asset denial |
| Guest RSVP | no wire changes | open/closed/rate-limit/idempotency/current invitation behavior |

Reject unsupported schema/renderer pairs using existing error conventions (`UNSUPPORTED_SCHEMA`, `DOCUMENT_INVALID`, `BINDING_INVALID` where applicable). Do not coerce schema2 to1 or unknown version to latest. API response metadata must agree with embedded JSON. Preserve v1 response shapes exactly; additive diagnostic fields only appear for v2 issues.

No viewport query parameter affects public data or authorization: one snapshot contains complete responsive rules. Actual display width is client container behavior, capture width is a private trusted harness input.

Contract tests must cover document1/2 round-trip, frontend consumption of each projection, unknown version/keys, expectedVersion conflict, malicious Customer design fields, non-owner/Admin restrictions, pinning after template republish, public snapshot after failed publish, nested asset references and old-release asset denial. Update API contract documentation and existing OpenAPI definitions if those surfaces enumerate document1 shapes; keep runtime REST route names unchanged.

Admin create accepts additive optional `schemaVersion:1|2` (omitted means1). It creates a validated blank document of that version; sample data remains1. Any other value/key is rejected. Draft save continues `{expectedVersion,document,sampleData}` and validates the embedded discriminator. Customer endpoints receive no version/layout selector.

Responsive readers accept document2 only when revision `schema_version` and `renderer_contract_version` both equal2; public snapshot readers accept only scene/renderer pairs(1,1)/(2,2). Unknown or inconsistent stored metadata is unavailable, never silently rendered through v1. Public responses and current-release assets retain `no-store`; draft edits, failed publication and new template revisions do not repin existing invitations or change their public snapshots.
