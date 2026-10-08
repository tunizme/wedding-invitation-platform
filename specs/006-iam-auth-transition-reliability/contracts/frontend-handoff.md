# Contract: Frontend Ownership và 005 Handoff (CSP-1)

**Date:** 2026-10-08. T001–T116 are implemented and checked. Final Phase24 auth-transition all PASS: browser208/208, selected frontend133, API76, scripts35 and all root quality gates, at `.artifacts/auth-transition/run-Lt4lxU/`. IAM all and owned production-start health PASS. See [validation-results](../validation-results.md) for final evidence and historical failed/interrupted invocations. Consumer alignment/re-analysis and private-resource fences remain feature005's responsibility (FR-016).

## Ownership

| Concern                                                                                | Owner | Ghi chú                                                                              |
| -------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------ |
| Shared selector (IndexedDB), provisioning/confirm, intent reserve/retry, outcome probe | 006   | Module duy nhất; 005 không duplicate                                                 |
| Auth headers, `authProtocol` check và operation knowledge                              | 006   | `apps/web/src/features/identity-access/api/client.ts`                                |
| Refresh single-flight, admission rules và peer hints                                   | 006   | `session/refresh-coordinator.ts`, `session/store.ts`, `session/session-provider.tsx` |
| Recovery states và accessible auth feedback                                            | 006   | Existing login/OAuth/onboarding/session recovery surfaces                            |
| Principal/resource lifetime fences, private-view disposal, surface lifecycle           | 005   | Consume actual 006 snapshots/events; không thêm coordinator thứ hai                  |

## Capability thực tế cho 005

