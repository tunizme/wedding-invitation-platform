# Data Model: Frontend Foundation & Reliability

Mô tả frontend ownership/lifetimes và existing entities; **không new DB tables/DTO fields/persisted schema**. Authority: [spec](spec.md), [session contract](contracts/session-boundaries.md), [compatibility](contracts/compatibility.md).

## Frontend-only Entities

| Entity                    | Fields / relationships                                                    | Validation / lifetime                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SessionSnapshot           | Existing `AccessSession \| null` + frontend `identityEpoch`               | Epoch tăng id/role/status/null/admitted-context/sessionTag transitions; không tăng token/profile update cùng context/tag                                                                                   |
| PrincipalScope            | Captured userId/role/status/epoch/contextId/sessionTag                    | Protected scope cần non-null active session/expected role; check snapshot before dispatch/retry/commit. Không gửi thay authorization vào API                                                               |
| AuthTransitionIntent      | Frontend-only captured transition generation/lifetime + operation kind    | Phân biệt stale login/onboarding completions, kể cả anonymous→anonymous pending attempts. Separate khỏi stable principal epoch; admission theo shared coordinator policy, T001 kiểm feasibility boundaries |
| AuthCoordinationOwnership | Existing006 context/intent/refresh lease metadata                         | 006-owned server context/intent + transactional selector/refresh lease;005 không tạo ownership handle/lock protocol riêng                                                                                  |
| AuthOperationOutcome      | `NOT_DISPATCHED \| COMPLETED \| UNCERTAIN` + dispatch/completion evidence | Outcome không phải success boolean; uncertain dispatched writer cần reviewed recovery/blocker trước newer cookie mutation                                                                                  |
| ResourceScope             | PrincipalScope + resource identity + owner lifetime                       | Actual invitation/template/customer ID; collection identity cho lists, owner-instance identity cho create draft, không invent backend ID                                                                   |
| RequestGeneration         | Scope + generation/filter fingerprint/abort handle                        | New query supersedes prior; page/cursor append phải cùng owner/query. Abort hỗ trợ cleanup, admission bảo đảm correctness                                                                                  |
| PrivateViewState          | records/detail/draft/assets/cursors/loading/error/status/operations       | Một scope lifetime; disposal reset all, timers/dirty registrations/Blob URLs. No old-account fallback khi new load lỗi                                                                                     |
| OperationScope            | Captured resource lifetime + active/disposed                              | Xuyên save/upload/publish/poll/reload; check mỗi continuation/catch/finally/navigation/next request                                                                                                        |
| PlatformFieldState        | value/local issue/helper-error IDs/busy/disabled                          | Validation theo actual contract; generic server error không fabricated field details                                                                                                                       |
| ModalSurfaceState         | open/heading ID/trigger/initial-fallback focus/owner                      | Single idempotent lifecycle; removed trigger→logical fallback, stale task completion không mutate owner mới                                                                                                |

Không persist tokens/passwords/proofs vào artifacts/logs. Existing session in-memory và sensitive-link handling giữ nguyên.

AuthTransitionIntent admission không chứng minh browser cookie state an toàn. Auth transport consume verified006 CSP-1 immutable slots/server intent/transactional selector.005 không tạo cookie ownership handle hoặc đọc selector trực tiếp. U1-B dependency evidence đã đạt; consumer alignment/re-analysis trước code và005 private lifetimes vẫn required.

## State Transitions

```text
Anonymous → A          : epoch tăng, mount A
A credential/profile  : epoch giữ nếu id/role/status giữ, valid edits giữ
A → B                 : epoch tăng, dispose A trước render B
A → null → A          : old A work invalid dù userId trùng
Role/status change    : old authorization scope invalid
Resource X → Y        : dispose X; principal epoch có thể giữ
Query Q1 → Q2         : generation tăng, không append Q1 vào Q2
Product → public      : dispose product effects/private subtree;
                        không logout chỉ vì navigation
```

View: `idle → loading → ready | empty | error`; reload cùng owner MAY giữ edits theo existing semantics. Identity/resource invalidation→`disposed`; completion disposed không update current view. Dispatched server mutation có thể commit cho original owner, model không hứa rollback.

Modal: `closed → opening → open → closing → closed`; unmount/owner invalidation dispose task work, return focus không reopen surface.

Auth operation: `captured → queued → owned → dispatched → COMPLETED`; cancel/timeout trước dispatch → `NOT_DISPATCHED`; mất confirmed outcome sau dispatch → `UNCERTAIN`. Admission là bước riêng sau confirmed completion, không chuyển uncertain thành success bằng store fence. Ownership release không chứng minh request rollback hoặc cookie context clean; recovery do verified006 bounded read-only reconciliation/persistent next action xử lý;005 không replay uncertain mutation.

## Existing Domain Entities — Compatibility Only

| Entity                          | Existing relationship / rules                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UserProfile / AccessSession     | Existing id/email/verification/loginMethod/role/status/displayName/phone/avatar fields và token/CSRF/lifetime; patch only actual supported fields, LOCAL/social password distinction |
| Invitation / WeddingData        | Existing schema v1, owner/editVersion/pinned published template revision; Customer data-only, CAS unchanged, no design overrides                                                     |
| Template / TemplateDesign       | Admin-owned authored document/bindings/sample/revisions; fonts/palette/geometry unchanged; optional missing data authored gaps/fallback                                              |
| MediaAsset                      | Existing asset ID/kind/dimensions/previewURL/ownership; customer IMAGE vs admin template scope; Blob URLs disposed                                                                   |
| PublicationOperation / snapshot | Existing receipt/status/idempotency/published output; no false success, prior snapshot on failure, recovery redesign deferred                                                        |
| FontAsset                       | Immutable existing invitation registry/manifest/hashes/licenses; separate platform font provenance, không new Customer-selectable font IDs                                           |

No enum/wire-model/pagination changes cho UI convenience. IAM `{items,page:{hasMore,nextCursor}}` khác builder `{items,nextCursor}`; adapters ở owning feature giữ actual contracts.

## Extension presentation state

No database/entity changes. Product disclosure is ephemeral and keyed by identity epoch; reads current session user, never cached prior owner. Template selection binds templateId+publishedRevisionId; authorized document/sampleData/formFields and assets are revision-scoped. Demo open/editor tab ephemeral; invitation data/versions remain existing server contracts. Overview statistics reflect loaded items unless full dataset is known. Profile updates reuse /me and update sessionStore only for originating owner. No mock quota/analytics fields.
