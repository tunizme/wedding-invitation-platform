# Feature Specification: IAM Auth Transition Reliability

**Feature Branch**: `master` — giữ branch hiện hành, không có branch hook.

**Feature Directory**: `specs/006-iam-auth-transition-reliability`

**Created**: 2026-10-06

**Status**: Implemented — T109–T112 verified on2026-10-08: browser188/188, final selected frontend120/API72, IAM all and independent root quality gates PASS. The cumulative invocation ended at a generated-tsconfig format failure; cleanup and remaining gate reruns are recorded in [validation-results.md](validation-results.md). Production HTTPS/live-provider checks remain unverified;005 consumer alignment is separate. Planning/approval records below are historical.

**Input**: Project owner yêu cầu “áp dụng như đề xuất”: tạo IAM refinement specification và cập nhật dependency documentation của feature 005; chưa authorize application code, backend changes hoặc migrations. Giữ privacy requirements, existing login/OAuth journeys và supported browsers; không đóng U1-B bằng frontend-only assertions.

## Clarifications

### Session 2026-10-07

- Q: Khi chuyển sang auth contract mới, hệ thống có được yêu cầu người dùng đang đăng nhập đăng nhập lại một lần không? → A: A — Cho phép yêu cầu đăng nhập lại một lần trong coordinated cutover; sau đó dùng protocol mới. Không yêu cầu seamless migration hoặc dual-protocol migration window. Existing login/OAuth journeys và security policies giữ nguyên; decision không đóng P01/P02 hoặc authorize application implementation.
- Q: Có duyệt required shared storage/logical-context boundary và finite delivery capacity/credential-loss recovery trong policy-proposal không? → A: Project owner “duyệt” cả hai policy. Shared selector storage là prerequisite cho auth; unavailable/reset/ambiguous selector end private admission và require bounded recovery. Server authority scoped theo bound logical context; selector không authenticate hoặc chứa credentials. Delivery capacity hữu hạn tính cả unresolved emissions/abandoned bindings; hết safe capacity thì block/defer new cookie-emitting work, không bypass bằng reset/fresh namespace. Credential loss/eviction require explicit no-fallback recovery; healthy-service fresh login cần storage và capacity an toàn. Approval chỉ cập nhật requirements và tiếp tục planning, không đóng protocol proof P01/P02/U1-B hoặc authorize code/migrations. Decision record: [policy-proposal.md](policy-proposal.md).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Account mới không bị auth operation cũ thay thế (Priority: P1)

Là Customer hoặc Admin, tôi muốn sau khi đăng nhập account B, auth work của account A không làm tôi quay lại A hoặc mất phiên B, kể cả khi responses đến muộn hoặc tôi dùng nhiều tabs.

**Why this priority**: Current account phải rõ ràng trước khi đọc/sửa private resources; late auth effects có thể làm frontend và server hiểu khác nhau về người đang đăng nhập.

**Independent Test**: Delay auth operations của A, hoàn tất login B, rồi cho A hoàn tất và reload/renew. Current account vẫn là B; không false login/logout success hoặc implicit fallback A.

Storage/capacity prerequisites theo FR-001/006/008. Khi credential thật sự mất, phải verify explicit recovery theo US2, không coi mất credential là successful preservation hoặc skip delayed-response tests.

**Acceptance Scenarios**:

1. **Given** refresh A đã gửi nhưng response chưa tới, **When** login B được xác nhận rồi refresh A tới muộn, **Then** current browser auth context vẫn B qua reload và renewal.
2. **Given** logout A đã gửi, **When** newer login B hoàn tất trước old logout response, **Then** old logout không end session B; không claim remote revocation nếu outcome chưa xác nhận.
3. **Given** hai anonymous login attempts cho A/B overlap, **When** một attempt được xác định là current theo authoritative ordering, **Then** stale attempt không thay current result; response arrival order không quyết định current intent.
4. **Given** password change/onboarding completion của prior context còn pending, **When** newer login hoàn tất, **Then** prior completion không clear/replace newer session hoặc đưa user vào private context cũ. Existing password revocation business rules vẫn áp dụng cho đúng account.
5. **Given** browser không cung cấp Web Locks và hai tabs cùng thao tác, **When** auth transitions overlap, **Then** same current-context guarantees vẫn đạt; không silently loại browser hoặc existing journey khỏi support.

### User Story 2 - Nhận biết và recover operation chưa rõ outcome (Priority: P1)

