# Approved Policy Record: Shared Selector và Cookie Delivery Capacity

**Date:** 2026-10-07. **Status:** APPROVED / requirements integrated — project owner trả lời “duyệt” cho cả P01 và P02. Chưa là selected protocol contract hoặc runtime PASS.

Tài liệu giữ filename `policy-proposal.md` để preserve references và ghi decision history. Hai policy đã được integrated vào [spec](spec.md) sau explicit approval. Không sửa policy security của 003, MASTER hoặc application behavior hiện tại. Approval candidate R09/coordinated cutover A trước đó khác với approval P01/P02 lần này.

## Quyết định đã duyệt

Project owner đã approve cùng lúc hai policy dưới đây để cập nhật specification và tiếp tục research candidate R09. Approval không authorize application implementation/migrations, không đóng protocol proof P01/P02 hoặc dependency U1-B của 005. Không cần hỏi lại approval cho cùng hai policy; protocol changes vượt decision này vẫn cần explicit review.

### Policy P01 — Required shared storage / logical context boundary

> New auth protocol MUST yêu cầu shared transactional selector storage trong participating frontend storage partition. Server MUST authenticate context binding và quyết định accepted ordering/session effects trong bound logical context. Shared selector chỉ chọn logical context được product sử dụng; selector MUST NOT authenticate, cấp quyền hoặc chứa credentials.
>
> Khi selector mất, bị reset, ambiguous hoặc required storage unavailable, product MUST end private admission, giữ public experience và kết thúc recovery attempt trong finite deadline bằng persistent explanation/next action. Product MUST NOT scan surviving cookies hoặc dùng cached tab context để restore account. Fresh provisioning sau reset MUST là explicit recovery vào isolated logical context, không implicit restore abandoned context.
>
> Supported browser engines, no-Web-Locks support và full-navigation login/OAuth models giữ nguyên. Full auth availability không được hứa khi runtime environment không cung cấp required shared storage. Khi storage hoạt động lại và safe delivery capacity còn đủ, healthy-service recovery MUST có tested path qua explicit fresh login.

**User-facing recovery:** “Không thể xác nhận phiên đăng nhập trong trình duyệt này.” Next action tùy diagnosis: `Thử lại` khi storage tạm unavailable; hướng dẫn cho phép site storage khi bị disabled; hoặc dùng browser context riêng đáp ứng capability. Không hiển thị login thành công, không silent single-tab/legacy fallback. Copy cụ thể thuộc implementation theo MASTER, không thêm design language.

**Authority boundary:** Server ordering áp dụng trong selected bound logical context. Reset không cần rollback mọi operation của abandoned context: existing original-account security effects vẫn được preserve. Tuy nhiên late response/callback của abandoned context MUST NOT select hoặc admit account đó vào current product. OAuth finalization vẫn cần protocol proof; policy này không tự authorize stale session issuance.

### Policy P02 — Finite delivery capacity / truthful credential-loss recovery

> Protocol MUST có finite delivery capacity tính cả current slots, abandoned bootstrap bindings và cookie-emitting responses chưa được positively acknowledged. Server terminal outcome, elapsed TTL, client abort, generic status probe hoặc successful renewal MUST NOT release capacity nếu không chứng minh emission tương ứng đã được xử lý an toàn.
>
> Khi không thể cấp namespace/capacity an toàn, product MUST reject hoặc defer new cookie-emitting auth operation trước dispatch/issuance tương ứng, giữ bounded persistent recovery và next action. Product MUST NOT dùng fresh provisioning/reset để bypass exhausted capacity, reuse cookie name cho session khác, hoặc phát unbounded cookie slots.
>
> Browser/admin storage loss hoặc cookie eviction MUST dẫn tới no-fallback recovery; explicit fresh login chỉ được thực hiện khi authority và capacity đã an toàn. Product không hứa unlimited fresh logins trong cùng cookie context khi unresolved deliveries đã làm hết safety budget. Chuyển sang genuinely separate browser context MAY là next action; mở tab mới cùng cookie jar không tạo isolation.
>
> Late protocol responses MUST vẫn không trực tiếp overwrite/delete current session slot. Bounded capacity không tự chứng minh current cookie sẽ không bị browser eviction. Nếu eviction thực sự xảy ra, UI MUST giải thích mất credential và require recovery, không âm thầm clear/restore account cũ. Protocol-induced unbounded accumulation MUST NOT được chấp nhận như browser limitation.

Policy này cho phép explicit degraded availability thay vì cam kết absolute credential retention trên finite browser storage. Nó không là waiver cho careless cleanup, unbounded slots, protocol-induced unbounded eviction hoặc account mix-up. Numeric limits chỉ được chọn sau accounting/cleanup proof; các con số 8/16 slots không là approved limits.

