# Contract: Auth Transition Protocol v2

**Status:** Selected planning contract, NOT currently available. Existing source vẫn là actual API; các endpoints/headers dưới đây là backend capability cần implementation ở006, không frontend assumption. Không routes/code được thay đổi trong planning.

Authority: [spec](../spec.md), [data model](../data-model.md), [approved policies](../policy-proposal.md). Platform feedback theo MASTER; Customer data-only restriction và003 IAM policies giữ nguyên.

## Transport / cookies

- New request header `X-Auth-Protocol: 2`; context-required requests thêm `X-Auth-Context` UUID, mutations thêm `X-Auth-Operation` UUID và `X-Auth-Transition` UUID nếu là establishing/ending intent. Không thêm metadata vào existing strict login/password/onboarding DTO bodies.
- Existing Origin/CSRF/Bearer requirements vẫn áp dụng; metadata không thay authentication/authorization. API CORS allowlist chỉ existing frontend origins và explicit new headers; credentials include, no-store, no-referrer. Responses không cache; không tokens trong URLs/logs/errors.
- Existing AccessSession success response shape giữ nguyên. V2 response metadata qua `X-Auth-Operation`, `X-Auth-Revision`, `X-Auth-Emissions` (comma-separated UUIDs); expose đúng các headers này qua CORS, không expose Set-Cookie. Revision trên wire là unsigned decimal string, không JavaScript Number; UUIDs validate canonical form. Lookup JSON có `operationId`, `outcome` (PENDING/SUCCEEDED/FAILED/SUPERSEDED/UNKNOWN), `currentRevision`, `currentSessionId` nullable và `publicErrorCode` nullable; không access/refresh credential. Server outcome khác client knowledge enum.
- New cookie names local `wip2_{kind}_{32hexId}`, production `__Secure-wip2_{kind}_{32hexId}`; kinds binding/refresh/oauth/onboarding. Immutable names, host-only/no Domain, HttpOnly, Secure production, SameSite=Lax. Max name64/value96 ASCII bytes.
- Refresh/OAuth/onboarding Path `/api/v1/auth`; binding Path `/api/v1` để `/me/password` có root possession proof. Binding không renewal credential; broaden proof path không broaden refresh-cookie path.
- Stable binding secret + server-issued per-emission nonce component: auth verifies stable root proof, nonce chỉ identify ACK. Late nonce variant MUST NOT invalidate root/current session hoặc grant authority. Refresh value vẫn strictly rotating credential003.
- Inventory/ACK/cleanup routes đều nằm `/api/v1/auth`, có thể nhận mọi owned refresh/provider/binding names. Không enumerate account để restore. Unknown legacy cookies không là new-protocol authority.

## Interfaces cần implementation

| Interface | Input / result | Rules |
| --- | --- | --- |
| POST `/api/v1/auth/contexts` | Body bootstrapAttemptId UUID; returns contextId/revision0/emission IDs; emits binding | Atomic global debit trước provisioning; thiếu local history không tạo per-browser free budget |
| GET `/api/v1/auth/contexts/current` | Bound context metadata; returns revision, currentSessionId nullable, eligibility và outstanding IDs | Read-only/non-rotating; no access/refresh token, no private profile; missing current slot → recovery |
| POST `/api/v1/auth/transitions` | Body kind, expectedRevision; UUID operation header; returns transitionId/acceptedRevision | Server CAS; revision mismatch SUPERSEDED; reserve không clear/replace current session; không auto replay stale reserve |
| GET `/api/v1/auth/operations/:id` | Bound operation context | Scoped read-only outcome/current revision; absent/unknown → UNCERTAIN, không NOT_DISPATCHED; no credential cache |
| GET `/api/v1/auth/delivery` | Bound or residual cookie-possession proof | Non-rotating inventory/ack eligibility, không activate/adopt old root hoặc expose account |
| POST `/api/v1/auth/delivery/ack` | emission IDs, lifecycle/selection reference; actual cookie proof từ request | ACK exact matching fresh value digest; status/body ID alone insufficient; stale/orphan ACK stays quarantined |
| POST `/api/v1/auth/delivery/cleanup` | Exact namespace IDs, cleanup operation ID | Seal under shared locks trước delete; chỉ proven obsolete names; fresh receipt trên distinct unsealed recovery witness, never cookie đang delete |

