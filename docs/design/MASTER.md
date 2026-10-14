# Design System v1 — Master

## Authority & Change Control

`docs/design/MASTER.md` là UI/UX source of truth cho online invitation platform. V1 tập trung vào wedding invitations; shared product architecture MUST hỗ trợ mở rộng occasion trong tương lai. Tài liệu này mô tả quyết định đã duyệt và hướng dẫn implementation, không xác nhận rằng mọi capability đã tồn tại.

- **MUST / MUST NOT:** yêu cầu bắt buộc / điều cấm.
- **SHOULD / SHOULD NOT:** hướng dẫn mặc định, chỉ lệch khi có lý do cụ thể được ghi nhận.
- **MAY:** tùy chọn trong phạm vi design đã duyệt.
- Giá trị ghi “khoảng”, “gợi ý” hoặc “approximately” là hướng dẫn, không phải constraint tuyệt đối.

Future agents MUST NOT âm thầm đổi color, typography, radius, spacing, shadow, button, form, motion, responsive philosophy hoặc editor interaction model. Khi có conflict, MUST: xác định conflict, giải thích nguyên nhân, đề xuất thay đổi nhỏ nhất và chờ explicit approval trước khi sửa design system.

Creative freedom được phép trong section composition, editorial layout, template presentation, micro-layout, restrained decoration và content hierarchy. Creative freedom MUST NOT tạo một visual language thứ hai cho platform.

**Approved refinement — 2026-10-06:** Customer MUST chỉ sửa invitation data; MUST NOT sửa layout/style/binding, đúng feature `004-invitation-builder`. Quyết định này thay thế các gợi ý Customer Design settings và section reordering trước đó. Template design thuộc Admin Template Authoring; thêm backend support không tự cấp quyền design editing cho Customer.

### Approved Change B01 — Functional Input Boundary

**Approved:** 2026-10-06, project owner trong conversation, qua chỉ dẫn “cứ xử lí như bạn đề xuất” đối với đề xuất B01 ngay trước đó. Approval chỉ cho narrow input-boundary rule và documentation; không authorize application implementation/backend changes hoặc waive verification.

Enabled platform input có border là sole meaningful boundary MUST dùng component alias `--color-control-border: var(--color-primary)` cho default boundary, thay cho pale `--color-border`. Baseline `--color-border: #E5DCCE` giữ nguyên cho decorative borders/dividers. White background, height 44px, radius 8px, typography và focus treatment giữ nguyên. Rule này không áp dụng vào invitation template design hoặc cấp Customer design-editing permissions.

Đây là approved refinement của Clean Outlined, nhằm đáp ứng meaningful control contrast ≥3:1 khi applicable. Approval không đồng nghĩa actual rendered control đạt accessibility PASS; MUST đo actual adjacent surfaces và kiểm states. Scope không mở rộng sang blanket recoloring mọi button/card/control.

## Quick Reference

| Hạng mục          | Quyết định / quy tắc                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Identity          | Warm Editorial; Elegant, Calm, Emotional, Modern, Personal; premium nhưng không phô trương luxury |
| Product           | Wedding-first, not wedding-locked                                                                 |
| Platform surfaces | Khoảng 85–90% warm white / ivory / beige / neutral                                                |
| Core colors       | Background `#FDFBF7`; Primary `#66584A`; Text `#29251F`; Accent `#B69A72` dùng ít                 |
| Typography        | Cormorant Garamond cho editorial; Be Vietnam Pro cho product/UI                                   |
| Density           | Browsing rộng thoáng; editing hiệu quả                                                            |
| Containers        | Reading 720px; Editorial 1120px; Page/Gallery 1280px; Editor dùng viewport                        |
| Radius            | Tooltip 6px; Button/Input 8px; Image/Popover 10px; Card 12px; Modal 16px                          |
| Depth             | Border/spacing trước shadow; TemplateCard không shadow mặc định                                   |
| Forms             | Clean Outlined; input 44px; visible label; inline error                                           |
| Icons             | Lucide; currentColor; khoảng 1.75px stroke; 16/18/20/24px                                         |
| Motion            | Elegant Editorial; easing `cubic-bezier(0.22, 1, 0.36, 1)`; reduced-motion                        |
| Discovery         | Curated Cover 4:5 → Detail → Live Preview → Dùng mẫu này                                          |
| Editor            | Guided Contextual Editor; edit invitation data, not pixels                                        |
| Feedback          | Autosave = local status; validation = inline; publish = dedicated success state                   |
| Mobile            | Đổi interaction model; published invitation được ưu tiên chất lượng cao nhất                      |
| Architecture      | Shared Template Renderer nơi khả thi; backend contracts là source of truth                        |

## Design Philosophy & Product Direction

Platform cung cấp online invitations. V1 marketing MAY hướng mạnh đến weddings. Future occasions có thể gồm Birthday, Baby / first birthday, Housewarming, Christmas, Engagement và các events khác.

Shared frontend architecture, components, route concepts, design primitives và domain terminology MUST occasion-neutral, trừ phần thực sự wedding-specific. Ưu tiên `Invitation`, `Template`, `TemplateCard`, `TemplateGallery`, `TemplateRenderer`, `TemplatePreview`, `Collection`, `Occasion`, `InvitationEditor`. MUST NOT đặt shared abstraction thành `WeddingCard`, `WeddingGallery`, `WeddingEditor` hoặc `WeddingTemplateRenderer` nếu không thực sự chỉ dành cho weddings.

Experience progression:

