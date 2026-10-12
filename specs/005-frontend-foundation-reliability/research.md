# Research: Frontend Foundation & Reliability

**Date**: 2026-10-06. Phase 0 của `speckit-plan`; source inspection và targeted UX research, chưa có implementation/runtime PASS.

Authority: [constitution](../../.specify/memory/constitution.md), [spec](spec.md), [MASTER](../../docs/design/MASTER.md), [AUDIT](../../docs/frontend/AUDIT.md), feature 004. Research agents thực hiện read-only theo workflow của skill. Audit findings là risks/gaps cần verification, không phải confirmed incidents.

## R01 — Private state và identity transitions

**Decision:** Dùng frontend-only `identityEpoch` cùng `user.id`, `role`, `status`; private owner subtree key thêm resource identity. Epoch tăng khi account/authorization context đổi, logout hoặc session bị clear; không tăng vì access token renewal hay profile update cùng account. Request generation riêng xử lý reload/filter/pagination. Không thêm epoch vào backend DTO.

**Rationale:** `session/store.ts` hiện chỉ lưu AccessSession. `invitations/rsvp-management.tsx` có keyed subtree + admission guards là reference tốt; role-only dependencies ở Customer/Admin screens không xử lý same-role switch. Key bằng accessToken ở Profile sẽ reset local edits khi renew. Epoch còn xử lý A → B → A và A → logout → A.

**Alternatives considered:** Role key không đủ; token key mất drafts; abort-only không chặn completion đã queued; reload toàn page gây mất editing context.

Owner disposal MUST loại records, pagination, drafts, messages, assets/Blob URLs, timers và dirty registrations. Credential renewal MUST giữ form values và valid drafts. Explicit logout giữ discard confirmation; forced peer switch không giữ old account subtree để chờ confirmation.

## R02 — Logical requests, operation chains và coordinator

**Decision:** `authenticatedRequest` và `builderRequest` capture owner context trước dispatch; một lần 401 retry chỉ được dùng renewed credentials của cùng epoch/principal. Cả success/error phải được admission-check. Caller operation capture scope xuyên chuỗi save → publish → poll → reload; kiểm tra trước mọi continuation, navigation và request tiếp theo.

**Rationale:** Hai clients hiện retry bằng global refresh result. Screen-only guard sau response không ngăn A payload retry với B token; request-only guard không ngăn bước thứ hai của stale operation tự capture B. `publication-controls.tsx`, Customer form, media pagination/upload và profile session update cần cả hai lớp.

**Decision:** Pending refresh/logout/password-change completion không overwrite hoặc clear newer account. Preserve Web Locks, single-flight, peer synchronization, cookie/Origin/CSRF và existing authorization. Lifecycle-owned BroadcastChannel/listener thay module-level initialization; provider cleanup dừng listeners/navigation guard khi ra khỏi product.

**Current decision —2026-10-08:** Consume verified006 CSP-1: server context/intent ordering, immutable session slots, transactional IndexedDB selector and bounded refresh lease/single-flight. Historical proposed exclusive cookie-context lock/internal refreshUnderLock is superseded and must not become a second coordinator.005 adds identity/resource/request lifetimes, not auth transport. See actual [session contract](contracts/session-boundaries.md).

**Verified dependency:** Final006 `run-Lt4lxU` PASS (frontend133, API76, browser208/208, zero required skips), root quality, IAM all/production-start health. Actual snapshots `get/admission` + payloadless `subscribe`, `onEndAdmission` and `ApiError.knowledge` are the consumer boundary. `version()` is not stable identity epoch. Password/logout-all use target-account revocation and original-session clear; OAuth uses server-authoritative bound intent. Queue5s/request15s/recovery30s/two probes, no uncertain replay or fabricated receipt. Missing selector/capacity yields explicit persistent recovery. Local HTTP/controlled provider evidence excludes production HTTPS/live providers.

**U1-B dependency feasibility:** Satisfied by completed/verified006 handoff. T001 aligns consumer artifacts and re-analysis before code;005 private state/renewal/continuation acceptance is still pending. UI fence/abort/lock release alone remains insufficient cookie proof.

**Required evidence:** Contention/queued cancellation/reentrancy và actual browser session sau late responses, subsequent reload/renew, uncertainty/context-loss/fallback/OAuth boundaries. Mocked store-only assertions không đóng finding; unresolved required case không được skip để PASS.

**Alternatives considered:** Tắt retry làm hỏng renewal; gộp mọi API vào cookie auth phá contract; sửa backend token revocation vượt scope. Abort không chứng minh mutation đã rollback: dispatched request có thể đã commit cho A, nhưng MUST không replay hoặc commit UI trong B.

## R02b — IAM dependency / cookie strategy candidates