Là người dùng, tôi muốn khi kết nối thất bại sau khi gửi auth action, hệ thống nói rõ trạng thái chưa chắc chắn và giúp tôi tiếp tục mà không lặp lại action một cách nguy hiểm.

**Why this priority**: Client timeout không chứng minh server chưa commit; retry mutation hoặc relogin khi old writer còn pending có thể tạo race mới.

**Independent Test**: Timeout/cancel trước và sau dispatch, mất response sau commit, đóng tab lúc pending rồi mở lại. Recovery xác định đúng current context hoặc giữ explicit unresolved state; không false success và không automatic replay mutation.

**Acceptance Scenarios**:

1. **Given** operation bị superseded/cancel khi chưa gửi, **When** user tiếp tục, **Then** operation được nhận diện là NOT_DISPATCHED và không tạo auth effect.
2. **Given** request đã gửi nhưng outcome chưa được xác nhận, **When** timeout/network failure/abort xảy ra, **Then** trạng thái UNCERTAIN có persistent explanation và next action, không báo success hay auto-replay cookie-mutating action.
3. **Given** old dispatched writer còn unresolved, **When** user muốn đăng nhập mới, **Then** chỉ tiếp tục khi reviewed protocol chứng minh old effect không thể phá current context; không coi một lần refresh thành công hoặc chờ hết TTL là proof.
4. **Given** tab đóng/crash khi request còn pending, **When** user mở product lại, **Then** hệ thống xác định current context hoặc hiển thị recovery state; không tự restore A do chỉ dựa old cookie/result.
5. **Given** logout local đã thực hiện nhưng remote outcome unknown, **When** feedback hiển thị, **Then** private local session đã end; thông báo không claim remote logout/logout-all thành công thiếu evidence.
6. **Given** server unavailable, **When** recovery không thể xác nhận current context, **Then** operation không bị giữ ở indefinite spinner: bounded attempt kết thúc bằng persistent unresolved state và next action, không admit private context chưa xác nhận.
7. **Given** selector bị reset trong binding verification hoặc tab còn giữ cached context cũ, **When** late result tới, **Then** private admission đã end; không restore từ cached context/surviving cookies. Fresh provisioning chỉ qua explicit recovery vào isolated logical context khi safe capacity cho phép.
8. **Given** required shared storage unavailable dù server healthy, **When** user muốn login/OAuth hoặc recover, **Then** public experience vẫn dùng được và finite attempt kết thúc bằng persistent explanation/next action; không silent single-tab/legacy fallback. Khi storage và safe capacity được restored, explicit fresh login có tested route to resolution.
9. **Given** delivery capacity đã hết do unresolved emissions/abandoned bindings, **When** user tạo new cookie-emitting operation hoặc reset selector, **Then** operation bị reject/defer trước dispatch/issuance tương ứng; reset không bypass capacity. TTL/terminal receipt/abort không là delivery acknowledgement.
10. **Given** current credential bị browser/admin xóa hoặc cookie eviction xảy ra, **When** stale cookies vẫn còn, **Then** UI giải thích credential loss và require explicit recovery; không silently restore old account. Fresh login chỉ khi authority/storage/capacity an toàn; mở tab mới cùng cookie jar không là isolated recovery context.

### User Story 3 - OAuth và onboarding tuân current auth context (Priority: P1)

Là người dùng đăng nhập qua Google/Facebook, tôi muốn existing redirect/onboarding journeys tiếp tục hoạt động mà callback cũ không thay thế một login mới.

**Why this priority**: API callback nằm ngoài page-held coordination; correct frontend store alone không bảo vệ auth context qua redirect.

**Independent Test**: Delay valid provider callback, hoàn tất newer login/logout rồi cho callback tới; test existing returning-user và first-time/onboarding cases mà không đổi sang popup.

**Acceptance Scenarios**:

1. **Given** OAuth attempt cũ đang chờ provider và newer login B đã hoàn tất, **When** old callback tới, **Then** callback không restore old account hoặc silently clear B; user nhận truthful superseded/recovery feedback.
2. **Given** user đã logout sau khi bắt đầu OAuth attempt, **When** old callback hoàn tất, **Then** callback không tự đăng nhập lại; fresh explicit login attempt vẫn có thể bắt đầu theo reviewed protocol.
3. **Given** valid current provider attempt với required storage và safe delivery capacity, **When** callback/onboarding hoàn tất, **Then** existing eligible user được đăng nhập đúng hoặc vào đúng onboarding flow theo feature 003, không blanket reject social login. Prerequisite mất giữa flow thì explicit recovery, không admit abandoned context.
4. **Given** invalid/expired/reused provider state hoặc binding không hợp lệ, **When** callback được nhận, **Then** existing security rejection giữ nguyên và không tạo current session.