| Surface            | Trải nghiệm                           |
| ------------------ | ------------------------------------- |
| Marketplace        | Emotional / Editorial / Inspirational |
| Template Preview   | Immersive / Product-focused           |
| Editor + Dashboard | Clear / Efficient / Predictable       |

Các nguyên tắc cốt lõi:

1. Invitation là visual hero.
2. “Serif tells the story. Sans-serif runs the product.”
3. “Browsing needs space. Editing needs efficiency.”
4. “Edit invitation data, not pixels.”
5. Responsive thay interaction model, không chỉ thu nhỏ desktop.
6. Accessibility là design constraint, không phải bản vá sau development.
7. Motion truyền đạt hierarchy, state hoặc delight.
8. Ưu tiên restraint thay vì decoration không cần thiết.
9. Nếu spacing/border đủ thể hiện hierarchy, không thêm shadow.
10. Nếu typography đủ tạo personality, không thêm decoration không cần thiết.

Platform MUST NOT mang cảm giác generic SaaS dashboard, Canva clone, pink wedding website, traditional luxury wedding site hoặc generic template marketplace.

## Foundations / Tokens

### Color System — Warm Ivory

Các màu dưới đây thuộc **platform chrome**, không áp đặt lên invitation templates.

| Token / vai trò      | Giá trị   | Cách dùng                   |
| -------------------- | --------- | --------------------------- |
| Background           | `#FDFBF7` | Main platform surface       |
| Soft Background      | `#F8F4ED` | Secondary surface / section |
| Beige                | `#F1EAE0` | Neutral grouping            |
| Border               | `#E5DCCE` | Surface separation          |
| Primary / Warm Mocha | `#66584A` | Main action, focus          |
| Primary Hover        | `#54483D` | Primary hover               |
| Main Text / Espresso | `#29251F` | Main readable content       |
| Muted Text / Taupe   | `#756E65` | Secondary content           |
| Accent / Champagne   | `#B69A72` | Restrained editorial accent |

Khoảng 85–90% platform UI SHOULD nằm trong warm white / ivory / beige / neutral surfaces. Mocha/dark text cung cấp contrast; Champagne MUST dùng sparingly. MUST NOT dùng excessive pink, gold everywhere, neon, excessive gradients, gradient CTAs, colored shadows hoặc glassmorphism.

### Semantic Colors

| State               | Text / icon | Background | Copy example        |
| ------------------- | ----------- | ---------- | ------------------- |
| Success / Published | `#52705A`   | `#EEF4EF`  | Đã lưu; Đã xuất bản |
| Warning             | `#8A6A32`   | `#F8F2E6`  | Cần kiểm tra        |
| Error               | `#A34F4F`   | `#F9EEEE`  | Lưu thất bại        |
| Info                | `#526A7A`   | `#EDF2F5`  | Thông tin hỗ trợ    |
| Neutral / Draft     | `#756E65`   | `#F3F0EB`  | Bản nháp            |

Color hỗ trợ status, MUST NOT là tín hiệu duy nhất. Kết hợp text với appropriate Lucide icon/status shape. Các ký hiệu “✓ Đã lưu”, “● Đã xuất bản”, “◐ Bản nháp”, “⚠ Lưu thất bại” minh họa ý nghĩa; MUST NOT dùng emoji để thay functional icon system.

### Typography

**Cormorant Garamond** SHOULD dùng cho Hero, Marketing H1/H2, editorial headings, collection titles và brand statements. **Be Vietnam Pro** MUST dùng cho body copy, navigation, buttons, inputs, labels, Dashboard, Editor, Modal, Dropdown, Tooltip, metadata và functional information.

| Editorial role | Font size | Line-height | Weight                   |
| -------------- | --------- | ----------- | ------------------------ |
| Display XL     | 72px      | 0.98        | Khoảng 500               |
| Display        | 60px      | 1.0         | Theo editorial hierarchy |
| H1             | 48px      | 1.05        | Theo editorial hierarchy |
| H2             | 40px      | 1.1         | Theo editorial hierarchy |
| H3             | 32px      | 1.15        | Theo editorial hierarchy |
| H4             | 24px      | 1.2         | Theo editorial hierarchy |

| UI / body role | Font size | Line-height            |
| -------------- | --------- | ---------------------- |
| Body Large     | 18px      | 1.6                    |
| Body           | 16px      | 1.6                    |
| Body Small     | 14px      | 1.5                    |
| Label          | 14px      | 1.4                    |
| Button         | 14–15px   | Phù hợp control height |
| Caption        | 12px      | 1.4                    |

Responsive typography SHOULD dùng fluid techniques khi phù hợp:

```css
/* Hero example: khoảng 48px mobile, 56–64px tablet, 72px desktop */
font-size: clamp(3rem, 5.5vw, 4.5rem);
```

Application UI headings SHOULD dùng Be Vietnam Pro. Ví dụ “Thông tin cặp đôi”: 18px, weight 600. MUST NOT dùng Cormorant Garamond chỉ vì element là heading. Visual role và semantic heading level là hai quyết định riêng; MUST giữ logical heading hierarchy.

### Spacing / Adaptive Density

Approved spacing scale: **4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 120px**.

| Surface          | Density guidance                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| Marketplace      | Section vertical spacing 96–120px; card gap 24–32px; heading → body 16–20px; heading → grid 40–48px     |
| Template listing | Section vertical spacing khoảng 64px; grid gap khoảng 24px; filters → grid khoảng 32px                  |
| Dashboard        | Page padding 24–32px; card gap 16–24px                                                                  |
| Editor           | Panel padding khoảng 16px; field gap 12–16px; group gap khoảng 24px; toolbar khoảng 56px; input 40–44px |