1. **Admission snapshot:** `sessionStore.subscribe(listener)` thông báo thay đổi, không truyền admission payload. Consumer đọc `sessionStore.get()` để lấy `AccessSession.user` và `sessionStore.admission()` để lấy `{contextId, sessionTag, contextRevision}`. Admission do coordinator kiểm selected context/tag/revision và cập nhật memory trong cùng callback readwrite selector transaction; promise continuation không admit lại snapshot cũ. Transaction abort/timeout rút admission tạm thời bằng local-version guard, không xóa B mới hơn. Generation cục bộ không là cross-tab authority. Không có API `onAdmission({principal,...})`; snapshot `null` nghĩa là chưa có private admission. Consumer phải kiểm snapshot ngay lúc mount và dispose subscription khi unmount.
2. **End admission:** `sessionStore.onEndAdmission(listener)` truyền reason `LOGOUT`, `SUPERSEDED`, `STORAGE_RESET`, `STORAGE_UNAVAILABLE`, `CREDENTIAL_MISSING`, `CAPACITY_EXHAUSTED`, `CONTEXT_UNAVAILABLE`, `NOT_DISPATCHED`, `OPERATION_UNCERTAIN` hoặc `OPERATION_FAILED` khi admission đang tồn tại bị kết thúc. `lastEndReason()` phục vụ recovery feedback; clear khi đã null không phát thêm end event. 005 phải dispose private view state và outstanding work khi admission mất hoặc principal/lifetime đổi; chỉ nghe end event không đủ để initial render an toàn.
3. **Renewal:** refresh giữ `sessionTag` và same-principal identity; token/expiry/CSRF có thể thay đổi. 005 không invalidate valid unsaved edits chỉ vì credential renewal. `contextRevision` là protocol authority metadata, không tự thay thế resource generation hoặc identity epoch của 005.
4. **Operation knowledge:** `ApiError.knowledge` là `NOT_DISPATCHED`, `COMPLETED` hoặc `UNCERTAIN`; parsed error cũng có thể `COMPLETED`, nên không đồng nghĩa success. Auth coordinator reconcile bằng bounded read-only outcome probes; không automatic replay mutation. Queue deadline 5s, dispatched request 15s, recovery tối đa 30s/hai probes theo [browser-state](browser-state.md#6-client-operation-knowledge-và-deadlines).
5. **Storage/capacity recovery:** transactional IndexedDB là prerequisite; peer messages chỉ là hints và Web Locks không là sole authority. Missing/reset/unavailable selector không adopt surviving cookies. Protocol caps giữ tối đa 8 outstanding delivery entries và cookie header budget 2048 bytes; terminal receipt, TTL, abort hoặc fresh selector không giải phóng capacity thiếu delivery proof. Persistent unresolved deliveries có thể hết budget; accessible next action hướng dẫn xóa dữ liệu site hoặc dùng genuinely separate browser context. Tab mới cùng cookie jar không tạo isolation. Xóa dữ liệu site là lựa chọn explicit của người dùng, không thao tác tự động.

005 MUST NOT đọc/ghi selector trực tiếp, tự chế auth headers, tin peer arrival order, tự clear/reuse cookie slots hoặc thêm coordinator/transport thứ hai. 005 vẫn owns lifetime fences cho private records/drafts/resource operations; 006 không chứng minh toàn bộ private application surfaces đã isolated.

## Verified evidence và giới hạn

- [Validation results](../validation-results.md): final all `.artifacts/auth-transition/run-05WyjJ/` PASS (scripts35, web74, API72, browser120/120), including T102/T103 corrections, all four projects and zero required skips. Historical US2 `.artifacts/auth-transition/run-yfMiWa/` PASS (scripts33, web73, API45, browser88); US3 `.artifacts/auth-transition/run-dQxdNn/` PASS (scripts33, web73, API50, browser112). Chromium, Firefox, WebKit và Chromium không Web Locks đều có required cases, zero skips. Các story checkpoints là lịch sử; final all evidence ở run-05WyjJ xác nhận snapshot cuối.
- A5 actual credentialed `POST /auth/contexts` từ frontend Origin qua CORS PASS4/4 tại `.artifacts/auth-transition/a5-3510/`. Synthetic header probes accepted 159 cookies/13990 bytes trên Chromium và Firefox; WebKit180/15838. WebKit next probe là network/CORS-hidden status0, không được diễn giải là observed431. Measurements không tăng protocol caps hoặc bảo đảm browser cookie retention tuyệt đối.
- Browser validation dùng local HTTP và controlled OAuth provider harness. Production HTTPS/Secure-cookie deployment, real Google/Facebook credentials/provider operation chưa được thực thi trong các checkpoints này. Protocol hỗ trợ full-navigation journeys khi prerequisites/capacity an toàn; không thêm provider hoặc đổi popup flow.
- Credential loss/eviction dẫn tới explicit no-fallback recovery, không được ghi account-preservation PASS. Shared storage unavailable giữ public experience và persistent next action. Availability không unlimited khi responses vĩnh viễn không được acknowledged.

Phase21 verification bổ sung: setup errors và queue timeout có persistent scoped feedback/next action; không probe khi chưa biết intent ID, không automatic mutation replay. Parsed refresh rejection là OPERATION_FAILED, khác UNCERTAIN. Metadata explanation được xóa bởi explicit new action hoặc verified peer renewal. Hai connection thực trên cả bốn browser projects đã verify delayed-result admission cùng real-cookie B reload/renew;005 tiếp tục consume cùng snapshots/events, không duplicate coordinator.

## Breaking changes và coordinated cutover

- Protocol-2 session responses có `authProtocol`, `sessionTag`, `contextRevision`; 003 strict response validators/consumers phải dùng updated contract. TypeScript `AccessSession` giữ optional metadata cho compatibility ở type boundary, nhưng runtime coordinator yêu cầu protocol2 trước admission; không fallback legacy response.
- Login/OAuth/onboarding complete/logout đi qua reserved intent. LOGOUT phải truyền `expectedSessionTag` kể cả giá trị explicit `null`; stale captured target không revoke newer session.
- `/me/password` và `/auth/logout-all` giữ đúng account-wide revocation, không clear newer immutable slot bằng singleton `wedding_rt`.
- API fleet phải đồng nhất CSP-1 trước frontend cutover; không mixed protocol fleet. Existing legacy users có thể cần fresh login một lần; late legacy responses chỉ tác động legacy cookie name. Không dual-protocol session migration.
- [IAM operations](../../../docs/iam-operations.md) ghi rollback: stop traffic, revoke context sessions trên full fleet trước legacy redeploy; users mất session và phải login lại, dữ liệu account/invitation được giữ. Additive schema không rollback tự động. Re-cutover kiểm lại fresh login và recovery.

## 005 consumer alignment và re-analysis

[005 session boundary](../../005-frontend-foundation-reliability/contracts/session-boundaries.md) đã ghi actual IAM dependency và story evidence. T001 của005 vẫn phải đồng bộ historical frontend-only lock/writer assumptions, compatibility matrix và task prerequisites với CSP-1; đặc biệt password/logout-all không là singleton-cookie writers, OAuth có server-authoritative intent boundary và admission API là subscribe + snapshots.

Final006 quickstart/all evidence đã có; re-run `speckit-analyze` trên005 trước application entry. Re-analysis hiện tại là read-only và không mark005 tasks complete; specification approval, story checkpoint hoặc handoff alone không đóng consumer-alignment/analysis gate.

## 005 read-only re-analysis — 2026-10-07

`speckit-analyze` đã đọc005 spec/plan/tasks + constitution, không thay đổi005 artifacts hoặc đánh dấu task complete. Requirements coverage34/34 (FR001–025, SC001–009),62 tasks, zero unmapped tasks; ambiguity0, duplication0, critical0. Coverage không đồng nghĩa implementation readiness.

| ID  | Severity | Source                                                                                                                            | Finding và required consumer alignment                                                                                                                                                                                                               |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | HIGH     | `005/contracts/session-boundaries.md` §Operation matrix/Lock ownership; `005/tasks.md` T015/T018; `005/plan.md` §Scoped lifetimes | Historical exclusive cookie-context lock through completion và internal `refreshUnderLock` mandates cần align với CSP-1 server authority/immutable slots/IDB refresh lease. Preserve005 resource/principal fences; không impose coordinator thứ hai. |
| I2  | HIGH     | `005/contracts/compatibility.md` opening; `005/contracts/session-boundaries.md` §Operation matrix                                 | “Chưa có actual006 implementation”, singleton-cookie password/logout-all writers và OAuth incomplete-boundary descriptions stale so với verified handoff; replace bằng actual transport/revocation/OAuth semantics.                                  |
| I3  | MEDIUM   | `005/plan.md` Status/Implementation entry/U1-B; `005/tasks.md` Status/approval gate                                               | Gate pending cần phân biệt verified006 story evidence, final006 acceptance và005 consumer alignment chưa hoàn tất. Không đóng gate chỉ vì dependency spec/story checkpoint đã PASS.                                                                  |

005 T001 owns remediation và subsequent re-analysis trước005 application entry; unresolved HIGH findings giữ gate theo constitution. Findings này là005 consumer artifacts, không phát sinh006 runtime scope hoặc yêu cầu implement005 trong006. Final006 evidence đã được bổ sung; các findings005 vẫn cần được T001 xử lý trước application entry005.

## 005 read-only re-analysis — 2026-10-08

Re-analysis read005 spec/plan/tasks, session/compatibility contracts and constitution2.0.0 after final006 all evidence. No005 artifact was modified and no005 task was marked complete. Coverage remains34/34 requirements (FR001–025 and SC001–009),62 tasks, zero unmapped tasks; ambiguity0, duplication0, critical0. Requirement coverage is not consumer readiness.

| ID  | Category      | Severity | Location                                                                                         | Finding / required action                                                                                                                                                                                                                               |
| --- | ------------- | -------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | Inconsistency | HIGH     | 005 session-boundaries §Operation matrix/Lock ownership; tasks T015/T018; plan §Scoped lifetimes | Exclusive cookie-context lock/internal refreshUnderLock requirements still conflict with006 server authority, immutable slots and transactional selector/refresh lease. T001 must align these consumer artifacts without creating a second coordinator. |
| I2  | Inconsistency | HIGH     | 005 compatibility opening; session-boundaries §Operation matrix                                  | Claims that006 has no implementation and singleton password/logout-all writer assumptions remain stale. Consume the verified protocol2 transport, original-session clear semantics and server-authoritative OAuth intent boundary.                      |
| I3  | Inconsistency | MEDIUM   | 005 plan Status/Implementation entry/U1-B; tasks Status/approval gate                            | Distinguish completed006 dependency validation from still-pending005 consumer alignment, private-resource fences and implementation acceptance.                                                                                                         |

Next action belongs to005 T001: update its consumer artifacts and re-run analysis before005 application implementation. Unresolved HIGH findings retain005's entry gate under constitutionV. This handoff completes006's evidence delivery/re-analysis obligation without claiming005 U1-B resolved or005 implemented.


## Phases22–24 verified capability updates

Bootstrap/refresh observing an invalid held admission now withdraws it in the selector transaction, including peer recovery and pending logout; delayed result delivery preserves newer B. Valid selected admission survives NOT_DISPATCHED queue explanation. Local login commits selector B, pending-fence release and memory admission atomically. OAuth-result confirmation, renewal and feedback are scoped to the originating attempt/context/tag, so B cannot become A's success and old A cannot publish B's queue failure.

Outcome receipts are genuinely read-only: no group merge, activity update, ledger acknowledgement/release or cookie emission. Normal mutating OAuth start settles co-present groups and ledgers atomically after its business write. Hidden unresolved emissions remain counted until actual delivery evidence permits release.

These capabilities are verified by deterministic frontend/actual-component tests, production PostgreSQL/HTTP regressions and all four actual browser projects, with real cookies/IndexedDB and B reload/renew. Final evidence is `run-Lt4lxU` (133 frontend,76 API,208 browser) plus `/tmp/006-phase24-iam-all.log`. Existing subscribe/snapshot/end-admission APIs remain the consumer contract;005 still must implement its own principal/resource lifetime fences and resolve its documented alignment findings.
