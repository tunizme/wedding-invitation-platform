# Frontend & Backend Contract Audit

## Prototype integration follow-up — 2026-10-11 / US5–US7

Đây là source mapping của extension005 được người dùng chốt; không thay snapshot2026-10-06 hay baseline verification2026-10-10 bên dưới. Full gate T100/T101 đang được kiểm chứng; không có kết luận final PASS, feature complete hoặc release-ready trong follow-up này. Xem [production integration](PRODUCTION-INTEGRATION.md), [005 tasks](../../specs/005-frontend-foundation-reliability/tasks.md) và [verification](../../specs/005-frontend-foundation-reliability/verification.md) để phân biệt implementation với acceptance evidence.

| Finding / phạm vi                         | Source implementation hiện tại                                                                                                                     | Giới hạn còn áp dụng                                                                                                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F05/F14 · Product shell/home, US5         | Brand/favicon “Tiệm làm thiệp”, header avatar, footer email văn bản, homepage editorial dùng platform fonts/tokens và CTA theo role                | Không coi hình minh họa homepage là inventory mẫu hoặc xác nhận toàn sản phẩm đạt MASTER/WCAG. Public/capture vẫn ngoài product session chrome.                                                  |
| F03/F06 · Catalog/detail/preview, US6     | Card trong CUSTOMER catalog mở popup khung thường 390px; revision/sampleData/scoped assets và QR/demo thật; POST create ghim revision              | Anonymous catalog vẫn không có contract. Không bỏ guards, expose draft hoặc thêm endpoint. Creation uncertain phải kiểm tra danh sách thay vì tự replay POST.                                    |
| F04 · Responsive demo, US6 / renderer007  | Demo mở thiệp riêng, rồi shared renderer: v2 adaptive desktop 900px, v1 legacy 390px; popup/editor mobile 390px                                    | Không migrate v1 hoặc thêm renderer. Preview/demo RSVP inert; không suy ra mọi template đều đã được kiểm chứng responsive/zoom chỉ từ host sizing.                                               |
| F07 · Overview/list/account, US6          | Sidebar/navigation, owner-scoped real list/profile và loaded-page status statistics                                                                | API summary vẫn thiếu title/cover và dataset-wide total/filter. Không thêm fake totals, pricing, quota, favorites, duplicate/delete hoặc analytics.                                              |
| F08/F09/F14 · Guided Customer editor, US7 | Accordion dữ liệu từ formFields, tab edit/preview, manual save với dirty feedback, linked date/venue controls, publication recovery/share feedback | Chỉ WeddingData; layout/style/binding/crop controls vẫn prohibited. Không có autosave. Form draft/version và owner/resource lifetime phải giữ nguyên qua đổi tab, request và credential renewal. |
| F14 · RSVP workspace, US7                 | Owner-scoped list/cursor, reload, open/close theo controlVersion; presentation dùng scoped CSS/platform controls                                   | Chỉ real response fields; không bổ sung guest management/export hoặc dashboard totals không có contract.                                                                                         |

Editor PATCH gửi `expectedVersion` với WeddingData và giữ snapshot/version fences; UI không tự lưu sau mỗi lần gõ. Publication pending không được biến thành attempt mới: recover POST dùng cùng Idempotency-Key khi chưa có operationId, recover GET khi đã biết operationId. Pending attempt chặn các write có thể làm đổi version đến khi settle; trạng thái uncertain không được hiển thị như thành công. Mô tả này là hành vi source hiện tại trong vòng đời editor, không khẳng định persistence qua mọi reload hoặc thay thế recovery/browser acceptance.

Các implementation mới reuse API/session/operation scopes hiện có, không thêm backend endpoint hoặc schema để phù hợp UI. Baseline browser adapters đã chuyển từ session navbar cũ sang mở avatar/disclosure, bao gồm owner switch, logout, keyboard Tab/Enter và absence trên public/capture; kết quả full gate tương thích thuộc verification, không được suy ra từ thay selector.

## Automated acceptance checkpoint — 2026-10-11

Checkpoint này thay các trạng thái pending US5–US7/T100/T101 ở follow-up lịch sử phía trên; giữ nguyên mọi failed/partial evidence và baseline. [005 verification — final prototype integration acceptance](../../specs/005-frontend-foundation-reliability/verification.md) ghi nhận **FULL PASS** tại `run-XjtXMT`, đủ cả 7 stories, missingCoverage rỗng; [tasks](../../specs/005-frontend-foundation-reliability/tasks.md) hoàn tất **101/101**.

- Selected unit **292/292**; independent web **534/534**, format/lint/typecheck và production build đạt.
- Browser với BE thật **519/519** trên Chromium/Firefox/WebKit; standalone **18/18**. Publication race **20/20**, owned seed, health và cleanup đạt.
- Compatibility riêng: IAM **358**; Builder US4 **160 API + 170 web + 54 browser** đạt.

Acceptance bao gồm popup/QR/focus, demo mobile390/adaptive900, workspace/profile thật, editor accordion/tab/draft retention, manual save/CAS conflict, delayed owner fencing, publication/public snapshot và RSVP. Baseline adapters giữ assertions về exact owner, keyboard và product/public/capture isolation; thay selector không được dùng thay bằng chứng runtime. Chỉ những runtime outcomes trong verification là authority, không suy diễn thêm capability từ layout.

Không thêm endpoint/schema BE, chưa commit/push/deploy. Giới hạn về live provider/production/HTTPS và manual whole-platform usability vẫn giữ; automated local integration acceptance không phải chứng nhận WCAG toàn sản phẩm. Không thay manual save thành autosave hay bảo đảm publication attempt tồn tại qua mọi reload.

## Implementation follow-up — 2026-10-10

The sections below retain the original2026-10-06 audit snapshot. Current005 outcomes use [verification](../../specs/005-frontend-foundation-reliability/verification.md), especially full run `run-8Sonwh` (459 browser/18 standalone, publication/health/cleanup PASS).

| Finding              | Current scoped outcome / evidence                                                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F01 private state    | SATISFIED in005: principal/resource disposal, renewal/edit retention and stale completion fences verified across three engines; current full browser459/459. This records prevention evidence, not a confirmed historical incident.              |
| F02 standalone fonts | SATISFIED: actual production image without source mount,16 invitation hashes/faces and platform fonts;18/18 package cases, injected font/image failure and prior publication retention PASS.                                                     |
| F05 foundations      | SATISFIED for ten FR-011 routes and adopted controls: six widths, keyboard,200% text zoom, long Vietnamese, reduced motion and15/15 contrast pairs reviewed. Approved B01 preserved. Homepage/Marketplace/full editor redesign remains DEFERRED. |
| F10 media library    | SATISFIED: native dialog, desktop drawer/mobile sheet, every trigger, containment/inert/close/Escape/return/fallback focus, authorized operations and local recovery; all45 cases across three engines PASS.                                     |
| F11 session surface  | SATISFIED: public/capture outside product provider; direct/client navigation and authenticated/anonymous isolation verified; existing product/Admin navigation retained.                                                                         |
| F14 feedback         | SATISFIED within adopted account/Admin/library controls, including persistent confirmed-login account next action. Other surfaces remain DEFERRED.                                                                                               |

F03/F04/F06/F07/F08/F09/F12/F13 and F14 outside adopted controls remain outside005. Customer design controls remain prohibited. No missing capability was invented or approved; no whole-product MASTER/WCAG, release-ready or deployment claim. Failed/interrupted evidence remains in verification; current PASS does not rewrite it.

