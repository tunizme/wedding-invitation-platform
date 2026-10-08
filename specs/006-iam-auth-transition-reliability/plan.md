# Implementation Plan: IAM Auth Transition Reliability

**Branch:** `master` (actual Git branch) | **Date:** 2026-10-07 | **Spec:** [spec.md](spec.md)

**Feature identity:** `006-iam-auth-transition-reliability`; feature identity không đi kèm Git branch switch.

**Input:** `specs/006-iam-auth-transition-reliability/spec.md`.

**Status:** Implementation and final local all verification complete on 2026-10-08. All 116 tasks are checked. Phase24 auth-transition all PASS: scripts 22/7/6, selected frontend 133, API 76, browser 208/208 (52 per supported project), all root quality gates; evidence `.artifacts/auth-transition/run-Lt4lxU/`. IAM all and owned production-start health PASS. See [validation-results.md](validation-results.md) and [frontend-handoff](contracts/frontend-handoff.md) for corrections, historical failures and current evidence. Production HTTPS/live providers and feature005 implementation remain separate.

## Summary

006 cung cấp authoritative browser auth context/supersession, recoverable operation outcome và late-response-safe auth effects cho dependency005, trong khi giữ003 IAM business/security, full-navigation OAuth/onboarding, supported browsers và MASTER feedback.

Approach (CSP-1): mỗi browser storage partition chọn một server-owned **AuthContext** qua shared IndexedDB selector (không secret); context được chứng minh bằng binding cookie riêng `__Host-wa_cb_<contextId>`. Mọi session-establishing/ending transition đi qua **AuthIntent** two-phase reserve/execute với expected-revision CAS, nên response hoặc callback cũ không thể thành current. Mỗi session có cookie slot tên immutable `__Secure-wa_s_<slotTag>` với strict003 rotation bên trong, nên late writes chỉ chạm session của chính nó. **Group-observed emission accounting** giới hạn số cookie protocol có thể khiến browser giữ. Lock mới chỉ thêm ở đầu (Context) và cuối (ledger) của existing003 hierarchy. Cutover theo clarification A (một lần đăng nhập lại).

## Technical Context

| Item | Value |
| --- | --- |
| Language/Version | Node 24, pnpm 12.3.4, TypeScript; NestJS 11 backend, Next.js 16/React 19 frontend; không đổi stack |
| Primary Dependencies | Existing TypeORM/PostgreSQL, IAM crypto/JWT/provider adapters, Vitest/Testing Library/Playwright. Không thêm dependency |
| Storage | PostgreSQL: bảng mới `auth_contexts`, `auth_intents`, `auth_cookie_names`; column mới trên `auth_sessions`, `oauth_transactions`, `pending_social_onboardings` ([data model](data-model.md)). Browser: IndexedDB selector do006 sở hữu; cookies HttpOnly |
| Testing | 003 app-owned unit/contract/integration + new API contract/integration + real-browser matrix B1–B15 qua owned delivery proxy; proposed runner `validate:auth-transition` ([quickstart](quickstart.md)) |
| Target Platform | Same-site HTTPS frontend/API; Chromium, Firefox, WebKit, kể cả không Web Locks. Shared IndexedDB là auth prerequisite (policy P01) |
| Project Type | Independent Next frontend + Nest REST modular monolith |
| Performance / bounds | Client: queue 5s, request 15s, recovery 30s ≤ 2 read-only probes. Server: intent expiry 60s (OAUTH 10 phút), outcome retention 24h, provisional binding 15 phút, confirmed binding 30 ngày. Capacity: `CAP_NAMES` 8, `CAP_BYTES` 2048 (chờ A5). Validation: contract ≤ 10, browser ≤ 20, compat ≤ 15, all ≤ 60 phút, cleanup reserve 30s |
| Constraints | 003 strict rotation/reuse revocation, no grace/raw-successor cache; access token memory-only, 15 phút; absolute session 14 ngày; request body allowlists không đổi; JWT claims không đổi; Origin/CSRF/role/ownership giữ nguyên |
| Scale/Scope | Existing auth transitions + minimal frontend auth integration; 005 sở hữu private-resource fences |
| NEEDS CLARIFICATION | Không còn. A5 là verification item, không phải clarification |