### Containers / Grid

| Container      | Max width |
| -------------- | --------- |
| Reading        | 720px     |
| Editorial      | 1120px    |
| Page / Gallery | 1280px    |
| Full bleed     | 100%      |

| Viewport   | Horizontal page padding |
| ---------- | ----------------------- |
| ≥ 1280px   | 32px                    |
| 768–1279px | 24px                    |
| < 768px    | 16px                    |

Desktop grid SHOULD dùng 12 columns, gutter khoảng 24px. Full-width section backgrounds MAY có inner content theo container. Editor là workspace và SHOULD dùng available viewport thay normal page container.

### Radius — Soft Editorial

| Surface            | Radius |
| ------------------ | ------ |
| Tooltip            | 6px    |
| Button / Input     | 8px    |
| Image              | 10px   |
| Dropdown / Popover | 10px   |
| Card               | 12px   |
| Modal              | 16px   |

Template cover/image dùng khoảng 12px theo Gallery Card pattern. `rounded-full` SHOULD chỉ dùng cho avatar, status dot và genuine pill. MUST NOT mặc định `rounded-3xl` cards hoặc pill-shaped CTA.

### Shadow / Depth — Subtle Lift

| Surface                          | Shadow                          |
| -------------------------------- | ------------------------------- |
| Button / Input                   | None                            |
| TemplateCard                     | None mặc định                   |
| Navbar                           | None ban đầu; MAY xs sau scroll |
| Card hover                       | xs hoặc sm nếu cần              |
| Dropdown / Popover / Date picker | sm                              |
| Modal                            | md                              |
| Editor preview / canvas          | sm                              |

Nếu border hoặc spacing đủ thể hiện hierarchy, SHOULD NOT dùng shadow. MUST NOT dùng shadows trên mọi card, colored shadows, glow, neumorphism hoặc huge blurred shadows.

### Icons / Editorial Decoration

Functional icons MUST dùng Lucide, `currentColor`, stroke khoảng 1.75px, kích thước thông dụng 16/18/20/24px. MUST NOT dùng emoji như UI icons, trộn nhiều icon libraries không có lý do, đặt sparkle khắp nơi hoặc icon trong mọi heading.

Brand/emotional decoration MAY dùng custom editorial SVG: botanical line, small star, floral stroke, curved line, monogram, abstract arch. Landing page SHOULD chỉ có khoảng 2–4 meaningful decorative moments. Invitation template có creative freedom riêng.

### Motion — Elegant Editorial Motion

| Interaction       | Duration guidance |
| ----------------- | ----------------- |
| Micro interaction | 150–200ms         |
| Dropdown          | 150–200ms         |
| Modal             | 200–250ms         |
| Card image        | 250–300ms         |
| Section reveal    | 350–450ms         |
| Hero entrance     | 450–600ms         |

Preferred easing: `cubic-bezier(0.22, 1, 0.36, 1)`. TemplateCard hover MAY scale image 1 → khoảng 1.02 và fade favorite control. Section reveal MAY dùng opacity 0 → 1, translateY khoảng 12px → 0. MUST NOT animate từng element từ nhiều hướng khác nhau.

Marketplace MAY dùng emotional motion nhiều hơn; Editor MUST restrained và functional. Motion MUST thể hiện hierarchy, state hoặc delight mà không trì hoãn interaction. Với `prefers-reduced-motion: reduce`, non-essential motion MUST được tắt hoặc giảm.

### Baseline CSS Variables

Đây là approved baseline. Snippet là documentation reference, không phải file stylesheet được tạo trong bước này.

```css
:root {
  /* Colors */
  --color-background: #fdfbf7;
  --color-background-soft: #f8f4ed;
  --color-beige: #f1eae0;
  --color-border: #e5dcce;

  --color-primary: #66584a;
  --color-primary-hover: #54483d;

  --color-text: #29251f;
  --color-text-muted: #756e65;
  --color-accent: #b69a72;

  /* Semantic */
  --color-success: #52705a;
  --color-success-bg: #eef4ef;

  --color-warning: #8a6a32;
  --color-warning-bg: #f8f2e6;

  --color-error: #a34f4f;
  --color-error-bg: #f9eeee;

  --color-info: #526a7a;
  --color-info-bg: #edf2f5;

  --color-neutral: #756e65;
  --color-neutral-bg: #f3f0eb;

  /* Radius */
  --radius-xs: 6px;
  --radius-sm: 8px;
  --radius-md: 10px;
  --radius-lg: 12px;
  --radius-xl: 16px;

  /* Shadows */
  --shadow-xs: 0 1px 2px rgb(41 37 31 / 0.04);
  --shadow-sm: 0 4px 12px rgb(41 37 31 / 0.06);
  --shadow-md: 0 12px 32px rgb(41 37 31 / 0.08);

  /* Containers */
  --container-reading: 720px;
  --container-editorial: 1120px;
  --container-page: 1280px;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
  --space-24: 96px;
  --space-30: 120px;

  /* Motion */
  --duration-fast: 150ms;
  --duration-normal: 200ms;
  --duration-slow: 300ms;
  --duration-reveal: 400ms;

  --ease-editorial: cubic-bezier(0.22, 1, 0.36, 1);
}
```

Future implementation SHOULD reference baseline tokens thay vì rải raw values trong components. Có thể thêm semantic/component aliases khi có actual reuse, nhưng MUST giữ approved values và ý nghĩa. Ví dụ:

```css
/* Alias example; không phải token mechanism đang tồn tại trong repository */
--button-primary-bg: var(--color-primary);
--button-radius: var(--radius-sm);
--editor-panel-padding: var(--space-4);
```

Nếu dùng framework theme/token mechanism trong tương lai, MUST map các vai trò tương ứng đến baseline này, không thay bằng framework defaults. Không tự thêm dark platform theme hoặc font system khác. Template theme độc lập với platform theme.

## Components & Interaction Patterns

### Buttons

| Variant     | Appearance / behavior                                                                        |
| ----------- | -------------------------------------------------------------------------------------------- |
| Primary     | Background `#66584A`; white text; hover `#54483D`; radius 8px; height khoảng 46px; no shadow |
| Secondary   | Transparent hoặc white background; border `#E5DCCE`; text `#29251F`                          |
| Ghost       | Lightweight secondary action                                                                 |
| Destructive | Muted semantic red, khoảng `#A34F4F`                                                         |

MUST NOT dùng gradient, glow, default shadow, excessive hover scaling hoặc pill-shaped primary CTA mặc định. Control states MUST có visible focus; unavailable actions SHOULD có disabled state rõ và lý do nếu cần để hiểu bước tiếp theo.

### Forms — Clean Outlined

Standard input: height 44px, white background, radius 8px, text `#29251F`, placeholder khoảng `#9A938B`. Editor MAY dùng height 40–44px theo density. Border theo approved B01: enabled platform input có border là sole meaningful boundary MUST dùng `--color-control-border` (Primary / Warm Mocha); pale `#E5DCCE` giữ cho decorative separation hoặc composition không dùng nó làm sole meaningful boundary và đã verify contrast khi applicable.

```css
/* Approved B01 component alias; documentation reference */
:root {
  --color-control-border: var(--color-primary);
}
/* Enabled platform input khi border là sole meaningful boundary:
   border: 1px solid var(--color-control-border); */
```

B01 không thay focus treatment hoặc quy tắc errors/disabled states. Visible label và focus ring MUST NOT được dùng để waive contrast của unfocused meaningful boundary.

Focus dùng border `#66584A` và subtle 2px focus ring. Labels MUST visible phía trên input; placeholder MUST NOT là label duy nhất. Helper/error text nằm dưới field. Validation errors MUST có text và accessible association, MUST NOT chỉ là red border.

Forms SHOULD visually restrained. Personality đến từ typography, imagery, composition, color và spacing, không từ unusual controls.

### Navbar — Classic Marketplace

Desktop concept: Logo → “Mẫu thiệp”, “Bộ sưu tập”, “Cảm hứng” → Favorite và account actions. Height khoảng 72px; Warm Ivory/warm neutral; sticky; no initial shadow; MAY subtle bottom border và rất nhẹ khi scrolled.

- Before login: “Đăng nhập” và primary CTA “Tạo thiệp”; MUST NOT có hai competing large CTAs.
- After login: Favorite, “Thiệp của tôi”, account/avatar.
- Editor MUST có workspace toolbar riêng; MUST NOT reuse marketplace navbar.

### TemplateCard — Gallery Card

Image là ưu tiên. Default card: transparent background, no border, no shadow. Template image radius khoảng 12px. Title dùng main text; metadata dùng muted text; price dùng dark text nếu pricing tồn tại.

Hover MAY scale image khoảng 1.02, reveal favorite control và pointer cursor. Favorite MUST vẫn accessible bằng keyboard và touch; essential functionality MUST NOT hover-only.

MUST NOT đặt large “Dùng mẫu này” CTA trên mọi card. Preferred flow: Card → Template Detail / Preview → “Dùng mẫu này”. Card SHOULD như design gallery, không như information-heavy ecommerce product card.

### Badges

Editorial badge: height 24–26px, horizontal padding khoảng 8px, radius khoảng 6px, font 12px / weight khoảng 500, internal gap khoảng 5px. SHOULD NOT biến mọi badge thành large rounded pill. Status MUST có readable text cùng color support.

### Overlay / Surface Strategy — Context-Aware Surfaces

| Task                                           | Surface                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| Quick Choice                                   | Popover                                                            |
| Important Decision                             | Modal                                                              |
| Complex Secondary Task                         | Drawer                                                             |
| Mobile Complex Task                            | Bottom Sheet / Full-screen Sheet                                   |
| Date / font / color picker                     | Popover                                                            |
| Card “...”                                     | Dropdown                                                           |
| Delete invitation / leave with unsaved changes | Modal                                                              |
| Media library / complex template filters       | Drawer                                                             |
| Mobile filters                                 | Bottom Sheet                                                       |
| Mobile editor editing panel                    | Full-screen Sheet cho complex task; Bottom Sheet cho task đơn giản |

SHOULD dùng lightest surface hoàn thành được task mà không mất context. SHOULD NOT dùng nested modals. Overlay MUST hỗ trợ keyboard/focus phù hợp với surface, accessible name và close/return behavior.

### Feedback — Contextual Feedback

| Situation             | Pattern                            |
| --------------------- | ---------------------------------- |
| Field problem         | Inline feedback                    |
| Background process    | Local status                       |
| Simple global success | Toast                              |
| Critical failure      | Persistent alert / inline recovery |
| Important milestone   | Dedicated success state            |

- Autosave: local status, MUST NOT success toast cho mỗi lần save.
- Validation: inline errors; SHOULD NOT generic “form invalid” toast khi field errors đã visible.
- Copy link: toast “Đã sao chép liên kết” kèm appropriate success icon.
- Upload: local progress; failure có local error + “Thử lại”.
- Publish: meaningful success state “Xuất bản thành công”, “Thiệp của bạn đã sẵn sàng để chia sẻ.”, action “Sao chép liên kết”. MUST NOT chỉ dựa vào toast ba giây.