## Snapshot / Phạm vi / Phương pháp

- Audit date: **2026-10-06**.
- Base HEAD: `a556b7e8195b616b4fdef008ef0e2a1a9e5962d2`.
- Snapshot gồm **working tree hiện tại**, có nhiều modified/untracked application files; không chỉ code tại HEAD. Future agents MUST kiểm tra lại source trước implementation.
- Design authority: [Design System v1](../design/MASTER.md). AUDIT ghi nhận hiện trạng, không override approved design và không approve route/schema migration.
- **Approved scope refinement — 2026-10-06:** Customer MUST NOT sửa layout/style/binding như feature 004. Customer colors/fonts/section controls/crop overrides được phân loại prohibited, không còn là backend blockers để implement. Refinement này không thay source snapshot hoặc kết quả checks bên dưới.
- Phạm vi: cả `apps/web` và `apps/api`; route inventory, frontend features, renderer, auth/session, HTTP controllers, application services, validators, authorization, persistence/worker boundaries, upload/public delivery, configuration/deployment và test coverage.
- Phương pháp: inventory toàn bộ non-ignored files bằng `rg --files apps`; đọc các entrypoints/contracts và implementation liên quan; static searches xuyên `src`, tests/config/scripts; đối chiếu frontend callers với backend; chạy typecheck, lint, frontend tests và API unit tests.
- Không chạy app/browser, Docker build, contract/integration suites có database/storage, migrations hoặc external provider requests. Không đo visual screenshots, contrast thực tế, performance hoặc production runtime. Đây không phải penetration test hay chứng nhận WCAG compliance.
- Chỉ tạo tài liệu này; không sửa application code, dependencies, routes, MASTER hoặc business behavior.

### Coverage inventory

Inventory ban đầu có **360 non-ignored files**: `apps/api` 199, `apps/web` 161. Không tính ignored dependencies/build outputs; hidden environment files không được dùng làm nguồn secrets. Binary fonts được inventory và kiểm tra manifest/CSS references, không phân tích binary content.

| Area               | Inventory                                                                            | Nội dung audit                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| API source         | 115 files: modules 92, common 5, config 5, infrastructure 8, health 3, entrypoints 2 | Tất cả HTTP surfaces, application contracts, guards/policies, validators, worker/persistence boundaries |
| API tests          | 67 files: unit 10, contract 20, integration 29, fixtures 6, hỗ trợ 2                 | Unit chạy trong audit; contract/integration inventory và đọc scenarios liên quan, chưa chạy             |
| API config/scripts | 17 files: root config 8, scripts 8, test setup 1                                     | Manifests, Vitest, Dockerfile, runtime/test orchestration boundaries                                    |
| Web source         | 84 files: app 22, config 2, features 60                                              | 20 page routes, root layout, health route; tất cả feature groups và API clients                         |
| Web tests/fixtures | 38 files                                                                             | 30 test files thực thi; fixtures/helpers được inventory                                                 |
| Web E2E            | 9 files                                                                              | Authoring, compatibility, convergence, customer flow, renderer fit, RSVP, publication và helpers        |
| Web public         | 19 files                                                                             | Noto font manifest, 16 WOFF2 faces, 2 licenses                                                          |
| Web root config    | 11 files                                                                             | Manifests, Next/TypeScript/ESLint/Vitest/Playwright/Docker, agent instructions                          |

**18 controller files, 57 HTTP handlers** được liệt kê theo subsystem bên dưới. Inventory toàn bộ không đồng nghĩa từng helper/test đã được formally verified; conclusions về runtime chỉ dựa vào checks đã thực thi.

## Kết luận chính

Repository có nền tảng functional tốt cho authenticated wedding invitation workflows: Identity Access, Admin Template Authoring, customer structured editing, revision pinning, shared renderer, async publication, protected media và RSVP. Frontend hiện thiên về functional foundation; **chưa triển khai visual/interaction system trong MASTER**.

Ba điểm cần chốt trước implementation lớn:

1. Public Marketplace trước login bị **backend contract blocker**: catalog/revision/cover hiện cần authentication, catalog/revision chỉ cho CUSTOMER.
2. Guided Customer Editor có thể reuse draft/save/preview/publish hiện có; album/content extensions và invitation management actions chưa có đầy đủ contract. Customer theme overrides và section order/visibility bị cấm theo quyết định chốt, không thuộc backlog mở rộng capability.
3. Có static risks cần kiểm chứng/fix riêng trước release: principal-scoped private state, standalone font packaging và functional content bị thu nhỏ theo fixed canvas.

Không tìm thấy mismatch rõ giữa tên endpoint/body của customer save/publish/RSVP callers và corresponding controllers đã kiểm tra. Typecheck/lint/unit pass không chứng minh public Marketplace, mobile quality, accessibility hoặc deployment đã hoàn thành.

## Findings / Priority

Priority là thứ tự xử lý đề xuất: **P1** ảnh hưởng privacy, release hoặc core approved flow; **P2** ảnh hưởng usability/contracts đáng kể; **P3** cải thiện độ rõ/maintainability. “Gap” là chưa đáp ứng approved product/design, không tự động là regression. “Static risk” cần reproduction runtime trước kết luận incident.

### F01 — P1 / Static risk: private state chưa scoped theo principal ở mọi screen

**Evidence:** [customer-pages.tsx](../../apps/web/src/features/invitations/customer-pages.tsx) dùng `useCustomer()` trả boolean role, `CustomerInvitationList` load effect phụ thuộc `[customer]`; [customer-invitation-form.tsx](../../apps/web/src/features/invitations/customer-invitation-form.tsx) phụ thuộc `[customer, id]`, giữ detail/data/assets trong local state. [customer-management.tsx](../../apps/web/src/features/identity-access/admin/customer-management.tsx) load theo role. Session có thể đổi qua [refresh-coordinator.ts](../../apps/web/src/features/identity-access/session/refresh-coordinator.ts).

**Trigger:** đổi A → B cùng role qua peer session/BroadcastChannel khi component còn mounted. Boolean role không đổi nên effect có thể không reload. Logout → login cũng không chủ động xóa old private state trước request mới; nếu request lỗi, state cũ có thể tồn tại. Một số async callbacks không kiểm tra user identity khi commit.

**Impact:** có thể hiển thị dữ liệu của principal trước hoặc merge pages khác principal trong browser. Backend ownership vẫn kiểm tra request; finding này không chứng minh bypass backend authorization.

**Hướng xử lý:** key private screen state theo `userId + resourceId`, clear/invalidate async work khi identity đổi, chỉ commit results khi principal còn hợp lệ. Có reference tốt tại [rsvp-management.tsx](../../apps/web/src/features/invitations/rsvp-management.tsx): keyed owner instance và generation/admission checks.

**Acceptance:** A → B cùng role, logout/login, stale response sau identity change và failed reload MUST không để old private records xuất hiện. Chưa chạy browser reproduction trong audit.

### F02 — P1 / Deployment risk: standalone web image chưa copy public fonts

**Evidence:** [apps/web/Dockerfile](../../apps/web/Dockerfile) runner chỉ copy `.next/standalone` và `.next/static`; [fonts.css](../../apps/web/src/features/invitation-builder/renderer/fonts.css) dùng `/fonts/invitation-builder/*.woff2`. Local Next.js output documentation xác nhận standalone không tự copy `public` mặc định.