## Constitution Check

| Gate | Before research | After Phase1 design |
| --- | --- | --- |
| I. Scope discipline | PASS: explicit IAM refinement | PASS: artifacts trace FR-001–016; không placeholder code/schema; wire names chỉ trong design contracts |
| II. App independence | PASS | PASS: backend và frontend changes nằm trong app riêng; root runner chỉ orchestration |
| III. Reproducible DX | PASS | PASS (design): runner, budgets, cleanup và failure behavior được document; command là proposed, phải được tạo trong tasks trước khi claim PASS |
| IV. Explicit DB evolution | PASS: không migration | PASS (design): mọi schema change qua một explicit migration mới; synchronize disabled; `down` chỉ trong test schema |
| V. Verifiable quality/security | PASS: checklist 16/16 | PASS (design): 003 security giữ, contract + browser matrix + log inspection được định nghĩa. Chưa có runtime evidence |
| Phase1 prerequisite | Research required | PASS: R12 complete |
| Application entry | Docs only | **BLOCKED** cho tới khi có tasks, analyze không còn CRITICAL/HIGH, và authorization phù hợp |

Không constitution exception. `.specify/extensions.yml` không tồn tại; hooks skipped. Không runtime gate, migration hoặc deployment nào chạy trong bước này.

## Research Decisions

[research.md](research.md) ghi lịch sử R01–R12:

- R01–R08: existing transport, browser facts, candidates, ordering/locks, operation knowledge/deadlines, compatibility, verification tooling.
- R09: candidate shared selector + session slots (project owner authorize để document).
- R10: counterexamples và policy deltas trước approval.
- R11: P01/P02 policies được duyệt, spec đã cập nhật.
- **R12: selected protocol CSP-1** — flows F1–F6, proofs P01-a…d, P02-a…d, L-proof, cutover/rollback, numeric bounds, R09 matrix disposition, residuals.

Residuals project owner nên biết (đều nằm trong approved policies, không phải security gap):

- Safari ITP xóa IndexedDB sau 7 ngày không truy cập → user phải đăng nhập lại dù session 14 ngày còn hiệu lực.
- Response bị mất vĩnh viễn chiếm một chỗ capacity; khoảng 8 lần trong cùng group thì cần xóa dữ liệu trang hoặc dùng trình duyệt khác.

## Phase1 Design Artifacts

| Artifact | Nội dung |
| --- | --- |
| [data-model.md](data-model.md) | AuthContext, AuthIntent, CookieName ledger (fields, invariants, state transitions), column bổ sung, IndexedDB selector, lock hierarchy |
| [contracts/auth-context.openapi.yaml](contracts/auth-context.openapi.yaml) | Delta OpenAPI 3.1 trên003: 4 route mới (provision, confirm, reserve, outcome) và 9 route003 có thay đổi header/cookie/response |
| [contracts/browser-state.md](contracts/browser-state.md) | Cookie table, capacity rules, selector rules, admission rules, cross-tab refresh, deadlines, recovery states, cutover/rollback |
| [contracts/frontend-handoff.md](contracts/frontend-handoff.md) | Ownership 006 vs 005, capability 005 được consume sau verification, breaking changes, re-analysis trigger |
| [quickstart.md](quickstart.md) | Baseline 003 regression, migration lifecycle, proposed phase runner, contract checks, browser matrix B1–B15, A5 verification, compat/cutover, handoff evidence |

## Integration / Ownership