### User Story 4 - Giữ existing IAM behavior và frontend handoff (Priority: P2)

Là người dùng và developer, tôi muốn refinement chỉ thay auth-transition reliability, giữ account policies và cung cấp contract/evidence để feature 005 tích hợp mà không tự đoán API.

**Why this priority**: Reliability không được làm mất refresh security, LOCAL/social distinctions hoặc product usability.

**Independent Test**: Chạy existing IAM journeys/security regressions cùng transition matrix; kiểm feature 005 consumer sử dụng documented contract và admission outcomes.

**Acceptance Scenarios**:

1. **Given** normal renewal cùng account, **When** credentials được renew, **Then** account identity giữ và valid unsaved edits không bị reset chỉ vì renewal.
2. **Given** existing LOCAL verification/recovery, social email/onboarding, account status hoặc role checks, **When** refinement được tích hợp, **Then** existing eligibility/generic messaging/security behavior được preserve.
3. **Given** actual contract/migration thay đổi được chọn ở planning, **When** frontend handoff được review, **Then** compatibility, rollout/recovery và required frontend integration được document và verify; chưa có capability không được giả là available.
4. **Given** user có existing legacy session tại coordinated cutover, **When** product chuyển sang auth contract mới, **Then** MAY yêu cầu đăng nhập lại một lần qua existing login/OAuth journey; sau fresh login dùng protocol mới, không silent legacy fallback. Legacy in-flight responses vẫn không được phá confirmed new session.

### Edge Cases