Delivery ACK là bookkeeping mutation, không auth-mutation replay. Probe có thể observe proof read-only; durable ACK chỉ qua explicit POST với Origin/CSRF phù hợp. Residual binding proof chỉ authorize bounded accounting/cleanup, không private admission hoặc new credential issuance. Unknown proofs trả generic recovery response, không disclose account existence.

Existing POST login/refresh/logout/logout-all/password và onboarding confirm giữ DTO bodies; v2 headers/context/intent required theo operation. Login/logout/onboarding/password execute reserved intent; refresh dùng current bound session + operation ID, không reserve new login intent. Same-principal authenticated request retry chỉ sau confirmed renewal của same captured principal; không automatic POST refresh/login/password/OAuth retry.

## Reserve / execute / admission

1. Short IndexedDB transaction reserves random local attempt với lifetime, last confirmed server revision.
2. POST reserve CAS expected server revision; accepted revision monotonic. Stale expected revision trả409 `AUTH_SUPERSEDED` mà không invalidate newer pending OAuth/current session.
3. Sau response, re-read/CAS shared attempt. Stale attempt không dispatch execute; uncertain reservation reconcile read-only, không retry với latest revision để manufacture newest intent.
4. Password/provider IO ngoài DB transaction; execute finalization checks bound context/reserved revision, eligibility và capacity under hierarchy; commit session mapping/outcome/emissions atomically.
5. Admission cần shared lifetime/attempt vẫn current + bound server current session + current credential proof. Peer messages chỉ yêu cầu re-read; không adopt raw AccessSession. Re-check sau mọi await trước private commit/navigation.
6. Successful session effect khác successful delivery/admission. Khi body lost hoặc selector/proof thiếu → UNCERTAIN/recovery, không fake success.

## Refresh / replay / original-account effects

- Server derive exact refresh slot từ current session mapping; không client slot name/cookie ordering/highest arbitrary ID. Reject duplicate/malformed exact cookie. Missing current slot không scan older account.
- Consume predecessor/issue successor giữ003 first-writer-wins; consumed/revoked presented credential replay revoke original session family. Concurrent same-slot refresh hoặc lost successor có thể require explicit fresh login; no grace/raw-successor replay cache.
- Historical slots tự được gửi kèm không là presented replay. Explicit old-credential replay với valid original binding/Origin/CSRF vẫn áp dụng original-family security effect dù private admission bị deny; không revoke unrelated B family.
- Logout-current captures original session, clears only exact original slot; conditional mapping end. Logout-all/password preserve original bearer account-wide effects; same-account B có thể legitimately revoked theo003. Existing JWT TTL15min vẫn valid theo baseline, không thêm immediate live-session guard/claims.
- Context binding alone không renew/access; GET current/delivery không mint AccessSession.

## Global + per-root capacity / acknowledgement

Selected bounds: per selected root≤8 names; global pending/orphan/quarantine≤32 names, regular issuance≤30 để reserve2 recovery slots; max4 unresolved emissions/name. Reserve BEFORE any header emission, including rewrite to existing name and provider cookies. Nếu cap không đủ, reject issuance/business transition atomically, không rotate token rồi mới fail capacity.

Every owned name có one authoritative accounting class. WRITE ACK matches exact fresh HttpOnly value/digest; predecessor không ACK successor. ACK một emission không ACK others hoặc delete. Orphan delivery không free global name: all writes ACKed + namespace SEALED against every writer + exact cleanup receipt and observed absence tại full auth cookie scope mới retire. Absence không đủ khi có outstanding writer.

Cleanup receipt nonce MUST nằm trong **distinct unsealed recovery-witness binding** đã reserve ở global pool/recovery reserve, không namespace đang SEALED/DELETE. Operation persist relationship giữa exact target namespace IDs và witnessNamespaceId; ACK authorized bằng witness sau old binding delete. Witness chỉ accounting proof, không renew/access/select account. Khi old root binding cũng cần delete, provision witness cho unselected new logical context trước cleanup; chỉ chọn new context sau cleanup/shared lifecycle checks. Fresh nonce match exact cleanup group và request absence của mọi target names tại auth scope; không write lại sealed target để chứng minh delete.

