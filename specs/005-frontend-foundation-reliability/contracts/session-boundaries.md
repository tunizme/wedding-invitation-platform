# Contract: Session / Request / Surface Boundaries

Frontend internal contract, không new endpoint. Trace: FR-001–005, FR-008; SC-001–003. [Research](../research.md).

## IAM Dependency Boundary

[006 IAM refinement](../../006-iam-auth-transition-reliability/spec.md) cung cấp baseline CSP-1 đã implement: server-authoritative context/intent supersession, immutable session cookie slots, IndexedDB selector và bounded read-only outcome reconciliation. Ownership và consumer API được mô tả trong [006 frontend handoff](../../006-iam-auth-transition-reliability/contracts/frontend-handoff.md); runtime evidence ở [006 validation results](../../006-iam-auth-transition-reliability/validation-results.md). US1, US2 và US3 checkpoints đã PASS trên Chromium, Firefox, WebKit và Chromium không Web Locks.

006 đã hoàn tất final acceptance tại `.artifacts/auth-transition/run-Lt4lxU/`: frontend133/133, API76/76, browser208/208 trên bốn projects, zero required skips, root quality và IAM all PASS. T001 consume handoff này để resolve dependency feasibility; broader private-resource fences và acceptance vẫn thuộc 005. Không duplicate selector/coordinator hoặc tự gửi auth headers.

Actual API: `sessionStore.subscribe(listener)` không có payload; đọc `get()` và `admission()` (`contextId`, `sessionTag`, `contextRevision`) ngay lúc mount/change. `get() === null` không có private admission. `onEndAdmission(reason)` dùng để dispose nhưng không thay initial snapshot guard. `version()` tăng cả renewal nên không dùng làm stable identity epoch. Epoch riêng của 005 tăng khi principal/authorization/null hoặc admitted context/sessionTag đổi; renewal giữ tag và không reset edits. Admission metadata không thay resource/query generation.

## Identity Scope

1. Session snapshot expose consistent epoch; không increment trong render. Id/role/status/null/admitted context/sessionTag transitions invalidate; token/expiry/CSRF/profile cùng context/tag giữ epoch.
2. Private owner key include epoch/resource, không token/role-only. Unauthorized snapshot không render previously loaded private subtree. A→B→A không admit old A work.
3. Dispose records/drafts/status/cursors/assets/timers/Blob URLs/dirty registrations. Explicit logout giữ confirmation; forced peer transition không giữ old subtree chờ confirmation.

## Request / Operation Admission

| Point                         | Required behavior                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| First authenticated dispatch  | Capture/assert active authorized principal; respect caller operation scope nếu có                             |
| Before refresh                | Superseded scope stop, không bootstrap để replay stale request                                                |
| After refresh / one retry     | Same captured principal/epoch/authorization context; use renewed credential only within that context          |
| Body/error parsing completion | Assert scope active trước return result/error tới owning flow                                                 |
| Caller continuation           | Assert owner lifetime/epoch/resource/generation trước state/session write, navigation, poll hoặc next request |
| Abort/superseded result       | No error/data/status fallback trong newer context                                                             |

Caller signal MUST combine existing timeout, không bỏ deadline. Preserve transport allowlists/no-store/redirect:error/no-referrer/credentials policies. Một logical request tối đa một renewal retry; no new retry business rules.

## Coordinator / Surface Lifecycle

- Pending refresh success/failure/logout/password/profile completion MUST không overwrite/clear newer identity hoặc broadcast stale logout.
- Web Locks/single-flight/peer synchronization vẫn hoạt động; pending refresh/logout + peer switch và same-principal renewal đều required cases.
- BroadcastChannel/listener và dirty guard start/stop theo product provider lifecycle; no module-evaluation initialization trong direct public/capture graph.
- Product→public dispose effects, stop stale continuations; không revoke/clear account chỉ do navigation. Quay lại product reuse/bootstrap theo existing semantics, không regress cookie rotation.

### Auth Transitions / Cookie Effects — U1 policy

State admission và cookie coordination là hai lớp riêng. Epoch/scope fence bảo vệ UI/store/navigation; bỏ response body, reject JSON hoặc không gọi `sessionStore.set` MUST NOT được coi là đã ngăn browser áp dụng late `Set-Cookie`.

#### Operation matrix — actual CSP-1 consumer contract