- Hai tabs với same/different-role accounts, anonymous attempts, A→B→A; client clocks lệch và peer messages đảo thứ tự.
- Server commit trước client timeout; response headers/cookies đến trước body parse failure. Outcome knowledge không được suy ra chỉ từ error class hoặc JSON failure.
- Server operation terminal nhưng already-emitted response chưa tới browser; terminal operation/status lookup alone không chứng minh cookie safety.
- Tab close/crash/navigation release frontend lock trong khi server/network work còn active.
- Logout-all/password revocation vẫn tác động đúng account theo existing rules; bảo vệ current context không hứa rollback mutation của original account.
- OAuth denial/cancellation, invalid/reused state, first-time social onboarding và newer logout trong khi provider pending.
- Browser không có Web Locks, private contexts/storage partition khác, cleared cookies/storage hoặc browser-context initialization overlap.
- Selector reset trong network verification; stale cached context ở live tab; required shared storage permanently unavailable dù backend healthy.
- Cookie-emission budget exhausted, abandoned bootstrap bindings và reset làm mất local accounting; fresh namespace MUST NOT bypass safety budget.
- Cleanup tới trước already-emitted old headers; late headers reinstall obsolete cookies; current slot/binding bị eviction trong khi historical slots còn lại. Protocol MUST NOT tạo unbounded accumulation hoặc reuse names để né cap.
- Late reserve A sau accepted reserve B nhưng trước OAuth B callback; stale reservation không được tự retry với latest revision để trở thành newer intent.
- Recovery artifact hết hạn/không thuộc context; không lộ account existence hoặc session của user khác.
- Coordinated cutover cho phép one-time reauthentication, không yêu cầu dual-protocol migration window. Legacy requests/callbacks đã in-flight hoặc stale clients vẫn phải được xử lý an toàn; late legacy response không phá confirmed new session, không fallback legacy hoặc giảm refresh-reuse protection.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST có server authority cho accepted ordering/session effects trong selected bound logical auth context, independent khỏi per-tab store và response arrival order. Shared transactional selector storage trong participating frontend storage partition MUST là runtime prerequisite; selector chỉ routing/lifecycle metadata, MUST NOT authenticate, cấp quyền hoặc chứa credentials. Missing/reset/ambiguous selector MUST end private admission và require explicit recovery, không adopt surviving cookies/cached context. Separate browser/private contexts MUST không nhận auth state của nhau. (US1, US2.4/7–8)
- **FR-002**: Concurrent session-establishing/ending transitions trong bound logical context MUST có deterministic server-accepted ordering và supersession rule, kể cả anonymous attempts, với server revision/CAS ngăn stale reservation supersede newer accepted intent. Client wall-clock timestamp hoặc peer arrival order MUST NOT tự quyết định authority. Explicit provisioning sau selector reset tạo isolated logical lifetime; late effects của abandoned context MUST NOT select/admit context đó vào current product. Không hứa server-global ordering giữa abandoned roots khi shared selection witness đã mất. (US1.3, US2.7, US3)
- **FR-003**: Late refresh/logout/logout-all/onboarding/password/OAuth effects của stale transition MUST NOT restore prior account hoặc trực tiếp overwrite/delete newer successful session slot qua reload/renew. Khi required storage/current credential còn valid và capacity an toàn, expected account MUST được preserve. Verified credential loss/eviction MUST chuyển sang explicit no-fallback recovery theo FR-006/008, không silent clearing hoặc claim preservation thành công. Không hứa absolute cookie retention; protocol MUST NOT phát unbounded slots hoặc dùng careless cleanup gây mất current slot. Existing account-wide revocation semantics đối với đúng target account giữ nguyên. (US1.1–4, US2.10, US3.1–2)
- **FR-004**: Undispatched cancellation, confirmed completion và dispatched uncertainty MUST được phân biệt. Confirmed completion MUST không mặc nhiên được hiển thị là success. (US2.1–2)
- **FR-005**: System MUST cho phép xác định/reconcile operation outcome và current auth context mà không automatic replay auth mutation; recovery data MUST scope đúng context và không expose secrets. (US2.2–4)
- **FR-006**: UNCERTAIN state MUST có persistent explanation/next action; private auth admission hoặc newer mutation MUST chờ safe protocol outcome và required storage/capacity, không coi client abort/lock release/TTL/one successful refresh là proof. Protocol MUST có finite delivery capacity tính current slots, abandoned bootstrap bindings và cookie-emitting responses chưa positively acknowledged. Terminal outcome, elapsed TTL, abort hoặc generic status probe MUST NOT release capacity thiếu proof cho emission tương ứng. Unsafe/exhausted capacity MUST reject/defer new cookie-emitting work trước dispatch/issuance tương ứng; reset/fresh provisioning MUST NOT bypass cap, reuse slot name cho session khác hoặc tạo unbounded slots. Numeric accounting/limits thuộc planning, không assumed từ browser quota. (US2.2–4/9–10)
- **FR-007**: Recovery attempts MUST có documented finite deadlines; không xác nhận được outcome thì kết thúc bằng actionable unresolved state, không indefinite spinner hoặc false success. Numeric deadlines thuộc planning và MUST được xác định trước tasks/implementation. (US2.6)
- **FR-008**: Correctness MUST giữ khi tab đóng/crash và khi Web Locks unavailable; frontend coordination MUST NOT là sole auth safety authority. Supported browser engines giữ nguyên. Full auth availability không được hứa khi required shared storage unavailable hoặc safe delivery capacity chưa đủ: product MUST giữ public experience, no private admission và bounded persistent recovery với actionable next step. Credential loss/eviction MUST NOT fallback old account; explicit fresh login chỉ khi authority/storage/capacity an toàn. Genuinely separate browser context MAY là next action; tab mới cùng cookie jar không là isolation. Khi prerequisites restored và service healthy, recovery MUST có tested route qua explicit fresh login; không hứa unlimited logins khi unresolved deliveries exhaust budget. (US1.5, US2.4/7–10)
- **FR-009**: Existing full-navigation Google/Facebook OAuth và social onboarding MUST được preserve khi runtime prerequisites/safe capacity đáp ứng; current valid attempts hoạt động, stale callbacks không establish session ngoài current transition authority hoặc become current qua abandoned context. Prerequisite mất thì recovery theo FR-008, không blanket reject social login trong supported healthy conditions. Không tự đổi popup hoặc thêm provider; state/binding/reuse/onboarding security giữ nguyên. (US3)
- **FR-010**: Local logout MUST end local private session kể cả network failure; remote revocation success MUST chỉ được claim khi confirmed. (US2.5)
- **FR-011**: Existing authentication eligibility, authorization/ownership, Origin/CSRF, token secrecy, session expiry/revocation và refresh-reuse protection MUST được preserve; không dùng weaker security để đạt availability. (US3.4, US4.2)
- **FR-012**: Same-account credential renewal MUST giữ stable identity và valid unsaved edits; stale result MUST không commit vào newer principal/store/navigation. Feature 005 vẫn owns broader private-resource lifetime fences. (US4.1, US1)
- **FR-013**: Required evidence MUST kiểm real browser auth behavior sau delayed responses, reload/renew, context loss, no-Web-Locks và OAuth; store-only tests hoặc status-only checks MUST NOT đóng required cookie guarantees. (US1–3)
- **FR-014**: Planning MUST chốt actual contract, coordinated cutover/recovery, frontend integration ownership và required explicit migrations nếu có. Cutover MAY yêu cầu existing users đăng nhập lại một lần; không yêu cầu seamless session migration hoặc dual-protocol migration window. Sau fresh login MUST dùng new protocol, không silent legacy fallback; existing login/OAuth journeys giữ nguyên và in-flight legacy responses MUST không phá confirmed new session. Không chọn cookie/schema/endpoint từ assumption hoặc giả existing capability. (US4.3–4)
- **FR-015**: Auth feedback MUST theo MASTER, accessible và truthful; không token/password/proof/cookie value trong logs/reports hoặc persisted frontend recovery metadata. (US2, US4)
- **FR-016**: Feature MUST cung cấp evidence-backed handoff để 005 cập nhật consumers và re-run analysis; specification/approval alone MUST NOT đóng U1-B hoặc authorize frontend implementation. (US4.3)