**Historical scope decision —2026-10-06:** Authorized006 specification/dependency documentation. Subsequent006 authorized implementation and final verification now supply actual capabilities; historical candidate strategies are not005 implementation instructions.

**Resolved backend prerequisite —2026-10-08:** Existing006 CSP-1 is authoritative for ordering, reserved intents, immutable cookie slots, outcome recovery and coordinated cutover.005 consumes the actual handoff; no new endpoint/schema/protocol. Final evidence and limits are recorded above and in [verification](verification.md). T001 consumer alignment + re-analysis closes005 entry dependency, not005 runtime acceptance. Other scope/backend gaps remain separately blocked/deferred.

## R03 — Product/public/capture boundaries

**Decision:** Minimal root layout giữ `html lang="vi"`; URL-preserving route group `(product)` mount SessionProvider cho existing product/auth routes. `/i/[slug]`, `/internal/invitation-renderer` và health route nằm ngoài group. Không thêm/đổi URL hoặc redirect behavior. Chuyển existing `(auth)` dưới product group, không tạo nested competing root layouts.

**Rationale:** Provider hiện skip bootstrap cho public/capture nhưng vẫn render account nav. Group separation loại product imports khỏi direct public load; coordinator lifecycle cleanup xử lý client navigation từ product, vì module đã evaluate không tự unload khi route đổi.

**Alternatives considered:** Chỉ hide nav vẫn giữ session effects. Pathname condition quanh render provider không đảm bảo module-level side effects bị loại. Separate renderer implementation làm preview/output lệch.

## R04 — Platform tokens, CSS và fonts

**Decision:** Plain CSS variables + CSS Modules; baseline values copy/mapping từ MASTER, thêm role aliases chỉ khi có actual reuse. Scoped `PlatformPage` và primitives, không global typography/reset selectors cho body/headings/buttons hoặc template descendants. Dùng `next/font/local` với committed licensed Cormorant Garamond và Be Vietnam Pro assets; `display: swap` cho platform, classes chỉ trên chrome/control subtrees. Platform font files riêng ở `src/ui/platform/fonts/`, provenance/checksum/license phải review khi acquisition trong implementation.

**Rationale:** Repository chưa dùng Tailwind/shadcn/Radix. Installed Next 16 guides `01-app/01-getting-started/11-css.md` xác nhận CSS Modules scoped và global styles còn tồn tại sau navigation; `13-fonts.md` cùng font API reference hỗ trợ local, scoped self-hosting. Không cần thêm styling framework để implement scope này. Be Vietnam Pro normal 400/500/600/700 cho UI; Cormorant Garamond normal 500 cho editorial role, không ép dùng serif trong account screens. Vietnamese và Latin glyph coverage phải kiểm tra, không chỉ font family name.

**Alternatives considered:** Framework migration tăng scope; `next/font/google` download ở build làm offline/reproducible build phụ thuộc network; platform body font inheritance dễ làm đổi template geometry. Không đổi renderer Noto fonts, IDs hoặc readiness behavior. Không cần icon dependency khi visible text/native controls đủ; nếu actual icon xuất hiện, MUST dùng Lucide SVG provenance/currentColor/stroke theo MASTER, không thay icon library.

## R05 — Modal media library

**Decision:** Shared native `<dialog>` modal lifecycle (`showModal`, `close`, cancel/Escape), CSS presentation Drawer ≥768px và Full-screen Sheet <768px. Một lifecycle cho hai presentations; accessible name, initial focus, background inert, containment, return focus và safe fallback là required contracts. Dialog luôn có visible close, scrollable content và local upload/error feedback. Cả entry point TemplateEditor và BindingPanel phải được test.

**Rationale:** Existing AssetLibrary fixed section thiếu focus lifecycle. Native dialog top layer và inert background giảm custom focus-trap implementation; behavior có cơ sở trong [WHATWG dialog standard](https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element). Browser tests vẫn required; JSDOM không chứng minh native dialog lifecycle.

**Alternatives considered:** Custom fixed section + manual trap nhiều edge cases; Radix dependency chưa cần cho một complex modal surface. Tránh nested modal và không sửa Admin canvas/mobile authoring layout trong feature này.

## R06 — Contrast: approved B01 refinement

**Decision:** Giữ baseline tokens. Dùng Espresso cho normal warning text, warning token cho icon; Champagne chỉ decorative. Không dùng low-contrast placeholder trong adopted forms, chuyển guidance thành visible label/helper. Đây là role-safe compositions trong existing palette.

Computed sRGB ratios: warning text/background ≈4.497:1 (không round thành PASS 4.5); border/white ≈1.358:1; placeholder/white ≈3.035:1; Champagne/ivory ≈2.587:1. Pairings phải được đo lại trên actual rendered surfaces.