**Impact:** deployment theo Dockerfile này có nguy cơ missing font assets, làm renderer fallback hoặc `FONT_UNAVAILABLE`, ảnh hưởng capture/publication và public output.

**Hướng xử lý:** future deployment change cần đưa public assets vào correct app runtime directory hoặc xác nhận asset delivery tương đương. Không sửa Dockerfile trong audit.

**Acceptance:** build/run standalone image và kiểm tra font URLs, font readiness cùng publish capture. Chưa build image; nếu environment có external public asset mount/CDN, cần chứng minh cơ chế đó.

### F03 — P1 / Contract blocker: discovery chưa public

**Evidence:** [template-catalog.controller.ts](../../apps/api/src/modules/invitation-builder/http/template-catalog.controller.ts) `GET /templates` và revision GET dùng `@Roles('CUSTOMER')`; cover controller không `@Public()`. [AuthGuard](../../apps/api/src/modules/identity-access/authorization/auth.guard.ts) mặc định yêu cầu Bearer. [CustomerTemplatePicker](../../apps/web/src/features/invitations/customer-pages.tsx) trả “Khu vực này chỉ dành cho Customer.” khi chưa có CUSTOMER session.

**Impact:** approved Home → Discover → Detail → Live Preview trước login không thể hoàn thành bằng UI-only redesign.

**Hướng xử lý:** ghi BLOCKED và review public catalog/read-only preview capability. MUST NOT bỏ guard hoặc expose admin drafts chỉ để dựng Marketplace.

### F04 — P1 / Design gap + accessibility risk: fixed canvas scale thu nhỏ functional content

**Evidence:** [document.types.ts](../../apps/api/src/modules/invitation-builder/domain/document.types.ts) canvas width cố định 390; [PublicInvitationView](../../apps/web/src/features/invitations/public-invitation-view.tsx) scale `min(1, clientWidth / canvas.width)`; [canvas.tsx](../../apps/web/src/features/invitation-builder/renderer/canvas.tsx) fixed height và `overflow: hidden`; [rsvp.tsx](../../apps/web/src/features/invitation-builder/renderer/widgets/rsvp.tsx) field/button `minHeight: 28`, font 14px.

**Impact:** ở 360px trước page padding, scale khoảng 0.923: 28px control thành khoảng 25.8px và 14px text thành khoảng 12.9px. Chưa đạt MASTER guidance 40–44px touch target; reflow/zoom và dynamic content trong fixed boxes cần kiểm chứng. Đây không phải kết luận rằng mọi template đều fail WCAG.

**Hướng xử lý:** giữ wire compatibility; kiểm tra functional control sizing, focus clipping, text zoom/reflow và long/error states. Nếu cần thay renderer/schema model, ghi conflict và explicit migration approval. Không tự biến document thành responsive sections trong bước redesign chrome.

### F05 — P2 / Gap: platform foundations và layout chưa theo MASTER

**Evidence:** [root page](<../../apps/web/src/app/(product)/page.tsx>) là Foundation status page, dùng `system-ui` và hiển thị API base; [layout](../../apps/web/src/app/layout.tsx) chưa load approved platform fonts/styles. Static search `apps/web/src` chưa thấy approved platform token system, Cormorant/Be Vietnam, Lucide, media-query layout hoặc reduced-motion rules.

**Impact:** chưa có Warm Editorial Home, Classic Marketplace Navbar, Gallery Card, consistent buttons/forms/containers hay adaptive product workspace.

**Hướng xử lý:** future UI implementation xây shared platform primitives từ MASTER, reuse existing feature contracts. Việc chưa có motion không tự thân là reduced-motion violation; khi thêm motion MUST có reduced-motion handling.

### F06 — P2 / Gap: TemplatePicker bỏ qua Detail / Live Preview

**Evidence:** [customer-pages.tsx](../../apps/web/src/features/invitations/customer-pages.tsx) cover hiển thị 120×160 (3:4), mỗi row có “Chọn mẫu” gọi create rồi navigate Editor. Chưa có template detail page route.

**Impact:** không khớp curated cover 4:5, Gallery Card và Card → Detail/Preview → Use pattern.

**Hướng xử lý:** dựng detail/preview quanh actual revision contract cho authenticated customer; anonymous version vẫn BLOCKED F03. Không giả định slug field tồn tại.

### F07 — P2 / Contract gap: Invitation Dashboard thiếu presentation metadata/actions

**Evidence:** [invitation-summary.ts](../../apps/api/src/modules/invitations/application/invitation-summary.ts) không có title, cover, template name; list query chỉ `limit,cursor`. [CustomerInvitationList](../../apps/web/src/features/invitations/customer-pages.tsx) là list links, raw status; không visual gallery/empty CTA/updated timestamp presentation.

**Impact:** title/cover gallery, global status filtering, duplicate/delete không thể giả lập như supported API. `publicUrl` có thể vẫn tồn tại sau unpublish; link tồn tại không chứng minh đang published.

**Hướng xử lý:** UI MAY trình bày status/updatedAt hiện có; MUST không dùng filter trên một loaded page như toàn bộ dataset. Review missing metadata/action contracts trước quảng bá capabilities.

### F08 — P2 / Gap: Customer Editor chưa Guided workspace/autosave/field recovery

**Evidence:** [customer-invitation-form.tsx](../../apps/web/src/features/invitations/customer-invitation-form.tsx) một long form + preview phía dưới, explicit “Lưu bản nháp”, date input yêu cầu ISO và timeZone IANA; validation chỉ báo first issue path trong alert. Chưa có category rail/contextual groups/mobile sheets.

**Impact:** structured editing đúng nền tảng nhưng interaction chưa đạt approved model; raw technical values/errors làm user phải hiểu contract internals.

**Hướng xử lý:** autosave có thể xây trên existing CAS save, không cần invent endpoint. Dùng localized controls và error mapping tới fields, giữ data/version semantics. Customer MUST không có layout/style/binding hoặc section/theme controls; data groups phải dựa trên actual formFields.

### F09 — P2 / Static risk: publish recovery chưa giữ receipt/key đủ cho uncertain outcomes

**Evidence:** customer `publish()` tạo `crypto.randomUUID()` mỗi invocation, operation chỉ trong local function; poll tới 90s; nếu request/poll fail, receipt không được giữ trong screen state. Backend có `GET /publication-operations` nhưng customer flow chưa dùng để recover.

**Impact:** mất network sau enqueue khiến user chưa biết publish đã commit; click lại tạo new key có thể gặp `PUBLICATION_IN_PROGRESS` hoặc `VERSION_CONFLICT`. Backend CAS/idempotency bảo vệ commit, nhưng UX recovery chưa khai thác đầy đủ.

**Hướng xử lý:** future implementation giữ submission identity/operation receipt cho retry cùng logical request, recover via existing operation read/list, phân biệt pending/failed/succeeded. Dedicated publish success + share action theo MASTER.

### F10 — P2 / Accessibility gap: Media library dialog thiếu focus lifecycle

**Evidence:** [asset-library.tsx](../../apps/web/src/features/invitation-builder/assets/asset-library.tsx) fixed `section role="dialog"`; có accessible label/close nhưng không thấy initial focus, focus containment, Escape handling, return focus hoặc inert background.

**Impact:** keyboard users có thể tab ra underlying editor; surface chưa đáp ứng complex-task Drawer/full-screen mobile sheet pattern.

**Hướng xử lý:** chọn surface đúng MASTER, implement complete focus lifecycle và mobile behavior. Không phải kết luận rằng toàn app cần modal.