### Key Entities _(include if feature involves data)_

- **Browser auth context**: bound logical auth lifetime được shared selector chọn; server authority cho ordering/session effects trong lifetime đó, phân biệt với user account/per-tab memory. Selector reset end admission; fresh isolated lifetime chỉ qua explicit recovery. Đây là domain concept; hiện thực hóa trong planning tại [data-model](data-model.md).
- **Shared selector**: non-secret routing/lifecycle metadata trong shared transactional storage; runtime capability bắt buộc, không authentication credential hoặc authority cho business effects.
- **Delivery capacity**: finite safety budget cho current/abandoned cookie namespaces và unresolved emissions; không đồng nhất với count cookie đang nhìn thấy hoặc server terminal operations. Concrete persistence/limits chưa selected.
- **Auth transition intent**: explicit establish/end intent, trusted ordering/supersession và relationship với current context. Không tự đồng nhất với frontend identityEpoch.
- **Auth operation outcome**: knowledge về dispatch/completion/uncertainty và effect đúng original context; không hứa rollback server mutation.
- **Recovery state**: user-visible uncertainty và context-scoped evidence cần để reconcile, không chứa credentials.
- **Provider attempt**: existing OAuth/onboarding attempt và authority relationship với current transition; không thay provider business policy.

### Scope Boundaries

**In scope:** reliability của existing IAM auth transitions; authoritative context/supersession, recoverable outcome và late-response-safe auth effects; required minimal frontend auth integration và browser/contract verification; compatibility design cho feature 003 và dependency handoff cho 005. Cookie/schema/wire changes đã được chọn trong planning (CSP-1); chưa authorize implementation.

**Out of scope:** new providers, account linking/unlinking, new account/business policies, public Marketplace/Dashboard/Editor redesign, invitation schemas/renderers/CAS/publication, Customer layout/style/binding editing, new occasion/payment/analytics, deployment. Không rewrite broader principal/resource UI isolation thuộc 005 hoặc duplicate auth coordinator implementation ở hai features.

