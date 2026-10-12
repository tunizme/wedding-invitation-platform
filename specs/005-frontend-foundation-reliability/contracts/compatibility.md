# Contract: Existing Backend / Template Compatibility

005 không tạo new HTTP contract; IAM refinement được quản lý riêng tại [006](../../006-iam-auth-transition-reliability/spec.md), đã implement/verified CSP-1; consume [actual frontend handoff](../../006-iam-auth-transition-reliability/contracts/frontend-handoff.md). Actual controllers/DTOs/services ở `apps/api` là source of truth; [AUDIT](../../../docs/frontend/AUDIT.md) chỉ discovery index, MUST recheck trước integration. Trace FR-005–008/014/020–024.

| Boundary       | MUST preserve                                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth           | `/api/v1`, Bearer vs cookie-specific behavior, Origin/CSRF/token/role/ownership. Không assume logout universal immediate token revocation                      |
| IAM            | Actual account/proof/password contracts, generic registration/recovery; no avatar-upload/phone-verification/provider-config API invented                       |
| Pagination     | IAM page wrapper khác builder cursor shape; pages bound owner/query, no mixing accounts/generations                                                            |
| Customer data  | Existing WeddingData only, CAS/editVersion/expectedVersion; no layout/style/binding/colors/fonts/section visibility-order/crop payloads                        |
| Admin template | Existing design/layer/geometry/binding controls retained; no assisted invitation capability invented                                                           |
| Renderer       | Same resolver/renderer/schemaVersion/rendererContract/pinned revision/fonts/palette/geometry; missing optional data giữ fallback/authored gaps, no auto-reflow |
| Assets         | Actual Admin/customer scopes, Customer IMAGE only, JPEG/PNG/WebP≤10MiB, normalized storage/scoped reads/deletion                                               |
| Publication    | Existing idempotency/CAS/operation polling/readiness; no false success, prior snapshot on failure, recovery redesign deferred                                  |
| Public         | Published-only/unavailable truthful, no private draft fallback/account controls                                                                                |

Timeline content/order là data, không layer/section reorder. Scope fences không new backend business rule hoặc mutation rollback guarantee.

## IAM Dependency Handoff

T001 review final006 `run-Lt4lxU` and IAM all, actual `subscribe/get/admission/onEndAdmission`, reserved intent transport and immutable slots. Runtime requires protocol2 (`authProtocol`, `sessionTag`, `contextRevision`); optional TypeScript fields are not a legacy fallback. Password/logout-all preserve target account-wide revocation and original-session clear semantics. OAuth callback uses server-authoritative bound intent, not page-held lock.

Fleet cutover must be uniform CSP-1; legacy users may need fresh login. Additive006 migrations remain006-owned;005 adds none. Rollback requires stopping traffic and revoking context sessions before full-fleet legacy redeploy; see [IAM operations](../../../docs/iam-operations.md). Local HTTP/controlled-provider evidence excludes live providers and production HTTPS acceptance.005 does not change these contracts or invent guarantees; resource lifetimes remain005-owned.

## Package Invariants

Future standalone runner MUST copy `apps/web/public` cạnh server và giữ `.next/static`; no source-tree mount fallback. Existing invitation manifest + mỗi WOFF2 bytes/hash/MIME match source; IDs/licenses unchanged. Platform local font output/provenance riêng, không new renderer font IDs.

Real browser kiểm face-specific Vietnamese/Latin/weight/style readiness, không family-regular-only. Block required face/image→existing error/readiness false; HTTP200 không chứng minh decode/renderer readiness. Existing `next start` gate không standalone evidence. Packaging local test không deploy/publish authorization.

## Capability Gaps

Public catalog/Marketplace detail/dashboard metadata/actions/assisted invitations và other out-of-scope findings giữ backlog. Customer design settings **prohibited**, không missing backend support. Nếu integration cần unsupported API, ghi MASTER `BLOCKED: Backend capability required` với Feature/Required capability/Affected UI/Suggested contract/Reason; proposal không pretend implemented.