Toast guidance: width khoảng 320–400px, thích ứng viewport; radius khoảng 10px; shadow sm; padding 12–16px. Simple success khoảng 3s; info khoảng 4s; warning khoảng 5s; error persistent hoặc đủ lâu để recovery. MUST NOT dùng toast khi user phải thực hiện action trước khi tiếp tục.

### Empty States

SHOULD giải thích cái gì đang empty, vì sao có ý nghĩa và next action. MUST NOT chỉ có decorative illustration không có hướng đi.

> **Chưa có thiệp nào**  
> Bắt đầu với một mẫu bạn yêu thích và tạo lời mời đầu tiên của mình.  
> **[Khám phá mẫu]**

## Page Patterns / Media / User Flows

### Homepage — Wedding-first Editorial

V1 marketing SHOULD tập trung mạnh vào weddings. Hero visual dùng Invitation Showcase với khoảng 3–5 invitation previews; middle invitation MAY dominant; side cards MAY rotation cực nhẹ. MUST NOT dùng full-screen stock bride/groom photograph làm primary hero. Templates là hero, interactive editor/demo đặt thấp hơn trên page.

Suggested copy:

> **Lời mời cho ngày mình về chung đôi.**  
> Tạo nên tấm thiệp cưới mang câu chuyện và dấu ấn của riêng hai bạn.  
> **[Khám phá mẫu cưới]**

Suggested homepage flow:

1. Navbar.
2. Invitation Showcase Hero.
3. Wedding styles / categories.
4. Featured Wedding Collection.
5. Brand Statement.
6. Popular Wedding Templates.
7. How It Works: “Chọn mẫu” → “Cá nhân hóa” → “Chia sẻ”.
8. Collection Story.
9. Interactive Preview.
10. New / Trending.
11. Final CTA.
12. Footer.

### TemplateGallery — Hybrid

Homepage SHOULD dùng editorial/asymmetric featured compositions. `/templates` listing MUST dùng consistent uniform grid optimized for discovery. “Home creates desire. Listing helps users find.”

Future-ready filters MAY gồm search, category, style, color, free/premium, orientation, sort và occasion. Đây là capability directions, không phải khẳng định backend hỗ trợ; MUST inspect contracts trước integration.

### Media — Curated Cover + Live Preview

Marketplace template cover: ratio **4:5**, radius khoảng **12px**, `object-fit: cover`. Thumbnail SHOULD thể hiện visual identity của template; MUST NOT nhét toàn bộ long invitation website vào tiny thumbnail.

Flow: Curated Cover → Template Detail → Live Template Renderer. Homepage MAY mixed editorial compositions; listing MUST consistent.

User-uploaded images SHOULD được trình bày theo appropriate modes: Original, Portrait, Landscape, Square do template/Admin định nghĩa. Customer chọn/upload ảnh như data, MUST NOT đổi authored presentation mode, crop/focal positioning hoặc geometry của template. Template MAY định nghĩa:

| Placement | Presentation example |
| --------- | -------------------- |
| Hero      | 16:9 / cover         |
| Portrait  | 4:5                  |
| Gallery   | Mixed                |
| Avatar    | 1:1                  |
| Story     | 3:4                  |

Admin image tooling SHOULD hỗ trợ focal point / crop positioning. MUST NOT tự động thêm gradient overlay hoặc shadow vào mọi image, apply beige filters, desaturate user photos hoặc thêm decorative borders khắp nơi.

### Template Detail / Preview

Approved pattern: **Split Live Preview + Fullscreen immersive preview**.

- Desktop: live invitation preview khoảng 65–70%; information/actions khoảng 30–35%.
- Information MAY gồm title, category/style, metadata, Desktop/Mobile preview switch, favorite và primary CTA “Dùng mẫu này”.
- MUST cung cấp “Xem toàn màn hình” để trải nghiệm gần published state.
- Fullscreen MAY có floating/sticky “Dùng mẫu này” khi phù hợp.
- Mobile MUST vertical layout, không giữ desktop split. Sticky bottom CTA MAY dùng nếu không che content.

### Dashboard — Hybrid Dashboard

V1 SHOULD ưu tiên “Thiệp của tôi”: visual invitation gallery với management metadata đủ dùng. Primary CTA: “Tạo thiệp”. Filters MAY gồm “Tất cả”, “Bản nháp”, “Đã xuất bản”. Card metadata MAY gồm title, status, last updated.

Secondary actions SHOULD trong contextual “...” menu: “Chỉnh sửa”, “Xem trước”, “Sao chép”, “Chia sẻ”, “Xóa”, khi capability thực sự tồn tại. MUST NOT đặt năm action buttons trên mọi card.

Architecture SHOULD future-ready cho Overview, Invitations, Guests, RSVP, Analytics, Settings. MUST NOT lấp V1 bằng empty SaaS widgets như “0 visitors”, “0 RSVP”, “0 guests” khi functionality chưa meaningful.

### Core User Flows

```text
HOME → DISCOVER → /templates → TEMPLATE DETAIL → LIVE PREVIEW
     → DÙNG MẪU NÀY → CREATE INVITATION → EDITOR → PREVIEW → PUBLISH → SHARE

LOGIN → THIỆP CỦA TÔI → INVITATION → EDITOR
```

## Editor Patterns

### Guided Contextual Editor