### F11 — P2 / Static risk: session controls xuất hiện trên public invitation

**Evidence:** [SessionProvider](../../apps/web/src/features/identity-access/session/session-provider.tsx) bỏ bootstrap tại `/i/*` và capture shell nhưng vẫn render email/logout nav khi in-memory session đã tồn tại; provider wrap mọi routes.

**Trigger:** authenticated user navigate client-side từ product sang public invitation.

**Impact:** public experience thêm platform nav/email, ảnh hưởng immersive presentation; DOM context khác visitor chưa login. Chưa kiểm chứng browser.

**Hướng xử lý:** separate layout/surface ownership cho public/capture/workspace; không thay auth contracts hoặc bootstrap protections.

### F12 — P2 / Accessibility contract gap: image meaning/heading semantics chưa biểu đạt đầy đủ

**Evidence:** [AssetImage](../../apps/web/src/features/invitation-builder/renderer/asset-image.tsx) mọi loaded image `alt=""`; template Image content không có alt/decorative distinction. [TextDisplay](../../apps/web/src/features/invitation-builder/renderer/primitives.tsx) render `div`; chưa có authored heading role. Widget RSVP heading `h3` không tự đảm bảo hierarchy của whole invitation.

**Impact:** meaningful images và invitation heading navigation không được biểu đạt đầy đủ. Empty alt là đúng cho decorative media, không phải cho mọi informative image.

**Hướng xử lý:** review template accessibility metadata/schema compatibility; không invent wire fields trong frontend. Platform headings có thể sửa theo semantic HTML trong future scope mà không đổi template document.

### F13 — P2 / Contract discoverability gap: Swagger không đủ để sinh frontend contracts

**Evidence:** [main.ts](../../apps/api/src/main.ts) tạo Swagger; nhiều controller nhận `@Body() body: unknown`, validators đóng trong services; không có đầy đủ `ApiBody`/response schema declarations cho các business routes đã scan.

**Impact:** inferred OpenAPI không biểu đạt hết body, errors, CAS, idempotency, pagination và constraints. Không thể coi docs UI là đủ để generate đúng frontend.

**Hướng xử lý:** agents MUST đọc controllers/services/schema/tests; future contract documentation improvement giữ actual behavior. Audit này là index, không thay executable validators.

### F14 — P3 / Integration UX gap: error/header handling và auth entry chưa đồng nhất

**Evidence:** IAM và Builder errors không expose `Retry-After`/`requestId`; Public RSVP client có parse retry delay. `BuilderApiError.VERSION_CONFLICT` dùng copy “Mẫu…” cho cả invitation errors. Social buttons render cả Google/Facebook khi base URL hợp lệ, trong khi backend provider có enabled flags. Login/OAuth success chưa có returning-user CTA hoặc return-to-template handling.

**Impact:** recovery/copy chưa contextual; disabled provider có thể dẫn user tới backend rejection. Backend 403 cho local login được UI diễn giải như unverified email; cần test locked-user behavior để không gán nguyên nhân quá cụ thể.

**Hướng xử lý:** contextual safe errors, preserve rate headers, meaningful next action. Provider availability cần actual capability/config mechanism; không tự invent endpoint.

## Frontend Route Inventory / Screen Readiness

Paths dưới đây là current routes, không phải suggested routes trong MASTER. Auth pages nằm trong route group `(auth)` nhưng URL không chứa group.

| Route                           | Hiện trạng / contract                       | Readiness với MASTER                                     |
| ------------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| `/`                             | Foundation status, public env output        | Home editorial chưa implement                            |
| `/login`                        | Local login + SocialLoginButtons            | Functional; styling và next action còn thiếu             |
| `/register`                     | Registration / accepted email state         | Functional; form system cần chuẩn hóa                    |
| `/verify-email`                 | Fragment proof + resend request             | Giữ fragment hygiene và generic messaging                |
| `/forgot-password`              | Reset request                               | Functional; giữ anti-enumeration                         |
| `/reset-password`               | Fragment proof + new password               | Functional; giữ revocation behavior                      |
| `/oauth-result`                 | Cookie session bootstrap                    | Success state chưa nối returning flow                    |
| `/social-onboarding`            | Onboarding cookie/CSRF + email verification | Functional; delivery/recovery UI cần chuẩn hóa           |
| `/account`                      | ProfileForm, password change                | Functional; shared form/error system còn thiếu           |
| `/templates`                    | CustomerTemplatePicker                      | Auth-only list; chưa Marketplace/Detail                  |
| `/invitations`                  | CustomerInvitationList                      | Existing “Thiệp của tôi”; preserve route                 |
| `/invitations/[id]/edit`        | CustomerInvitationForm                      | Structured data; chưa Guided workspace                   |
| `/invitations/[id]/rsvps`       | Owner RSVP management                       | Có real functionality; không phải empty widget           |
| `/admin/customers`              | Admin customer search/list                  | Functional management screen                             |
| `/admin/customers/[customerId]` | Detail, lock/unlock                         | Native confirmation; không thấy assisted invitation UI   |
| `/admin/templates`              | Admin template list/filter/duplicate        | Actual template-authoring management                     |
| `/admin/templates/new`          | Create template draft                       | ADMIN only                                               |
| `/admin/templates/[id]/edit`    | Craft.js TemplateEditor                     | Pixel authoring thuộc admin, không phải customer editor  |
| `/i/[slug]`                     | SSR public scene + client renderer          | Snapshot delivery; mobile/a11y/deployment cần kiểm chứng |
| `/internal/invitation-renderer` | Isolated CaptureHarness                     | Infrastructure surface; preserve isolation               |
| `/api/health`                   | Next Route Handler                          | Operational JSON endpoint, không product screen          |

Không tìm thấy routes `/templates/[slug]`, `/collections`, `/collections/[slug]`, `/inspirations`, `/favorites`, `/dashboard`, hoặc route-level `loading/error/not-found` files trong app tree đã scan. Absence route không luôn đồng nghĩa backend capability thiếu: fullscreen/mobile simulation có thể là local state; content pages có thể dùng reviewed static content.

## Backend Contract Inventory

### Transport / Authentication / Errors

Source: [main.ts](../../apps/api/src/main.ts), [request-boundaries.ts](../../apps/api/src/common/http/request-boundaries.ts), [ProblemFilter](../../apps/api/src/common/errors/problem.filter.ts), [BrowserSecurityService](../../apps/api/src/modules/identity-access/auth/browser-security.service.ts).

- Global API prefix: **`/api/v1`**. Tables bên dưới dùng path relative với prefix này.
- Global AuthGuard + RolesGuard. Route không `@Public()` cần Bearer; absence `@Roles()` không làm route public. Ownership authorization nằm trong services/policies.
- CORS chỉ cho exact `FRONTEND_ORIGIN`; credentials enabled; methods GET/POST/PATCH/DELETE/OPTIONS. Allowed headers: Authorization, Content-Type, X-CSRF-Token, Idempotency-Key. Exposed: Retry-After, Location.
- Access token RS256, lifetime **900s**; principal role CUSTOMER/ADMIN. Ordinary Bearer guard verify JWT, không fresh DB status lookup mỗi request. Publish finalize có live status checks riêng. MUST không coi logout/lock là universal immediate access-token revocation nếu actual service không check.
- Refresh/onboarding cookies HttpOnly, SameSite=Lax, Secure ở production, path `/api/v1/auth`. Refresh/logout dùng exact Origin + cookie-context CSRF. Bearer builder requests dùng `credentials: omit`; MUST không chuyển mọi requests thành cookie auth.
- Global ValidationPipe forbid unknown/non-whitelisted fields; business bodies dạng `unknown` còn được validate riêng bằng closed objects, schemas và services.
- JSON parser limits: admin templates 1536KiB; invitations 272KiB; public RSVP POST 8KiB; IAM/default 100KiB. Document semantic limits thấp hơn parser envelope.
- Multipart: một `file`, tối đa 10MiB; tối đa hai text fields; field value 480 bytes; tổng Content-Length envelope 10MiB + 64KiB.
- Responses có `Cache-Control: no-store` và nosniff ở boundary; errors dùng `application/problem+json`. Rate/storage/queue failures có thể có `Retry-After`.