006 sử dụng existing IAM baseline của 003 và requirements/policy đã ghi của 005 như reference, **không phụ thuộc runtime implementation của 005**. Ngược lại, application implementation entry của 005 phụ thuộc completed/verified 006 và re-analysis; không tạo circular task dependency.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% delayed refresh/logout/onboarding/password scenarios trong US1 với valid storage/current credential và safe capacity giữ expected account qua reload/renew; zero late direct overwrite/delete, old-account restoration hoặc silent clearing. Required loss/eviction/pressure cases MUST verify explicit no-fallback recovery và finite emission accounting, không skip hoặc mark account-preservation PASS khi credential mất; zero unbounded protocol accumulation/careless current-slot cleanup. (FR-001–003/006/008)
- **SC-002**: 100% cancellation/timeout/lost-response scenarios phân biệt đúng chưa gửi, confirmed outcome và uncertainty; zero automatic replay mutation hoặc false auth/remote-revocation success. (FR-004–007, FR-010)
- **SC-003**: Toàn bộ required tab-close/no-Web-Locks/reset/storage-unavailable/capacity-exhausted scenarios đạt preservation khi prerequisites valid hoặc bounded explicit recovery khi authority/storage/capacity chưa an toàn; zero unsafe private admission/old-cookie fallback/reset bypass. Supported browser engines không bị loại để PASS; khi service và prerequisites restored, explicit fresh-login recovery MUST được verify. (FR-001, FR-006–008)
- **SC-004**: 100% delayed/superseded OAuth scenarios không overwrite/select/admit old account; existing current Google/Facebook/onboarding journeys hoàn tất khi runtime prerequisites/capacity đáp ứng, prerequisite-loss cases có explicit recovery, invalid/reused-state cases vẫn bị reject. Không skip required callback/onboarding security cases. (FR-002–003, FR-009, FR-011)
- **SC-005**: Existing IAM eligibility/generic messaging/authorization/CSRF/revocation/reuse regressions có zero unintended behavior changes; same-account renewal giữ valid unsaved edits trong representative auth integration tests. (FR-011–012)
- **SC-006**: Mọi recovery scenario, gồm healthy server nhưng storage unavailable/capacity exhausted, kết thúc trong documented attempt deadline bằng confirmed outcome hoặc persistent unresolved state/next action; zero indefinite spinner/false success/secrets. Sau prerequisites restored, tested explicit recovery có route to resolution; exhausted budget không được release từ TTL/terminal receipt alone. (FR-005–008, FR-015)
- **SC-007**: Mỗi required transition scenario có actual browser/contract evidence, và handoff nêu đầy đủ available capability, coordinated cutover/one-time reauthentication, limitations và 005 consumer updates; 100% cutover scenarios hoàn tất existing fresh login journey và late legacy responses không phá new session. Zero required cases bị skip hoặc đánh dấu PASS bằng mock-only evidence. (FR-013–014, FR-016)

## Assumptions

- [Constitution](../../.specify/memory/constitution.md) quản lý governance; [MASTER](../../docs/design/MASTER.md) quản lý platform UI; B01 refinement và Customer data-only restriction giữ nguyên.
- [Feature 003](../003-identity-access-management/spec.md) là IAM business baseline; [feature 005](../005-frontend-foundation-reliability/spec.md) vẫn giữ privacy/success targets. Scope approval lần này chỉ tạo specification/dependency docs, không waive business/security behavior hoặc authorize code/migrations.
- Approved clarification 2026-10-07 chọn coordinated cutover với optional one-time reauthentication. Không mandate seamless migration/dual-protocol support; planning vẫn phải chốt safe handling cho legacy in-flight responses, stale clients và rollback. Decision không waive003 security/TTL semantics hoặc resolve P01 initialization/P02 refresh proof.
- Approved P01/P02 policies 2026-10-07 theo project owner “duyệt” đã integrated vào FR/SC/US ở trên; [decision record](policy-proposal.md). Đây là explicit availability/logical-lifetime refinement, không security waiver. Protocol candidate, finite accounting, wire contracts và evidence vẫn phải qua planning gates; approval không đóng P01/P02/U1-B hoặc authorize implementation.
- “Newer/current” phải theo trusted acceptance ordering được chốt ở planning, không theo client timestamp hoặc thời điểm response tới. Successful login B là confirmed authoritative acceptance, không chỉ successful-looking local UI.
- Không thể hứa known outcome trong permanent network outage hoặc full auth availability khi required client storage/capacity chưa đáp ứng. Unresolved state là truthful degraded outcome, không equivalent successful recovery. Healthy-service recovery MUST có reviewed/tested route khi shared storage và safe capacity restored; trước đó persistent explanation/next action giữ public experience, không indefinite spinner hoặc false private admission. Planning phải chốt delivery accounting, finite deadlines và recovery actions; không coi fresh reset/new tab cùng cookie jar là safe-capacity proof.
- Current contracts cần re-inspect ở planning. Stable browser-context cookie với server-owned mapping chỉ là candidate trong [005 research](../005-frontend-foundation-reliability/research.md#r02b--iam-dependency--cookie-strategy-candidates), chưa là approved architecture. Threat model/compatibility phải review trước chọn. Planning đã chọn CSP-1 thay cho candidate này (R12).
- Không tạo HTTP contracts, DTO fields, migrations, plan/tasks placeholders trong bước specify. Application changes chỉ được thực hiện sau đầy đủ SpecKit quality gates và authorization phù hợp.
- Verification dùng owned non-production fixtures với delays tại controlled test boundary; không log credentials hoặc đổi production business rules để tạo race.
- Documentation bằng tiếng Việt, technical/normative terminology bằng English. Không `.specify/extensions.yml`; before/after specify hooks skipped; branch giữ `master`, active feature chuyển sang 006 cho bước planning tiếp theo.