Customer Editor MUST chỉnh structured invitation data, không phải Canva clone. Data có thể gồm couple names, wedding date, location, invitation message, story, schedule, gallery và RSVP, tùy actual template/backend support. Customer MUST NOT sửa layout/style/binding, kể cả colors, typography, section enable/disable hoặc section order. Các content fields chưa có contract MUST được ghi nhận thay vì invent schema.

V1 MUST NOT có free-position pixel editing cho ordinary invitation content: arbitrary x/y, layers panel cho ordinary content, manual z-index hoặc canvas coordinate editing. Customer MUST NOT reorder sections hoặc thay bản thiết kế được ghim. Chỉnh nội dung/thứ tự timeline entries là data editing theo contract, không phải section/layer reordering. Element tùy chọn thiếu data được renderer xử lý theo feature 004; Customer không có manual visibility control. Admin Template Authoring có layer/geometry capabilities riêng và không thuộc Customer Editor.

Desktop workspace:

```text
TOP BAR (~56px)
┌──────────────────┬─────────────────────────┬───────────────────────┐
│ Navigation rail  │ Contextual editing panel│ Large live preview    │
│ ~64–72px         │ ~300–360px              │ Remaining viewport    │
└──────────────────┴─────────────────────────┴───────────────────────┘
```

Possible Customer navigation: “Nội dung”, “Ảnh”, “RSVP”, “Cài đặt”, chỉ khi có actual capability. MUST NOT có Customer “Thiết kế” panel. Content groups MAY gồm “Thông tin cặp đôi”, “Ngày cưới”, “Địa điểm”, “Lời mời”, “Câu chuyện”, “Lịch trình”, “Album”, “Lời cảm ơn” khi actual data contract hỗ trợ. “Cài đặt” MUST không trở thành lối đi tới layout/style/binding editing.

Colors, heading/body font, enabled elements, layer order và template-supported design settings thuộc Admin Template Authoring. Customer MUST NOT chỉnh những thuộc tính này qua UI hoặc payload. Admin hỗ trợ nhập data cho Customer cũng MUST không mutate pinned design trong data-entry flow. MUST NOT trình bày controls cho unsupported capability như thể đã hoạt động.

### Autosave

SHOULD ưu tiên autosave với local status:

```text
Đang lưu... → [success icon] Đã lưu

[warning icon] Chưa thể lưu thay đổi
Thử lại
```

MUST NOT toast spam. Failure SHOULD giữ context và cung cấp retry. Future implementation MUST inspect save contract, validation và conflict behavior trước khi chọn autosave orchestration; không tự invent business rules hoặc dữ liệu đã lưu.

### Mobile Editor

MUST NOT thu nhỏ desktop workspace. Mobile concept: top bar → live preview → compact editor category navigation. Chọn category mở Bottom Sheet cho lightweight task hoặc Full-screen Sheet cho complex task.

MUST giữ khả năng hoàn thành core editing flow trên mobile. Responsive chọn đúng interaction model cho available space; không chỉ giảm kích thước panels.

## Responsive Behavior

| Surface              | Strategy                                                  |
| -------------------- | --------------------------------------------------------- |
| Marketplace          | Mobile-first responsive                                   |
| Published Invitation | Strongly mobile-first; chất lượng mobile ưu tiên cao nhất |
| Template Preview     | Mobile-first, thêm desktop/mobile simulation khi useful   |
| Dashboard            | Balanced responsive                                       |
| Editor               | Desktop-optimized, fully usable trên mobile               |

Typical marketplace grid: desktop khoảng 4 cards/row; tablet khoảng 3; mobile khoảng 2. MUST NOT ép số columns khi available width không phù hợp. Important viewport tests SHOULD gồm khoảng **360, 375, 390, 430, 768, 1440px**.

Controls, overlays và sticky CTAs MUST giữ usable content và actions ở viewport nhỏ; essential actions MUST không phụ thuộc hover. Một responsive philosophy MUST NOT áp dụng mù quáng cho toàn bộ application.

## Accessibility

Target: **Practical WCAG 2.2 AA**.

| Content                           | Contrast target      |
| --------------------------------- | -------------------- |
| Normal text                       | ≥ 4.5:1              |
| Large text                        | ≥ 3:1                |
| UI controls / meaningful graphics | ≥ 3:1 khi applicable |

Implementation MUST có semantic HTML, keyboard navigation, visible focus, logical heading hierarchy, proper form labels, accessible error messages, screen-reader accessible names, reduced-motion support và adequate touch targets.

Suggested focus:

```css
outline: 2px solid var(--color-primary);
outline-offset: 2px;
```

MUST NOT xóa focus indication nếu không có accessible replacement. Icon-only Favorite, Close, More menu, Back và Gallery navigation MUST có accessible names. Touch targets SHOULD thường tối thiểu khoảng 40–44px, kể cả visible icon nhỏ hơn.

### Published Invitation Accessibility

Templates có creative freedom nhưng functional content MUST readable/usable: date/time, venue, address, map link, RSVP, contact information và schedule.

Decorative/script typography MAY dùng cho emotional display, ví dụ couple names “Ngọc Ánh & Minh”. MUST NOT dùng hard-to-read script cho long addresses, RSVP instructions, schedules hoặc functional information khác. Template palette/layout/motion không được bỏ qua accessibility.

## Architecture Boundaries & Implementation Rules

### Platform vs Template

| Owner               | Responsibilities                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform            | Navbar, Marketplace, Dashboard, Editor chrome, Forms, Buttons, Dialogs, Filters, Status, Navigation, Accessibility và product feedback patterns; MUST theo Design System v1 |
| Invitation Template | Invitation-specific typography, palette, artwork, section composition, wedding imagery, animation và layout; có creative freedom trong constraints về functional usability  |