| Operation                        | Coordination / admission                                                                                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login, onboarding confirmation   | Existing 006 reserved intent and transactional selector admission; captured attempt, no direct unguarded session commit                                                          |
| Refresh / OAuth-result bootstrap | Existing 006 IndexedDB refresh lease/single-flight and server context authority; admit only current context/tag/revision                                                         |
| Logout                           | Existing `logoutCurrent()` reserves bound intent with explicit expectedSessionTag; ends local admission; reconcile uncertain outcome without replay                              |
| Logout-all                       | Existing `logoutAll()` uses account-wide revocation; clears only originating admitted session; no singleton-cookie writer lock                                                   |
| Password change                  | Existing authenticated `/me/password` transport and account-wide target revocation; scope original session and clear only it after confirmed success; no second cookie transport |
| Profile update                   | Principal/resource operation fence before result/session patch; no auth writer lock                                                                                              |
| OAuth full navigation            | Existing 006 server-authoritative reserved intent and context-bound callback; result confirmation/admission scoped to originating attempt, preserve full-navigation flow         |

005 adds no endpoint/DTO. Immutable session cookie slots and server authority handle late delivery; UI/body fencing alone remains insufficient cookie proof. Password/logout-all do not clear B's immutable slot as a singleton-cookie writer.

#### Authority, ownership and retry

1. Consume existing 006 coordinator and selector API; do not impose an exclusive page-held lock across all cookie writers or introduce `refreshUnderLock`/ownership-handle protocol. Server context/intent ordering, immutable slots and transactional IndexedDB selector are authority. Web Locks/peer hints are optional coordination, not cross-tab authority.
2. Captured principal/identity epoch/resource scope is separate from 006 attempt/intent. Check it before dispatch, renewal retry, parsed result/error, state update and every continuation. A→B→A invalidates old work; same-context/tag renewal retains edits.
3. Preserve existing refresh single-flight/IDB lease and bounded queue cancellation; do not reacquire a new lock or replay uncertain auth mutations. Resource request one-retry rules remain unchanged.
4. Peer arrival order and connection-local generation are not trusted ordering. Read snapshots on subscribe; dispose subscriptions/dirty work/timers/Blob URLs. Do not persist/broadcast/log credentials.

#### Outcomes and recovery

`ApiError.knowledge` is `NOT_DISPATCHED`, `COMPLETED` or `UNCERTAIN`; completed includes parsed rejection and does not mean success. Existing 006 bounds are queue5s, dispatched request15s, recovery30s/two read-only probes. Unknown intent IDs never fabricate receipt probes; no automatic mutation replay. Persistent recovery/next action handles selector loss/unavailable storage and unresolved delivery capacity. A new tab with the same cookie jar is not separate isolation; deleting site data remains an explicit user action. Caps remain8 outstanding delivery entries/2048 header bytes. Receipt/TTL/abort/fresh selector alone do not release unresolved delivery capacity.

#### Feasibility / implementation gate

U1-B dependency feasibility is satisfied by verified 006 handoff and T001 consumer alignment/re-analysis. This closes the backend prerequisite, not 005 US1 implementation or SC-001–003 acceptance. Existing OAuth/browser journeys and security semantics remain required. Local HTTP/controlled provider acceptance does not claim production HTTPS sibling-domain or live-provider acceptance. 005 owns broader private state disposal and request/continuation fencing.

Browser acceptance MUST kiểm contention, queued cancellation, existing refresh lease/single-flight không deadlock, refresh/logout A pending→login B, stale login/onboarding/password completion, timeout trước/sau dispatch, tab close, no-Web-Locks và OAuth callback gần auth operation khác. Sau late response, reload/renew phải vẫn đúng expected account hoặc explicit recovery đã được chứng minh/approve; không fallback A/silently clear B/false authenticated success. Store-only assertions không đóng U1; no cookie/token values trong reports.

| Surface — URL unchanged             | Session / styling                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| Existing auth/account/Admin/product | Product provider, existing auth rules; scoped chrome/adopted screens              |
| `/i/[slug]`                         | No account nav/provider/refresh/peer/dirty guard; template-only typography/output |
| `/internal/invitation-renderer`     | Existing isolated capture harness, no product runtime/styles                      |
| `/api/health`                       | Existing independent handler, no UI provider                                      |

Route groups là ownership organization, không authorization mechanism; actual backend remains source of truth.

## Acceptance Matrix

Customer/Admin same-role switch, different role, logout/login, A→B→A; delayed success/error/page append; failed reload; pending save/upload/publish/poll; stale401; pending refresh/logout/password/profile; dirty disposal; same-owner renewal giữ unsaved forms. Auth-transition cases phải kiểm subsequent reload/renewal và actual cookie behavior theo U1 refinement. Browser evidence cần actual peer/account transition; unit mock alone không đủ.
