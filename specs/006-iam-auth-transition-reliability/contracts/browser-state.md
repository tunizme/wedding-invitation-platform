# Contract: Browser State, Cookies và Client Rules (CSP-1)

**Date:** 2026-10-07. **Source:** [research R12](../research.md#r12--selected-protocol--p01p02-design-proof), [data model](../data-model.md), [HTTP contract](auth-context.openapi.yaml). CSP-1 đã implemented; final006 all local evidence PASS ngày2026-10-08, xem [validation results](../validation-results.md).

## 1. Cookie table

| Cookie            | Production name            | Dev name            | Attributes                                                             | Lifetime                                                    | Writer                                              |
| ----------------- | -------------------------- | ------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------- |
| Context binding   | `__Host-wa_cb_<contextId>` | `wa_cb_<contextId>` | HttpOnly, Secure (prod), Path=/, SameSite=Lax, không Domain            | 900s provisional; 2592000s sau confirm, re-emit khi refresh | provision, confirm, refresh                         |
| Session slot      | `__Secure-wa_s_<slotTag>`  | `wa_s_<slotTag>`    | HttpOnly, Secure (prod), Path=/api/v1/auth, SameSite=Lax, không Domain | Session absolute expiry còn lại (≤ 14 ngày)                 | login, OAuth callback, onboarding complete, refresh |
| OAuth transaction | `__Secure-wedding_oauth`   | `wedding_oauth`     | 003 không đổi                                                          | 003                                                         | OAuth start/callback                                |
| Onboarding        | `__Secure-wedding_ob`      | `wedding_ob`        | 003 không đổi                                                          | 003                                                         | OAuth callback                                      |
| Legacy refresh    | `__Secure-wedding_rt`      | `wedding_rt`        | 003                                                                    | Chỉ bị clear sau cutover                                    | Legacy routes (cutover cleanup)                     |

Rules:

- `contextId` là UUID (36 ký tự). `slotTag` là 22 ký tự base64url random 128-bit. Names không bao giờ reuse cho context/session khác.
- Server parse **exactly one** cookie theo tên đã derive; duplicate, malformed hoặc missing đều fail closed. Không có wildcard read, highest-name hoặc arrival-order selection.
- Clear emission (`Max-Age=0`) chỉ target: slot của session gốc của request (logout, logout-all, password); slot của session revoked/superseded; binding của context RETIRED hoặc có `confirmed_seq` nhỏ hơn context của request và không có current session. Không bao giờ clear binding/slot current hoặc binding confirmed mới nhất của group.
- Protocol không emit `Clear-Site-Data` và không mass clear.

## 2. Capacity (policy P02)

| Bound       | Value                                        | Ghi chú                                                                    |
| ----------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| `CAP_NAMES` | 8 dynamic names (bindings + slots) per group | + 3 fixed names; A5 actual-route PASS trên cả bốn projects, cap giữ nguyên |
| `CAP_BYTES` | 2048 bytes serialized protocol subset        | Dưới proxy 8 KiB và Node header 16 KiB                                     |

- Group được xác định từ mọi binding cookie co-present trong request tới auth endpoint.
- Emission tạo name mới bị reject `CAPACITY_EXHAUSTED` **trước** khi emit (provision, reserve establish, execute commit).
- Ack chỉ bằng request trình đúng value đã emit. Không release theo TTL, terminal intent, client abort hoặc status probe.
- `CAPACITY_EXHAUSTED` → selector `RECOVERY_REQUIRED(CAPACITY_EXHAUSTED)`; next action: xóa dữ liệu trang cho site hoặc dùng browser context riêng. Mở tab mới **không** phải next action hợp lệ.

## 3. Shared selector (IndexedDB)

Schema: [data model — Shared selector](../data-model.md#shared-selector--indexeddb-mới-006-sở-hữu).

Client MUST:

1. Ghi selector chỉ qua short readwrite transaction; không await network trong transaction.
2. Snapshot `expectedRevision` trong **cùng** transaction tạo attempt.
3. Re-check `attemptId` còn current trong một transaction **sau** mỗi network step trước khi commit selector hoặc admit session.
4. Chỉ retry reservation `STALE_REVISION` khi re-check xác nhận attempt vẫn current; tối đa 2 retry trong R06 budget.
5. Gửi `X-Auth-Context` bằng giá trị selector vừa đọc; không bao giờ dùng context từ tab memory cũ, cookie scan hoặc peer message.
6. Cập nhật `revision` bằng CAS max; không admit response có `contextRevision` nhỏ hơn `selector.revision`.
7. Không provision tự động khi page load. Selector vắng mặt = không private admission; provisioning chỉ theo explicit auth action.

Client MUST NOT lưu email, profile, access token, CSRF token, cookie value, proof hoặc password trong selector hoặc storage khác (FR-015).

## 4. Admission rules

Tab chỉ admit private context khi **tất cả** đúng:

- Selector `SELECTED`, `contextId` khớp context của response.
- Response `authProtocol = 2`, `contextRevision ≥ selector.revision` và `sessionTag` được ghi vào selector qua CAS.
- Không có `pendingIntent` kind LOGOUT chưa resolved với revision mới hơn.

Tab MUST end private admission khi: selector record vắng mặt/reset, IDB connection nhận `close`, selector chuyển `RECOVERY_REQUIRED`, `contextId` hoặc `sessionTag` trong selector khác giá trị tab đang giữ, hoặc nhận `SUPERSEDED`/`CREDENTIAL_MISSING`/`CONTEXT_UNAVAILABLE`. Peer message (BroadcastChannel) chỉ là tín hiệu để đọc lại selector, không phải authority.

Admission và recovery continuation phải so sánh generation cục bộ đã snapshot trước khi await với generation hiện tại, ngay trước hiệu ứng memory đồng bộ. Một selector transaction thành công không cho phép continuation ghi đè hoặc xóa admission mới xuất hiện trước khi transaction result được giao. Local-login selector CAS cũng phải khớp attempt gốc. Đọc lại selector bất đồng bộ nhiều lần không thay thế được fence này (T104–T105).

Admission được kiểm tra và cập nhật memory đồng bộ trong callback của short readwrite selector transaction, khi mọi connection khác còn bị serialize. Promise continuation không được admit lại snapshot sau khi tab khác đã chọn B. Admission tạm thời bị rút nếu transaction abort/timeout, với local-version guard để không xóa B mới hơn. Generation authority cục bộ chỉ giúp eager invalidation cho chính connection đó; nó không chứng minh authority giữa các tabs. Login dùng attempt CAS trong setup rồi snapshot version admission trước credential request, để bootstrap hợp lệ hoàn tất trong setup không bị nhầm là transition mới hơn. Peer/refresh không admit khi intent đang pending hoặc recovery explanation chưa được resolved (T109).

Bootstrap/refresh, peer logout inspection và refresh-queue inspection rút admission cũ ngay trong callback transaction khi thấy selector invalidates context/tag đang giữ, RECOVERY_REQUIRED hoặc pending LOGOUT. Không áp dụng clear ở continuation sau delivery; local version guard giữ admission B mới hơn. SELECTED cùng context/tag với explanation NOT_DISPATCHED của queue không tự invalidates một peer-renewed admission hợp lệ (T113).

OAuth-result dùng attempt CAS gốc khi observe confirmation, rồi refresh có scope `{contextId, attemptId, sessionTag}`. Scope mismatch không refresh session B; admission và feedback success chỉ hợp lệ khi selector vẫn thuộc đúng attempt/slot và session vừa verify còn được giữ. Decision feedback được kiểm tra trong transaction; intent đã bị thay thế hiển thị superseded, kể cả B hoàn tất khi confirm/refresh đang pending. Có session bất kỳ không chứng minh OAuth intent gốc thành công (T114).

Local-login success commit dùng một short readwrite selector transaction để kiểm tra attempt/revision và local admission version, cập nhật tag/revision B, bỏ pending LOCAL_LOGIN và cập nhật memory admission B cùng lúc. Không xóa pending trước khi đổi tag; không có khoảng trống để refresh A cũ cùng revision reservation được admit và khiến B bị báo superseded. Abort/timeout rút đúng provisional admission của transaction, giữ admission mới hơn; per-connection generation không được dùng để nhầm chính authority write B là invalidation (T115).

## 5. Cross-tab refresh

- Dùng `selector.refreshLease`: tab chiếm lease bằng transaction khi lease trống hoặc quá 20s.
- Tab khác chờ lease release rồi tự refresh tuần tự (access token memory-only per tab, 003).
- Web Locks có thể dùng như optimization khi available; correctness không phụ thuộc Web Locks (FR-008).
- Lease bị chiếm khi request cũ vẫn sống chỉ có thể gây REFRESH_REUSE revoke → explicit relogin; không retry refresh, không grace.

## 6. Client operation knowledge và deadlines

Giữ R06: queue 5s, request 15s, recovery 30s tối đa 2 read-only probes (`getAuthIntentOutcome`), zero automatic auth-mutation retry.

IndexedDB transaction có deadline mặc định 5s; acquisition/read khi chờ refresh lease nhận phần budget queue còn lại. Timeout invalidate connection, abort transaction và chặn callback đến muộn chạy work/ghi selector. Không fallback storage hay giải phóng cookie-delivery capacity (T108).

Refresh không có intent receipt: lỗi trước refresh dispatch hoặc kết quả refresh chưa rõ kết thúc admission với next action đăng nhập mới, không tự gửi lại refresh và không suy diễn credential đã mất. Notice đang mounted nhận thay đổi admission/recovery; probe và thông báo cũ bị bỏ khi admission mới thay thế. Receipt LOGOUT COMMITTED xác nhận remote logout; logout-all chưa có receipt không được báo remote thành công khi response mất (T106–T107).

Outcome lookup chỉ xác minh binding của context được yêu cầu và giữ Context lock cho receipt/current-slot read. Nó không hợp nhất group, cập nhật last_seen_at, acknowledge/release ledger names hoặc emit Set-Cookie. Mutating auth operations vẫn hợp nhất context và ledger trong cùng transaction; OAuth start settlement chạy sau khi insert business row để không để unresolved names ở group cũ và giữ L-infinity last (T116).

Provision/confirm/reserve failures persist `recoveryReason` dưới attempt CAS và publish thông báo cho notice đang mounted. Nếu chưa biết context hoặc intent ID thì không fabricate receipt URL/probe; pending metadata được giữ cho uncertainty. Parsed rejection dùng OPERATION_FAILED; NOT_DISPATCHED và UNCERTAIN giữ riêng. Notice bị unmount/supersede ngừng các probe tiếp theo (T110).

Refresh queue expiry publish NOT_DISPATCHED trong một selector transaction bounded, guard context/tag/revision/attempt và local version. Giữ lease và authority để peer renewal đang chạy hợp lệ có thể hoàn tất; record có explanation chặn bootstrap mới. Explicit new login/reservation hoặc confirmed server-state update xóa explanation; không tự replay refresh. Refresh nhận parsed rejection dùng OPERATION_FAILED, chỉ outcome chưa xác nhận sau dispatch dùng OPERATION_UNCERTAIN (T111–T112).

| Situation                                             | Client knowledge                      | UI                                                               |
| ----------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| Hủy trước khi gửi                                     | `NOT_DISPATCHED`                      | Không auth effect                                                |
| Response 2xx/4xx đã parse                             | `COMPLETED` (không mặc nhiên success) | Theo outcome                                                     |
| Timeout/network/abort/body parse failure sau dispatch | `UNCERTAIN`                           | Persistent explanation + next action; probe outcome trong budget |
| Probe 404/unavailable hết budget                      | `UNCERTAIN` giữ nguyên                | Không success, không spinner vô hạn                              |

## 7. Recovery states (copy theo MASTER, không thêm design language)

| `recoveryReason`                          | Thông điệp chính                                                  | Next action                                                                         |
| ----------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `STORAGE_UNAVAILABLE` (IDB open thất bại) | “Không thể xác nhận phiên đăng nhập trong trình duyệt này.”       | `Thử lại`; hướng dẫn cho phép lưu trữ dữ liệu trang; hoặc dùng trình duyệt khác     |
| `STORAGE_RESET`                           | Như trên                                                          | Đăng nhập lại (explicit fresh provisioning)                                         |
| `CREDENTIAL_MISSING`                      | Phiên đăng nhập trong trình duyệt này đã mất                      | Đăng nhập lại; không tự khôi phục account cũ                                        |
| `CAPACITY_EXHAUSTED`                      | Trình duyệt đang có quá nhiều phiên chưa được xác nhận            | Xóa dữ liệu trang cho site hoặc dùng trình duyệt khác                               |
| `CONTEXT_UNAVAILABLE`                     | Phiên trình duyệt đã hết hạn                                      | Đăng nhập lại                                                                       |
| `NOT_DISPATCHED`                          | Không thể gửi yêu cầu xác nhận phiên đăng nhập                    | Đăng nhập lại bằng thao tác mới                                                     |
| `OPERATION_UNCERTAIN`                     | Chưa xác nhận được kết quả trên máy chủ; phiên cục bộ đã kết thúc | Probe intent chỉ đọc nếu có; đăng nhập lại bằng thao tác mới, không replay mutation |
| `OPERATION_FAILED`                        | Máy chủ không hoàn tất thao tác; phiên cục bộ đã kết thúc         | Đăng nhập lại bằng thao tác mới; không suy diễn remote revocation thành công        |

Public experience luôn còn dùng được trong mọi recovery state.

## 8. Cutover và rollback (clarification A)

- Cutover yêu cầu API fleet đồng nhất CSP-1 trước khi deploy frontend; không mixed fleet.
- Sau cutover: request tới `/auth/refresh`, `/auth/logout`, `/auth/csrf` thiếu `X-Auth-Context` → 401 + clear `wedding_rt` (chỉ legacy name). Legacy session (`context_id` null) không bao giờ là current session → one-time fresh login.
- OAuth transaction pre-cutover (`intent_id` null) → callback fail path 003, không session.
- Client bỏ qua mọi response thiếu `authProtocol = 2`.
- Rollback: revoke mọi session có `context_id` khác null trước khi chạy lại legacy; khi re-cutover, selector cũ trỏ tới session đã revoke → `CREDENTIAL_MISSING` → recovery.
