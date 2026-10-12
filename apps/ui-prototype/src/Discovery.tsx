import { useState } from 'react';
import {
  ArrowRight,
  Check,
  Expand,
  Search,
  ImagePlus,
  MapPin,
  MailCheck,
  Link2,
  Type,
  BookHeart,
  Heart,
} from 'lucide-react';
import { usePrototype } from './App';
import { resolveDesign } from '../../web/src/features/invitation-builder/document/resolve-design';
import { templates, assetUrls, AS_OF, sampleData } from './fixtures';
import { createQrModules } from '../../web/src/features/invitation-builder/document/qr-bank';
import { formFieldsForDesign } from '../../web/src/features/invitation-builder/document/binding-catalog';
import {
  Back,
  Button,
  Dialog,
  Empty,
  LivePreview,
  PageHeading,
  ScenarioContent,
  TemplateCard,
  TemplateCover,
} from './ui';

export function Home() {
  const { navigate, role } = usePrototype();
  return (
    <main tabIndex={-1} className="home">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">CHO NGÀY MÌNH VỀ CHUNG ĐÔI</p>
          <h1 className="editorial" tabIndex={-1}>
            Lời mời nhỏ.
            <br />
            Ngày <em>thật lớn.</em>
          </h1>
          <p>
            Từ những điều giản dị của hai bạn,
            <br className="desktop-only" /> tạo nên tấm thiệp mang một câu
            chuyện riêng.
          </p>
          <Button
            onClick={() =>
              navigate(role === 'CUSTOMER' ? '/templates' : '/login')
            }
          >
            Khám phá mẫu cưới <ArrowRight size={18} />
          </Button>
          <span className="hero-note">
            Chọn một mẫu. Thêm câu chuyện. Gửi lời thương.
          </span>
        </div>
        <div
          className="hero-showcase"
          aria-label="Ba phong cách thiệp minh họa"
        >
          {[templates[1], templates[0], templates[2]].map((template, i) => (
            <div key={template.id} className={`showcase-item showcase-${i}`}>
              <TemplateCover template={template} />
            </div>
          ))}
          <span className="showcase-caption">
            a little invitation, a beautiful beginning.
          </span>
          <svg className="botanical" viewBox="0 0 100 120" aria-hidden="true">
            <path
              d="M25 110Q58 67 57 12M48 67Q15 57 16 30Q45 35 48 67M55 43Q87 40 86 15Q62 19 55 43M38 89Q66 97 82 69Q52 69 38 89"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            />
          </svg>
        </div>
      </section>
      <section className="style-strip">
        <span>MỘT PHONG CÁCH, MỘT DẤU ẤN</span>
        {['Tối giản', 'Truyền thống', 'Thiên nhiên', 'Editorial'].map(
          (name) => (
            <button
              key={name}
              onClick={() =>
                navigate(role === 'CUSTOMER' ? '/templates' : '/login')
              }
            >
              {name}
              <ArrowRight size={15} />
            </button>
          ),
        )}
      </section>
      <section className="home-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">GỢI Ý TỪ TIỆM</p>
            <h2 className="editorial">Một lời mời vừa vặn với hai bạn.</h2>
          </div>
          <button
            className="text-link"
            onClick={() =>
              navigate(role === 'CUSTOMER' ? '/templates' : '/login')
            }
          >
            Khám phá kho mẫu <ArrowRight size={17} />
          </button>
        </div>
        <div className="template-grid">
          {templates.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      </section>
      <section className="brand-statement">
        <span className="eyebrow">KHÔNG CHỈ LÀ MỘT TẤM THIỆP</span>
        <h2 className="editorial">
          Là cách bạn nói:
          <br />
          <em>“Có bạn, ngày này sẽ đẹp hơn.”</em>
        </h2>
        <p>
          Ảnh của hai bạn. Những dòng kể của hai bạn.
          <br />
          Một lời mời được gửi đi bằng sự chân thành.
        </p>
      </section>
      <section className="home-section steps-section" id="how-it-works">
        <div className="section-heading">
          <div>
            <p className="eyebrow">TỪ Ý TƯỞNG ĐẾN LỜI MỜI</p>
            <h2 className="editorial">Ba bước. Một ngày đáng nhớ.</h2>
          </div>
        </div>
        <div className="steps">
          {[
            [
              '01',
              'Chọn một mẫu',
              'Tìm phong cách khiến hai bạn thấy mình trong đó.',
            ],
            [
              '02',
              'Thêm chuyện của bạn',
              'Điền tên, ngày hẹn, địa điểm và những bức ảnh yêu thích.',
            ],
            [
              '03',
              'Gửi lời thương',
              'Xem trước, xuất bản và gửi đường dẫn cho khách mời.',
            ],
          ].map(([number, title, text]) => (
            <article key={number}>
              <span className="step-number editorial">{number}</span>
              <h3>{title}</h3>
              <p className="muted">{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="final-cta">
        <p className="eyebrow">MỘT CHƯƠNG MỚI ĐANG CHỜ</p>
        <h2 className="editorial">Bắt đầu từ một lời mời.</h2>
        <Button onClick={() => navigate('/login')}>
          Tạo tấm thiệp của bạn <ArrowRight size={18} />
        </Button>
      </section>
    </main>
  );
}
export function Gallery() {
  const { catalog, scenario } = usePrototype();
  const [q, setQ] = useState(''),
    [category, setCategory] = useState('Tất cả'),
    [tag, setTag] = useState(''),
    [limit, setLimit] = useState(3);
  const visible = catalog.filter(
    (t) =>
      t.status === 'PUBLISHED' &&
      t.name.toLocaleLowerCase('vi').includes(q.toLocaleLowerCase('vi')) &&
      (category === 'Tất cả' || t.category === category) &&
      (!tag || t.tags.includes(tag)),
  );
  return (
    <main className="page" tabIndex={-1}>
      <PageHeading
        editorial
        eyebrow="TÌM MỘT LỜI MỜI CỦA RIÊNG BẠN"
        title="Mẫu thiệp từ tiệm"
        description="Mỗi phong cách mở ra một câu chuyện. Bạn muốn kể chuyện của mình thế nào?"
      />
      <div className="gallery-tools">
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Tìm mẫu thiệp</span>
          <input
            placeholder="Tìm một mẫu thiệp…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(3);
            }}
          />
        </label>
        <label className="tag-filter">
          <span>Nhãn</span>
          <select
            value={tag}
            onChange={(e) => {
              setTag(e.target.value);
              setLimit(3);
            }}
          >
            <option value="">Tất cả nhãn</option>
            {[...new Set(catalog.flatMap((t) => t.tags))].map((label) => (
              <option key={label}>{label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="category-tabs" aria-label="Danh mục">
        {['Tất cả', ...new Set(catalog.map((t) => t.category))].map((label) => (
          <button
            key={label}
            aria-pressed={category === label}
            className={category === label ? 'selected' : ''}
            onClick={() => {
              setCategory(label);
              setLimit(3);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <ScenarioContent>
        {scenario === 'empty' || visible.length === 0 ? (
          <Empty
            title="Chưa tìm thấy mẫu phù hợp"
            description="Thử một từ khóa khác hoặc bỏ bớt bộ lọc."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQ('');
                  setCategory('Tất cả');
                  setTag('');
                }}
              >
                Xóa bộ lọc
              </Button>
            }
          />
        ) : (
          <>
            <p className="results-caption muted">
              {visible.length} mẫu trong dữ liệu minh họa
            </p>
            <div className="template-grid">
              {visible.slice(0, limit).map((t) => (
                <TemplateCard key={t.id} template={t} />
              ))}
            </div>
            {limit < visible.length && (
              <div className="load-more">
                <Button variant="secondary" onClick={() => setLimit(limit + 3)}>
                  Xem thêm mẫu <ArrowRight size={16} />
                </Button>
              </div>
            )}
          </>
        )}
      </ScenarioContent>
    </main>
  );
}
export function TemplatePopup({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { catalog, designs, createInvitation, navigate, toast } =
    usePrototype();
  const template = catalog.find((t) => t.id === id && t.status === 'PUBLISHED');
  if (!template)
    return (
      <Dialog title="Mẫu này chưa khả dụng" onClose={onClose}>
        <Empty title="Hãy chọn một mẫu khác" />
      </Dialog>
    );
  const fields = formFieldsForDesign(designs[id]);
  const has = (field: string) => fields.some((item) => item.id === field);
  const features = [
    {
      label: 'Cá nhân hóa nội dung',
      icon: Type,
      enabled: has('bride.name') || has('groom.name'),
    },
    {
      label: 'Hình ảnh của hai bạn',
      icon: ImagePlus,
      enabled: has('couple.photo') || has('bride.photo') || has('groom.photo'),
    },
    {
      label: 'Ngày giờ và địa điểm',
      icon: MapPin,
      enabled: has('wedding.date') || has('venue.name'),
    },
    {
      label: 'Câu chuyện và timeline',
      icon: BookHeart,
      enabled: has('story') || has('timeline'),
    },
    {
      label: 'Xác nhận tham dự',
      icon: MailCheck,
      enabled: resolveDesign(designs[id], sampleData, {
        mode: 'preview',
        asOf: AS_OF,
      }).hasVisibleRsvp,
    },
    { label: 'Chia sẻ qua liên kết', icon: Link2, enabled: true },
  ].filter((feature) => feature.enabled);
  const demoUrl = `${location.origin}/#/demo/${id}`;
  const { size, modules } = createQrModules(demoUrl);
  const cells = Array.from(modules).flatMap((dark, index) =>
    dark
      ? [
          <rect
            key={index}
            x={(index % size) + 4}
            y={Math.floor(index / size) + 4}
            width="1"
            height="1"
          />,
        ]
      : [],
  );
  return (
    <Dialog
      title={template.name}
      onClose={onClose}
      large
      className="template-popup"
    >
      <div className="template-popup-layout">
        <section className="popup-phone-stage" aria-label="Bản xem trước mẫu">
          <div className="preview-phone">
            <div
              className="phone-screen"
              style={{ backgroundColor: template.paper }}
              tabIndex={0}
              aria-label="Cuộn xem thiệp mobile"
            >
              <LivePreview template={template} document={designs[id]} />
            </div>
          </div>
        </section>
        <section className="popup-template-info">
          <div>
            <h3>{template.name}</h3>
            <p className="muted popup-caption">{template.caption}</p>
            <div className="popup-tags">
              {[template.category, ...template.tags].map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <h4>Tính năng của mẫu</h4>
            <ul className="popup-feature-list">
              {features.map(({ label, icon: Icon }) => (
                <li key={label}>
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>
          </div>
          <div className="popup-template-bottom">
            <div className="demo-qr-row">
              <svg
                role="img"
                aria-label="Mã QR liên kết demo mẫu thiệp"
                data-demo-url={demoUrl}
                viewBox={`0 0 ${size + 8} ${size + 8}`}
                shapeRendering="crispEdges"
              >
                <rect width={size + 8} height={size + 8} fill="white" />
                <g fill="#29251f">{cells}</g>
              </svg>
              <div>
                <p className="small muted">Quét mã QR để mở trang demo.</p>
                <button
                  className="text-link small"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(demoUrl)
                      .then(() => toast('Đã sao chép liên kết demo'))
                      .catch(() =>
                        toast('Hãy dùng nút Xem demo để mở liên kết.'),
                      )
                  }
                >
                  Sao chép liên kết demo
                </button>
              </div>
            </div>
            <p className="small muted popup-design-note">
              Chọn mẫu bạn yêu thích, rồi thêm câu chuyện của hai bạn.
            </p>
            <div className="popup-template-actions">
              <Button onClick={() => createInvitation(template)}>
                <Check size={17} />
                Dùng mẫu này
              </Button>
              <Button
                variant="secondary"
                onClick={() => navigate(`/demo/${id}`)}
              >
                <Expand size={17} />
                Xem demo
              </Button>
            </div>
          </div>
        </section>
      </div>
    </Dialog>
  );
}

// Preserve old bookmarks/review links as a gallery with the template popup open.
export function TemplateDetail({ id }: { id: string }) {
  const { navigate } = usePrototype();
  return (
    <>
      <Gallery />
      <TemplatePopup id={id} onClose={() => navigate('/templates')} />
    </>
  );
}
export function TemplateDemo({ id }: { id: string }) {
  const { catalog, designs, navigate, createInvitation } = usePrototype();
  const [opened, setOpened] = useState(false);
  const template = catalog.find((t) => t.id === id && t.status === 'PUBLISHED');
  if (!template)
    return (
      <main className="page">
        <Back />
        <Empty title="Mẫu này chưa khả dụng" />
      </main>
    );
  return (
    <main
      className={`template-demo ${!opened ? 'is-opening' : ''}`}
      tabIndex={-1}
    >
      <header className="demo-toolbar">
        <button className="text-link" onClick={() => navigate('/templates')}>
          Về kho mẫu
        </button>
        <span className="muted small">Demo · {template.name}</span>
        <Button onClick={() => createInvitation(template)}>Dùng mẫu này</Button>
      </header>
      {!opened ? (
        <section className="demo-opening" style={{ color: template.ink }}>
          <div
            className="demo-opening-card"
            style={{ backgroundColor: template.paper }}
          >
            {(['left', 'right'] as const).map((side) => (
              <svg
                key={side}
                className={`opening-botanical opening-botanical-${side}`}
                viewBox="0 0 140 280"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M12 280C24 190 45 125 84 28M20 235C48 180 78 132 119 83M31 194C26 126 29 70 38 20"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                {[
                  [84, 28],
                  [69, 65],
                  [55, 103],
                  [119, 83],
                  [94, 114],
                  [72, 149],
                  [38, 20],
                  [31, 60],
                  [29, 99],
                ].map(([x, y], i) => (
                  <g key={i} transform={`translate(${x} ${y})`}>
                    <path d="M0 13V0" stroke="currentColor" />
                    {[0, 72, 144, 216, 288].map((a) => (
                      <ellipse
                        key={a}
                        cx="0"
                        cy="-5"
                        rx="3"
                        ry="6"
                        fill="currentColor"
                        opacity="0.6"
                        transform={`rotate(${a})`}
                      />
                    ))}
                    <circle r="3" fill="currentColor" />
                  </g>
                ))}
                <path
                  d="M24 220C1 200 4 185 17 188C27 195 28 207 24 220ZM39 173C60 149 69 153 65 165C59 176 47 180 39 173ZM35 117C13 106 14 92 25 95C36 98 38 107 35 117"
                  fill="currentColor"
                  opacity="0.4"
                />
              </svg>
            ))}
            <span className="opening-seal" aria-hidden="true">
              <Heart size={25} fill="currentColor" />
            </span>
            <p className="eyebrow">MỘT LỜI MỜI DÀNH CHO BẠN</p>
            <h1 tabIndex={-1}>
              Ngọc Anh <span>&</span> Minh Quân
            </h1>
            <div className="demo-opening-photo">
              <img
                src={assetUrls[template.photo]}
                alt="Ảnh cưới minh họa cho lời mời"
              />
            </div>
            <div className="opening-divider" aria-hidden="true">
              <span />❦<span />
            </div>
            <p>20 tháng 12, 2026</p>
            <p className="opening-salutation">Thân Mời</p>
            <Button
              onClick={() => {
                setOpened(true);
                window.scrollTo(0, 0);
              }}
            >
              Mở thiệp <ArrowRight size={17} />
            </Button>
            <p className="small opening-note">
              Trân trọng mời bạn đến chung vui.
            </p>
          </div>
        </section>
      ) : (
        <section className="demo-invitation" aria-label="Nội dung thiệp demo">
          <h1 className="sr-only" tabIndex={-1}>
            Thiệp demo {template.name}
          </h1>
          <LivePreview
            template={template}
            document={designs[id]}
            hostPolicy="adaptive"
          />
          <p className="demo-note muted small">
            Nội dung và RSVP minh họa · Không gửi phản hồi thật
          </p>
          <button
            className="text-link"
            onClick={() => {
              setOpened(false);
              window.scrollTo(0, 0);
            }}
          >
            Xem lại lời mời
          </button>
        </section>
      )}
    </main>
  );
}