Error shape thực tế:

```ts
type Problem = {
  type: 'about:blank';
  title: string;
  status: number;
  code: string;
  requestId: string;
  issues?: { path: string; code: string; nodeId?: string }[];
};
```

`issues` chỉ khi BuilderProblemException có entries, tối đa 100, paths/codes sanitized; không serialize arbitrary exception messages/SQL/request values. Generic IAM validation 422 không trả field-specific detail; UI phải validate locally và dùng safe summary, không giả định backend gửi field errors.

Common statuses: 400 INVALID_REQUEST; 401 AUTHENTICATION_REQUIRED; 403 ACCESS_DENIED; 404 NOT_FOUND; 409 CANNOT_COMPLETE hoặc domain code; 413 PAYLOAD_TOO_LARGE; 415 UNSUPPORTED_MEDIA_TYPE; 422 VALIDATION_FAILED hoặc domain code; 429 RATE_LIMITED; 500 INTERNAL_ERROR; 503 SERVICE_UNAVAILABLE/STORAGE_UNAVAILABLE hoặc queue code.

### Identity Access / Profile / Admin Customers — 23 handlers

| Method + path                                        | Access                                    | Request / response                                                  |
| ---------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| POST `/auth/registrations`                           | Public + Origin/JSON                      | `{email,password}` → 202 generic accepted message                   |
| POST `/auth/login`                                   | Public + Origin/JSON                      | `{email,password}` → 200 AccessSession + refresh cookie             |
| GET `/auth/csrf`                                     | Public decorator, valid refresh cookie    | `{csrfToken}`; 401 nếu không có active context                      |
| POST `/auth/refresh`                                 | Refresh cookie + Origin/CSRF              | 200 rotated AccessSession + cookie                                  |
| POST `/auth/logout`                                  | Origin; CSRF nếu active cookie            | 204, revoke current refresh + clear cookie                          |
| POST `/auth/logout-all`                              | Bearer                                    | 204 revoke user's sessions + clear cookie                           |
| POST `/auth/email-verifications`                     | Public + Origin/JSON                      | `{email}` → 202 generic accepted                                    |
| POST `/auth/email-verifications/confirm`             | Public + Origin/JSON                      | `{proof}` → 204                                                     |
| POST `/auth/password-resets`                         | Public + Origin/JSON                      | `{email}` → 202 generic accepted                                    |
| POST `/auth/password-resets/confirm`                 | Public + Origin/JSON                      | `{proof,newPassword}` → 204                                         |
| GET `/auth/oauth/:provider/start`                    | Public, provider enabled                  | google/facebook; redirect to provider                               |
| GET `/auth/oauth/:provider/callback`                 | Public, bound transaction cookie/state    | code hoặc provider error; success 303 to frontend result/onboarding |
| GET `/auth/social-onboarding`                        | Public decorator, valid onboarding cookie | provider/status/emailCandidate/expiresAt/csrfToken                  |
| POST `/auth/social-onboarding/email`                 | Onboarding cookie + Origin/CSRF           | `{email}` → 202 accepted                                            |
| POST `/auth/social-onboarding/verifications`         | Onboarding cookie + Origin/CSRF           | 202 accepted                                                        |
| POST `/auth/social-onboarding/verifications/confirm` | Onboarding cookie + Origin/CSRF           | `{proof}` → 200 AccessSession; set refresh, clear onboarding cookie |
| GET `/me`                                            | Bearer                                    | SafeUserProfile                                                     |
| PATCH `/me`                                          | Bearer                                    | Nonempty patch `{displayName?,phoneNumber?}` → profile              |
| POST `/me/password`                                  | Bearer                                    | `{currentPassword,newPassword}` → 204; clear refresh cookie         |
| GET `/admin/customers`                               | ADMIN                                     | `limit,cursor,q,status` → customer page                             |
| GET `/admin/customers/:customerId`                   | ADMIN                                     | Customer detail                                                     |
| POST `/admin/customers/:customerId/lock`             | ADMIN                                     | 204                                                                 |
| POST `/admin/customers/:customerId/unlock`           | ADMIN                                     | 204                                                                 |

SafeUserProfile: `id,email,emailVerified,loginMethod,role,status,displayName,phoneNumber,avatarUrl`. Login methods LOCAL/GOOGLE/FACEBOOK; user states ACTIVE/LOCKED. AccessSession thêm `accessToken, tokenType: 'Bearer', expiresIn: 900, csrfToken, user`.

Validation: email trim/lowercase, tối đa 254; registration/new password 8–128 Unicode code points và ≤512 UTF-8 bytes; login/current password 1–128, cùng byte/encoding limits. Proof 40–512 chars. Profile displayName tối đa 100, phoneNumber 32; nullable, nonempty khi là string; không có avatar upload hoặc phone verification contract trong profile patch.

Admin customer list khác Builder list: `{items, page:{hasMore,nextCursor}}`, default limit 20/max 100; q tối đa 100 code points; status ACTIVE/LOCKED. Cursor signed/fingerprint-bound với filters. Customer detail thêm createdAt/updatedAt. Không có HTTP assisted customer invitation routes được register trong current controllers; existence của policy helpers không chứng minh capability exposed.

Sources: [identity-access module](../../apps/api/src/modules/identity-access/identity-access.module.ts), [profile controller](../../apps/api/src/modules/identity-access/profile/profile.controller.ts), [customer controller](../../apps/api/src/modules/identity-access/admin/customer.controller.ts).

### Template Catalog / Admin Authoring — 12 handlers

| Method + path                                              | Access                           | Request / response                                                                  |
| ---------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| GET `/templates`                                           | CUSTOMER                         | `q,category,tag,limit,cursor` → published choices page                              |
| GET `/templates/:id/revisions/:revisionId`                 | CUSTOMER                         | Current published revision → `{id,revisionId,document,sampleData,formFields}`       |
| GET `/templates/:id/revisions/:revisionId/assets/:assetId` | Bearer + resource policy         | Authorized revision image bytes                                                     |
| GET `/templates/:id/cover`                                 | Bearer + cover visibility policy | Image bytes; no public access                                                       |
| GET `/admin/templates`                                     | ADMIN                            | `q,category,tag,status,limit,cursor` → template page                                |
| POST `/admin/templates`                                    | ADMIN                            | `{name,category,tags?,sortOrder?}` → TemplateDetail                                 |
| GET `/admin/templates/:id`                                 | ADMIN                            | TemplateDetail                                                                      |
| PATCH `/admin/templates/:id`                               | ADMIN                            | `{expectedVersion,name?,category?,tags?,sortOrder?,coverAssetId?}` → TemplateDetail |
| PATCH `/admin/templates/:id/draft`                         | ADMIN                            | `{expectedVersion,document,sampleData}` → TemplateDetail                            |
| POST `/admin/templates/:id/duplicate`                      | ADMIN                            | `{expectedVersion,name}` → new unpublished TemplateDetail                           |
| POST `/admin/templates/:id/publish`                        | ADMIN                            | `{expectedVersion}` + UUID Idempotency-Key → 202 operation                          |
| POST `/admin/templates/:id/unpublish`                      | ADMIN                            | `{expectedVersion}` → 200 TemplateDetail                                            |