Templates MAY minimal ivory, black and white, traditional red, pastel, dark luxury, blue modern, Vietnamese traditional, floral hoặc style khác. MUST NOT buộc mọi template dùng Warm Ivory platform palette. Platform-owned controls nằm trong hoặc cạnh preview vẫn theo platform system.

### Shared Template Renderer

SHOULD dùng một shared Template Renderer nơi practical:

```text
                     Template Renderer
                     /       |       \
         Template Detail   Editor    Published Invitation
                |          Preview
         Fullscreen Preview
```

Preview MUST match published output. SHOULD NOT duplicate implementations gây khác nhau giữa Template Detail, Editor Preview và Published Invitation. Reuse cần bao gồm actual template rendering behavior, không chỉ appearance tương tự.

### Navigation / Information Architecture

V1 public navigation vẫn wedding-focused và đơn giản: “Mẫu thiệp”, “Bộ sưu tập”, “Cảm hứng”. Personal navigation MAY gồm “Yêu thích”, “Thiệp của tôi”, Account. Editor là contextual workspace; MUST NOT thêm “Editor” vào global navigation.

Conceptual route recommendations:

```text
/
/templates
/templates/:slug
/collections
/collections/:slug
/inspirations
/favorites
/dashboard
/invitations/:id/edit
```

Đây không phải approved route migration. Trước route changes, MUST inspect project và preserve valid behavior trừ khi migration được explicit approval. Typical entry: Template Detail → “Dùng mẫu này” → Create Invitation → Editor; hoặc “Thiệp của tôi” → Invitation → Editor.

Future occasion data MAY dùng `occasion = wedding`, sau đó `birthday`, `baby`, `housewarming`, `christmas`. Đây là architectural direction, không phải DTO field đang tồn tại. Future SEO routes MAY `/wedding`, `/birthday`, `/baby` mà không đổi core Invitation architecture.

### Backend Contracts

Backend là source of truth cho application contracts. Future frontend agents MUST inspect actual endpoints, DTOs, enums, authentication, authorization, validation, error responses, pagination, upload behavior, invitation schema và template schema trước integration.

MUST NOT invent API endpoints, DTO fields hoặc business rules để đáp ứng design. MUST NOT thay valid backend business behavior chỉ để frontend dễ hơn. Khi thiếu capability, ghi nhận thay vì giả vờ feature hoạt động:

```text
BLOCKED: Backend capability required

Feature:
    <Tên feature>
Required capability:
    <Capability còn thiếu>
Affected UI:
    <Screen / component chịu ảnh hưởng>
Suggested contract:
    <Đề xuất để review; không phải API đã tồn tại>
Reason:
    <Vì sao actual contract chưa đáp ứng>
```

### Reusability

SHOULD dùng reusable primitives và domain-neutral composition. SHOULD NOT tạo `HomeTemplateCard`, `SearchTemplateCard`, `WeddingTemplateCard` khi `TemplateCard` với composition/variants đủ. Không over-generalize prematurely; reuse theo actual product semantics.

## Anti-patterns

Các pattern sau MUST NOT được thêm, trừ khi future approved requirement override cụ thể:

| Nhóm         | Prohibited patterns                                                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Visual       | Excessive gradients; glassmorphism; neon; excessive pink; gold everywhere; shadows everywhere; huge blurred shadows; rounded-3xl everywhere; pill-shaped primary buttons everywhere; excessive floral decoration                     |
| Typography   | Serif cho ordinary form controls; decorative script cho functional information; quá nhiều font families; tiny low-contrast text                                                                                                      |
| UX           | Modal cho mọi interaction; toast cho mọi action; hover-only essential functionality; placeholder-as-label; color-only status; mobile là shrunk desktop                                                                               |
| Marketplace  | Stock wedding photography làm primary hero; CTA trên mọi TemplateCard; information-heavy ecommerce cards                                                                                                                             |
| Editor       | Canva clone; Customer sửa layout/style/binding hoặc section order/visibility; free-position canvas không explicit requirement; pixel positioning cho ordinary invitation content; unnecessary decorative motion; autosave toast spam |
| Architecture | Invented endpoints/DTOs/business rules; wedding-only coupling cho shared UI; unnecessary duplicate Template Renderers                                                                                                                |

## Implementation Notes / Open Questions

Các ghi nhận dưới đây dựa trên repository inspection ngày 2026-10-06, gồm cả working-tree changes đang có. Đây là compatibility notes, không phải approval để sửa code hoặc thay design. Future agents MUST kiểm tra lại actual state trước implementation.

