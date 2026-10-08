# Research: IAM Auth Transition Reliability

**Date:** 2026-10-07. **Status:** P01/P02 policies APPROVED (R11); protocol CSP-1 selected và P01/P02 feasibility gates **CLOSED ở mức design proof** (R12). Phase 0 complete; Phase1 mở được. Còn verification A5 (WebKit cookie limit) chỉ ảnh hưởng numeric cap. Không runtime PASS. R10 là pre-approval research; R11 ghi policy authority; R12 là selected protocol.

Read-only research agents kiểm protocol/security, actual IAM compatibility và validation/tooling. Không application code, dependencies hoặc migrations được thay đổi. Authority: [spec](spec.md), [constitution](../../.specify/memory/constitution.md), [003 refresh policy](../003-identity-access-management/research.md#refresh-token-rotation-reuse-và-concurrency), [005 dependency](../005-frontend-foundation-reliability/research.md#r02b--iam-dependency--cookie-strategy-candidates). Source-based risks không là reproduced incidents.

## R01 — Existing transport và immutable requirements

**Decision:** Giữ existing IAM business/security baseline; không chọn stable browser cookie làm replacement refresh credential. Preserve strict first-writer-wins rotation, consumed/revoked credential reuse → revoke đúng session family; no grace window/raw-successor replay/cache. Lost refresh response có thể cần fresh explicit login, không auto replay refresh. Access TTL15min, absolute session expiry14days và memory-only access token giữ nguyên.

**Rationale:** `apps/api/src/modules/identity-access/auth/refresh.service.ts` kiểm presented browser credential, consume predecessor và insert successor dưới transaction. [003 research](../003-identity-access-management/research.md) đã explicitly reject grace/idempotent raw-successor cache. Chỉ giữ bảng `refresh_credentials` trong khi rotation hoàn toàn hidden server-side không giữ cùng theft/replay detection.

**Alternatives considered:** Stable reusable bearer context cookie + server-owned rotating secret không phân biệt stolen previous browser credential với legitimate renewal. Versioned/session-scoped cookie slots có thể giữ presented-credential security nhưng cần proof bootstrap/authority và bounds trước chọn.

## R02 — Verified browser facts và project inference

**Decision:** Cookie delivery phải nằm trong correctness proof; store fences, operation terminal state, client abort hoặc lock release không đủ.

**Verified facts:** [RFC 6265 §4.1](https://www.rfc-editor.org/info/rfc6265/) mô tả concurrent Set-Cookie race và replacement khi same name/domain/path; cookie cũng có thể bị eviction. [Fetch Standard](https://fetch.spec.whatwg.org/) xử lý credentials/cookies ở browser, script admission không là cookie fence. [Web Locks](https://www.w3.org/TR/web-locks/) chỉ cooperative coordination trong shared storage context. [RFC 9700 §4.14.2](https://www.rfc-editor.org/info/rfc9700/) là source cho rotation/replay threat model; project003 chọn policy cụ thể chặt hơn, không tự reinterpret nó.

**Project evidence / inference:** `auth/browser-security.service.ts` dùng singleton `wedding_rt` (production `__Secure-wedding_rt`), host-only/HttpOnly/SameSite=Lax, Path `/api/v1/auth`. `auth/session.controller.ts` write/clear shared slot; `profile/profile.controller.ts` clear cùng slot; `oauth/oauth.controller.ts` callback ghi cookie ngoài page lock. Vì vậy current contracts chưa cung cấp required006 guarantee. Đây là inference từ source, chưa runtime incident evidence.

**Alternatives considered:** Đợi TTL, clear cookie toàn cục, successful refresh, status lookup alone hoặc đổi OAuth popup không chứng minh response đã emitted sẽ không phá current context; không waive supported journeys/browsers.

## R03 — Candidate evaluation / P01 initialization authority

| Candidate                                                             | Established-context benefit                                                       | Missing proof / disposition                                                                                                                                    |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Singleton stable context cookie + server current mapping              | Auth operations có thể tránh write/clear stable cookie                            | Concurrent virgin initialization có thể trả C1/C2; late C1 overwrite cookie C2 đã dùng login B. Không chọn final architecture                                  |
| Stable context là reusable renewal credential                         | Server mapping serialize effects                                                  | Violates preserved presented-refresh replay semantics nếu không có separate reviewed proof. Rejected as currently described                                    |
| Authoritative context + immutable per-transition/session cookie slots | Late A writes/deletes A slot thay vì B; within-slot strict rotation có thể giữ003 | Context selector/init vẫn cần delivery-safe proof; slot bounds/eviction/cleanup/cleared-storage/fixation chưa chốt. Research candidate, chưa selected contract |
| Append-only per-generation cookies                                    | Có thể tránh overwrite credential generation                                      | Cookie growth/eviction, selecting head/revoked head, bootstrap và treating historical consumed tokens cần proof; không tự xem là giải pháp                     |
| Frontend lock + epoch only                                            | Cooperative scheduling và UI admission                                            | Không cover external writers/no-Web-Locks/context loss; insufficient                                                                                           |

**P01 — BLOCKED: Context initialization / selection capability required.**

- Feature: browser auth context provisioning/selection; trace006 FR-001–003/008/014, SC-001/003/007.
- Affected UI: anonymous login, OAuth start, cleared cookies/storage, tab close/reopen và cross-tab context switch.
- Required capability: trusted current-context selection sau overlap initialization và late response; không implicit fallback sang prior account khi head credential/selector mất.
- Suggested contract: chưa selected endpoint/header/cookie. Initialization protocol phải chứng minh server-side authority và browser-bound possession/fixation isolation, including concurrent cookie-less tabs; không trust public client IDs hoặc cookie arrival order làm authority.
- Counterexample: init1 emits C1 nhưng response bị hold; init2 installs C2, login B confirmed; init1 arrives và installs C1; reload có thể dùng wrong mapping. “Set once”/one successful probe không loại race này.
- Closure: complete protocol + adversarial sequence proof cho late init, storage/cookie deletion, missing/evicted head và separate browser/private contexts; actual browser cases là required implementation evidence. Không pre-seed cookie trong mọi fixture để che gap.

## R04 — P02 strict refresh preservation và safe relogin

**P02 — BLOCKED: Refresh credential / slot protocol required.**

- Feature: late-response-safe credential delivery giữ003 reuse/revocation; trace006 FR-003/005/011/014, SC-001/002/005/007.
- Required capability: old A effect không overwrite/delete B credential, trong khi old consumed credential thực sự được presented vẫn revoke đúng family. Server-held rotating secret với stable replayable browser bearer không đủ.
- Suggested direction: separate immutable transition/session slots, current mapping chọn authoritative slot; within slot preserve current strict rotation. Fresh explicit login reserve transition/session mới có thể recover lost refresh, không recover bằng replay/caching raw successor. Đây là candidate phụ thuộc P01, chưa final design.
- Closure: enumerate parsing/selection, tombstone/no-fallback, max slot/header sizes, pruning/eviction, in-flight old cleanup và logout/password semantics; prove legitimate historical slots không bị nhầm với malicious replay nhưng old-token-only replay vẫn bị reject/revoke. Numeric slot/retention limits chỉ chọn sau protocol proof, không invent feasible bounds.

**Decision:** Không âm thầm thay003 FR-039 hoặc access-token revocation semantics để chọn candidate. Nếu thật sự cần đổi policy, phải explicit separate scope/security approval và artifacts cập nhật; chưa được authorize ở bước plan.

## R05 — Ordering, effects và lock hierarchy

**Decision:** Trusted ordering phải được accepted trước password/provider work; final session/context commit re-check current intent atomically. OAuth authority capture ở start, carry qua existing transaction/onboarding và check tại final commit; không allocate fresh authority tại callback cũ.

**Rationale:** `auth/local-login.service.ts` password verification và `oauth/oauth.controller.ts` provider calls nằm ngoài DB transaction. Existing `application/resolve-social-identity.service.ts` và `complete-social-onboarding.service.ts` issue session + consume transaction/proof atomically. Refinement không được tách các existing guarantees này.

**Alternatives considered:** Commit-order/response-order “latest wins” hoặc client clock không bảo đảm supersession. Account-wide logout/password/reset/lock effects vẫn áp dụng original principal theo existing policy; context stale không hứa rollback mutation. Login B cùng account cũng vẫn chịu account-wide revocation nếu business ordering yêu cầu, không coi preservation là exemption.

**Unselected integration details:** `infrastructure/transactions.ts` và003 rotation giữ User → Session → Credential hierarchy. Context/OAuth/onboarding locks phải được enumerate ở mọi writer rồi chốt one consistent hierarchy; không thêm context-first tại một path và user-first tại path khác. Không network trong transaction; bounded provider IO và retries của transaction vẫn giữ security semantics. Hierarchy mở rộng phụ thuộc P01/P02 final model, chưa đủ chốt ở Phase 0.

## R06 — Operation knowledge / deadlines

**Decision:** NOT_DISPATCHED, COMPLETED và UNCERTAIN là client knowledge, không substitute backend operation states. COMPLETED khác success; body parse failure sau headers không chứng minh mutation chưa xảy ra. Unknown lookup không chứng minh undispatched: request có thể còn tới server.

Recovery lookup phải read-only/non-rotating, authorized đúng browser/operation context, không return credentials từ receipt/cache. Durable terminal outcome + effects cần atomically recorded trong selected protocol; nhưng terminal outcome không tự fence already-emitted cookies. Fresh explicit login chỉ được coi safe recovery khi P01/P02 chứng minh stale delivery không phá new context.

**Chosen client budgets cho future design:** Queue acquisition5s; dispatched auth request15s (giữ current timeout); recovery attempt tổng30s, tối đa2 read-only probes mỗi probe≤15s và bounded bởi remaining total budget; zero automatic auth-mutation retries. Caller signal combine deadline, không replace timeout. Deadline hết → persistent UNCERTAIN/recovery state, không success/indefinite spinner. Các budgets không tự authorize newer writer khi chưa safe; server transaction/provider budgets và operation retention phải được chốt cùng final protocol trước tasks.

**Rationale:** `apps/web/src/features/identity-access/api/client.ts` map network và malformed body thành `ApiError(0)`; caller signal hiện thay default15s. `session/refresh-coordinator.ts` mọi refresh failure clear/broadcast logout và bootstrap lại rotate. Các behaviors cần reviewed transport integration, không screen-only guard.

**Alternatives considered:** Auto retry POST refresh, expired lease hoặc unbounded pending promise không đáp ứng006 outcomes. Healthy-service recovery phải có reviewed route to resolution; indefinite blocker screen không đủ.

## R07 — Compatibility boundaries

**Decision:** Không change existing strict body allowlists bằng undocumented DTO fields. Login chỉ email/password, onboarding confirm chỉ proof, password change currentPassword/newPassword. Future context/operation metadata format chỉ chốt khi protocol selected.

`/me/password` nằm ngoài refresh cookie Path `/api/v1/auth`; bearer principal xác định original target account, không suy browser binding từ absent cookie. `authorization/auth.guard.ts` chỉ JWT validation; `auth/access-token.service.ts` reject unknown claims. Không claim JWT đang chứa browser authority hoặc tự thêm claim/session-live lookup, vì003 cho existing bearer TTL tối đa15min sau revocation.

Legacy write/clear `wedding_rt` phải không thể affect new protocol slot/selector. Không new→legacy fallback khi upgraded context unresolved. Theo clarification A, không mandate dual-protocol migration window; stale clients/workers, old in-flight OAuth/refresh, coordinated cutover và rollback vẫn phải có proof; tách new namespace alone chưa resolve selector/init/reuse. Nếu tables/relationships cần thay đổi, explicit migrations tại `apps/api/src/infrastructure/database/migrations/`, synchronization disabled; không migration chạy trong planning.

**Ownership:**006 owns minimal IAM transport/coordinator/protocol integration;005 owns wider principal/resource UI fences và visual foundations, consume same coordinator. Không circular runtime dependency hoặc duplicate implementation.

## R08 — Verification tooling và evidence design

**Decision:** Existing `scripts/iam-validate.mjs` cumulative003 gates là compatibility baseline, không006 browser evidence. Existing `apps/web/playwright.config.ts` chỉ builder testDir. Cần dedicated IAM browser runner/config và owned API/proxy/provider harness sau contract selected; chưa tạo code trong planning.

Planned app-owned suites: API contract/integration/security/migrations tại `apps/api/test/{contract,integration}/identity-access/`; web transport/coordinator tests và new IAM e2e suite tại `apps/web`; root runner chỉ orchestration. Existing Playwright available, không cần mặc định install dependency.

**Proposed validation phases, chưa executable006 commands:** contract≤10min, browser≤20min, compatibility≤15min, all≤60min với fixed required-file/case registry, baseline IAM all và applicable independent format/lint/typecheck/build/health. All budgets include30s cleanup reserve; child/proxy/provider waits bounded bởi remaining deadline; missing engine/suite/case hoặc cleanup failure MUST fail, không skipped PASS. Final numeric phase manifests sẽ nằm quickstart khi Phase1 được mở.

**Actual delivery harness:** Owned loopback reverse proxy giữ downstream response headers sau actual upstream DB commit, preserving separate Set-Cookie headers/status/Origin/CORS/redirects. Release old real response sau confirmed B, reload/renew và verify actual API principal. Delay body-only, fabricated route.fulfill success hoặc APIRequestContext cookie jar không đủ.

OAuth browser harness dùng test-only bootstrap inject deterministic adapter ở existing verification port nhưng giữ real controllers/state/binding/claim/finalization/redirect/onboarding; không production fake endpoints, live provider secrets hoặc popup. Existing adapter security/claims suites vẫn chạy riêng; harness evidence không là live-provider integration PASS.

Required matrix: delayed writes/clears trước và sau commit; anonymous A/B; first provisioning overlap; same/different role; A→B→A; same-owner edits; timeout trước/sau dispatch/body parse; close/crash/navigation; no Web Locks; OAuth current/stale/invalid; clear/evict context; legacy responses after cutover; outage rồi healthy recovery. Owned cleanup stop/release browser/proxy/process groups trước drop schema; không shared reset/prune. No token/cookie/proof/password dumps, traces/HAR hoặc secret-bearing screenshots trong artifacts.

## R09 — Proposed protocol: shared selector + session-specific slots

**Proposal authorization:** 2026-10-07, project owner “áp dụng như đã đề xuất”, trả lời proposal server-owned auth context + cookie slot riêng cho từng session + shared context selector không chứa secret. Authorization cho candidate documentation, không final architecture, application code, migrations hoặc P01/P02 closure. [Clarification A trong spec](spec.md#clarifications) cho coordinated cutover với optional one-time reauthentication; không mandate seamless migration hoặc dual-protocol window.

### Roles / trust boundaries

| Role                | Candidate responsibilities                                                                                                                    | MUST NOT assume                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Server auth context | Current session, server-accepted transition order/supersession và original-account effects                                                    | Public context ID hoặc client sequence là authentication/ordering authority                |
| Shared selector     | IndexedDB record chứa opaque context ID, bootstrap attempt ID và non-secret lifecycle metadata; same-origin tabs đọc/cập nhật transactionally | Selector cấp quyền login/renew, là refresh credential hoặc replaces backend checks         |
| Context binding     | Server-minted HttpOnly proof ở cookie namespace riêng cho context; chỉ validate possession/binding theo reviewed protocol                     | Stable binding alone đủ renew/access hoặc silently mint same binding từ supplied public ID |
| Session slot        | Immutable cookie **name** cho session/context; refresh **value** vẫn rotate theo003, HttpOnly                                                 | “Immutable slot” nghĩa là reusable immutable refresh token                                 |
| Operation record    | Original context/intent, outcome/effect knowledge; scoped read-only reconciliation                                                            | Receipt có raw successor/token hoặc terminal state chứng minh response delivery đã hết     |

Selector không chứa user email/profile, token/password/proof/CSRF hoặc cookie value. [IndexedDB specification](https://www.w3.org/TR/IndexedDB/) hỗ trợ transactions cho shared records; điều này chỉ là cơ sở cho local compare-and-set, không proof server authority, storage availability hoặc complete auth correctness. Proposed new IndexedDB ownership/database lifecycle phải document tại Phase1 sau feasibility proof; chưa có persisted frontend store được implement.

### Candidate bootstrap / selector state machine

```text
UNSELECTED
  → reserve attempt in shared transaction
  → PROVISIONING(attemptId)
  → server emits context-specific binding; response arrives
  → verify attempt still current + binding with server
  → conditional shared transaction commits SELECTED(contextId)

Superseded response → no selector commit
Unconfirmed dispatch/outcome → UNCERTAIN
Missing/cleared/ambiguous selector or proof → RECOVERY_REQUIRED
```

1. Reserve bootstrap attempt bằng short IndexedDB transaction, không giữ transaction qua network await. Attempt IDs phải tránh stale-response collision sau storage reset; không sử dụng client clock làm trusted server intent order.
2. Server provisions anonymous context/binding riêng; mỗi initializer MUST không ghi cùng singleton selector-cookie name. Opaque context ID không được dùng để lấy lại auth credential hoặc adopt attacker-provided context.
3. Khi response tới, check current attempt; verify cookie possession/binding với server; sau verification **re-check** attempt bằng conditional shared transaction trước selector commit. Network verification và IndexedDB commit không atomic với nhau, nên check trước await alone không đủ.
4. Late/superseded response không mutate selector. Browser có thể vẫn install cookie riêng của abandoned context; server/consumer không được tự chọn nó làm current account.
5. Mọi session establishment/renewal phải được server validate với bound context và server-accepted intent; chỉ selected frontend record không đủ admission. Peer messages là notifications để re-read/reconcile, không direct session authority.
6. Nếu selector/proof mất hoặc ambiguous, không scan leftover cookies rồi chọn account bất kỳ. Recovery/new explicit login cần reviewed protocol; record thiếu không tự chứng minh mọi old request đã hết.
7. IndexedDB unavailable/blocked/evicted hoặc storage partition khác MUST có explicit handling. Không quietly dùng localStorage lease, drop browser support hoặc phụ thuộc Web Locks cho required guarantees. Fallback availability/correctness còn proof obligation.

**Conditional P01 benefit:** init A response late không overwrite binding cookie B nếu namespace thật sự disjoint; nó không replace shared selector B nếu attempt CAS vẫn valid. Đây là conditional argument cho hai steps, **chưa chứng minh** authoritative binding/supersession giữa contexts, tab crash, storage reset hoặc selector unavailable.

### Candidate session / refresh / logout flow

- Fresh accepted login creates a new session-specific slot; name không được tái sử dụng cho session khác. Auth context current mapping + session issuance + operation result cập nhật atomically ở server theo selected lock hierarchy.
- Request MUST specify/resolve đúng bound context và current slot bằng reviewed protocol; không chọn qua cookie arrival order, highest arbitrary cookie name hoặc client timestamp. Exact cookie/header names chưa selected HTTP contract.
- Trong current slot, strict rotation vẫn consume predecessor/create successor; presented consumed/revoked credential replay revoke đúng family. Do not cache raw successor/replay POST refresh để recover lost response.
- Late A refresh ghi value vào slot A; late A logout clear slot A, không wildcard clear B/current selector. Existing account-wide logout/password/reset/lock revocation vẫn tác động original account theo business rules, kể cả same-account newer sessions nếu applicable.
- Same-session concurrent refresh và lost successor vẫn chịu strict003 policy; slot isolation không tự giải within-session rotation race. Cần coordination/protocol handling dẫn tới truthful explicit relogin khi reuse/lost-response policy yêu cầu, không security grace.
- Fresh explicit login sau uncertainty tạo slot mới chỉ khi reviewed authority/provisioning protocol chứng minh old writers không thể supersede nó. Không dùng “đã tạo slot B” alone làm proof.
- Cleanup chỉ delete proven obsolete slot names; late cleanup không xóa current/new slot. Parsing, maximum slots/header bytes, tombstones/no-old-fallback, eviction và pruning còn phải chốt; không giả unlimited cookie storage.

**Conditional P02 benefit:** disjoint A/B cookie names ngăn same-name replacement/deletion giữa hai sessions; presented-refresh rotation có thể giữ003. P02 chưa đóng khi current selection, bounds, malicious replay versus leftover slots hoặc same-account revocation còn chưa specified/proven.

### OAuth / recovery / cutover

OAuth start capture server-accepted intent/bound context; callback/onboarding re-check cùng intent, không reserve newer authority tại callback. Full navigation preserve existing flows; shared selector không mặc nhiên available ở API/provider origin. Callback phải bind qua existing state/transaction và reviewed cookie proof, không token trong redirect URL. Exact handoff để callback biết current context còn unresolved.

Outcome query read-only, authorized context/operation; no credential result cache. Unknown result giữ UNCERTAIN, không imply undispatched. Recovery budgets theo R06. Logout vẫn end local state khi network unavailable; remote effect chỉ confirmed khi có evidence. Healthy-service recovery phải progress theo reviewed protocol, không indefinite blocker.

Cutover A cho phép one-time fresh login. Upgraded consumer không fallback legacy `wedding_rt`; legacy response chỉ mutate legacy namespace. New protocol cần version/admission behavior cho stale clients/in-flight provider callbacks và rollback; không claim bỏ dual-protocol window đã loại mọi old writer. Existing bearer TTL/security semantics giữ nguyên.

### Proof obligations / adversarial matrix

| Sequence / condition                                                  | Required proof / expected behavior                                                                | Disposition                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Init A held → init B selected/login B confirmed → late init A         | Separate bindings; stale attempt cannot commit selector; server mapping/reload/renew remain B     | Local CAS/namespace argument partial; complete P01 proof OPEN |
| Storage reset during init/verification or active B                    | Old attempt cannot reuse new reservation; no old-cookie account fallback; safe fresh provisioning | OPEN                                                          |
| Selector unavailable, private/partitioned contexts, tab close         | Supported-browser flow + bounded recovery; no credential mixing or lock-only safety               | OPEN                                                          |
| Known public context ID / attacker context adoption                   | Context ID grants no access; possession/fixation/CSRF and original binding verified               | OPEN                                                          |
| Refresh/logout A response held after commit → B confirmed → release A | Only A slot affected; authoritative B selection and cookie reload proof                           | Namespace argument partial; selector/server proof OPEN        |
| Current slot missing/revoked/evicted; stale slots remain              | No silent restore old account; explicit reviewed recovery                                         | OPEN                                                          |
| Same-slot refresh concurrency / consumed credential replay            | Strict003 family revocation retained, no hidden grace/cache                                       | Existing policy retained; parsing/integration proof OPEN      |
| Old cleanup + slot pressure/header limits                             | Finite safe bounds; cleanup cannot delete newer slot or resurrect old context                     | OPEN                                                          |
| OAuth old callback after B/logout; current valid callback             | Correct supersession; existing returning-user/onboarding security preserved                       | OPEN                                                          |
| Late legacy response after cutover                                    | No effect on new namespace/selector/current authority; no legacy fallback                         | OPEN                                                          |

No row is runtime PASS. P01 closure needs complete bootstrap/binding/server authority + unavailable/cleared storage proof. P02 closure needs slot selection/replay/bounds/cleanup proof integrated with P01. Review counterexamples before Phase1 schema/contract selection; required actual browser delivery evidence follows authorized implementation.

## R10 — R09 feasibility review / concrete policy deltas

**Decision:** Lần rerun `speckit-plan` giữ P01/P02 BLOCKED, nhưng thu hẹp remaining work thành concrete protocol refinements và hai policy deltas trong [policy-proposal.md](policy-proposal.md). Không apply proposed wording vào spec trước explicit approval. Ba read-only research agents đã challenge bootstrap/server authority, actual003 contracts và validation/availability; không application code hoặc dependencies thay đổi.

**Rationale:** Available IndexedDB + separate bindings có conditional isolation argument; không tự cung cấp availability khi required selector substrate mất hoặc finite cookie-delivery capacity hết. SC-003 cho phép bounded unresolved state nhưng không waive healthy-service resolution/existing journey requirements. Approval cutover A không authorize repeated recovery reauthentication hoặc disabling auth khi storage unavailable.

### Concrete protocol refinements — chưa final wire contract

1. Bootstrap reserve/verify/CAS như R09; selector là routing/lifecycle metadata, backend binding/session checks là auth authority. Missing/reset selector end private admission, không adopt surviving cookies. Fresh provisioning là new logical lifetime; abandoned-root effects không được trở thành current. Boundary này cần explicit wording ở FR-001/002 trước final design.
2. Auth intent cần **reserve → re-check shared attempt → execute**, không allocate authority lần đầu tại delayed execute arrival. Reservation không clear/replace current session; execute finalization atomically checks server intent rồi issues/ends session và records outcome. OAuth pre-reserves qua fetch trước existing full-navigation start; callback/onboarding carry original intent.
3. Reservation cần **expected server revision CAS**: stale A reserve với observed revision r không được supersede B đã reserve r+1. Không auto lookup newest revision rồi replay stale A để biến nó thành current. Local attempt check alone không đủ: late A reserve có thể invalidate pending OAuth B dù A không execute. Numeric revision/metadata/schema vẫn proposal, chưa có existing DTO hoặc endpoint như vậy.
4. Current mapping derive exact slot từ server session ID; exactly-one binding/slot parsing, reject duplicate/malformed values. Ordinary historical cookies browser gửi kèm không là presented credential; missing current slot không scan fallback. Explicit consumed A replay với valid original binding/Origin/CSRF vẫn phải revoke original family theo003; deny stale private admission không được silently bỏ security effect này.
5. Logout-current capture original session và clear only its immutable slot. Logout-all/password vẫn target original bearer account; same-account newer session có thể bị legitimate account-wide revocation. `/me/password` cần deliberate binding transport vì narrow-path refresh cookie không được gửi tới route đó; không invent JWT claim.
6. Candidate lock extension: Context sorted IDs → provider-subject advisory locks nếu cần → User sorted IDs → Session sorted IDs → OAuth/onboarding/challenge/credential rows theo consistent order. Đây là hypothesis cần audit mọi writer, không approved hierarchy. Account-wide revocation không cần acquire Context sau User; invalid current mapping có thể derive từ revoked session, lazy retirement qua separate Context-first transaction. Password/provider IO nằm ngoài DB callback.
7. Coordinated cutover: isolate new namespace; upgraded consumer không legacy fallback; distinguish pre-cutover provider transactions; stale clients không được mint new-context authority; rollback require explicit fresh auth thay vì adopt retained legacy cookie. Chưa selected version field/header hoặc migration.

### P01 counterexample / remaining authority boundary

Cookies absent, no IndexedDB/no Web Locks: T1/T2 provision independent C1/C2; B confirms in C2; delayed A establishes C1. Không shared selection witness, backend không biết đây là two tabs hay separate browsers. Arrival-based singleton selection sai; distinct cookies không đủ current-head proof. Permanent blocking safe nhưng chưa đáp ứng current availability wording.

Khi selector reset, stale tab admission từ cached C1 cũng có thể restore A. CAS re-check lifecycle và no fallback ngăn admission; fresh C2 chỉ có authority trong new lifetime, không automatically supersede all unknown abandoned roots ở backend. [P01 proposal](policy-proposal.md#policy-p01--required-shared-storage--logical-context-boundary) yêu cầu shared storage cho auth và làm context lifetime/degraded availability explicit. Không coi đây là requirement đã approved.

### P02 counterexample / finite capacity

N+1 distinct cookie responses đã emitted nhưng held → cleanup deletes obsolete names → B confirmed → old headers reinstall N+1 cookies → browser quota có thể evict B. Same-name replacement đã tránh nhưng eviction chưa tránh. Fixed-name reuse tái tạo overwrite race; elapsed TTL/status terminal không thu hồi headers. [RFC6265](https://www.rfc-editor.org/info/rfc6265/) không bảo đảm browser lưu cookie đến expiry; [IndexedDB](https://www.w3.org/TR/IndexedDB/) transaction không làm selector và cookie receipt atomic.

Finite emission accounting phải tính abandoned bootstrap bindings, storage reset, every cookie-emitting response, name/value bytes và positive acknowledgement của **specific response**. Generic receipt lookup không là delivery ack. `Max-Age` tính từ receipt nên delayed installation không thể tự được coi expired theo server elapsed time. Unacknowledged records không được free chỉ do timeout; exhausted budget cần explicit recovery, không unlimited fresh contexts để bypass cap.

[P02 proposal](policy-proposal.md#policy-p02--finite-delivery-capacity--truthful-credential-loss-recovery) cho degraded availability/explicit credential-loss recovery nhưng không waive unbounded accumulation. Numeric cap chưa selected; 8KiB application-owned cookie-subset cap chỉ là possible request resource bound, không browser retention guarantee hoặc verified proxy configuration. Approval proposal không tự complete finite accounting proof.

**Alternatives considered:** Single-step execute allocating newest intent, cookie scan/highest-name fallback, stable reusable refresh bearer, fixed slot-name reuse, TTL-based capacity release và unlimited fresh bootstrap đều không được chọn. New protocol với additional shared root witness có thể là alternative research, chưa có proof hoặc scope approval để invent final contracts.

**Validation additions:** late reservation A sau B reservation trước OAuth B callback; reset trong binding verification; headers arriving sau cleanup; all pending slots rồi attempted bootstrap reset; selected-slot eviction với historical slots còn lại; explicit consumed-A replay với B current. Browser delayed-header evidence vẫn required sau implementation; không row nào runtime PASS trong planning.

## R11 — Approved P01/P02 policies / remaining feasibility gate

**Decision:** Project owner trả lời “duyệt” cho hai policy trong [approved decision record](policy-proposal.md). Apply normative amendments vào [spec](spec.md): Clarifications; US1 prerequisites; US2.7–10; US3.3; Edge Cases; FR-001–003/006/008–009; Key Entities; SC-001/003–004/006; Assumptions. [Requirements checklist](checklists/requirements.md) được review lại 16/16 cho updated scope. Plan aligned; không application code/migrations thay đổi.

**Rationale:** Approval làm availability/lifetime tradeoffs explicit thay vì tự suy ra từ cutover A hoặc bounded unresolved allowance. Shared transactional selector storage là auth prerequisite; server authority trong selected bound logical context. Reset/loss end private admission, fresh provisioning chỉ qua explicit isolated recovery; unavailable substrate giữ public experience và actionable bounded recovery. Finite delivery capacity phải cover current slots/abandoned bindings/unacknowledged emissions; unsafe/exhausted capacity block/defer new emissions, không reset bypass/unlimited namespaces. Credential loss/eviction require explicit no-fallback recovery; healthy-service resolution cần storage và safe capacity restored.

**Alternatives considered:** Giữ absolute availability/retention wording sẽ tiếp tục conflict với candidate; silent fallback hoặc weakening003 refresh security không được chọn. Approved degraded availability không authorize careless cleanup hoặc protocol-induced unbounded accumulation. Không cần hỏi lại approval cho cùng policy; changes vượt boundary này vẫn cần review.

### Gate re-evaluation

| Item | Current disposition | Remaining obligation |
| --- | --- | --- |
| Availability khi required storage unavailable | RESOLVED policy | Detect/lifecycle/recovery contract và browser evidence |
| Logical context authority sau selector reset | RESOLVED policy boundary | Binding/fixation, old-tab lifecycle checks và no abandoned-context admission proof |
| Finite capacity / explicit credential-loss recovery | RESOLVED policy | Concrete accounting across reset/abandoned roots, positive per-emission acknowledgement, limits/expiry/cleanup |
| P01 protocol feasibility | OPEN / BLOCKED | Bootstrap binding + expected server revision CAS + OAuth handoff + trusted current admission |
| P02 protocol feasibility | OPEN / BLOCKED | Slot parsing/replay/original-account effects + complete finite-capacity/cleanup proof |
| Constitution / documentation scope | PASS cho policy integration | No implementation/schema selected; application-owned validation và explicit migration governance vẫn required |
| Phase1 prerequisite / 005 handoff | ERROR / BLOCKED | Research/protocol complete trước final model/contracts/quickstart; runtime evidence trước U1-B closure |

Không translate RESOLVED policy thành architecture hoặc runtime PASS. Numeric limits/server budgets/wire/model/locks chưa selected; approval không đủ để invent contracts hoặc declare completed planning.

## R12 — Selected protocol / P01+P02 design proof

**Decision:** Chọn protocol **CSP-1 (Context-bound Slot Protocol)**: R09 candidate + R10 refinements, hoàn thiện bằng (a) jar-observed group accounting, (b) value-exact emission acknowledgement, (c) intent revision CAS gated bởi shared selector attempt order, (d) lock extension chỉ ở đầu/cuối hierarchy. P01 và P02 **CLOSED ở mức design proof** dưới approved policies R11 và platform facts A1–A4; A5 (WebKit per-host cookie limit) phải verify bằng browser test trước khi freeze numeric cap, kết quả chỉ đổi con số, không đổi protocol. Không runtime PASS; actual browser evidence (R08) vẫn required sau implementation được authorize.

**Rationale:** Code re-inspection 2026-10-07 xác nhận các điểm proof dựa vào: JWT đã có `sid` (`auth/session.service.ts` `issue`), nên `/me/password` và `logout-all` xác định original session mà không cần claim mới hoặc refresh cookie; `profile.controller.ts` và `session.controller.ts` hiện clear singleton `wedding_rt` (Set-Cookie với Path `/api/v1/auth` được gửi từ `/me/password` vẫn xóa cookie đó), đây là late-clear hazard mà CSP-1 loại bỏ; mọi existing writer lock theo thứ tự `users → auth_sessions → (credentials/challenges/oauth/onboarding)` hoặc `onboarding → challenges → users`, không writer nào lock bảng context/ledger mới, nên prepend/append lock không tạo cycle (L-proof bên dưới).

### Platform facts / assumptions

| ID | Fact / assumption | Source / status |
| --- | --- | --- |
| A1 | Cookie store keyed theo (name, domain, path); Set-Cookie với name khác không replace/delete cookie khác | [RFC 6265 §5.3](https://www.rfc-editor.org/info/rfc6265/) — spec fact |
| A2 | `__Host-` prefix bắt buộc Secure, Path=/, không Domain → subdomain không toss được cookie cùng name | RFC 6265bis cookie prefixes; Chromium/Firefox/WebKit hỗ trợ — spec fact |
| A3 | IndexedDB readwrite transactions có overlapping scope chạy tuần tự; commit atomic | [IndexedDB](https://www.w3.org/TR/IndexedDB/) — spec fact |
| A4 | SameSite=Lax cookie được gửi trên top-level cross-site GET navigation (OAuth callback) | Existing `wedding_oauth` callback đã phụ thuộc fact này — verified by current003 flow |
| A5 | Per-host cookie count ≥ 50 (RFC minimum); Chromium/Firefox thực tế ~180 | RFC 6265 §6.1 minimum; **WebKit value phải verify** bằng browser test trước numeric freeze |
| A6 | IDB connection nhận `close` khi site data bị xóa | Optimization cho prompt admission end; correctness không phụ thuộc |
| A7 | Safari ITP xóa script-writable storage sau 7 ngày không tương tác; server-set HttpOnly cookies giữ | WebKit ITP 2.3 — product impact, xem Residuals |

### Server model (proposal cho Phase1 data-model)

- **AuthContext**: `id` (opaque 128-bit), `binding_digest` (HMAC, key-versioned như refresh digest), `group_id`, `confirmed_seq` (global sequence khi confirm, null nếu unconfirmed), `revision` (int, tăng mỗi khi reservation session-establishing/ending được accept), `current_intent_id`, `current_session_id`, `state` (PROVISIONAL/ACTIVE/RETIRED), timestamps.
- **AuthIntent**: `id`, `context_id`, `kind` (LOCAL_LOGIN, OAUTH, ONBOARDING_COMPLETE, LOGOUT), `revision` (giá trị context.revision sau khi accept), `state` (RESERVED/COMMITTED/SUPERSEDED/FAILED/EXPIRED), `expires_at`, outcome code. Không lưu token/password/proof.
- **CookieName ledger** (per group): `group_id`, `name`, `kind` (BINDING/SLOT), `owner` (context hoặc session), `last_set_value_digest`, `unresolved_set` (bool), `observed_present` (bool), `observed_at`.
- `auth_sessions` thêm `context_id`, `slot_tag` (immutable, random 128-bit, không reuse); revocation reason thêm `SUPERSEDED`. `oauth_transactions` thêm `intent_id`. Explicit migration, synchronization disabled.

### Cookie namespace

| Cookie | Name (production) | Attributes | Lifetime |
| --- | --- | --- | --- |
| Context binding | `__Host-wa_cb_<contextId>` | HttpOnly, Secure, Path=/, SameSite=Lax | Provisional Max-Age 15 phút; sau confirm re-emit cùng value Max-Age 30 ngày, gia hạn khi refresh |
| Session slot | `__Secure-wa_s_<slotTag>` | HttpOnly, Secure, Path=/api/v1/auth, SameSite=Lax, không Domain | Max-Age = session absolute expiry còn lại (giữ003 14 ngày); value rotate strict003 |
| Fixed names | `wedding_oauth`, `wedding_ob`, legacy `wedding_rt` | Giữ nguyên003 | Legacy `wedding_rt` chỉ bị clear tại cutover |

Development (HTTP loopback) bỏ prefix như hiện tại. Binding Path=/ để mọi auth endpoint (kể cả provisioning) thấy toàn bộ binding đang installed; slot Path giữ `/api/v1/auth` để không gửi refresh credential tới non-auth routes.

### Shared selector (frontend, IndexedDB)

Database riêng do006 sở hữu; một record `selector`: `{ state: UNSELECTED|PROVISIONING|SELECTED|RECOVERY_REQUIRED, attemptId, attemptSeq, attemptAt, contextId, revision, sessionTag, pendingIntent, refreshLease }`. Chỉ opaque IDs, số revision, timestamps local; không email/profile/token/CSRF/cookie value (FR-015). Mọi thay đổi qua short readwrite transaction, không giữ transaction qua network await (A3).

### Protocol flows

**F1 — Provisioning (P01 bootstrap):**

1. User thực hiện explicit auth action (login/OAuth) khi selector `UNSELECTED`/`RECOVERY_REQUIRED`. Page load **không** tự provision. IDB tx: ghi `PROVISIONING(attemptId mới, attemptSeq+1)`.
2. `POST` provisioning (Origin + JSON). Server đọc mọi binding đang co-present trong Cookie header → group (xem F6) → capacity check (+1 name) → tạo PROVISIONAL context, ledger `unresolved_set` cho binding name, emit `__Host-wa_cb_<id>` provisional. Response body: `contextId`, `revision=0`. Exhausted → reject trước khi emit (FR-006).
3. Tab IDB re-check `attemptId` còn current; nếu không → abandon (không confirm). Nếu còn → `POST confirm` với `X-Auth-Context`: server parse **exactly one** cookie đúng name, verify digest → ledger ack (value-exact), set `confirmed_seq`, state ACTIVE, re-emit binding Max-Age dài cùng value.
4. IDB tx re-check `attemptId` lần nữa (network và IDB không atomic) → commit `SELECTED(contextId, revision 0)`. Thất bại → context bị bỏ, không selector mutation.

**F2 — Intent reservation / execute (P01 ordering, FR-002):**

1. User action tạo local attempt bằng IDB tx: `pendingIntent = {attemptSeq, kind, expectedRevision = selector.revision}` (snapshot trong cùng transaction).
2. `POST reserve` (binding + `X-Auth-Context`, body `{kind, expectedRevision}`): tx lock Context; nếu `revision ≠ expectedRevision` → `STALE` kèm current revision (read-only). Nếu bằng: accept, `revision+1`, intent cũ (nếu RESERVED) → SUPERSEDED, `current_intent_id = new`. Session-establishing kinds cũng check capacity +1 name tại đây (reject trước dispatch).
3. `STALE` → client chỉ retry với revision mới **nếu** IDB tx xác nhận attempt vẫn là current local attempt; tối đa 2 retry trong R06 budget. Attempt đã bị supersede locally → abandon, không retry.
4. Execute (existing route, body allowlist **giữ nguyên**; context/intent qua headers `X-Auth-Context`, `X-Auth-Intent`): password/provider IO ngoài transaction; commit tx lock Context đầu tiên, yêu cầu `current_intent_id = intent` và `revision = intent.revision`, rồi mới issue session (slot tag mới), revoke session hiện tại của context với `SUPERSEDED`, set `current_session_id`, ledger `unresolved_set` cho slot name, intent COMMITTED.

**F3 — Refresh (P02 slot selection):** Headers `X-Auth-Context`, `X-Auth-Session-Tag` (expected). Server verify binding → lock Context → yêu cầu `current_session_id` có `slot_tag = expected` (khác → `SUPERSEDED`, không rotate). Derive slot name từ server session, parse **exactly one** cookie đúng name; duplicate/malformed/missing → `CREDENTIAL_MISSING` (recovery, không scan historical slots). Value thuộc credential đã consumed/revoked của session đó → REFRESH_REUSE revoke family đúng003; còn lại rotate strict003 (first-writer-wins, no grace, no raw-successor cache). Response re-emit binding Max-Age dài. Cross-tab single-flight bằng IDB `refreshLease {attemptId, at}` hết hạn sau 20 giây (15s request + 5s margin); lease bị chiếm sau hạn mà request cũ vẫn sống chỉ có thể gây REUSE revocation → explicit relogin, không security grace.

**F4 — Logout / logout-all / password:**

- Logout là intent kind LOGOUT qua F2 (supersede pending login trong context). Execute revoke session có `slot_tag` = captured session, clear **chỉ** slot đó; nếu session đó là current → `current_session_id = null`. Network failure: local private session vẫn end (FR-010); selector giữ `pendingIntent` LOGOUT để bootstrap sau không auto-admit session được commit bởi intent cũ hơn cho tới khi logout reservation resolved.
- Logout-all và `/me/password`: giữ bearer principal target account và account-wide revocation003 (kể cả same-account newer session). Response clear **chỉ** slot của JWT `sid`, không clear name khác. Không session issuance → không cần context authority, không cần binding transport tới `/me/password`, không thêm JWT claim.

**F5 — OAuth / onboarding (US3):**

1. Fetch reserve intent OAUTH (F2) → navigate full-page tới existing start route kèm `intent=<id>` query (intent ID không secret). Start verify binding cookie của `intent.context_id` (A4, Path=/), intent current và chưa started; tạo oauth transaction với `intent_id`; giữ existing state/PKCE/nonce/`wedding_oauth` binding.
2. Callback giữ existing claim/binding/provider verification. Final tx: lock Context → re-check `current_intent_id = intent` và `revision = intent.revision` → existing advisory subject → identities → users → session issue (slot mới) → complete oauth transaction. Superseded → existing fail path, redirect `oauth-result?result=superseded`, không session.
3. First-time social → existing onboarding cookie/flow. Completion là explicit user action nên reserve intent mới `ONBOARDING_COMPLETE` (F2) rồi execute với proof body không đổi; completion request cũ in-flight bị supersede bởi revision.
4. `oauth-result` page chỉ admit sau IDB check (selector context = intent context) + refresh; refresh đầu tiên chính là ack cho slot emission của navigation response.

Singleton `wedding_oauth` vẫn có thể bị start response cũ overwrite; hậu quả là callback mới fail existing binding check (truthful failure, retry) — không session sai account. Giữ nguyên để không đổi003 OAuth binding.

**F6 — Group accounting / cleanup (P02 finite capacity):**

- **Group**: union của contexts có binding được co-present trong cùng request (persisted `group_id`, merge lock contexts sorted). Provisioning khi đã có binding trong jar luôn join group đó → IDB-only reset hoặc fresh provisioning **không** bypass capacity.
- **Accounted names** `N(G)` = names observed installed trong request gần nhất của G ∪ names có `unresolved_set`. Capacity check: `|N(G)| + 1 ≤ CAP_NAMES` và serialized bytes ≤ `CAP_BYTES` trước mọi emission tạo name mới.
- **Ack** chỉ bằng request trình đúng value đã emit (value-exact). Rotation n+1 chỉ được issue khi value n được trình, nên mỗi slot chain có ≤1 unresolved set. Clear emissions không cần accounting vì chỉ giảm số cookie và names không bao giờ reuse.
- **Release** name chỉ khi `unresolved_set = false` **và** request sau đó cho thấy name absent. Không release theo TTL, terminal intent, abort hoặc status probe.
- **Cleanup** (clear emission) chỉ cho: slot của session revoked/superseded; binding của context RETIRED hoặc có `confirmed_seq` nhỏ hơn context của request hiện tại và không có current session. Không bao giờ clear binding/slot current; luôn giữ binding confirmed mới nhất làm group anchor. Cleanup sai chỉ có thể gây credential loss → explicit recovery, không account mix-up (fail-safe).
- Exhausted capacity → reject/defer trước dispatch/issuance; UI recovery theo policy P02: xóa dữ liệu trang cho site hoặc dùng browser context riêng. Protocol không bao giờ emit `Clear-Site-Data` hoặc mass clear.

### Proof sketches

**P01-a (late init không thay selection):** init A response chỉ install `wa_cb_<A>` (A1), không chạm `wa_cb_<B>`. Selector chỉ commit khi attempt còn current tại IDB re-check sau network (A3); attempt A đã bị supersede → không commit. Server authority của B nằm ở context B; context A không có session, không được client nào select. ∎

**P01-b (stale reservation không thành newer intent):** Gọi x là attempt cũ, y là attempt mới hơn theo IDB order. `expectedRevision` của x được observe trước khi y tồn tại, nên ≤ revision R_y lúc y được accept; sau accept revision = R_y+1 > expected(x) → x STALE. x không được retry vì IDB re-check thấy y current. Nếu x được accept trước y thì y supersede x khi reserve thành công (y retry được vì vẫn current). Execute/callback của x sau đó fail check `current_intent_id`. Nếu y chết trước khi tới server, x là intent được server accept cuối cùng, nhất quán với authoritative ordering của spec. ∎

**P01-c (fixation / public ID):** Mọi context operation yêu cầu binding cookie (HttpOnly, `__Host-` A2); context ID không mở khóa gì. Attacker không ghi được victim IndexedDB (cần same-origin script — XSS ngoài threat model như003) và không toss được `__Host-` cookie. Attacker tossing `__Secure-wa_s_*` của session attacker: server chỉ đọc slot của `current_session_id` thuộc context có binding đã verify → mismatch → reject. Cross-site POST thiếu Origin bị reject như003. ∎

**P01-d (reset / unavailable / partition):** Selector missing hoặc reset → không private admission, không scan cookies (policy P01). Old attempt không reuse reservation mới vì `attemptId` random và re-check fail. Stale tab cached context: mọi auth transition và refresh re-check selector; IDB `close` (A6) end admission sớm; worst case giới hạn bởi existing access TTL 15 phút và005 private-view fences. IDB unavailable → public experience + bounded recovery, không localStorage/single-tab fallback. Private window/browser khác có cookie jar + IDB riêng → không trộn credential. ∎

**P02-a (late writes chỉ tác động session của chính nó):** Mọi set/clear target `wa_s_<slotTag>` của session gốc; slot tag không reuse (A1). Late A refresh: nếu B commit trước thì A refresh bị reject tại check expected tag (không emission); nếu A refresh commit trước B thì emission chỉ install slot A, và session A đã bị `SUPERSEDED` → không restore A. Logout/password/logout-all late chỉ clear slot `sid` gốc. ∎

**P02-b (replay vs historical cookies):** Server chỉ đọc slot của current session; historical slots browser gửi kèm không được parse nên không phải “presented credential”. Value consumed trình trong current slot (stolen-and-used hoặc late same-slot overwrite) → REFRESH_REUSE revoke đúng family003. Request thiếu binding bị reject trước, nên credential bị đánh cắp riêng lẻ không dùng được (chặt hơn003, không yếu hơn). ∎

**P02-c (finite accounting):** Trong một group: name mới chỉ được tạo khi `|N(G)|+1 ≤ CAP`; unresolved names được giữ tới khi được ack và quan sát absent; mỗi slot chain ≤1 unresolved set; mỗi context ≤1 cookie-emitting operation executing (Context lock). Do đó tổng names mà protocol có thể khiến browser giữ cho group ≤ CAP_NAMES + fixed names. C2 (cleanup trước late headers): cleanup không release `unresolved_set`, nên N+1 held emissions không thể vượt CAP. ∎

**P02-d (qua reset):** IDB-only reset: bindings còn trong jar → provisioning join group → không bypass. Cookie-only clear hoặc full clear do user/browser là external boundary event mà server không quan sát được (C1). Mỗi event chỉ có thể để lại ≤ CAP_NAMES late arrivals của group cũ (finite, không do protocol gây ra). Protocol không tự tạo boundary event. Late arrivals đó được quan sát chính xác ở request đầu tiên của group mới, được tính vào capacity và cleanup. ∎

**L-proof (lock hierarchy):** Final order: **L0** `auth_contexts` (sorted IDs, một statement) → existing003 orders không đổi (advisory subject → external_identities → users sorted → auth_sessions per user → credentials/challenges/oauth/onboarding) → **L∞** cookie-name ledger rows (sorted name). L0 không bao giờ được acquire sau lock khác; L∞ không bao giờ được theo sau bởi lock khác. Thêm lock ở đầu/cuối mọi path không tạo cycle mới với existing locks. Account-wide revocation (password, logout-all, admin lock, reset) không lock Context; `current_session_id` trỏ tới revoked session được đọc như absent (lazy retirement). No network trong transaction giữ nguyên. Pre-existing relative order giữa `users` và `pending_social_onboardings` (onboarding vs outbox worker) không bị006 thay đổi; ghi nhận để Phase1 audit, không phải006 regression. ∎

### Cutover / rollback (clarification A)

Cookie names, headers và intent routes mới disjoint với legacy. Legacy sessions không có `context_id` → không thể là current session → one-time fresh login. Sau cutover, legacy refresh/logout không có `X-Auth-Context` → 401 + clear `wedding_rt` (chỉ legacy name), stale tabs về logged-out và reload bundle mới. Responses của protocol mới mang marker version trong body; client bỏ qua response thiếu marker. Cutover yêu cầu API fleet đồng nhất trước frontend (không mixed fleet). Rollback: revoke mọi session có `context_id` trước khi chạy lại legacy, để re-cutover không adopt session cũ; selector cũ trỏ tới revoked session → recovery.

### Proposed numeric bounds (planning values, chưa runtime-verified)

| Bound | Value | Basis |
| --- | --- | --- |
| `CAP_NAMES` (dynamic bindings + slots per group) | 8 | 8 + 3 fixed ≈ 11 names ≈ 1 KiB serialized; 4 boundary events vẫn < 50 (A5 RFC minimum), ~15 events < 180 |
| `CAP_BYTES` (protocol cookie subset) | 2048 | Dưới 8 KiB proxy line và 16 KiB Node header default với margin |
| Provisional binding Max-Age | 15 phút | Chỉ cần đủ cho confirm; không dùng để release capacity |
| Confirmed binding Max-Age | 30 ngày, gia hạn khi refresh | > session absolute 14 ngày |
| Intent expiry | LOCAL/LOGOUT/ONBOARDING 60s; OAUTH 10 phút | Provider round-trip; expiry không release capacity |
| IDB attempt/lease staleness | 20s | R06 request 15s + 5s margin |
| Operation outcome retention | 24h | Read-only reconcile; không chứa credentials |
| Client budgets | Giữ R06 (queue 5s, request 15s, recovery 30s ≤ 2 probes) | Unchanged |

A5 có kết quả WebKit < 50 thì giảm `CAP_NAMES` tương ứng; protocol không đổi.

**A5 measured (T006, 2026-10-07, API 003 + owned proxy, server-side size-only observation, cookie ~85 byte):**

| Engine | Retained per host | Sent to server | Max accepted Cookie header |
| --- | --- | --- | --- |
| Chromium 153.0.8010.12 | 157 | 157 | 13 990 B (HTTP 200) |
| Firefox 155.0 | 157 | 157 | 13 990 B (HTTP 200) |
| WebKit 26.6 | 250 (no eviction at 250) | **81** | **7 126 B** — WebKit truncates the Cookie header at ~7 KB |

Disposition: `CAP_NAMES` 8 và `CAP_BYTES` 2048 **giữ nguyên**. Binding constraint thực tế là WebKit header truncation (~7 KB ≈ 81 names), không phải eviction: một group tối đa ~11 names ≈ 1 KB; còn chịu được ~8 boundary events (mỗi event ≤ 8 stale names) trước khi WebKit bắt đầu bỏ cookie khỏi header. Node API chấp nhận ≥ 14 KB trong local; proxy production vẫn phải verify (deployment-shape). Kết quả chi tiết: `.artifacts/auth-transition/a5-cookie-limits.json` (không chứa cookie value).

### R09 matrix disposition sau R12

| R09 sequence | Disposition | Proof |
| --- | --- | --- |
| Late init A sau B selected | CLOSED (design) | P01-a |
| Storage reset trong init/verification/active B | CLOSED (design) | P01-d, P02-d |
| Selector unavailable / private contexts / tab close | CLOSED (design), degraded theo policy P01 | P01-d |
| Public context ID / adoption | CLOSED (design) | P01-c |
| Refresh/logout A held → B confirmed → release A | CLOSED (design) | P02-a, F3/F4 |
| Current slot missing/evicted, stale slots còn | CLOSED (design) | F3 `CREDENTIAL_MISSING`, P02-b |
| Same-slot concurrency / consumed replay | CLOSED (design), strict003 | F3 lease, P02-b |
| Cleanup + slot pressure/header limits | CLOSED (design); numeric chờ A5 | P02-c, F6 |
| OAuth old callback / current valid callback | CLOSED (design) | F5, P01-b |
| Late legacy response sau cutover | CLOSED (design) | Cutover section |

Không row nào runtime PASS. Mọi row vẫn là required browser/contract evidence ở R08 sau implementation được authorize.

### Residuals / alternatives

- **Safari ITP (A7):** user Safari không quay lại site trong 7 ngày sẽ mất selector dù session 14 ngày còn hiệu lực → explicit fresh login. Hành vi này nằm trong approved P01 (missing selector end admission). Đây là product-visible impact cần project owner biết, không phải security gap.
- **Lost responses tiêu thụ capacity:** login/refresh response mất vĩnh viễn giữ 1 name unresolved tới hết group. Sau khoảng 8 lần mất response trong cùng group thì cần recovery (xóa dữ liệu trang hoặc browser context khác), đúng như policy P02.
- **Deferred optimization:** client attestation “fetch rejected trước response headers” để release unresolved name. Chưa chọn vì policy P02 không cho abort release nếu không có proof, và browser behavior (redirect/CORS) phải verify trước.
- **Rejected:** jar-level singleton accounting cookie (late virgin response overwrite làm mất attribution); `Expires`-based release (client clock skew, Max-Age precedence); bỏ `wedding_oauth` thay bằng context binding (đổi003 OAuth binding, không cần thiết).

## Phase 0 Disposition / Next Step

**Phase 0 COMPLETE (design-level).** R12 chọn CSP-1 và đóng P01/P02 feasibility gates bằng design proof dưới approved policies R11. Prerequisite “research.md complete” cho Phase1 đạt; còn một verification item (A5 WebKit cookie limit) chỉ ảnh hưởng numeric cap. Đây không phải runtime PASS và không authorize application code, migrations hoặc005 U1-B closure.

Next: Phase1 `speckit-plan` — `data-model.md` (AuthContext/AuthIntent/CookieName ledger/session columns, migration outline), `contracts/` (provisioning/confirm/reserve/outcome routes, headers `X-Auth-Context`/`X-Auth-Intent`/`X-Auth-Session-Tag`, error codes STALE/SUPERSEDED/CREDENTIAL_MISSING/CAPACITY_EXHAUSTED/STORAGE_REQUIRED, cookie table), `quickstart.md` (R08 browser matrix + A5 verification), rồi post-design constitution re-check. Wire names trong R12 là proposal cho Phase1 review, chưa phải contract cuối cùng.

**Update 2026-10-07:** Phase1 artifacts đã được tạo: [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).

R10 lưu counterexamples trước approval; R11 ghi policy approval; R12 là selected protocol. Feature005 U1-B vẫn BLOCKED cho tới khi006 có runtime evidence.