Catalog choices: `id,name,category,tags,publishedRevisionId,coverUrl`; không có slug, pricing, premium flag, occasion, style/color/orientation fields. q ≤120, category ≤64, tag ≤32; search theo name, category/tag exact. Sort `(sort_order,id)` ascending; cursor opaque. API list chỉ current PUBLISHED revision; existing invitation vẫn pinned revision, không tự upgrade.

Admin metadata: name 1–120 code points, category 1–64, tối đa 20 unique tags mỗi tag 1–32; sortOrder integer abs ≤1,000,000. Updates cần positive expectedVersion và ít nhất một metadata field. TemplateSummary thêm status/sortOrder/editVersion/timestamps, nullable coverUrl/publishedRevisionId; TemplateDetail thêm draftDocument/draftSampleData/coverAssetId/createdBy.

Cover ưu tiên explicit cover asset, fallback revision thumbnail. Contract hỗ trợ curated cover override, nhưng publication fallback là capture thumbnail; không mặc nhiên đã curated 4:5. Frontend MUST fetch protected bytes qua authenticated client rồi dùng blob URL; ordinary `<img src>` không gửi Bearer.

### Invitations / Publication Operations — 9 handlers

| Method + path                     | Access                                 | Request / response                                         |
| --------------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| GET `/invitations`                | CUSTOMER owner                         | `limit,cursor` → InvitationSummary page                    |
| POST `/invitations`               | CUSTOMER                               | `{templateId,designRevisionId}` → InvitationDetail         |
| GET `/invitations/:id`            | CUSTOMER owner                         | InvitationDetail                                           |
| PATCH `/invitations/:id/draft`    | CUSTOMER owner                         | `{expectedVersion,weddingData}` → InvitationDetail         |
| POST `/invitations/:id/publish`   | CUSTOMER owner                         | `{expectedVersion}` + UUID Idempotency-Key → 202 operation |
| POST `/invitations/:id/unpublish` | CUSTOMER owner                         | `{expectedVersion}` → 200 InvitationSummary                |
| GET `/publication-operations/:id` | Bearer + requester/resource visibility | PublicationOperation                                       |
| GET `/publication-operations`     | Bearer + requester/resource visibility | `resourceKind,resourceId,limit` → `{items}`                |
| GET `/public/invitations/:slug`   | Public                                 | Current published scene/context only                       |

**InvitationSummary:** `id,status,publicUrl,publicVersion,editVersion,controlVersion,rsvpOpen,createdAt,updatedAt`. Status DRAFT/PUBLISHED/UNPUBLISHED. **InvitationDetail** thêm ownerId/createdBy/templateId/designRevisionId/draftWeddingData/templateName/document/formFields.

- Create pin đúng current published revision; stale/unpublished selection → 409 TEMPLATE_UNAVAILABLE. Owner lấy từ principal; không accept owner overrides. Create không có Idempotency-Key contract.
- Draft save thay toàn bộ weddingData, validate schema và customer asset ownership; CAS `expectedVersion == editVersion`; success increment editVersion. Không nhận partial data patch hoặc customer template document overrides.
- Publish enqueue snapshot → PENDING/RUNNING/SUCCEEDED/FAILED. 202 có Location `/api/v1/publication-operations/:id`; **202 không đồng nghĩa published**.
- Idempotency replay cùng request/key trước CAS; changed payload/resource với cùng key → IDEMPOTENCY_CONFLICT. Có VERSION_CONFLICT, PUBLICATION_IN_PROGRESS, TEMPLATE_UNAVAILABLE, RENDER_QUEUE_FULL và validation failures.
- Operation result: `resourceId,editVersion,revisionId?` cho template hoặc `publicVersion?` cho invitation; error `{code,issues}`. Không giả định operation result có publicUrl; cần refresh detail/summary. Operation list limit effective tối đa 20, không có nextCursor.
- Finalize kiểm tra candidate hash, version, live user state, lease, assets và capture results; publication atomically commit snapshot. Draft edits không đổi public scene trước republish. Failure giữ public snapshot cũ.
- Stable public_slug UUID được tạo khi first publish; publicVersion increment. Public scene chỉ current PUBLISHED; unpublish revoke public access. Public endpoint không trả draftWeddingData/private editor metadata.
- `controlVersion` tách riêng RSVP open/close khỏi editVersion; MUST không dùng chung version cho mọi action.

Sources: [InvitationService](../../apps/api/src/modules/invitations/application/invitation.service.ts), [PublicationService](../../apps/api/src/modules/invitation-builder/publication/publication.service.ts), [InvitationPublicationService](../../apps/api/src/modules/invitations/application/invitation-publication.service.ts).

### Assets — 7 handlers

| Method + path                                                     | Access                                     | Request / response                            |
| ----------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| GET `/admin/template-assets`                                      | ADMIN                                      | `limit,cursor,q,kind,mine` → asset page       |
| POST `/admin/template-assets`                                     | ADMIN                                      | Multipart file/name/kind → AssetSummary       |
| GET `/assets`                                                     | CUSTOMER                                   | `limit,cursor,q,kind` → own READY asset page  |
| POST `/assets`                                                    | CUSTOMER                                   | Multipart file/name/kind IMAGE → AssetSummary |
| GET `/assets/:id/content`                                         | Bearer + scope authorization               | Image bytes                                   |
| DELETE `/assets/:id`                                              | Bearer + ownership/reference authorization | 204; ASSET_IN_USE nếu referenced              |
| GET `/public/invitations/:slug/releases/:version/assets/:assetId` | Public + current release visibility        | Authorized visible asset bytes only           |

AssetSummary: `id,name,kind,mimeType,byteSize,width,height,createdAt,previewUrl`. Kind IMAGE/DECORATION/BACKGROUND/THUMBNAIL; THUMBNAIL là generated/internal, không upload kind. q tối đa 120 code points; customer chỉ IMAGE; admin mine true/false.

Upload accepts JPEG/PNG/WebP ≤10MiB, rejects declared/decoded MIME mismatch, animation/multipage, edge >10000 hoặc >25 million pixels. Normalize EXIF orientation, strip metadata qua re-encode, resize inside ≤4096px without enlargement, output WebP quality 90. “Original” presentation mode trong MASTER không có nghĩa server giữ original binary; MUST ghi rõ nếu future UI cần original-file preservation.

Reference tracking giữ DRAFT/PUBLISHED/template revision/job assets. Delete referenced asset → 409 ASSET_IN_USE. Public asset URLs chỉ cho current version/current PUBLISHED invitation và visible references; old release URL không phải permanent CDN URL. Không expose private storage keys; reads/writes bounded deadline + cleanup workers.

Sources: [upload.service.ts](../../apps/api/src/modules/invitation-assets/application/upload.service.ts), [asset-reference.service.ts](../../apps/api/src/modules/invitation-assets/application/asset-reference.service.ts), [public-assets.controller.ts](../../apps/api/src/modules/invitation-assets/http/public-assets.controller.ts).

### RSVP — 4 handlers