| Ghi nhận                                                                                                                                                                                                                                    | Hướng xử lý cho future implementation                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend dùng Next.js 16, React 19, TypeScript; `apps/web/package.json` chưa khai báo Tailwind, shadcn/ui hoặc Lucide. Chưa thấy shared platform token stylesheet.                                                                          | Baseline map trực tiếp sang CSS custom properties; nếu chọn theme mechanism sau này, map tương đương. Lucide/font integration cần implementation riêng; không giả định dependency đã có. Đọc `apps/web/AGENTS.md` và relevant local Next.js docs trước code changes. |
| Root layout chưa thiết lập approved platform font pairing. Invitation renderer có Noto Sans/Noto Serif registry riêng.                                                                                                                      | Tích hợp Cormorant Garamond/Be Vietnam Pro cho platform; MUST không âm thầm thay invitation font IDs hoặc renderer font readiness contract. Hai phạm vi typography độc lập.                                                                                          |
| Customer Invitation Editor dùng structured data; Admin Template Editor hiện có Craft.js, layers và geometry controls.                                                                                                                       | Quyết định chốt 2026-10-06 giữ rule của feature 004: Customer MUST NOT sửa layout/style/binding. Guided Contextual Editor chỉ tổ chức data-entry UX; MUST giữ Admin authoring capabilities riêng và không tự xóa chúng.                                              |
| Customer form hiện có “Lưu bản nháp”; autosave UX được duyệt chưa được xác nhận là đã implement.                                                                                                                                            | Inspect save endpoint, validation, error/conflict behavior và dirty navigation trước autosave implementation. Không tự đặt debounce hoặc conflict policy như business requirement.                                                                                   |
| Existing routes gồm `/templates`, `/invitations`, `/invitations/:id/edit`, `/invitations/:id/rsvps`, `/i/:slug` và admin routes. Conceptual `/dashboard`, detail/collection/favorites/inspiration routes không phải hiện trạng đã xác nhận. | Preserve existing routes. Bất kỳ migration hoặc new capability cần scope/contract riêng; MUST không rename `/invitations` chỉ để khớp conceptual diagram.                                                                                                            |
| `ScenePreview` và public invitation view đã dùng `InvitationRenderer`.                                                                                                                                                                      | Tận dụng shared renderer hiện có; kiểm chứng parity giữa actual preview contexts và published output, không tạo renderer thay thế chỉ vì redesign chrome.                                                                                                            |
| Existing data có `WeddingData`, bride/groom bindings và wedding-specific schema.                                                                                                                                                            | Occasion-neutral shared UI naming không đồng nghĩa schema migration được duyệt. Giữ actual backend contracts; ghi riêng compatibility work khi future occasion support yêu cầu.                                                                                      |
| Palette có pale borders, muted/accent/placeholder colors; không phải mọi foreground/background pairing đều mặc nhiên đạt AA.                                                                                                                | Kiểm tra contrast theo actual usage, đặc biệt functional control boundaries, small text và semantic states. Nếu approved styling không đạt target trong context cụ thể, ghi conflict và đề xuất smallest change theo change control; không âm thầm đổi baseline.     |

Việc có design pattern không chứng minh có backend capability. Filters, pricing, favorites, duplication, Admin crop/focal point và autosave MUST được đối chiếu contract riêng trước integration. Customer design editing là prohibited, không phải capability đang chờ backend support. Inspection trong bước documentation không phải full backend capability audit.

## Final Design Check

Trước khi approve major frontend design, hỏi:

1. Invitation có còn là visual hero không?
2. Trải nghiệm có warm/editorial thay vì SaaS-like không?
3. Interaction có đơn giản hơn visual treatment không?
4. Trải nghiệm có còn usable trên mobile không?
5. Shared component này có còn hợp lý cho birthday invitation trong tương lai không?

Nếu câu 5 là “không”, MUST kiểm tra component có bị wedding-locked ngoài ý muốn hay thực sự wedding-specific.

## Definition of Done

Checklist dùng cho future screen implementation; không yêu cầu triển khai application trong bước documentation này.

- [ ] Đã đọc MASTER và actual repository contracts; không invent endpoints, DTOs hoặc business rules.
- [ ] Platform dùng approved palette, font roles, spacing, radius, shadows và motion; mọi deviation có explicit approval khi cần.
- [ ] Invitation là visual hero; chrome restrained; template creative freedom không bị Warm Ivory ép buộc.
- [ ] Component names/reuse occasion-neutral theo actual semantics; wedding-specific data contracts được giữ đúng.
- [ ] Page đúng pattern tương ứng; discovery, preview, editing và management có hierarchy/action rõ.
- [ ] Gallery covers consistent 4:5; detail/live/fullscreen preview dùng shared renderer nơi practical và match published output.
- [ ] Customer Editor chỉ chỉnh structured data, MUST NOT sửa layout/style/binding, section order/visibility hoặc pinned design; desktop/mobile dùng đúng interaction models; Admin authoring vẫn riêng biệt.
- [ ] Empty/loading/error/success states phù hợp actual flow; autosave local status, validation inline, publish meaningful success state.
- [ ] Forms có visible labels và accessible errors; icon-only actions có names; essential functionality dùng được bằng keyboard và touch.
- [ ] Contrast, focus, heading hierarchy, semantic HTML, touch targets và reduced motion được kiểm tra; functional invitation content readable.
- [ ] Kiểm tra viewports khoảng 360/375/390/430/768/1440px; published invitation có mobile quality cao nhất; sticky elements không che content/actions.
- [ ] Routes, authentication/authorization và valid backend behavior được preserve trừ migration được approved.
- [ ] Unsupported capabilities ghi `BLOCKED: Backend capability required`; technical conflicts ghi rõ, không giải bằng invented behavior.
- [ ] Cả năm câu Final Design Check đã được review; không có prohibited anti-pattern chưa được override.

## Approved editor layout refinement — 2026-10-12

The user explicitly requested the Cinelove new-blank layout from four supplied screenshots. Feature008 therefore scopes a white/gray/blue studio skin to the single500 editor: compact64px header,84px rail,334px collapsible library,340px properties panel, gray workspace and floating zoom. Original platform brand assets/fonts remain; global platform tokens and all other product surfaces retain the Warm Ivory system. Mobile tools continue to use accessible drawers with focus restoration. This supersedes earlier editor layout guidance only within this workspace.
