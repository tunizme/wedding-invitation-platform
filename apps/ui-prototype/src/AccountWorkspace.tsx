import { useEffect, useRef, type ReactNode } from 'react';
import {
  LayoutDashboard,
  Mail,
  UserRound,
  Plus,
  LogOut,
  ArrowUpRight,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { usePrototype } from './App';
import { mockState } from './rsvp-mock';
import { Button, PageHeading, ScenarioContent, Empty } from './ui';
const links = [
  { path: '/overview', label: 'Tổng quan', icon: LayoutDashboard },
  { path: '/invitations', label: 'Thiệp của tôi', icon: Mail },
  { path: '/account', label: 'Thông tin cá nhân', icon: UserRound },
];
export function AccountMenu() {
  const { role, profile, navigate, setRole } = usePrototype();
  const root = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node) && root.current)
        root.current.open = false;
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && root.current?.open) {
        root.current.open = false;
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  function go(path: string) {
    if (root.current) root.current.open = false;
    navigate(path);
  }
  return (
    <details className="account-disclosure" ref={root}>
      <summary className="avatar" aria-label="Tài khoản" ref={trigger}>
        {role === 'ADMIN' ? 'AD' : profile.name.slice(0, 1).toUpperCase()}
      </summary>
      <div className="account-dropdown">
        <div className="account-menu-identity">
          <strong>{role === 'ADMIN' ? 'Quản trị viên' : profile.name}</strong>
          <span>{profile.email}</span>
          <small>Tài khoản cá nhân</small>
        </div>
        <nav aria-label="Menu tài khoản">
          {(role === 'ADMIN'
            ? [
                { path: '/admin/templates', label: 'Quản lý mẫu', icon: Mail },
                links[2],
              ]
            : links
          ).map(({ path, label, icon: Icon }) => (
            <button key={path} onClick={() => go(path)}>
              <Icon size={18} />
              {label}
            </button>
          ))}
          {role === 'CUSTOMER' && (
            <button onClick={() => go('/templates')}>
              <Plus size={18} />
              Tạo thiệp mới
            </button>
          )}
        </nav>
        <button
          className="account-signout"
          onClick={() => {
            setRole('ANONYMOUS');
            go('/home');
          }}
        >
          <LogOut size={18} />
          Đăng xuất
        </button>
      </div>
    </details>
  );
}
export function AccountWorkspace({ children }: { children: ReactNode }) {
  const { route, profile, navigate } = usePrototype();
  return (
    <div className="account-workspace">
      <aside className="account-sidebar">
        <div className="workspace-identity">
          <span className="avatar">
            {profile.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{profile.name}</strong>
            <span>Góc riêng của bạn</span>
          </div>
        </div>
        <p className="eyebrow">KHÔNG GIAN CÁ NHÂN</p>
        <nav aria-label="Khu vực tài khoản">
          {links.map(({ path, label, icon: Icon }) => (
            <button
              key={path}
              aria-current={route === path ? 'page' : undefined}
              onClick={() => navigate(path)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="account-sidebar-bottom">
          <p>
            Một lời mời đẹp,
            <br />
            một ngày đáng nhớ.
          </p>
          <Button variant="secondary" onClick={() => navigate('/templates')}>
            <Plus size={16} />
            Tạo thiệp mới
          </Button>
        </div>
      </aside>
      <div className="account-workspace-content">{children}</div>
    </div>
  );
}
export function AccountOverview() {
  const { profile, invitations, navigate, scenario } = usePrototype();
  const items = scenario === 'empty' ? [] : invitations;
  const published = items.filter((i) => i.status === 'PUBLISHED').length;
  const responses = items.reduce(
    (sum, i) => sum + (mockState.itemsBySlug[i.id]?.length ?? 0),
    0,
  );
  return (
    <main className="page overview-page" tabIndex={-1}>
      <PageHeading
        eyebrow="KHÔNG GIAN CỦA BẠN"
        title="Mọi lời mời, ở một nơi."
        description="Chuẩn bị ngày vui theo cách thật nhẹ nhàng."
      />
      <ScenarioContent>
        <section className="overview-welcome">
          <div>
            <span className="eyebrow">CHÀO MỪNG TRỞ LẠI</span>
            <h2>{profile.name}</h2>
            <p>{profile.email}</p>
            <button className="text-link" onClick={() => navigate('/account')}>
              Cập nhật hồ sơ <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="welcome-caption">
            <span className="editorial">
              Ngày vui bắt đầu
              <br />
              từ một lời mời.
            </span>
            <Button onClick={() => navigate('/templates')}>
              <Plus size={18} />
              Tạo thiệp mới
            </Button>
          </div>
        </section>
        <section className="account-stats" aria-label="Tổng quan thiệp">
          {[
            {
              label: 'Thiệp của bạn',
              value: items.length,
              detail: 'Tất cả lời mời đã tạo',
              icon: Mail,
            },
            {
              label: 'Đang xuất bản',
              value: published,
              detail: 'Sẵn sàng chia sẻ với khách',
              icon: CheckCircle2,
            },
            {
              label: 'Bản nháp & tạm dừng',
              value: items.length - published,
              detail: 'Tiếp tục khi bạn sẵn sàng',
              icon: FileText,
            },
          ].map(({ label, value, detail, icon: Icon }) => (
            <article key={label}>
              <Icon size={20} />
              <p>{label}</p>
              <strong>{value}</strong>
              <span>{detail}</span>
            </article>
          ))}
        </section>
        <section className="overview-recent">
          <div className="overview-section-heading">
            <h2>Tiếp tục chuẩn bị ngày vui</h2>
            <button
              className="text-link"
              onClick={() => navigate('/invitations')}
            >
              Tất cả thiệp <ArrowUpRight size={16} />
            </button>
          </div>
          {!items.length ? (
            <Empty
              title="Lời mời đầu tiên đang chờ bạn"
              action={
                <Button onClick={() => navigate('/templates')}>
                  Khám phá mẫu thiệp
                </Button>
              }
            />
          ) : (
            items.slice(0, 3).map((i) => (
              <article key={i.id}>
                <span className="overview-invitation-icon">
                  <Mail size={22} />
                </span>
                <div>
                  <h3>
                    {i.data.bride?.name} & {i.data.groom?.name}
                  </h3>
                  <p>
                    {i.status === 'PUBLISHED'
                      ? 'Đã xuất bản'
                      : i.status === 'DRAFT'
                        ? 'Bản nháp'
                        : 'Tạm dừng chia sẻ'}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/editor/${i.id}`)}
                >
                  Tiếp tục <ArrowUpRight size={16} />
                </Button>
              </article>
            ))
          )}
        </section>
        <section className="overview-rsvp">
          <div>
            <h2>Đón những lời hồi âm</h2>
            <p>{responses} phản hồi RSVP trong các thiệp của bạn.</p>
          </div>
          <Button
            variant="secondary"
            disabled={!items.length}
            onClick={() =>
              navigate(
                `/rsvps/${(items.find((i) => i.status === 'PUBLISHED') ?? items[0])?.id}`,
              )
            }
          >
            Quản lý tham dự <ArrowUpRight size={16} />
          </Button>
        </section>
      </ScenarioContent>
    </main>
  );
}