| Method + path                              | Access                        | Request / response                                            |
| ------------------------------------------ | ----------------------------- | ------------------------------------------------------------- |
| GET `/public/invitations/:slug/rsvp-state` | Public                        | `{open,available}`; published only                            |
| POST `/public/invitations/:slug/rsvps`     | Public + UUID Idempotency-Key | Payload → `{receiptId,acceptedAt}`, 201 new / 200 replay      |
| GET `/invitations/:id/rsvps`               | CUSTOMER owner                | `limit,cursor` → newest response page                         |
| PATCH `/invitations/:id/rsvp-state`        | CUSTOMER owner                | `{expectedControlVersion,open}` → `{controlVersion,rsvpOpen}` |

Payload: name trimmed 1–120 code points; attendance ATTENDING/DECLINED; partySize integer 1–20 nếu ATTENDING, đúng 0 nếu DECLINED; message optional, normalized empty string, max 1000. Reject unknown fields/NUL/invalid Unicode. Same key+payload replay cùng receipt; changed payload cùng key → 409 IDEMPOTENCY_CONFLICT; new key MAY tạo response trùng tên, không có guest identity dedup rule.

New submissions cần PUBLISHED + rsvpOpen + visible RSVP widget; otherwise 404 hoặc 409 RSVP_CLOSED. Replay được kiểm tra trước state gate. Rate: tối đa 5 new accepted responses / 10 minutes / invitation+source hash, thứ sáu 429 + Retry-After; replay không consume quota. Source lấy socket address, không tin forwarded headers.

Owner list items: `id,name,attendance,partySize,message,createdAt`; không email/phone/guest list/export/analytics contract. State toggle CAS riêng, chỉ increment controlVersion khi thực sự changed. PublicRsvp client đã có uncertain-result same-key retry, field errors và countdown handling; đây là reference tốt cho publication recovery.

### Health / Operational — 2 handlers

| Method + path       | Access | Response                                                   |
| ------------------- | ------ | ---------------------------------------------------------- |
| GET `/health/live`  | Public | Process-only liveness payload                              |
| GET `/health/ready` | Public | PostgreSQL-aware readiness; 200 hoặc 503 readiness payload |

Health endpoints không dùng chung business Problem shape cho normal readiness response. Swagger UI tại `/api/v1/docs` là infrastructure setup, không nằm trong 57 decorated HTTP handlers.

**Count reconciliation:** Identity/Profile/Admin 23 + Template 12 + Invitation/Operations 9 + Assets 7 + RSVP 4 + Health 2 = **57**.

## Schemas / Renderer / Data Flow

### Current wire model

| Model             | Actual constraints / boundaries                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| TemplateDesign    | schemaVersion 1; ROOT InvitationCanvas; flat nodes; 10 component types; max 200 elements/30 widgets; document max 1MiB                               |
| Canvas            | width literal 390; height 390–12000; solid/asset background                                                                                          |
| Element           | Text, Image, Decoration, Shape, Calendar, Countdown, Map, RSVP, QRBank, Timeline; box x/y/width/height/rotation, appearance, typed content, bindings |
| Fonts/colors      | Template fontId noto-sans-v1/noto-serif-v1; weight 400/700; template color format `#RRGGBBAA`, khác six-digit platform tokens                        |
| Image positioning | fit cover/contain; normalized positionX/positionY 0–1 có sẵn trong design/background; không có customer crop override trong WeddingData              |
| WeddingData       | schemaVersion 1; bride/groom name/photo; couple photo; parents; story; events; timeline; bank; max 256KiB                                            |
| Events            | ceremony/reception/engagement/afterParty; datetime + IANA timeZone + venue; actual datetime/timezone consistency validated                           |
| Content limits    | Names 120; story 5000; venue address 500; timeline max 20, title 120, description 500, dateLabel 80                                                  |
| Form fields       | Derived từ bound template nodes; không phải mọi field đều xuất hiện ở mọi template                                                                   |
| ResolvedScene     | schemaVersion 1, rendererContractVersion 1, canvas/elements; visible content projection, không raw private document                                  |
| RenderContext     | editor/preview/capture/public, asOf, assetUrls, optional invitation slug/publicVersion/rsvpOpen                                                      |

Customer data không có invitation title/message/album array/colors/fonts/sections/order/occasion fields. Missing title/message/album capabilities cần review contract nếu future feature đưa vào scope. Customer colors/fonts/section order/visibility và layout/style/binding editing là prohibited theo quyết định chốt; không đề xuất thêm contract cho chúng. Static design properties thuộc Admin TemplateDesign. Timeline entry ordering là content data, khác section/layer order.

### End-to-end flow hiện có

```text
CUSTOMER session
  → GET templates (current published revisions)
  → POST invitations (pin revision)
  → GET invitation detail + own assets
  → formFields → edit WeddingData → local resolveDesign → ScenePreview
  → PATCH draft(expectedVersion)
  → POST publish(expectedVersion, Idempotency-Key)
  → PublicationOperation → worker → isolated browser capture / measurements
  → finalize immutable published_scene + publicVersion
  → /i/:slug → server API public scene → InvitationRenderer
  → scoped current-release assets / live public RSVP
```

Admin flow tách riêng: metadata + TemplateDesign + sampleData → draft CAS → template publication → immutable revision/catalog. Craft.js/Moveable/layers/geometry là admin authoring tools; MUST không đưa chúng vào Guided Customer Editor chỉ vì đã có dependency.

Shared `InvitationRenderer` được reuse bởi ScenePreview, PublicInvitationView và CaptureHarness; font/asset readiness và measured overflow kiểm tra publication. Public RSVP và live countdown có intentional mode differences; visual parity không có nghĩa preview submit actual RSVP.

Backend/browser giữ independent schema/resolver copies. Types tương ứng gần như giống nhau; browser thêm harness-only validationState, không persisted. Schema implementations khác nhau (API AJV/browser schema); fixture corpus, bank snapshot, resolver/rendering tests là compatibility gates. Không coi textual diff là semantic bug và không import API runtime vào web để “deduplicate” ngoài approved architecture.

## Capability Matrix so với MASTER