- **Backend (`apps/api/src/modules/identity-access/`)**: module context/intent/ledger mới trong identity-access; sửa `auth/browser-security.service.ts` (cookie names/parse), `auth/session.controller.ts`, `auth/refresh.service.ts`, `auth/local-login.service.ts`, `auth/session.service.ts` (slot tag, context), `oauth/oauth.controller.ts` + `oauth-transaction.service.ts` (intent), `application/resolve-social-identity.service.ts` + `complete-social-onboarding.service.ts` (Context lock đầu, intent check), `profile/profile.controller.ts` (clear chỉ slot của `sid`), `infrastructure/transactions.ts` (lock helpers), `infrastructure/retention.worker.ts` (contexts/intents retention).
- **Frontend (`apps/web/src/features/identity-access/`)**: selector module mới; `api/client.ts` (headers, `authProtocol`, operation knowledge); `session/refresh-coordinator.ts` (IDB lease, admission); `session/store.ts`, `session/session-provider.tsx` (admission/end-admission events); OAuth result và recovery surfaces theo MASTER. Đọc installed Next guides theo `apps/web/AGENTS.md` trước khi sửa frontend.
- **Contract 003**: giữ nguyên làm baseline lịch sử; 006 là delta authoritative cho các route bị đổi (FR-014). Chỉ thêm ghi chú supersede, không sửa schema 003.
- **005** consume admission events theo [handoff](contracts/frontend-handoff.md); không duplicate coordinator.
- **Validation**: test mới tại `apps/api/test/{contract,integration}/identity-access/`, `apps/web/tests/identity-access/`; runner orchestration ở root `scripts/`.

## Project Structure

### Documentation

```text
specs/006-iam-auth-transition-reliability/
├── spec.md
├── checklists/requirements.md
├── policy-proposal.md          # APPROVED P01/P02 policy record
├── plan.md                     # this file
├── research.md                 # R01–R12, Phase 0 complete
├── data-model.md               # Phase 1
├── quickstart.md               # Phase 1
└── contracts/
    ├── auth-context.openapi.yaml
    ├── browser-state.md
    └── frontend-handoff.md
```

`tasks.md` là output của `speckit-tasks`, chưa tạo.

### Source Code (existing, sẽ được sửa trong implementation)

```text
apps/api/src/modules/identity-access/
  auth/  authorization/  oauth/  application/  profile/  infrastructure/  domain/
apps/api/src/infrastructure/database/migrations/      # một migration mới cho 006
apps/api/test/{contract,integration}/identity-access/
apps/web/src/features/identity-access/{api,session,forms}/
apps/web/tests/identity-access/
scripts/                                              # validate:auth-transition runner (proposed)
```

**Structure Decision:** Giữ cấu trúc monorepo hiện có (`apps/api` NestJS modular monolith, `apps/web` Next.js). Mọi thay đổi nằm trong module identity-access của từng app; không service mới, không shared business package.

## Requirement Trace

| Requirements | Design coverage |
| --- | --- |
| FR-001, FR-002, FR-008 | R12 F1/F2, P01-a…d; data model AuthContext/AuthIntent/selector; browser-state §3–5 |
| FR-003, FR-006 | R12 F3/F4/F6, P02-a…d; CookieName ledger; browser-state §1–2 |
| FR-004, FR-005, FR-007, FR-010 | R06 + outcome route; browser-state §6–7 |
| FR-009 | R12 F5; OAuth start/callback/onboarding routes |
| FR-011, FR-012 | 003 rotation/reuse/CSRF giữ; same-principal renewal trong handoff |
| FR-013 | Quickstart browser matrix B1–B15 |
| FR-014 | Cutover/rollback (R12, browser-state §8) |
| FR-015 | Selector không chứa secret; log inspection trong quickstart |
| FR-016 | frontend-handoff.md |
| SC-001–SC-007 | Quickstart contract checks + B1–B15 + compat; chưa execute |

## Complexity Tracking

Không có constitution violation. Complexity mới (3 bảng, IDB selector, intent CAS, capacity ledger) là tối thiểu để đáp ứng FR-001–003/006 dưới policies đã duyệt; các phương án đơn giản hơn (singleton cookie, stable reusable bearer, frontend lock only, TTL release) đã bị loại trong R03/R10/R12 với counterexample cụ thể.
