# Contract: Platform Foundations / Initial Adoption

[MASTER](../../../docs/design/MASTER.md) là authority; contract này chọn composition trong approved system. Trace FR-009–020/025; không generated second MASTER hoặc page overrides.

## Shared Primitives

| Primitive                 | Required behavior / styling                                                                                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button / action link      | Native button cho action, link cho navigation; primary Mocha/white/approved hover, ~46px/radius8/no shadow. Secondary/ghost theo MASTER. Busy label/prevent duplicate submit, disabled semantics/visible focus, no low-contrast enabled text |
| Field / TextField         | Visible linked label; height44/white/radius8; helper/error dưới field, aria-describedby/invalid khi phù hợp; native autocomplete/type/inputMode và actual validation. Approved B01 meaningful boundary rule bên dưới                         |
| StatusBadge               | Text + semantic treatment, optional Lucide; height24–26/padding8/radius6/font12-500. Warning text Espresso; no color-only status                                                                                                             |
| InlineAlert / LocalStatus | Critical persistent recovery/local busy/upload status, appropriate single live region. No premature success/transient-only milestones/autosave toast spam                                                                                    |
| PlatformPage              | Be Vietnam Pro/ivory; responsive padding16/24/32 theo MASTER; reading720 account forms, editorial1120 Admin management; spacing16–32/group24; app headings sans18–24/600 theo hierarchy                                                      |
| ModalSurface              | Native dialog lifecycle, accessible heading/close; Drawer/Full-screen Sheet variants, no nested modal hoặc canvas typography inheritance                                                                                                     |

Forward native semantics/ref cho focus/forms; không generic business-form framework. Aliases map baseline, không alternate raw palette/radius/shadow. Không cần icon dependency khi visible text controls đủ; actual icons MUST là Lucide SVG/currentColor/stroke theo MASTER, không alternate library.

## Typography / CSS Ownership

`next/font/local`: web-owned licensed files/manifest/provenance/checksums, real Vietnamese/Latin coverage. Be Vietnam Pro normal400/500/600/700; Cormorant normal500 editorial-only; không giả static face thành variable. Platform `display:swap` không đổi renderer `font-display:block`/readiness/Noto IDs.

Global token declarations MAY tồn tại sau navigation; no body typography/background/reset hoặc generic descendant styles lên renderer. Explicit font classes chỉ chrome/controls. Review same scene computed fonts/palette/geometry trước/sau adoption; no hidden inheritance trên Admin canvas.

## Initial Adoption

| Existing URL                                        | Preserved semantics                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `/login`                                            | Credentials/social entry/recovery links, password manager/paste                              |
| `/register`                                         | Actual validation/generic accepted milestone, no account-existence disclosure                |
| `/verify-email`                                     | Request/confirm và sensitive proof handling                                                  |
| `/forgot-password`, `/reset-password`               | Generic request, actual proof/new password validation, no logged proof/token                 |
| `/social-onboarding`, `/oauth-result`               | Existing provider/cookie/result flows, no invented provider discovery API                    |
| `/account`                                          | Supported profile patch, LOCAL/social password distinction, renewal giữ typed edits          |
| `/admin/customers`, `/admin/customers/[customerId]` | Search/filter/cursor/detail/status/lock-unlock confirmation/auth; no assisted invitation API |

Narrow screens single column; Admin rows MAY recompose semantic list/detail để readable actions. Không new widgets/navigation hoặc toàn-product redesign.

## Admin Media Library

≥768px: right Drawer width `min(720px, calc(100vw - 48px))`; <768px: full-screen sheet/`100dvh`. Ivory/white surface, modal-level depth theo MASTER; reachable name/close/header, independently scrollable body, wrapping controls. Không shrink `inset:8%` desktop overlay.

`showModal()` với heading name/initial search-or-heading focus; background inert, Tab/Shift+Tab contained, Escape/Close/select chung idempotent close. Restore surviving TemplateEditor/BindingPanel trigger; removed trigger→logical workspace fallback. Close during upload dispose continuation, không hứa rollback asset. Preserve authorized query/filter/mine/upload/pagination/select và local recovery.

## A11y / Contrast / Motion

Normal text≥4.5, large≥3, meaningful controls/graphics≥3 khi applicable; focus2px primary offset2, target40–44. Six viewports/keyboard/text zoom200%/long Vietnamese/reduced motion/focus-not-obscured required. DeviceScaleFactor không thay text zoom; không disable zoom/password paste.

Adopted inputs không cần placeholder: label/helper đủ guidance. Champagne decorative only; warning normal text Espresso, semantic icon. Không round4.497 thành PASS. Motion150–200ms/ease-editorial khi cần, reduced theo preference, không entrance choreography.

**B01 — APPROVED (2026-10-06):** Enabled platform input có border là sole meaningful boundary MUST dùng `--color-control-border: var(--color-primary)` theo [MASTER](../../../docs/design/MASTER.md#approved-change-b01--functional-input-boundary). Giữ baseline pale border cho decorative borders/dividers; white background/height44/radius8/type/focus unchanged. Label/focus ring không waive boundary contrast. [Approval evidence](../verification.md#b01--design-approval) chỉ documentation; actual states/adjacent-surface contrast vẫn phải verify, không blanket recoloring controls hoặc thay template palette.
