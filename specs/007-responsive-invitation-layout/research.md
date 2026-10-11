# Research: Responsive Invitation Layout

**Date**: 2026-10-11. Phase0 hoàn tất cho planning; không xác nhận implementation.

## R1 — Flow v2 thay vì dual-scene

**Decision**: Dùng section flow/grid cho nội dung và absolute artwork trong section, adapter v1/v2 tại shared renderer. Không scale390→900 hoặc tự suy diễn section.
**Rationale**: `document/types.ts` và `schema-definitions.ts` của web, API `domain/document.types.ts`/`document-schema.ts` cố định canvas390, parentROOT và box tuyệt đối. `renderer/canvas.tsx` overflow hidden; đổi wrapper không làm nội dung reflow. Dual-scene vẫn giới hạn chiều cao/tọa độ, cần bảo trì hai geometry.
**Alternatives considered**: Wrapper900 không sửa content; scale2.31x làm controls/typography sai; dual-scene hữu ích ra mắt nhanh nhưng trái mục tiêu nội dung tự tăng chiều cao.

## R2 — Container thật quyết định layout

**Decision**: Named query container ở host có width độc lập với child; child max480 dưới768, max900 từ768. Mobile preview host max390. CSS container queries đổi layout trên cùng DOM, không chọn scene khác bằng React key.
**Rationale**: Chuẩn [CSS Containment Level3](https://www.w3.org/TR/css-contain-3/) định nghĩa size query cho descendants của query container. Suy luận áp dụng vào feature: host phải nằm ngoài invitation bị cap480, nếu không desktop query không thể kích hoạt. `PublicInvitationView` hiện scale theo canvas.width; v2 cần nhánh intrinsic flow riêng.
**Alternatives considered**: Window media queries sai với popup hẹp; query trên capped child gây breakpoint sai; ResizeObserver chọn hai tree làm remount widget. Observer chỉ phục vụ đo/debug hoặc fallback width nếu matrix browser thực tế yêu cầu.

## R3 — Độc lập apps, strict schema và parity

**Decision**: TemplateDesign1|2, ResolvedScene cặp(1,1)|(2,2); mỗi app sở hữu validator/resolver, dùng cùng corpus JSON trong test, không tạo root package nghiệp vụ. Reject unknown keys, version mismatch, invalid IDs, unknown presets và arbitrary CSS/HTML/URL.
**Rationale**: Web Zod/API AJV hiện chặt và resolver flat. Nới width đơn thuần làm lệch wire contract. Corpus kiểm valid/invalid, semantic binding, resolved output, assets và optional-node handling.
**Alternatives considered**: Import source app kia vi phạm constitution; permissive validator làm v2 lọt qua v1; serialize Craft nodes làm public renderer phụ thuộc editor.

## R4 — Persistence cần migration và finalizer version-aware

**Decision**: Migration mới nới đúng các CHECK document/scene version, metadata khớp JSON; dữ liệu v1 giữ nguyên. Finalizer/entity nhận version từ candidate validated. Down migration từ chối khi còn bất kỳ v2 draft/revision/job/snapshot.
**Rationale**: `20261001000100-InvitationBuilderCore.ts` ép schema1 tại draft, revision, published_scene và metadata; `20261001000200-InvitationPublicationJobs.ts` ép candidate_document1. `template-publication.service.ts` hiện ghi literal schema/renderer1. Immutable revisions/pinning đã có, phải giữ.
**Alternatives considered**: Chỉ sửa TS không vượt DB CHECK; rewrite migration cũ phá upgrade path; bulk rewrite snapshot phá immutability; down bằng delete dữ liệu không được phép.

## R5 — Resolve snapshot đầy đủ, giữ WeddingData1

**Decision**: Scene2 chứa resolved content và cả hai layout rules, section/node IDs/order, backgrounds/artwork. WeddingData1 và binding catalog hiện có giữ nguyên. Nhóm ảnh là grid Image nodes tĩnh hoặc ba photo binding; không thêm customer album/audio.
**Rationale**: `domain/resolve-design.ts`, `invitations/application/invitation-publication.service.ts` và public controller hiện publish scene đã resolve. `WeddingData` và `weddingAssetIds` chỉ có bride/groom/couple.photo. Asset kinds/mime không hỗ trợ audio. Phạm vi đổi layout không đòi đổi dữ liệu Customer.
**Alternatives considered**: Public đọc lại template draft gây drift; resolve riêng hai scenes nhân đôi identity; thêm collection media mở rộng phạm vi/backend/data không được yêu cầu.

## R6 — Publication và measurement version-aware

**Decision**: V1 giữ đo box/canvas; v2 đo DOM flow sau font/image/background readiness tại390 và900. Cả hai phải pass functional variants hiện có. Thumbnail vẫn390×520 normal frozen state, cover override/catalog contract giữ nguyên. Harness handshake có version riêng và report width/hash/scene pair/rect chính xác.
**Rationale**: `renderer/measure.ts` hiện dùng absolute corners; `capture-harness.tsx` và `publication/chromium-renderer.ts` hardcode version1/width390. V2 height tăng là hợp lệ, không xem là overflow. Validation chỉ390 bỏ sót desktop.
**Alternatives considered**: Screenshot-only không phát hiện clipping/focus; v1 geometry measurement không hiểu flow; width768 đủ cho breakpoint nhưng không chứng minh desktop900. Matrix rộng kiểm bằng browser suite, trusted publish đo canonical widths.

**Budget decision**: Giữ capture timeout30s, worker lease45s và job deadline90s làm baseline. Hai width/state passes cần dùng chung bounded capture session và đo worst-case. Không reset timeout30s cho từng pass để vô tình vượt job deadline; heartbeat/fencing phải còn đúng. Nếu không đạt, dừng publication và ghi evidence để review thay budget; thay deadline cần migration CHECK và queue tests, không âm thầm tăng.

## R7 — Assets và diagnostics

**Decision**: Traversal v2 duyệt root/sections/nodes/background/artwork/binding fallbacks; retained refs gồm mọi authored references còn cần cho draft/revision/job, kể cả hidden/fallback; resolved public allowlist chỉ gồm reachable nodes sau pruning. Asset identity/visibility chung hai layouts. Issues bổ sung sectionId/layout nhưng giữ max100 và sanitation phù hợp.
**Rationale**: `asset-reference.service.ts` và `visible-scene-assets.ts` hiện flat. Chỉ duyệt flat ROOT bỏ sót nested section/background/artwork/fallback và có thể cleanup hoặc chặn asset hợp lệ. Worker sanitize issues cần hiểu UUID section và path mới.
**Alternatives considered**: Cho phép tất cả draft assets gây leak; refs chỉ ở current width sai cleanup; diagnostics chỉ code không chỉ được section/layout cho Admin.

## R8 — Authoring và rollout

**Decision**: Giữ Craft/Moveable cho v1; v2 dùng state/commands theo schema riêng, section presets và typed property panels. Layout toggles dành Admin; Customer chỉ data. V2 content primitives intrinsic; artwork geometry trong section. Duplication tạo IDs mới và remap mọi refs/order.
**Rationale**: `editor/craft-adapter.ts` export schema1, ROOT flat và geometry panels hiện dành canvas. Ép section vào flat model tạo conversion ngầm. Shared widgets có thể reuse logic nhưng `height:100%`/wrapper fixed trong renderer hiện tại cần tách cho v2.
**Alternatives considered**: Đổi editor v1 toàn bộ rủi ro legacy; reuse v1 geometry cho content không reflow; conversion automatic y-position thiếu semantic section boundaries.

## R9 — Cache và rollout compatibility

**Decision**: Giữ current-release publicVersion asset URLs và no-store hiện có; không thêm cache framework. Upgrade readers trước writers, manual revision mới, không tự repin. Rollback chỉ dùng reader hỗ trợ v2 khi v2 đã tồn tại.
**Rationale**: Public controllers bảo vệ current publication và versioned asset access. Render contract2 cần có trong snapshot để không mất layout khi finalization.
**Alternatives considered**: Cache width-independent screenshot sai output; v1-only rollback làm thiệp v2 hỏng; serving assets của old release trái policy hiện tại.

## Resolution status

Nested shapes, globals and numeric limits đã được chốt theo user approval ngày2026-10-11; không phải chức năng đã implement. Gate A phải xác minh browser/container behavior và performance trước chốt contract. Nghiên cứu dựa trên local working tree ngày2026-10-11 và chuẩn CSS chính thức; không khảo sát lại các website tham chiếu trong tài liệu nguồn.

## Remediation resolution — 2026-10-11

- I1: web-owned test-only Vite host provisioned/smoke-tested at T005/T006, before prototype/rendering tests. No dependency on trusted capture2, Next test route or ui-prototype application runtime.
- I2: separate persistence migration/reference races(T031) from full publication races(T032/T033), explicit gate manifest membership.
- I3: mandatory production parity Customer preview/public, Admin preview/public at authoring; prototype demo/popup excluded.
- U1: exact nested layouts/override placement/merge/resolved fields and example in document-v2.md.
- U2: legacy global invitationRenderer stays version1; new invitationRendererV2 advertises protocol2 and supported pairs; strict request/report correlation/geometry.
- I4: shared asset identity/visibility across layouts; nested hidden/fallback retention separated from resolved public allowlist. No desktop-only assets.

Alternatives rejected: modifying trusted capture early conflates test modes with publication security; adding production demo/discovery expands scope; breakpoint-only media creates extra responsive content/asset rules beyond007. These decisions close document findings; real compatibility/browser/performance checks await implementation.
