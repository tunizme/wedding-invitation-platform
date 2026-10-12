import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ComponentProps,
} from 'react';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  LoaderCircle,
  X,
  AlertCircle,
} from 'lucide-react';
import { InvitationRenderer } from '../../web/src/features/invitation-builder/renderer/invitation-renderer';
import { resolveDesign } from '../../web/src/features/invitation-builder/document/resolve-design';
import type {
  SupportedTemplateDesign,
  WeddingData,
} from '../../web/src/features/invitation-builder/document/types';
import { AS_OF, assetUrls, sampleData, type TemplateFixture } from './fixtures';
import { createPrototypeDesign } from './responsive-fixtures';
import { usePrototype } from './App';
import { Button as PlatformButton } from '../../web/src/ui/platform/button';
export function Button(props: ComponentProps<typeof PlatformButton>) {
  return (
    <PlatformButton
      {...props}
      className={`platform-button ${props.className ?? ''}`}
    />
  );
}
export { Field, SelectField } from '../../web/src/ui/platform/field';

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
  editorial = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  editorial?: boolean;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 tabIndex={-1} className={editorial ? 'editorial' : ''}>
          {title}
        </h1>
        {description && <p className="muted lead">{description}</p>}
      </div>
      {action}
    </header>
  );
}
export function Status({ status }: { status: string }) {
  const published = status === 'PUBLISHED' || status === 'saved';
  return (
    <span className={`status ${published ? 'success' : ''}`}>
      <Check size={14} aria-hidden="true" />
      {(
        {
          PUBLISHED: 'Đã xuất bản',
          DRAFT: 'Bản nháp',
          UNPUBLISHED: 'Đã ngừng xuất bản',
          saved: 'Đã lưu',
        } as Record<string, string>
      )[status] ?? status}
    </span>
  );
}
export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'error' | 'success';
}) {
  return (
    <div
      className={`notice ${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {tone === 'success' ? (
        <Check size={18} aria-hidden="true" />
      ) : (
        <AlertCircle size={18} aria-hidden="true" />
      )}
      <div>{children}</div>
    </div>
  );
}
export function Empty({
  title = 'Chưa có thiệp nào',
  description = 'Bắt đầu với một mẫu bạn yêu thích và tạo lời mời đầu tiên của mình.',
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-mark" aria-hidden="true">
        ✳
      </span>
      <h2>{title}</h2>
      <p className="muted">{description}</p>
      {action}
    </div>
  );
}
export function ScenarioContent({ children }: { children: ReactNode }) {
  const { scenario, setScenario } = usePrototype();
  if (scenario === 'loading')
    return (
      <div
        className="skeleton-grid"
        role="status"
        aria-label="Đang tải nội dung"
      >
        {[0, 1, 2, 3].map((i) => (
          <div className="skeleton" key={i} />
        ))}
        <span className="sr-only">Đang tải…</span>
      </div>
    );
  if (scenario === 'error')
    return (
      <Notice tone="error">
        Chưa thể tải nội dung. Dữ liệu của bạn vẫn được giữ lại.
        <br />
        <button className="text-link" onClick={() => setScenario('normal')}>
          Thử lại <ArrowRight size={16} />
        </button>
      </Notice>
    );
  return children;
}
export function Back({
  to = '/templates',
  children = 'Về kho mẫu',
}: {
  to?: string;
  children?: ReactNode;
}) {
  const { navigate } = usePrototype();
  return (
    <button className="text-link back" onClick={() => navigate(to)}>
      <ChevronLeft size={16} />
      {children}
    </button>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  drawer = false,
  large = false,
  className = '',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  drawer?: boolean;
  large?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const callback = useRef(onClose);
  callback.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const cancel = (event: Event) => {
      event.preventDefault();
      callback.current();
    };
    const containTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const controls = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.getClientRects().length);
      const first = controls[0],
        last = controls.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === heading.current)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    dialog.addEventListener('cancel', cancel);
    dialog.addEventListener('keydown', containTab);
    dialog.showModal();
    heading.current?.focus();
    return () => {
      dialog.removeEventListener('cancel', cancel);
      dialog.removeEventListener('keydown', containTab);
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      else
        document.querySelector<HTMLElement>('main h1, .workspace h1')?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${drawer ? 'drawer' : ''} ${large ? 'dialog-large' : ''} ${className}`}
      aria-labelledby="dialog-title"
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <header className="dialog-header">
        <h2 id="dialog-title" ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <button className="icon-button" aria-label="Đóng" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
export function TemplateCover({
  template,
  data = sampleData,
}: {
  template: TemplateFixture;
  data?: WeddingData;
}) {
  return (
    <div
      className={`template-cover cover-${template.category}`}
      style={{ backgroundColor: template.paper, color: template.ink }}
    >
      <div className="cover-type">
        <span className="cover-kicker">THE WEDDING OF</span>
        <span className="cover-names">
          {data.bride?.name}
          <i>&</i>
          {data.groom?.name}
        </span>
        <span className="cover-date">20 . 12 . 2026</span>
      </div>
      <img src={assetUrls[template.photo]} alt="" loading="lazy" />
      <span className="cover-foot">MỘT NGÀY, MỘT ĐỜI, MỘT CHÚNG MÌNH.</span>
    </div>
  );
}
export function TemplateCard({ template }: { template: TemplateFixture }) {
  const { openTemplate } = usePrototype();
  return (
    <article className="template-card">
      <button
        className="cover-button"
        aria-label={`Xem mẫu ${template.name}`}
        onClick={() => openTemplate(template.id)}
      >
        <TemplateCover template={template} />
        <span className="cover-action">
          Xem mẫu <ArrowRight size={17} />
        </span>
      </button>
      <div className="card-meta">
        <h3>
          <button
            className="title-button"
            onClick={() => openTemplate(template.id)}
          >
            {template.name}
          </button>
        </h3>
        <span className="muted">
          {template.category} · {template.tags[0]}
        </span>
      </div>
    </article>
  );
}
export function LivePreview({
  template,
  data = { ...sampleData, couple: { photo: template.photo } },
  publicMode = false,
  slug = '50000000-0000-4000-8000-000000000001',
  open = true,
  document: design,
  hostPolicy = 'mobile',
  assets = {},
}: {
  template: TemplateFixture;
  data?: WeddingData;
  publicMode?: boolean;
  slug?: string;
  open?: boolean;
  document?: SupportedTemplateDesign;
  assets?: Record<string, string>;
  hostPolicy?: 'mobile' | 'adaptive';
}) {
  const [width, setWidth] = useState(390);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.min(390, entry.contentRect.width)),
    );
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, []);
  const context = {
    mode: publicMode ? ('public' as const) : ('preview' as const),
    asOf: AS_OF,
    invitation: { slug, publicVersion: 1, rsvpOpen: open },
    assetUrls: { ...assetUrls, ...assets },
  };
  const resolved = resolveDesign(
    design ?? createPrototypeDesign(template),
    data,
    context,
  );
  if (resolved.scene.schemaVersion === 2)
    return (
      <div
        className={`live-preview ${hostPolicy === 'adaptive' ? 'live-preview-adaptive' : ''}`}
        ref={ref}
      >
        <InvitationRenderer
          scene={resolved.scene}
          context={context}
          hostPolicy={hostPolicy}
        />
      </div>
    );
  return (
    <div className="live-preview" ref={ref}>
      <div
        style={{
          height: (resolved.scene.canvas.height * width) / 390,
          width: '100%',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: 390,
            transform: `scale(${width / 390})`,
            transformOrigin: 'top left',
          }}
        >
          <InvitationRenderer scene={resolved.scene} context={context} />
        </div>
      </div>
    </div>
  );
}
export function Busy({ children = 'Đang xử lý…' }: { children?: ReactNode }) {
  return (
    <span className="busy" role="status">
      <LoaderCircle size={16} className="spin" aria-hidden="true" />
      {children}
    </span>
  );
}
