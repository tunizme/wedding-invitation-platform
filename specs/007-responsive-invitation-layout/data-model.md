# Data Model: Responsive Invitation Layout

Contract chi tiết tại [document-v2.md](contracts/document-v2.md). Nested wire shape/merge semantics đã chốt trong contract theo remediation ngày2026-10-11; chưa implementation.

## Versioned documents

- `TemplateDesignV1`: nguyên trạng schema1 với flat ROOT/canvas390.
- `TemplateDesignV2`: schema2, viewport policy, ordered section IDs, section map, leaf node map. Không serialize editor runtime.
- `WeddingData`: giữ schema1, bindings và validation hiện có; không thêm album/audio fields.
- `ResolvedScene`: discriminated pair scene1/renderer1 hoặc scene2/renderer2. Scene2 giữ cấu trúc/layout và resolved content, không còn binding hoặc URL signed trong snapshot.

## Section and node relationships

Template → ordered section IDs → section flow node IDs/artwork IDs → leaf nodes. UUID globally unique giữa sections và leaf nodes; mỗi leaf thuộc đúng một section, đúng một role. ROOT không phải section. Thứ tự node giống ở hai layouts, grid không thay reading/tab order.

Section fields: id, label, hidden, mobile rule, desktop override, background, flowNodeIds, artworkNodeIds. Height content-driven; minHeight được phép cho hero nhưng không maxHeight/hard height. Artwork chỉ Image/Decoration/Shape, aria-hidden/pointer-events:none, có clip layer riêng. Text và functional widgets không được vào artwork role.

Leaf fields: id, type từ component catalog hiện có, content, bindings, appearance, optional/hidden/locked/layerName; layout mobile và desktop override theo role. Binding rules/fallback/required data giữ semantics v1. Section không chứa WeddingData riêng. Optional leaf thiếu data bị loại theo resolver; section không còn flow content bị bỏ (pilot không dùng decoration-only section). Một document sau resolve phải còn ít nhất một flow section; required binding thiếu vẫn chặn publication.

## Revisions, invitations and jobs

| Entity | Changes | Invariants |
| --- | --- | --- |
| InvitationTemplate | draft_document union1/2 | edit_version/CAS/status và sample_data1 giữ nguyên |
| TemplateDesignRevision | schema_version/renderer_contract_version1 hoặc2, document union | metadata đúng với JSON; revision bất biến; thumbnail contract giữ nguyên |
| Invitation | pinned revision có thể v1/v2, published_scene union | draft/public tách biệt; URL và owner không đổi; không tự repin |
| PublicationJob | candidate_document union, candidate_data1 | candidate hash bất biến, request_key idempotency, lease/retry/deadline/CAS giữ nguyên |
| Asset refs | traversal nested sections/nodes/backgrounds/fallbacks | retained draft/revision/job refs bao gồm hidden/fallback; public allowlist chỉ resolved reachable refs, không public private/unused asset |

## Validation and limits

- Document bytes≤1048576, weddingData≤262144; ≤40 sections, ≤200 leaf nodes, ≤30 widgets. Section nesting không cho phép; tránh recursion unbounded.
- Required section/node reference phải tồn tại; không duplicate, orphan, cycles, foreign parent hoặc ID role mismatch.
- Numeric values finite/bounded; allowed presets/styles/override keys rõ ràng; unknown fields bị từ chối cả hai app.
- Desktop override không được đổi id/type/content/binding/optional/hidden/role/order; không nhân đôi customer data.
- Actual width≤host; canonical measured height≤12000 ở390/900. Height giới hạn publication là resource bound, không CSS clipping. Long content vượt bound phải báo lỗi.
- Font IDs, colors, border/shadow, event/date/bank/catalog validators hiện có được reuse; no raw CSS/HTML/script/asset URL field.

## State transitions

Template DRAFT→PUBLISHED→UNPUBLISHED và invitation lifecycle giữ nguyên. Draft schema1 có thể được Admin tái author trong separate new template draft schema2; không inplace sửa revision immutable. Published candidate chỉ commit sau hai canonical reports pass; PENDING→RUNNING→SUCCEEDED/FAILED như hiện tại. Failed v2 job không đổi current revision/publicVersion/snapshot. Resize chỉ đổi presentation, không là persistence transition.

## Database evolution

Migration mới thay CHECK liên quan draft_document, revision document/schema_version/renderer_contract_version, candidate_document và published_scene. Giữ JSON type/byte checks, WeddingData1 checks, immutable revision triggers, foreign keys và trạng thái jobs. Cặp supported(1,1)/(2,2) phải khớp JSON; không chỉ nới `IN(1,2)` riêng rẽ. Existing rows giữ bytes/version/hash; không backfill scene và không chuyển mẫu bằng migration.

Integration test seed v1 trước upgrade, chạy migration, insert/save/publish hợp lệ cả hai version và reject mismatch/unknown trực tiếp ở PostgreSQL. Down migration đọc tất cả nơi có v2 và refuse trước mọi DDL nếu còn dữ liệu; không delete/truncate để downgrade. Exact constraint names lấy từ migrations/pg catalog khi implementation, không giả định tên CHECK tự sinh.

## Remediation invariants

Mobile/desktop leaf rules đặt tại `mobile.layout`/`desktop.layout`, typography/appearance overrides tách vào sibling keys theo exact contract. Resolved section/leaf shapes loại bỏ editor/hidden/binding metadata; preserve both rule sets. Asset identity/background/visibility chung hai layouts; không breakpoint-only media. Retention graph và public allowlist là hai projections khác nhau: giữ hidden/fallback assets khi còn authored reference, chỉ public resolved visible assets.

Persistence gate kiểm direct SQL scenes/version pairing và reference/delete races; published jobs/capture/finalizers được kiểm ở publication gate sau khi có đầy đủ pipeline.
