import { useState } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  Eye,
  Layers,
  LockKeyhole,
  Plus,
  Search,
  Settings2,
} from 'lucide-react';
import { createPrototypeDesign } from './responsive-fixtures';
import { usePrototype } from './App';
import { createDesign, templates } from './fixtures';
import type {
  ElementNode,
  SupportedTemplateDesign,
} from '../../web/src/features/invitation-builder/document/types';
import {
  Back,
  Busy,
  Button,
  Dialog,
  Empty,
  Field,
  LivePreview,
  Notice,
  PageHeading,
  ScenarioContent,
  SelectField,
  Status,
} from './ui';

const authTitles: Record<string, [string, string, string]> = {
  login: [
    'Chào bạn,',
    'câu chuyện đang chờ.',
    'Đăng nhập để chọn mẫu và tạo lời mời của riêng mình.',
  ],
  register: [
    'Một khởi đầu mới,',
    'một lời mời riêng.',
    'Tạo tài khoản để lưu giữ và hoàn thiện thiệp của bạn.',
  ],
  'verify-email': [
    'Chỉ còn một bước,',
    'mình bắt đầu nhé.',
    'Mở email và xác minh tài khoản để tiếp tục.',
  ],
  'forgot-password': [
    'Mình tìm lại',
    'lối vào nhé.',
    'Nhập email để nhận hướng dẫn đặt lại mật khẩu.',
  ],
  'reset-password': [
    'Một mật khẩu mới,',
    'tiếp tục câu chuyện.',
    'Chọn mật khẩu mới cho tài khoản của bạn.',
  ],
  'social-onboarding': [
    'Rất vui được gặp bạn.',
    'Thêm một chút thông tin.',
    'Hoàn thiện hồ sơ để lời mời được lưu đúng tài khoản.',
  ],
  'oauth-result': [
    'Chào mừng trở lại.',
    'Câu chuyện tiếp nối.',
    'Đang kiểm tra kết quả đăng nhập của bạn.',
  ],
};
export function AuthScreen({
  kind,
  onAuthenticated,
  destination,
}: {
  kind: string;
  onAuthenticated?: () => void;
  destination?: string;
}) {
  const { navigate, login, scenario, setScenario } = usePrototype();
  const [pending, setPending] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState('');
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState('');
  const copy = authTitles[kind] ?? authTitles.login;
  const oauth = kind === 'oauth-result';
  const verification = kind === 'verify-email';
  async function submit() {
    setError('');
    setPending(true);
    await new Promise((r) => setTimeout(r, 450));
    setPending(false);
    if (scenario === 'error' || scenario === 'conflict') {
      setError(
        kind === 'login'
          ? 'Chưa thể đăng nhập. Kiểm tra thông tin hoặc thử lại.'
          : 'Chưa thể hoàn tất thao tác. Hãy thử lại.',
      );
      return;
    }
    if (kind === 'login') {
      if (destination) {
        onAuthenticated?.();
        if (!onAuthenticated) login();
        navigate(destination);
      } else login();
    } else setDone(true);
  }
  const emailNeeded = !['reset-password', 'oauth-result'].includes(kind);
  const passwordNeeded = ['login', 'register', 'reset-password'].includes(kind);
  return (
    <main className="auth-page" tabIndex={-1}>
      <section className="auth-story">
        <p className="eyebrow">TIỆM LÀM THIỆP</p>
        <h1 className="editorial" tabIndex={-1}>
          {copy[0]}
          <br />
          <em>{copy[1]}</em>
        </h1>
        <p>{copy[2]}</p>
        <div className="auth-line-art" aria-hidden="true">
          <svg viewBox="0 0 280 200">
            <path
              d="M35 55H235V173H35ZM35 55L135 125L235 55M35 173L109 109M235 173L160 109M110 30Q99 8 84 21Q73 35 110 57Q147 35 134 21Q119 8 110 30"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            />
          </svg>
        </div>
        <p className="auth-quote editorial">
          “Một lời mời nhỏ,
          <br />
          đủ để mang mọi người đến gần.”
        </p>
      </section>
      <section className="auth-form">
        <span className="eyebrow">BẮT ĐẦU TỪ ĐÂY</span>
        <h2>
          {{
            login: 'Đăng nhập',
            register: 'Tạo tài khoản',
            'verify-email': 'Xác minh email',
            'forgot-password': 'Quên mật khẩu',
            'reset-password': 'Đặt lại mật khẩu',
            'social-onboarding': 'Hoàn thiện hồ sơ',
            'oauth-result': 'Kết quả đăng nhập',
          }[kind] ?? 'Đăng nhập'}
        </h2>
        {done || oauth ? (
          <>
            <Notice tone="success">
              {kind === 'login' || oauth
                ? 'Đã xác nhận đăng nhập trong prototype.'
                : kind === 'reset-password'
                  ? 'Đã cập nhật mật khẩu minh họa. Bạn có thể đăng nhập lại.'
                  : 'Nếu thông tin hợp lệ, hướng dẫn sẽ được gửi tới email của bạn.'}
            </Notice>
            <p className="muted">
              Thao tác này được mô phỏng; không có email hoặc request đăng nhập
              thật.
            </p>
            <Button
              onClick={() =>
                oauth
                  ? login()
                  : navigate(
                      kind === 'register' || kind === 'social-onboarding'
                        ? '/verify-email'
                        : '/login',
                    )
              }
            >
              Tiếp tục <ArrowRight size={16} />
            </Button>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {verification && (
              <Notice>
                Kiểm tra cả hộp thư rác. Liên kết xác minh thật sẽ được xử lý
                theo luồng hiện tại của ứng dụng.
              </Notice>
            )}
            {emailNeeded && (
              <Field
                id="auth-email"
                label="Email"
                type="email"
                value={email}
                required
                autoComplete="email"
                placeholder="ban@email.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
            {passwordNeeded && (
              <Field
                id="auth-password"
                label={kind === 'reset-password' ? 'Mật khẩu mới' : 'Mật khẩu'}
                type="password"
                value={password}
                required
                minLength={kind === 'login' ? 1 : 8}
                autoComplete={
                  kind === 'login' ? 'current-password' : 'new-password'
                }
                helper={
                  kind === 'login'
                    ? undefined
                    : 'Ít nhất 8 ký tự trong bản minh họa; khi tích hợp phải dùng policy thật.'
                }
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
            {kind === 'login' && (
              <button
                type="button"
                className="text-link forgot-link"
                onClick={() => navigate('/forgot-password')}
              >
                Quên mật khẩu?
              </button>
            )}
            {error && (
              <Notice tone="error">
                {error}
                <button
                  type="button"
                  className="text-link"
                  onClick={() => {
                    setScenario('normal');
                    setError('');
                  }}
                >
                  Thử lại
                </button>
              </Notice>
            )}
            <Button type="submit" busy={pending}>
              {pending ? (
                <Busy />
              ) : verification ? (
                'Gửi lại hướng dẫn'
              ) : kind === 'forgot-password' ? (
                'Gửi hướng dẫn'
              ) : kind === 'login' ? (
                'Đăng nhập'
              ) : (
                'Tiếp tục'
              )}
              <ArrowRight size={16} />
            </Button>
            {['login', 'register'].includes(kind) && (
              <>
                <div className="auth-divider">
                  <span>hoặc tiếp tục với</span>
                </div>
                <div className="social-buttons">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => navigate('/oauth-result')}
                  >
                    Google
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => navigate('/social-onboarding')}
                  >
                    Facebook
                  </Button>
                </div>
                <p className="muted small">
                  {kind === 'login'
                    ? 'Bạn chưa có tài khoản? '
                    : 'Bạn đã có tài khoản? '}
                  <button
                    type="button"
                    className="text-link"
                    onClick={() =>
                      navigate(kind === 'login' ? '/register' : '/login')
                    }
                  >
                    {kind === 'login' ? 'Tạo tài khoản' : 'Đăng nhập'}
                  </button>
                </p>
              </>
            )}
          </form>
        )}
      </section>
    </main>
  );
}
export function Account() {
  const { setRole, navigate, scenario, profile, setProfile } = usePrototype();
  const [name, setName] = useState(profile.name),
    [phone, setPhone] = useState(profile.phone),
    [saved, setSaved] = useState(false),
    [passwordChanged, setPasswordChanged] = useState(false),
    [error, setError] = useState('');
  return (
    <main className="page account-page" tabIndex={-1}>
      <PageHeading
        title="Tài khoản của bạn"
        description="Một góc nhỏ để cập nhật thông tin và giữ tài khoản an toàn."
      />
      <section className="form-section">
        <h2>Thông tin cá nhân</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (scenario === 'error')
              setError(
                'Chưa thể cập nhật hồ sơ. Thông tin vừa nhập vẫn được giữ.',
              );
            else {
              setError('');
              setProfile({ ...profile, name: name.trim(), phone });
              setSaved(true);
            }
          }}
        >
          <Field
            id="profile-name"
            label="Tên hiển thị"
            value={name}
            required
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
          />
          <Field
            id="profile-phone"
            label="Số điện thoại (chưa xác minh)"
            type="tel"
            value={phone}
            maxLength={32}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Field
            id="profile-email"
            label="Email"
            value={profile.email}
            readOnly
            helper="Email minh họa · Đã xác minh"
          />
          {saved && <Notice tone="success">Đã cập nhật hồ sơ minh họa.</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit">Lưu thông tin</Button>
        </form>
      </section>
      <section className="form-section">
        <h2>Mật khẩu</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (scenario === 'error') {
              setError('Chưa thể đổi mật khẩu. Hãy thử lại.');
              return;
            }
            setPasswordChanged(true);
            e.currentTarget.reset();
          }}
        >
          <Field
            id="current-password"
            label="Mật khẩu hiện tại"
            type="password"
            autoComplete="current-password"
            required
          />
          <Field
            id="new-password"
            label="Mật khẩu mới"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
          {passwordChanged && (
            <Notice tone="success">Đã cập nhật mật khẩu.</Notice>
          )}
          <Button type="submit" variant="secondary">
            Đổi mật khẩu
          </Button>
        </form>
      </section>
      <Button
        variant="ghost"
        onClick={() => {
          setRole('ANONYMOUS');
          navigate('/home');
        }}
      >
        Đăng xuất
      </Button>
    </main>
  );
}
const seedCustomers = [
  {
    id: 'c1',
    name: 'Ngọc Anh',
    email: 'ngocanh@example.test',
    status: 'ACTIVE',
    createdAt: '2026-10-02',
  },
  {
    id: 'c2',
    name: 'Minh Quân',
    email: 'minhquan@example.test',
    status: 'ACTIVE',
    createdAt: '2026-10-04',
  },
  {
    id: 'c3',
    name: 'Thanh Mai',
    email: 'thanhmai@example.test',
    status: 'LOCKED',
    createdAt: '2026-10-06',
  },
];
export function AdminCustomers() {
  const { scenario } = usePrototype();
  const [customers, setCustomers] = useState(seedCustomers),
    [q, setQ] = useState(''),
    [status, setStatus] = useState(''),
    [selected, setSelected] = useState<string | null>(null),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState('');
  const customer = customers.find((c) => c.id === selected);
  const visible =
    scenario === 'empty'
      ? []
      : customers.filter(
          (c) =>
            `${c.name} ${c.email}`.toLowerCase().includes(q.toLowerCase()) &&
            (!status || c.status === status),
        );
  return (
    <main className="page" tabIndex={-1}>
      <PageHeading
        eyebrow="QUẢN TRỊ TIỆM"
        title="Khách hàng"
        description="Tra cứu tài khoản và quản lý trạng thái truy cập."
      />
      <div className="management-filters">
        <Field
          id="customer-search"
          label="Tìm khách hàng"
          placeholder="Tên hoặc email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <SelectField
          id="customer-status"
          label="Trạng thái"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Tất cả</option>
          <option value="ACTIVE">Hoạt động</option>
          <option value="LOCKED">Đã khóa</option>
        </SelectField>
      </div>
      <ScenarioContent>
        {!visible.length ? (
          <Empty
            title="Không có khách hàng phù hợp"
            description="Thử từ khóa hoặc trạng thái khác."
          />
        ) : (
          <div className="customer-table">
            {visible.map((c) => (
              <button
                className="customer-row"
                key={c.id}
                onClick={() => {
                  setSelected(c.id);
                  setError('');
                }}
              >
                <span className="avatar">
                  {c.name
                    .split(' ')
                    .map((w) => w[0])
                    .join('')}
                </span>
                <span>
                  <strong>{c.name}</strong>
                  <small>{c.email}</small>
                </span>
                <span
                  className={`status ${c.status === 'ACTIVE' ? 'success' : ''}`}
                >
                  {c.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khóa'}
                </span>
                <ArrowRight size={17} />
              </button>
            ))}
          </div>
        )}
      </ScenarioContent>
      {customer && !confirm && (
        <Dialog
          title="Chi tiết khách hàng"
          onClose={() => setSelected(null)}
          drawer
        >
          <div className="customer-detail">
            <span className="avatar large-avatar">{customer.name[0]}</span>
            <h3>{customer.name}</h3>
            <p>{customer.email}</p>
            <dl>
              <dt>Trạng thái</dt>
              <dd>{customer.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khóa'}</dd>
              <dt>Ngày tạo</dt>
              <dd>{customer.createdAt}</dd>
            </dl>
            <Button
              variant={
                customer.status === 'ACTIVE' ? 'destructive' : 'secondary'
              }
              onClick={() => setConfirm(true)}
            >
              <LockKeyhole size={17} />
              {customer.status === 'ACTIVE'
                ? 'Khóa tài khoản'
                : 'Mở khóa tài khoản'}
            </Button>
          </div>
        </Dialog>
      )}
      {customer && confirm && (
        <Dialog
          title={
            customer.status === 'ACTIVE'
              ? 'Khóa tài khoản này?'
              : 'Mở khóa tài khoản?'
          }
          onClose={() => setConfirm(false)}
        >
          <p>
            {customer.status === 'ACTIVE'
              ? 'Khách hàng sẽ không thể tiếp tục sử dụng tài khoản cho tới khi được mở khóa.'
              : 'Khôi phục trạng thái hoạt động cho tài khoản này.'}
          </p>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Hủy
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (scenario === 'error') {
                  setError('Chưa thể thay đổi trạng thái. Hãy thử lại.');
                  return;
                }
                setCustomers((all) =>
                  all.map((c) =>
                    c.id === customer.id
                      ? {
                          ...c,
                          status: c.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE',
                        }
                      : c,
                  ),
                );
                setConfirm(false);
              }}
            >
              Xác nhận
            </Button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
export function AdminTemplates({ creating = false }: { creating?: boolean }) {
  const { catalog, setCatalog, navigate, scenario } = usePrototype();
  const [q, setQ] = useState(''),
    [name, setName] = useState(''),
    [status, setStatus] = useState(''),
    [category, setCategory] = useState(''),
    [tag, setTag] = useState(''),
    [newCategory, setNewCategory] = useState('Hiện đại'),
    [duplicate, setDuplicate] = useState<string | null>(null),
    [error, setError] = useState('');
  const visible =
    scenario === 'empty'
      ? []
      : catalog.filter(
          (t) =>
            t.name.toLowerCase().includes(q.toLowerCase()) &&
            (!status || t.status === status) &&
            (!category || t.category === category) &&
            (!tag || t.tags.includes(tag)),
        );
  function create(copy?: string) {
    if (scenario === 'error') {
      setError('Chưa thể tạo mẫu. Nội dung vừa nhập vẫn được giữ.');
      return;
    }
    const base = catalog.find((t) => t.id === copy) ?? templates[0];
    const id = crypto.randomUUID();
    setCatalog((items) => [
      ...items,
      {
        ...structuredClone(base),
        id,
        name: name.trim(),
        category: copy ? base.category : newCategory.trim(),
        status: 'DRAFT',
      },
    ]);
    setDuplicate(null);
    navigate(`/admin/editor/${id}`);
  }
  return (
    <main className="page" tabIndex={-1}>
      <PageHeading
        eyebrow="QUẢN TRỊ TIỆM"
        title={creating ? 'Tạo mẫu thiệp' : 'Mẫu thiệp của tiệm'}
        description="Thiết kế được chuẩn bị tại đây; khách hàng cá nhân hóa nội dung theo mẫu."
        action={
          !creating && (
            <Button onClick={() => navigate('/admin/templates/new')}>
              <Plus size={17} />
              Tạo mẫu mới
            </Button>
          )
        }
      />
      {creating ? (
        <form
          className="create-template-form"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <Field
            id="template-name"
            label="Tên mẫu"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Field
            id="template-category"
            label="Danh mục"
            required
            maxLength={64}
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          {error && <Notice tone="error">{error}</Notice>}
          <div className="row">
            <Button type="submit">
              Tạo bản nháp <ArrowRight size={16} />
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate('/admin/templates')}
            >
              Hủy
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="management-filters">
            <Field
              id="admin-template-search"
              label="Tìm mẫu"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <SelectField
              id="admin-template-category"
              label="Danh mục"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Tất cả</option>
              {[...new Set(catalog.map((t) => t.category))].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </SelectField>
            <SelectField
              id="admin-template-tag"
              label="Nhãn"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            >
              <option value="">Tất cả</option>
              {[...new Set(catalog.flatMap((t) => t.tags))].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </SelectField>
            <SelectField
              id="admin-template-status"
              label="Trạng thái"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Tất cả</option>
              {['DRAFT', 'PUBLISHED', 'UNPUBLISHED'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </SelectField>
          </div>
          <ScenarioContent>
            {!visible.length ? (
              <Empty
                title="Chưa có mẫu phù hợp"
                description="Tạo một bản nháp mới hoặc thay đổi bộ lọc."
              />
            ) : (
              <div className="admin-template-list">
                {visible.map((t) => (
                  <article key={t.id}>
                    <div>
                      <h2>
                        <button
                          className="title-button"
                          onClick={() => navigate(`/admin/editor/${t.id}`)}
                        >
                          {t.name}
                        </button>
                      </h2>
                      <p className="muted small">
                        {t.category} · {t.tags.join(', ')}
                      </p>
                    </div>
                    <Status status={t.status} />
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setDuplicate(t.id);
                        setName(`${t.name} (bản sao)`);
                      }}
                    >
                      <Copy size={16} />
                      Nhân bản
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => navigate(`/admin/editor/${t.id}`)}
                    >
                      Thiết kế <ArrowRight size={16} />
                    </Button>
                  </article>
                ))}
              </div>
            )}
          </ScenarioContent>
        </>
      )}
      {duplicate && (
        <Dialog title="Nhân bản mẫu" onClose={() => setDuplicate(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create(duplicate);
            }}
          >
            <Field
              id="duplicate-name"
              label="Tên bản sao"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit">Tạo bản sao</Button>
          </form>
        </Dialog>
      )}
    </main>
  );
}
export function AdminEditor({ id }: { id: string }) {
  return (
    <main className="page" data-template-id={id}>
      <h1>Thiết kế mẫu</h1>
      <a href="http://localhost:3000/admin/templates">Mở editor thiệp</a>
    </main>
  );
}