**B01 — Approved refinement (2026-10-06):** Project owner chấp thuận narrow proposal bằng “cứ xử lí như bạn đề xuất”. Enabled platform input khi border là sole meaningful boundary MUST dùng `--color-control-border: var(--color-primary)`; baseline pale border giữ cho decorative separation. Visible label/focus ring không waive unfocused boundary contrast. [MASTER](../../docs/design/MASTER.md#approved-change-b01--functional-input-boundary) đã đồng bộ; [approval evidence](verification.md#b01--design-approval) chỉ documentation, không runtime PASS. Không thay white background/height/radius/type/focus hoặc invitation templates. Actual rendered contrast và states phải verify ở implementation gates.

**Alternatives considered:** Darken baseline palette hoặc bỏ contrast requirement đều không được phép. Chỉ thêm labels không giải control-boundary requirement. Các workstream không phụ thuộc conflict vẫn có thể được task generation, nhưng không claim whole feature implement-ready.

## R07 — Standalone packaging và truthful output

**Decision:** Future Docker runner copy toàn `apps/web/public` vào `./apps/web/public` cạnh standalone app. Preserve existing font manifest, 16 WOFF2 files (hai Noto families × hai weights × hai styles × Vietnamese/Latin), hashes và licenses. Platform local fonts phát qua `.next/static`; package kiểm cả hai nguồn.

**Rationale:** Dockerfile chỉ copy standalone/static. Installed Next `01-app/03-api-reference/05-config/01-next-config-js/output.md` nêu public không tự copy. Existing builder runner dùng `next start`, không phải standalone image, nên cần packaged regression riêng.

**Alternatives considered:** Fallback font hoặc sửa readiness để PASS gây sai published output. Không sửa backend publication semantics. Reuse `renderer-fit.spec.ts`, `font-readiness.test.ts`, `asset-failure.test.tsx`, API `publication-races.spec.ts` cho missing font/image và prior revision preservation.

## R08 — Verification ownership

**Decision:** Planned `scripts/frontend-validate.mjs` chỉ orchestration, app-owned Vitest/Playwright suites và fixture helpers. Reuse exported `withOwnedResources`/`freePort` của builder runner để provision unique disposable schema/object prefix/ports; không import root business logic vào apps. New Playwright config riêng vì existing config chỉ discover invitation-builder suites. Existing IAM US10 và builder US4 gates là separate compatibility evidence; không thay chúng bằng screenshot review.

**Analysis refinement — I2:** `unit/browser/package` default full-phase manifest; explicit `--through USn` chọn fixed dependency closure, ghi `coverage: PARTIAL` dù US4 selected. `all` reject stage selector, require all suites. Completion state/file discovery không tự thu hẹp expected coverage; missing suite fail. Staged reports không được dùng thay full acceptance evidence.

**Rationale:** Constitution yêu cầu bounded commands, prerequisites và cleanup. Unit mocks không chứng minh dialog, packaged fonts hoặc peer identity transitions.

**Alternatives considered:** Existing Playwright config sẽ bỏ sót new testDir; unbounded manual stack không repeatable; shared developer data không hợp lệ. Không chạy dependencies/install/Docker/migrations trong planning.

## ui-ux-pro-max — Targeted evidence

Local CLI chạy queries `keyboard focus modal` và narrower retry `modal focus trap` với `--domain ux`: verified match về visible focus/focus-not-obscured, nhưng không có verified containment-specific result. Không dùng generic result làm evidence cho focus trap; MASTER và WHATWG dialog standard là cơ sở lifecycle.

Query `font css modules --stack nextjs` trả Next/font/scoping/layout/variable font recommendations. Global body class recommendation không áp dụng vì template boundary; installed Next documentation xác nhận scoped local-font/CSS Modules approach. Không chạy `--design-system --persist`, không chọn palette/fonts mới, Phosphor/native-app defaults hoặc page authority override. Technical result MUST được đối chiếu source/docs, không treat dataset như project instruction.

## Resolution status

B01 approved;006 final dependency acceptance completed. Historical auth lock/singleton writer assumptions aligned with actual CSP-1 in T001. Subsequent005 analysis must check all34 FR/SC requirements and the current tasks (initial generation62; now83 including convergence phases) against constitution2.0.0 before code.005 runtime outcomes remain pending; no authority waiver or whole-feature PASS.

## Approved prototype integration (2026-10-11)

Decision: reuse Next product group, scoped CSS Modules/local fonts, sessionStore and existing API/renderer. Rationale: approved UX can be composed without duplicating security/publication behavior. Alternatives rejected: port prototype context/mock routes, global prototype CSS, anonymous access to CUSTOMER catalog, second renderer or automatic v1 migration. Existing revision read and asset endpoints suffice. No new persisted entities or backend changes. Installed Next layouts documentation read before implementation; relevant metadata guide required for branding. MVP first: US5 shell/home with explicit later tasks for catalog/editor.