Witness có thể chuyển thành binding của explicitly selected new context trong root8 inventory. Nếu không select được, witness vẫn globally charged/quarantined. Retiring witness cần distinct safe witness cho deletion confirmation; final abandoned witness MAY remain charged, không self-delete+self-write, không assume cookie expiry/TTL giải phóng. Nếu không cấp witness an toàn, giữ persistent recovery; không bypass capacity để cleanup.

Transfer global→per-root LIVE chỉ khi delivery proof và shared selected lifecycle current, server binding/session/namespace relationship valid, root chưa sealed. Stale ACK không activate/adopt/unseal root. Selector-only reset reconcile/seal/cleanup residual inventories trước new lifetime selection; all-history-loss bootstrap vẫn charged global pool, không infer virgin capacity từ empty cookies/IDB.

Global exhaustion có thể ảnh hưởng mọi users, kể cả genuine new browser; separate browser không bypass global exhaustion. Anonymous client không ACK có thể exhaust pool. Existing rate limits + new bootstrap admission limit5/minute/IP (burst5) chỉ reduce abuse rate, **không proof identity hoặc automatic release**. Không deploy production với false availability claims; pressure phải observable bằng non-secret counters và tested recovery. Không operator “force-free” còn emitted responses để restore service.

## Outcomes / errors / deadlines

| Result | Contract / UI |
| --- | --- |
| NOT_DISPATCHED | Client có proof request chưa dispatched; không suy ra từ absent receipt |
| COMPLETED | Confirmed terminal outcome; success/failed/superseded riêng, không mặc nhiên success |
| UNCERTAIN | Dispatched nhưng completion/admission chưa confirmed; persistent recovery, no automatic auth mutation replay |
|409 AUTH_SUPERSEDED | Stale expected revision/intent; no new authority; preserve current session |
|409 AUTH_RECOVERY_REQUIRED | Missing/ambiguous selector/proof/current slot; no private admission |
|503 AUTH_CAPACITY_UNAVAILABLE | Global/per-root safety budget exhausted; public experience, persistent recovery; Retry-After chỉ timing hint, không release proof |
|431 AUTH_COOKIE_HEADER_TOO_LARGE | Owned subset>7KiB hoặc total>8KiB; recovery/cleanup, no arbitrary truncation/fallback |

Existing eligibility/provider/validation/security error semantics giữ nguyên; new public errors không credentials/profile. Client queue/storage open5s, auth request15s, recovery total30s≤2 probes mỗi≤15s bounded bởi remaining budget. Combine caller cancellation với deadline. Server provider IO5s, DB statement/lock wait5s, auth handler budget15s; timeout vẫn không proof response effect absent. Zero automatic auth mutation retries.

## OAuth / onboarding

Pre-reserve qua fetch và re-check shared attempt rồi full-navigation GET existing `/api/v1/auth/oauth/:provider/start` với non-secret `operation` UUID query. No token/proof/account in redirect URL. Start validates bound context/operation và creates existing state/transaction với captured context/revision/version; unique transaction binding cookie counts capacity.

Callback claims original state/binding theo003 trước provider work; finalization uses captured intent, không reserve fresh authority. Stale callback không establish/admit session; returning-user/onboarding current flows unchanged. Onboarding proof stays strict existing DTO; new metadata qua headers. Provider return và frontend landing re-read shared selector, ACK delivered namespaces as current/orphan appropriately. No popup/provider change.

## Cutover / rollback / 005 ownership

Additive migrations/schema trước contract activation; deploy new API and coordinated frontend gate. Legacy provider records version LEGACY; old callback/response chỉ legacy namespace hoặc upgrade-required. Upgraded consumer never falls back `wedding_rt`; optional one-time reauthentication đã approved. Already emitted old headers không mutate new names.

Rollback disables new admissions và requires explicit fresh login theo chosen active protocol, không adopt retained legacy rt; giữ safety ledgers/additive schema tới cleanup safe. Migration down không recovery shortcut.

006 owns this protocol + minimal transport/coordinator/store admission integration. 005 owns broader private-resource lifetime/visual foundations; consumes same coordinator after verified handoff. Design complete không đóng005 U1-B; required real-browser evidence và re-analysis vẫn mandatory.
