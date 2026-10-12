import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  ArrowRight,
  Menu,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  AccountMenu,
  AccountWorkspace,
  AccountOverview,
} from './AccountWorkspace';
import logo from '../../../docs/branding/Gemini_Generated_Image_bdlxgbbdlxgbbdlx.png';
import {
  Home,
  Gallery,
  TemplateDetail,
  TemplateDemo,
  TemplatePopup,
} from './Discovery';
import {
  Dashboard,
  InvitationEditor,
  RsvpManagement,
  GuestInvitation,
} from './Customer';
import {
  AuthScreen,
  Account,
  AdminCustomers,
  AdminTemplates,
  AdminEditor,
} from './Management';
import {
  initialInvitations,
  templates,
  sampleData,
  ASSET_IDS,
  assetUrls,
  type InvitationFixture,
  type TemplateFixture,
} from './fixtures';
import { createPrototypeDesign as createDesign } from './responsive-fixtures';
import type { SupportedTemplateDesign as TemplateDesign } from '../../web/src/features/invitation-builder/document/types';
import { mockState, resetRsvps, type Scenario } from './rsvp-mock';
import { Button } from './ui';

export type Role = 'ANONYMOUS' | 'CUSTOMER' | 'ADMIN';
type Context = {
  profile: { name: string; email: string; phone: string };
  setProfile: (value: { name: string; email: string; phone: string }) => void;
  route: string;
  navigate: (route: string) => void;
  openTemplate: (id: string) => void;
  role: Role;
  setRole: (role: Role) => void;
  scenario: Scenario;
  setScenario: (scenario: Scenario) => void;
  invitations: InvitationFixture[];
  setInvitations: (
    items:
      | InvitationFixture[]
      | ((items: InvitationFixture[]) => InvitationFixture[]),
  ) => void;
  catalog: TemplateFixture[];
  setCatalog: (
    items:
      TemplateFixture[] | ((items: TemplateFixture[]) => TemplateFixture[]),
  ) => void;
  designs: Record<string, TemplateDesign>;
  setDesigns: (
    update: (
      items: Record<string, TemplateDesign>,
    ) => Record<string, TemplateDesign>,
  ) => void;
  createInvitation: (template: TemplateFixture) => void;
  toast: (message: string) => void;
  login: (role?: Role) => void;
};
const PrototypeContext = createContext<Context | null>(null);
export function usePrototype() {
  return useContext(PrototypeContext)!;
}
const screens = [
  ['/home', 'Trang chủ'],
  ['/templates', 'Kho mẫu'],
  [`/template/${templates[0].id}`, 'Chi tiết mẫu'],
  [`/demo/${templates[0].id}`, 'Demo mẫu thiệp'],
  ['/invitations', 'Thiệp của tôi'],
  ['/editor/50000000-0000-4000-8000-000000000001', 'Customer Editor'],
  ['/rsvps/50000000-0000-4000-8000-000000000001', 'Quản lý RSVP'],
  ['/i/50000000-0000-4000-8000-000000000001', 'Thiệp công khai'],
  ['/login', 'Đăng nhập'],
  ['/register', 'Đăng ký'],
  ['/verify-email', 'Xác minh email'],
  ['/forgot-password', 'Quên mật khẩu'],
  ['/reset-password', 'Đặt lại mật khẩu'],
  ['/social-onboarding', 'Social onboarding'],
  ['/oauth-result', 'Kết quả OAuth'],
  ['/overview', 'Tổng quan tài khoản'],
  ['/account', 'Tài khoản'],
  ['/admin/customers', 'Admin · Khách hàng'],
  ['/admin/templates', 'Admin · Mẫu thiệp'],
  ['/admin/templates/new', 'Admin · Tạo mẫu'],
  [`/admin/editor/${templates[0].id}`, 'Admin · Thiết kế mẫu'],
];
const currentRoute = () => window.location.hash.slice(1) || '/home';
export default function App() {
  const [route, setRoute] = useState(currentRoute),
    [role, setRole] = useState<Role>('ANONYMOUS');
  const [scenario, setScenarioState] = useState<Scenario>('normal');
  const [invitations, setInvitations] = useState(initialInvitations),
    [catalog, setCatalog] = useState(() => structuredClone(templates));
  const [designs, setDesigns] = useState<Record<string, TemplateDesign>>(() =>
    Object.fromEntries(templates.map((t) => [t.id, createDesign(t)])),
  );
  const [profile, setProfile] = useState({
    name: 'Ngọc Anh',
    email: 'ngocanh@example.test',
    phone: '',
  });
  const [review, setReview] = useState(false),
    [menu, setMenu] = useState(false),
    [toastMessage, setToastMessage] = useState('');
  const [next, setNext] = useState('/templates');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  function openTemplate(id: string) {
    if (role !== 'CUSTOMER') {
      setNext('/templates');
      navigate('/login');
      return;
    }
    setSelectedTemplate(id);
  }
  function navigate(target: string) {
    setSelectedTemplate(null);
    setMenu(false);
    window.location.hash = target;
  }
  function setScenario(value: Scenario) {
    mockState.scenario = value;
    setScenarioState(value);
  }
  useEffect(() => {
    const listener = () => {
      setSelectedTemplate(null);
      setRoute(currentRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);
  useEffect(() => {
    if (role !== 'CUSTOMER') setSelectedTemplate(null);
  }, [role]);
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>('main h1, .workspace h1')
        ?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [route]);
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(''), 3500);
    return () => clearTimeout(timer);
  }, [toastMessage]);
  function login(value: Role = 'CUSTOMER') {
    setRole(value);
    navigate(value === 'ADMIN' ? '/admin/templates' : next);
  }
  function createInvitation(template: TemplateFixture) {
    if (role !== 'CUSTOMER') {
      setNext(`/template/${template.id}`);
      navigate('/login');
      return;
    }
    const id = crypto.randomUUID();
    setInvitations((items) => [
      {
        id,
        templateId: template.id,
        document: structuredClone(
          designs[template.id] ?? createDesign(template),
        ),
        data: {
          ...structuredClone(sampleData),
          couple: { photo: template.photo },
        },
        publishedData: null,
        status: 'DRAFT',
        updatedAt: new Date().toISOString(),
        rsvpOpen: true,
      },
      ...items,
    ]);
    navigate(`/editor/${id}`);
  }
  function reset() {
    setDesigns(
      Object.fromEntries(templates.map((t) => [t.id, createDesign(t)])),
    );
    for (const id of Object.keys(assetUrls)) {
      if (!ASSET_IDS.includes(id)) {
        URL.revokeObjectURL(assetUrls[id]);
        delete assetUrls[id];
      }
    }
    setProfile({ name: 'Ngọc Anh', email: 'ngocanh@example.test', phone: '' });
    setInvitations(initialInvitations());
    setCatalog(structuredClone(templates));
    resetRsvps();
    setScenario('normal');
    setRole('ANONYMOUS');
    setNext('/templates');
    navigate('/home');
    setToastMessage('Đã đặt lại dữ liệu minh họa');
  }
  const guarded =
    route === '/overview' ||
    route === '/templates' ||
    route === '/invitations' ||
    route.startsWith('/editor/') ||
    route.startsWith('/rsvps/') ||
    route.startsWith('/template/') ||
    route.startsWith('/demo/');
  const customerAllowed = role === 'CUSTOMER';
  const workspace =
    route.startsWith('/editor/') || route.startsWith('/admin/editor/');
  const guest = route.startsWith('/i/') || route.startsWith('/demo/');
  let content: ReactNode;
  if (guarded && !customerAllowed)
    content = (
      <AuthScreen
        kind="login"
        onAuthenticated={() => {
          setRole('CUSTOMER');
        }}
        destination={route}
      />
    );
  else if (route.startsWith('/admin/') && role !== 'ADMIN')
    content = (
      <main className="page">
        <h1 tabIndex={-1}>Khu vực dành cho Admin</h1>
        <p>Chọn vai trò Admin ở thanh review để xem thiết kế quản trị.</p>
      </main>
    );
  else if (route === '/home') content = <Home />;
  else if (route === '/templates') content = <Gallery />;
  else if (route.startsWith('/template/'))
    content = <TemplateDetail id={route.split('/')[2]} />;
  else if (route.startsWith('/demo/'))
    content = <TemplateDemo key={route} id={route.split('/')[2]} />;
  else if (route === '/overview') content = <AccountOverview />;
  else if (route === '/invitations') content = <Dashboard />;
  else if (route.startsWith('/editor/'))
    content = <InvitationEditor key={route} id={route.split('/')[2]} />;
  else if (route.startsWith('/rsvps/'))
    content = <RsvpManagement id={route.split('/')[2]} />;
  else if (guest) content = <GuestInvitation id={route.split('/')[2]} />;
  else if (route === '/account')
    content =
      role === 'ANONYMOUS' ? (
        <AuthScreen kind="login" destination="/account" />
      ) : (
        <Account />
      );
  else if (route === '/admin/customers') content = <AdminCustomers />;
  else if (route === '/admin/templates' || route === '/admin/templates/new')
    content = <AdminTemplates creating={route.endsWith('/new')} />;
  else if (route.startsWith('/admin/editor/'))
    content = <AdminEditor id={route.split('/')[3]} />;
  else if (
    [
      '/login',
      '/register',
      '/verify-email',
      '/forgot-password',
      '/reset-password',
      '/social-onboarding',
      '/oauth-result',
    ].includes(route)
  )
    content = <AuthScreen key={route} kind={route.slice(1)} />;
  else
    content = (
      <main className="page">
        <h1 tabIndex={-1}>Không tìm thấy màn hình</h1>
        <Button onClick={() => navigate('/home')}>Về trang chủ</Button>
      </main>
    );
  const context: Context = {
    profile,
    setProfile,
    route,
    navigate,
    openTemplate,
    role,
    setRole,
    scenario,
    setScenario,
    invitations,
    setInvitations,
    catalog,
    setCatalog,
    designs,
    setDesigns,
    createInvitation,
    toast: setToastMessage,
    login,
  };
  return (
    <PrototypeContext.Provider value={context}>
      <div className="platformTokens app">
        <aside className="review-bar" aria-label="Công cụ review prototype">
          <span>
            PROTOTYPE <span className="review-detail">· Dữ liệu minh họa</span>
          </span>
          <button onClick={() => setReview(!review)} aria-expanded={review}>
            <SlidersHorizontal size={14} />
            Review thiết kế
          </button>
        </aside>
        {review && (
          <div className="review-panel">
            <label>
              Màn hình
              <select
                aria-label="Màn hình review"
                value={screens.some(([value]) => value === route) ? route : ''}
                onChange={(e) => {
                  setReview(false);
                  const target = e.target.value;
                  setRole(
                    target.startsWith('/admin/')
                      ? 'ADMIN'
                      : [
                            '/home',
                            '/login',
                            '/register',
                            '/verify-email',
                            '/forgot-password',
                            '/reset-password',
                            '/social-onboarding',
                            '/oauth-result',
                          ].includes(target)
                        ? 'ANONYMOUS'
                        : 'CUSTOMER',
                  );
                  setScenario('normal');
                  navigate(target);
                }}
              >
                <option value="" disabled>
                  Chọn màn hình
                </option>
                {screens.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Vai trò
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                <option value="ANONYMOUS">Khách chưa đăng nhập</option>
                <option value="CUSTOMER">Customer</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>
            <label>
              Trạng thái
              <select
                aria-label="Trạng thái review"
                value={scenario}
                onChange={(e) => setScenario(e.target.value as Scenario)}
              >
                <option value="normal">Bình thường</option>
                <option value="loading">Đang tải</option>
                <option value="empty">Trống</option>
                <option value="error">Lỗi mạng / lưu thất bại</option>
                <option value="conflict">Xung đột phiên bản</option>
              </select>
            </label>
            <button className="text-link" onClick={reset}>
              <RotateCcw size={16} />
              Đặt lại
            </button>
          </div>
        )}
        <a
          href="#main-content"
          className="skip-link"
          onClick={(e) => {
            e.preventDefault();
            document.querySelector<HTMLElement>('main, .workspace')?.focus();
          }}
        >
          Bỏ qua điều hướng
        </a>
        {!route.startsWith('/admin/editor/') && !guest && (
          <header className="navbar">
            <button
              className="brand"
              aria-label="Tiệm làm thiệp — Trang chủ"
              onClick={() => navigate('/home')}
            >
              <img src={logo} alt="" />
              <span>Tiệm làm thiệp</span>
            </button>
            <nav className="desktop-nav" aria-label="Điều hướng chính">
              <button
                className={route === '/templates' ? 'active' : ''}
                onClick={() => {
                  setNext('/templates');
                  navigate(role === 'CUSTOMER' ? '/templates' : '/login');
                }}
              >
                Mẫu thiệp
              </button>
              <button
                onClick={() => {
                  navigate('/home');
                  setTimeout(
                    () =>
                      document
                        .getElementById('how-it-works')
                        ?.scrollIntoView({ behavior: 'smooth' }),
                    80,
                  );
                }}
              >
                Cách tạo thiệp
              </button>
              {role === 'ADMIN' && (
                <>
                  <button onClick={() => navigate('/admin/templates')}>
                    Quản lý mẫu
                  </button>
                  <button onClick={() => navigate('/admin/customers')}>
                    Khách hàng
                  </button>
                </>
              )}
            </nav>
            <div className="nav-actions">
              {role === 'ANONYMOUS' ? (
                <>
                  <button
                    className="text-link login-link"
                    onClick={() => navigate('/login')}
                  >
                    Đăng nhập
                  </button>
                  <Button
                    onClick={() => {
                      setNext('/templates');
                      navigate('/login');
                    }}
                  >
                    Tạo thiệp <ArrowRight size={16} />
                  </Button>
                </>
              ) : (
                <>
                  {role === 'ADMIN' && (
                    <button
                      className="text-link my-invitations"
                      onClick={() =>
                        navigate(
                          role === 'ADMIN'
                            ? '/admin/templates'
                            : '/invitations',
                        )
                      }
                    >
                      Quản trị
                    </button>
                  )}
                  <AccountMenu />
                </>
              )}
              <button
                className="icon-button mobile-menu"
                aria-label="Mở menu"
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                {menu ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
            {menu && (
              <nav className="mobile-nav" aria-label="Điều hướng mobile">
                <button onClick={() => navigate('/templates')}>
                  Mẫu thiệp
                </button>
                <button onClick={() => navigate('/invitations')}>
                  Thiệp của tôi
                </button>
                <button
                  onClick={() =>
                    navigate(role === 'ANONYMOUS' ? '/login' : '/account')
                  }
                >
                  Tài khoản
                </button>
                {role === 'ADMIN' && (
                  <>
                    <button onClick={() => navigate('/admin/templates')}>
                      Quản lý mẫu
                    </button>
                    <button onClick={() => navigate('/admin/customers')}>
                      Khách hàng
                    </button>
                  </>
                )}
              </nav>
            )}
          </header>
        )}
        <div id="main-content">
          {role === 'CUSTOMER' &&
          ['/overview', '/invitations', '/account'].includes(route) ? (
            <AccountWorkspace>{content}</AccountWorkspace>
          ) : (
            content
          )}
        </div>
        {!workspace && !guest && (
          <footer className="footer">
            <p>
              Tiệm làm thiệp
              <br />
              <span className="muted">Mỗi lời mời, một câu chuyện.</span>
            </p>
            <p>
              Được tạo bằng sự chăm chút
              <br />
              <span className="muted">Cho những ngày đáng nhớ của bạn.</span>
            </p>
            <span className="muted">tiemlamthiep@gmail.com</span>
          </footer>
        )}
        {selectedTemplate && role === 'CUSTOMER' && (
          <TemplatePopup
            id={selectedTemplate}
            onClose={() => setSelectedTemplate(null)}
          />
        )}
        {toastMessage && (
          <div className="toast" role="status">
            {toastMessage}
          </div>
        )}
      </div>
    </PrototypeContext.Provider>
  );
}