| Approved direction                                 | Current support                                                   | Classification / next boundary                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Warm Editorial tokens/fonts/chrome                 | Chưa có shared platform system                                    | Frontend work; giữ template styling riêng                                                    |
| Wedding-first homepage                             | Foundation page                                                   | Frontend/content work; featured data phải có nguồn thật                                      |
| Anonymous Marketplace                              | Catalog/read protected                                            | BLOCKED backend public read capability                                                       |
| Search/category/tag                                | Có customer catalog queries                                       | Reuse; category/tag chưa có taxonomy endpoint riêng                                          |
| Style/color/free-premium/orientation/sort/occasion | Không có corresponding query/fields                               | BLOCKED cho server-backed filtering/pricing                                                  |
| Collections/Inspiration/Favorites                  | Không có controller/domain/resource đã tìm thấy                   | BLOCKED cho persisted features; reviewed static editorial content có thể scope riêng         |
| Detail/live/fullscreen/mobile preview              | Revision API + renderer có; page chưa có                          | Authenticated UI có nền tảng; anonymous read/slug metadata thiếu                             |
| Curated 4:5 cover                                  | Admin coverAssetId override có                                    | Frontend presentation + curated asset workflow; không ép full-page thumbnail                 |
| “Thiệp của tôi”                                    | Own list/get có                                                   | UI gallery needs metadata support; route hiện tại `/invitations`                             |
| Draft/published filters                            | Status ở items, list không status filter                          | BLOCKED cho complete server-side filter                                                      |
| Invitation title/cover/duplicate/delete            | Không có corresponding customer contracts                         | BLOCKED; template duplicate không phải invitation duplicate                                  |
| Structured Customer Editor                         | Derived formFields + WeddingData save có                          | Reuse, Guided layout/controls còn thiếu                                                      |
| Autosave                                           | CAS draft save có, customer manual save                           | Frontend orchestration; no new endpoint required mặc định                                    |
| Customer colors/fonts/section toggles/order        | Current Customer save không nhận design overrides                 | PROHIBITED theo feature 004 và approved refinement; không tạo controls/contracts             |
| Customer album/gallery data                        | WeddingData chưa có album array                                   | BLOCKED cho content capability nếu được đưa vào future scope; không cho chỉnh gallery layout |
| Crop/focal point                                   | Admin design fit/position có, Customer data chỉ asset IDs         | Admin authoring capability; Customer template presentation overrides PROHIBITED              |
| Async publish/unpublish/share URL                  | Có                                                                | Reuse; recovery + dedicated success/copy UI còn thiếu                                        |
| RSVP open/close/submit/list                        | Có real contract và UI                                            | Reuse; không thêm empty SaaS metrics                                                         |
| Guests/RSVP export/Analytics                       | Chưa có corresponding APIs                                        | Future scope; MUST không invent counters/data                                                |
| Other occasions                                    | Shared Invitation names có, WeddingData/bindings wedding-specific | Future schema work; không migrate trong frontend redesign                                    |

### BLOCKED records cho future agents

Các Suggested contract dưới đây chỉ là capability-level proposal, **không phải approved endpoint/DTO**.

```text
BLOCKED: Backend capability required
Feature: Anonymous Marketplace / Template Detail
Required capability: Safe public catalog, published preview data và public cover/assets.
Affected UI: Home showcase, /templates, Template Detail / Fullscreen Preview trước login.
Suggested contract: Reviewed read-only published projection; preserve draft privacy,
                    current revision visibility và create authentication.
Reason: Current catalog/revision CUSTOMER-only, covers require Bearer.
```

```text
BLOCKED: Backend capability required
Feature: Visual Invitation Dashboard / management
Required capability: Display metadata/cover, dataset-wide status query,
                     customer invitation duplicate/delete nếu feature được đưa vào scope.
Affected UI: Thiệp của tôi, filters, contextual menu.
Suggested contract: Owner-scoped summary/actions với explicit lifecycle,
                    asset/public-link/reference semantics được review.
Reason: Current summary thiếu title/cover; list chỉ limit/cursor; actions chưa exposed.
```

```text
BLOCKED: Backend capability required
Feature: Customer album / additional invitation content
Required capability: Typed content data khi future feature explicitly đưa vào scope.
Affected UI: InvitationEditor Images/Content data-entry groups.
Suggested contract: Content-only data, validation và renderer projection tương thích
                    revision pinning; không nhận layout/style/binding overrides.
Reason: Current WeddingData chưa có album array hoặc mọi content field trong MASTER.
        Customer design settings/section controls/crop overrides là prohibited,
        không phải missing capability cần bổ sung.
```

```text
BLOCKED: Backend capability required
Feature: Persisted Favorites / Collections / richer discovery / pricing
Required capability: Actual resources/taxonomy/filter fields và availability rules.
Affected UI: Navbar Favorite, galleries, Collections và filter surfaces.
Suggested contract: Review từng capability riêng; không invent pricing/premium business rules.
Reason: Current controllers/schema không cung cấp các persisted features này.
```

## Test / Verification Results

Checks thực thi trong audit, không dùng `--fix`, không install, không migrations:

| Command                                | Result                    | Giới hạn                                         |
| -------------------------------------- | ------------------------- | ------------------------------------------------ |
| `pnpm --filter @wedding/web typecheck` | PASS                      | Type compatibility, không runtime contract proof |
| `pnpm --filter @wedding/api typecheck` | PASS                      | Type compatibility                               |
| `pnpm --filter @wedding/web lint`      | PASS, max-warnings 0      | Static lint; không WCAG certification            |
| `pnpm --filter @wedding/api lint`      | PASS, max-warnings 0      | Static lint                                      |
| `pnpm --filter @wedding/web test`      | PASS: 30 files, 233 tests | Vitest/jsdom; không browser layout proof         |
| `pnpm --filter @wedding/api test`      | PASS: 10 files, 77 tests  | Unit project; không contract/integration suites  |

Logs local ở `/tmp/frontend-audit-{web-typecheck,api-typecheck,web-lint,api-lint,web-tests,api-unit}.log`; không commit logs/artifacts. Typecheck có thể update ignored cache artifacts; audit không sửa tracked application source.

### Existing coverage đáng giữ

- IAM contract/integration scenarios: local/social login, registration/verification/reset, sessions, profile, admin status, authorization, races, secret hygiene và retention.
- Builder contract/integration: closed document schemas, Unicode/date/timezone validation, revision pinning, CAS, scoped assets/deletion, publication lease/races, HTTP body/CORS/problem boundaries, public release revocation và RSVP idempotency/rates.
- Frontend tests: auth/session/proof handling, customer typed forms và dirty guard, publication committed-version recovery, assets/blob cleanup, pagination, binding/schema fixtures, font readiness, widget/RSVP states.
- E2E config có Chromium/Firefox/WebKit, locale vi-VN, timezone Asia/Ho_Chi_Minh, reducedMotion reduce; suites có authoring/customer/publish/RSVP/renderer fit/compatibility. Có tests không có nghĩa đã chạy trong audit này.

### Verification còn thiếu cho release / redesign

- Browser reproduction F01/F11: same-role principal switch, stale async completion, public route với existing session.
- Standalone Docker image fonts/public asset delivery và capture publication F02.
- Actual viewport 360/375/390/430/768/1440, zoom/reflow, keyboard focus không bị clipping và RSVP error/long-message states.
- Dialog/Drawer/sheet focus lifecycle, touch targets, field-linked error/focus recovery và meaningful image/text semantics.
- Publish lost-response recovery, pending operation reload/retry, queue/storage failure; không chỉ happy path.
- Full contract/integration suites với owned test database/storage/runtime fixtures; không chạy nhầm production resources.
- Visual/contrast checks theo MASTER; tests hiện có không xác nhận palette/font/spacing system đã implement.

## Implementation Order / Handoff

Đây là thứ tự đề xuất cho future approved implementation, không phải authorization sửa application trong audit:

1. Verify/fix private principal-scoped state và standalone public assets; thêm regression coverage phù hợp.
2. Review public catalog/preview và missing customer capabilities bằng BLOCKED records; preserve existing auth/ownership/business rules.
3. Implement platform tokens/fonts/primitives và surface/layout separation theo MASTER; không đổi template font/color wire contracts.
4. Implement Home/Listing/Detail/“Thiệp của tôi” dựa trên actual available contracts; không thêm fake pricing/analytics/favorites.
5. Implement Guided Customer Editor, autosave CAS, contextual errors, publication recovery/success; giữ admin authoring role riêng.
6. Resolve mobile functional readability/focus/overlay issues qua explicit renderer compatibility review; chạy browser và backend gates.

Future agents MUST dùng source + MASTER + audit cùng nhau. Khi repository thay đổi, cập nhật audit evidence và actual contract inventory trước khi dùng tài liệu này làm integration reference.