## Những thay đổi specification đã áp dụng

| Artifact / requirement | Chỉnh sửa đã integrated | Giữ nguyên |
| --- | --- | --- |
| FR-001 | Nêu rõ server authority trong bound logical context; selector là routing/lifecycle metadata; selector reset end private admission | Không per-tab authority, không account mixing, separate browser/private isolation |
| FR-002 | Chốt server revision/CAS cho accepted intents trong logical context; abandoned-root responses không được select/admit root cũ | Không client clock/peer arrival authority |
| FR-003, SC-001 | Giữ prohibition late overwrite/delete/old-account restore; tách verified credential-loss recovery khỏi silent clearing; thêm bounded storage/capacity condition | Original-account revocation và strict003 security |
| FR-006–008, SC-003/006 | Required storage unavailable/capacity exhausted → bounded persistent recovery; không claim healthy server alone sửa client substrate | Finite deadlines, no unsafe admission, no automatic mutation replay, no-Web-Locks support |
| FR-009, SC-004 | Existing full-navigation OAuth hoạt động khi runtime prerequisites và safe capacity đáp ứng; stale callback không become current | Providers/state/binding/reuse/onboarding security và interaction model |
| Assumptions | Healthy-service resolution yêu cầu shared storage hoạt động và safe capacity; nếu không, có explicit next action, không false successful recovery | Coordinated cutover A chỉ one-time rollout reauthentication |
| US2 / Edge Cases | Thêm reset trong verification, permanent storage unavailable, full delivery budget và late headers sau cleanup | Existing normal timeout/crash/reload cases vẫn required |

Spec/checklist và plan/research đã aligned với approval. Phase1 chỉ mở khi complete protocol proof/research prerequisite đạt; approval của policy không thay feasibility gate.

## Counterexamples cần protocol giải quyết

### C1 — Không có shared selector

1. Cookies chưa tồn tại; IndexedDB unavailable, Web Locks unavailable.
2. T1/T2 tạo bound contexts C1/C2 độc lập; T1 reserve/login A còn pending.
3. T2 xác nhận B; response/callback A đến sau.
4. Server không có shared selection witness để phân biệt two tabs với separate browsers. Singleton selection theo arrival có thể restore A; arbitrary cookie scan không có no-fallback proof.

Trước approval, blocking là safe nhưng không đáp ứng full auth availability wording. Approved P01 đã làm degraded availability explicit; counterexample vẫn cho thấy không được pretend có alternate fallback protocol khi required storage unavailable.

### C2 — Cleanup trước late headers

1. N+1 distinct cookie-emitting responses đã emitted, headers chưa tới browser.
2. Cleanup delete obsolete names; B login confirmed với cookie slot mới.
3. Old headers tới sau cleanup, reinstall stale cookies.
4. Finite browser quota có thể evict B. Disjoint names ngăn replacement nhưng không ngăn eviction.

Fixed-name reuse tái tạo overwrite race; TTL/terminal receipt không thu hồi emitted headers. Finite reservation budget chỉ là direction khi accounting còn giữ được sau tab close/reset. Không declare C2 solved bằng chosen cap.

## Research bắt buộc còn lại

- Bootstrap binding/fixation proof; short IndexedDB CAS và lifecycle check trước mọi private admission; reset không adopt old context.
- Two-phase reserve/execute với expected server revision, stale reserve không supersede newer accepted intent; final commit CAS và scoped read-only outcomes.
- Finite emission accounting qua abandoned contexts/storage reset, byte limits, cookie expiry và cleanup. Nếu accounting không thể preserve, phải giữ explicit recovery thay vì cấp tiếp slots.
- Exact current-slot parser, duplicate rejection và no historical-cookie fallback. Ordinary historical cookie presence không là replay; explicit consumed credential replay vẫn revoke đúng original family theo003.
- OAuth pre-reservation/full-navigation handoff, callback/onboarding final authority check và delivery acknowledgement; không fresh intent ở old callback.
- One consistent lock hierarchy cho tất cả writers; no network trong DB transaction. Existing body allowlists, JWT semantics và account-wide revocation giữ nguyên.
- Cutover/rollback namespace isolation và actual delayed-header browser matrix; required cases không được skip hoặc thay bằng store-only PASS.

Approval của tài liệu này chỉ resolve policy ambiguity. Nó không thay complete protocol proof, runnable validation hoặc review security. [Plan](plan.md) tiếp tục ERROR / BLOCKED cho tới khi research prerequisite đạt.
