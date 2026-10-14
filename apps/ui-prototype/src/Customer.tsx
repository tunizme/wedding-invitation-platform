import { createPrototypeDesign } from './responsive-fixtures';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  Expand,
  ImagePlus,
  MailCheck,
  MapPin,
  MoreHorizontal,
  Plus,
  Send,
  Settings2,
  Type,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { usePrototype } from './App';
import {
  ASSET_IDS,
  AS_OF,
  assetUrls,
  createDesign,
  sampleData,
  templates,
  type InvitationFixture,
} from './fixtures';
import type { WeddingData } from '../../web/src/features/invitation-builder/document/types';
import { formFieldsForDesign } from '../../web/src/features/invitation-builder/document/binding-catalog';
import { validateWeddingData } from '../../web/src/features/invitations/wedding-data.schema';
import { mockState } from './rsvp-mock';
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
  Status,
  TemplateCover,
} from './ui';

export function Dashboard() {
  const { invitations, catalog, navigate, scenario, toast } = usePrototype();
  const [menu, setMenu] = useState<string | null>(null);
  async function copy(id: string) {
    await navigator.clipboard
      .writeText(`${location.origin}/#/i/${id}`)
      .then(() => toast('Đã sao chép liên kết minh họa'))
      .catch(() =>
        toast(
          'Không thể sao chép. Hãy sao chép đường dẫn trong màn hình chia sẻ.',
        ),
      );
  }
  return (
    <main className="page" tabIndex={-1}>
      <PageHeading
        title="Thiệp của tôi"
        eyebrow="GÓC NHỎ CỦA HAI BẠN"
        description="Những lời mời đang chờ được gửi đi."
        action={
          <Button onClick={() => navigate('/templates')}>
            <Plus size={18} />
            Tạo thiệp
          </Button>
        }
      />
      <ScenarioContent>
        {scenario === 'empty' || !invitations.length ? (
          <Empty
            action={
              <Button onClick={() => navigate('/templates')}>
                Khám phá mẫu <ArrowRight size={16} />
              </Button>
            }
          />
        ) : (
          <div className="invitation-grid">
            {invitations.map((invitation) => {
              const template =
                catalog.find((t) => t.id === invitation.templateId) ??
                templates[0];
              return (
                <article className="invitation-card" key={invitation.id}>
                  <button
                    className="cover-button"
                    onClick={() => navigate(`/editor/${invitation.id}`)}
                    aria-label={`Chỉnh sửa thiệp ${invitation.data.bride?.name} và ${invitation.data.groom?.name}`}
                  >
                    <TemplateCover template={template} data={invitation.data} />
                  </button>
                  <div className="invitation-card-info">
                    <div className="row between">
                      <Status status={invitation.status} />
                      <details
                        className="more-menu"
                        open={menu === invitation.id}
                        onToggle={(e) => {
                          if (!e.currentTarget.open && menu === invitation.id)
                            setMenu(null);
                        }}
                      >
                        <summary
                          aria-label="Thao tác với thiệp"
                          onClick={(e) => {
                            e.preventDefault();
                            setMenu(
                              menu === invitation.id ? null : invitation.id,
                            );
                          }}
                        >
                          <MoreHorizontal size={20} />
                        </summary>
                        <div className="menu-panel">
                          <button
                            onClick={() => navigate(`/editor/${invitation.id}`)}
                          >
                            Chỉnh sửa
                          </button>
                          <button
                            onClick={() => navigate(`/rsvps/${invitation.id}`)}
                          >
                            Phản hồi RSVP
                          </button>
                          {invitation.status === 'PUBLISHED' && (
                            <>
                              <button
                                onClick={() => navigate(`/i/${invitation.id}`)}
                              >
                                Xem thiệp công khai
                              </button>
                              <button onClick={() => void copy(invitation.id)}>
                                Sao chép liên kết
                              </button>
                            </>
                          )}
                        </div>
                      </details>
                    </div>
                    <h2>
                      {invitation.data.bride?.name} &{' '}
                      {invitation.data.groom?.name}
                    </h2>
                    <p className="small muted">
                      {template.name} · Cập nhật{' '}
                      {new Intl.DateTimeFormat('vi-VN', {
                        day: 'numeric',
                        month: 'numeric',
                      }).format(new Date(invitation.updatedAt))}
                    </p>
                    <button
                      className="text-link"
                      onClick={() => navigate(`/editor/${invitation.id}`)}
                    >
                      Tiếp tục hoàn thiện <ArrowRight size={16} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </ScenarioContent>
    </main>
  );
}

function MediaLibrary({
  onSelect,
  onClose,
}: {
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const { invitations, scenario, setScenario } = usePrototype();
  const [query, setQuery] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const items = Object.keys(assetUrls).filter((_, index) =>
    `Ảnh ${index + 1}`
      .toLocaleLowerCase('vi')
      .includes(query.toLocaleLowerCase('vi')),
  );
  const referenced = (id: string) =>
    invitations.some((i) =>
      [i.data, i.publishedData].some(
        (d) =>
          d && [d.bride?.photo, d.groom?.photo, d.couple?.photo].includes(id),
      ),
    );
  async function upload(file?: File) {
    if (!file) return;
    setError('');
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      setError('Chọn ảnh JPEG, PNG hoặc WebP, dung lượng tối đa 10 MiB.');
      return;
    }
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      const tooLarge =
        bitmap.width > 10000 ||
        bitmap.height > 10000 ||
        bitmap.width * bitmap.height > 25000000;
      bitmap.close();
      if (tooLarge)
        throw new Error(
          'Ảnh quá lớn. Hãy chọn ảnh có cạnh tối đa 10.000px và không quá 25 triệu pixel.',
        );
      if (scenario === 'error')
        throw new Error('Upload thất bại. Ảnh chưa được thêm. Hãy thử lại.');
      const id = crypto.randomUUID();
      assetUrls[id] = URL.createObjectURL(file);
      setVersion(version + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Không đọc được ảnh. Hãy thử ảnh khác.',
      );
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }
  return (
    <Dialog title="Ảnh của bạn" onClose={onClose} drawer>
      <p className="muted">Chọn một khoảnh khắc để đưa vào lời mời.</p>
      <label className="upload-zone">
        <Upload size={24} aria-hidden="true" />
        <strong>{busy ? 'Đang kiểm tra ảnh…' : 'Tải ảnh lên'}</strong>
        <span>JPEG, PNG, WebP · Tối đa 10 MiB</span>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          aria-label="Tải ảnh lên"
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </label>
      <Field
        id="media-search"
        label="Tìm ảnh"
        placeholder="Ảnh 1…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && (
        <Notice tone="error">
          {error}
          <button
            className="text-link"
            onClick={() => {
              setScenario('normal');
              setError('');
              fileInput.current?.click();
            }}
          >
            Thử lại
          </button>
        </Notice>
      )}
      <div className="media-grid">
        {items.map((id, index) => (
          <article key={id}>
            <button
              className="media-choice"
              onClick={() => {
                onSelect(id);
                onClose();
              }}
            >
              <img src={assetUrls[id]} alt={`Ảnh minh họa ${index + 1}`} />
              <span>
                Chọn ảnh {index + 1}
                <Check size={16} />
              </span>
            </button>
            <button
              className="text-link small"
              onClick={() => {
                if (referenced(id)) {
                  setError(
                    'Ảnh đang được dùng trong bản nháp hoặc bản đã xuất bản. Hãy thay ảnh trước khi xóa.',
                  );
                  return;
                }
                if (ASSET_IDS.includes(id)) {
                  setError(
                    'Ảnh mẫu được giữ để có thể đặt lại prototype. Bạn có thể thử xóa ảnh vừa upload chưa được sử dụng.',
                  );
                  return;
                }
                URL.revokeObjectURL(assetUrls[id]);
                delete assetUrls[id];
                setVersion(version + 1);
              }}
            >
              Xóa ảnh
            </button>
          </article>
        ))}
      </div>
      {!items.length && (
        <Empty
          title="Không có ảnh phù hợp"
          description="Thử tên ảnh khác hoặc tải ảnh mới."
        />
      )}
    </Dialog>
  );
}

type Category =
  'couple' | 'photos' | 'event' | 'story' | 'timeline' | 'bank' | 'settings';
const categories = [
  { id: 'couple' as const, label: 'Hai bạn', icon: Users },
  { id: 'photos' as const, label: 'Hình ảnh', icon: ImagePlus },
  { id: 'event' as const, label: 'Lễ & tiệc', icon: MapPin },
  { id: 'story' as const, label: 'Câu chuyện', icon: Type },
  { id: 'timeline' as const, label: 'Timeline', icon: MailCheck },
  { id: 'bank' as const, label: 'Mừng cưới', icon: MailCheck },
  { id: 'settings' as const, label: 'Chia sẻ', icon: Settings2 },
];
export function InvitationEditor({ id }: { id: string }) {
  const {
    invitations,
    setInvitations,
    catalog,
    navigate,
    scenario,
    setScenario,
    toast,
  } = usePrototype();
  const invitation = invitations.find((item) => item.id === id);
  const template =
    catalog.find((t) => t.id === invitation?.templateId) ?? templates[0];
  const [data, setData] = useState<WeddingData>(() =>
    structuredClone(invitation?.data ?? sampleData),
  );
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [media, setMedia] = useState(false),
    [fullscreen, setFullscreen] = useState(false);
  const [saveState, setSaveState] = useState('saved'),
    [publishState, setPublishState] = useState('idle'),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState<string | null>(null);
  const [assetTarget, setAssetTarget] = useState<'couple' | 'bride' | 'groom'>(
    'couple',
  );
  const generation = useRef(0),
    mounted = useRef(true),
    latest = useRef(data),
    saved = useRef(JSON.stringify(data));
  latest.current = data;
  const fields = formFieldsForDesign(
    invitation?.document ?? createPrototypeDesign(template),
  );
  const has = (name: string) => fields.some((f) => f.id === name);
  const available = categories.filter((c) => c.id !== 'bank' || has('bank'));
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    if (JSON.stringify(data) === saved.current) return;
    const timer = setTimeout(() => save(data), 800);
    return () => clearTimeout(timer);
  }, [data]); // The simulation reads current scenario through save, and never calls an API.
  function validate(value: WeddingData) {
    const issues: Record<string, string> = {};
    if (!value.bride?.name?.trim()) issues.bride = 'Hãy điền tên cô dâu.';
    if (!value.groom?.name?.trim()) issues.groom = 'Hãy điền tên chú rể.';
    const result = validateWeddingData(value);
    if (!result.valid)
      issues.form =
        'Có thông tin chưa đúng định dạng. Kiểm tra ngày giờ, dòng thời gian và các nội dung vừa nhập.';
    setErrors(issues);
    return !Object.keys(issues).length;
  }
  function save(value = latest.current): boolean {
    if (!validate(value)) {
      setSaveState('invalid');
      return false;
    }
    if (scenario === 'conflict') {
      setSaveState('conflict');
      return false;
    }
    if (scenario === 'error') {
      setSaveState('error');
      return false;
    }
    setSaveState('saving');
    saved.current = JSON.stringify(value);
    setInvitations((items) =>
      items.map((i) =>
        i.id === id
          ? {
              ...i,
              data: structuredClone(value),
              updatedAt: new Date().toISOString(),
            }
          : i,
      ),
    );
    setTimeout(() => {
      if (mounted.current) setSaveState('saved');
    }, 250);
    return true;
  }
  function edit(update: (draft: WeddingData) => void) {
    const next = structuredClone(latest.current);
    update(next);
    setData(next);
    setSaveState('dirty');
  }
  async function publish() {
    if (publishState === 'pending' || publishState === 'running') return;
    if (!save()) {
      setPublishState('idle');
      return;
    }
    const token = ++generation.current;
    const snapshot = structuredClone(latest.current);
    setPublishState('pending');
    await new Promise((r) => setTimeout(r, 400));
    if (!mounted.current || generation.current !== token) return;
    setPublishState('running');
    await new Promise((r) => setTimeout(r, 600));
    if (!mounted.current || generation.current !== token) return;
    setInvitations((items) =>
      items.map((i) =>
        i.id === id
          ? { ...i, status: 'PUBLISHED', publishedData: snapshot }
          : i,
      ),
    );
    setPublishState('success');
  }
  function choosePhoto(target: 'couple' | 'bride' | 'groom') {
    setAssetTarget(target);
    setMedia(true);
  }
  function requestNavigate(target: string) {
    if (JSON.stringify(latest.current) !== saved.current) {
      setLeaveTarget(target);
    } else navigate(target);
  }
  const event = data.events?.reception;
  const busy = publishState === 'pending' || publishState === 'running';
  const savedText = (
    {
      saved: 'Đã lưu',
      dirty: 'Chưa lưu',
      saving: 'Đang lưu…',
      invalid: 'Cần kiểm tra',
      error: 'Lưu thất bại',
      conflict: 'Xung đột phiên bản',
    } as Record<string, string>
  )[saveState];
  function panel(category: Category) {
    return (
      <div className="editor-fields">
        <p className="eyebrow">NỘI DUNG CỦA HAI BẠN</p>

        {category === 'couple' && (
          <>
            <p className="muted small">
              Bắt đầu từ hai nhân vật chính của ngày đặc biệt.
            </p>
            <Field
              id="bride-name"
              label="Tên cô dâu"
              value={data.bride?.name ?? ''}
              error={errors.bride}
              maxLength={120}
              onChange={(e) =>
                edit((d) => {
                  d.bride = { ...d.bride, name: e.target.value };
                })
              }
            />
            <Field
              id="groom-name"
              label="Tên chú rể"
              value={data.groom?.name ?? ''}
              error={errors.groom}
              maxLength={120}
              onChange={(e) =>
                edit((d) => {
                  d.groom = { ...d.groom, name: e.target.value };
                })
              }
            />
            {has('parents.bride.fatherName') && (
              <>
                <h3>Gia đình hai bên</h3>
                {(['bride', 'groom'] as const).map((side) =>
                  (['fatherName', 'motherName'] as const).map((parent) => (
                    <Field
                      key={`${side}-${parent}`}
                      id={`${side}-${parent}`}
                      label={`${parent === 'fatherName' ? 'Bố' : 'Mẹ'} ${side === 'bride' ? 'cô dâu' : 'chú rể'}`}
                      value={data.parents?.[side]?.[parent] ?? ''}
                      onChange={(e) =>
                        edit((d) => {
                          d.parents = {
                            ...d.parents,
                            [side]: {
                              ...d.parents?.[side],
                              [parent]: e.target.value,
                            },
                          };
                        })
                      }
                    />
                  )),
                )}
              </>
            )}
            <p className="help-note">Thiết kế được giữ theo mẫu bạn đã chọn.</p>
          </>
        )}
        {category === 'photos' && (
          <>
            <p className="muted small">
              Chọn ảnh. Cách trình bày đã được tiệm chuẩn bị theo mẫu.
            </p>
            {(['couple', 'bride', 'groom'] as const)
              .filter((target) => has(`${target}.photo`))
              .map((target) => (
                <div className="photo-field" key={target}>
                  {data[target]?.photo && (
                    <img
                      src={assetUrls[data[target]!.photo!]}
                      alt={`Ảnh ${target === 'couple' ? 'đôi' : target === 'bride' ? 'cô dâu' : 'chú rể'} đã chọn`}
                    />
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => choosePhoto(target)}
                  >
                    <ImagePlus size={17} />
                    Chọn{' '}
                    {target === 'couple'
                      ? 'ảnh đôi'
                      : target === 'bride'
                        ? 'ảnh cô dâu'
                        : 'ảnh chú rể'}
                  </Button>
                </div>
              ))}
          </>
        )}
        {category === 'event' && (
          <>
            <Field
              id="event-date"
              label="Ngày và giờ tổ chức"
              type="datetime-local"
              value={event?.datetime?.slice(0, 16) ?? ''}
              onChange={(e) =>
                edit((d) => {
                  d.events = {
                    ...d.events,
                    reception: {
                      ...d.events?.reception,
                      datetime: e.target.value
                        ? `${e.target.value}:00+07:00`
                        : '',
                      timeZone: 'Asia/Ho_Chi_Minh',
                    },
                  };
                })
              }
              helper="Múi giờ Việt Nam · UTC+7"
            />
            <Field
              id="venue-name"
              label="Tên địa điểm"
              value={event?.venue?.name ?? ''}
              onChange={(e) =>
                edit((d) => {
                  d.events = {
                    ...d.events,
                    reception: {
                      ...d.events?.reception,
                      venue: {
                        ...d.events?.reception?.venue,
                        name: e.target.value,
                      },
                    },
                  };
                })
              }
            />
            <div className="customer-wide-field">
              <Field
                id="venue-address"
                label="Địa chỉ"
                value={event?.venue?.address ?? ''}
                onChange={(e) =>
                  edit((d) => {
                    d.events = {
                      ...d.events,
                      reception: {
                        ...d.events?.reception,
                        venue: {
                          ...d.events?.reception?.venue,
                          address: e.target.value,
                        },
                      },
                    };
                  })
                }
              />
            </div>
          </>
        )}
        {category === 'story' && (
          <label className="textarea-field">
            Câu chuyện của hai bạn
            <textarea
              rows={9}
              maxLength={4000}
              value={data.story ?? ''}
              onChange={(e) =>
                edit((d) => {
                  d.story = e.target.value;
                })
              }
            />
            <span className="muted small">
              Một cuộc gặp. Một lời hẹn. Những điều muốn kể.
            </span>
          </label>
        )}
        {category === 'timeline' && (
          <>
            {data.timeline?.map((entry, index) => (
              <div className="timeline-field" key={entry.id}>
                <div className="row between">
                  <strong>Khoảnh khắc {index + 1}</strong>
                  <button
                    className="icon-button"
                    aria-label={`Xóa khoảnh khắc ${index + 1}`}
                    onClick={() =>
                      edit((d) => {
                        d.timeline?.splice(index, 1);
                      })
                    }
                  >
                    <X size={16} />
                  </button>
                </div>
                {(['title', 'dateLabel', 'description'] as const).map((key) => (
                  <Field
                    key={key}
                    id={`${entry.id}-${key}`}
                    label={
                      {
                        title: 'Tiêu đề',
                        dateLabel: 'Mốc thời gian',
                        description: 'Mô tả',
                      }[key]
                    }
                    value={entry[key] ?? ''}
                    onChange={(e) =>
                      edit((d) => {
                        d.timeline![index][key] = e.target.value;
                      })
                    }
                  />
                ))}
              </div>
            ))}
            <Button
              variant="secondary"
              disabled={(data.timeline?.length ?? 0) >= 20}
              onClick={() =>
                edit((d) => {
                  d.timeline = [
                    ...(d.timeline ?? []),
                    { id: crypto.randomUUID(), title: 'Khoảnh khắc mới' },
                  ];
                })
              }
            >
              <Plus size={16} />
              Thêm khoảnh khắc
            </Button>
          </>
        )}
        {category === 'bank' && (
          <>
            <Notice>
              Thông tin minh họa. Không chuyển tiền tới tài khoản này.
            </Notice>
            {(['bin', 'account', 'recipientName', 'message'] as const).map(
              (key) => (
                <Field
                  key={key}
                  id={`bank-${key}`}
                  label={
                    {
                      bin: 'Mã BIN ngân hàng',
                      account: 'Số tài khoản',
                      recipientName: 'Tên người nhận',
                      message: 'Nội dung chuyển khoản',
                    }[key]
                  }
                  value={data.bank?.[key] ?? ''}
                  onChange={(e) =>
                    edit((d) => {
                      d.bank = { ...d.bank, [key]: e.target.value };
                    })
                  }
                />
              ),
            )}
          </>
        )}
        {category === 'settings' && (
          <>
            <p className="muted">
              Kiểm tra thiệp, xuất bản rồi gửi đường dẫn tới khách mời.
            </p>
            <Button
              variant="secondary"
              onClick={() => requestNavigate(`/rsvps/${id}`)}
            >
              <MailCheck size={17} />
              Quản lý phản hồi RSVP
            </Button>
            {invitation?.status === 'PUBLISHED' && (
              <Button
                variant="destructive"
                onClick={() => {
                  setConfirmUnpublish(true);
                }}
              >
                Ngừng xuất bản
              </Button>
            )}
          </>
        )}
      </div>
    );
  }
  if (!invitation)
    return (
      <main className="page">
        <Back to="/invitations" />
        <Empty title="Không tìm thấy thiệp" />
      </main>
    );
  return (
    <main className="workspace customer-workspace" tabIndex={-1}>
      <header className="workspace-toolbar">
        <button
          className="icon-button"
          aria-label="Về thiệp của tôi"
          onClick={() => requestNavigate('/invitations')}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="workspace-title">
          <h1 tabIndex={-1}>
            {data.bride?.name} & {data.groom?.name}
          </h1>
          <span className="muted small">{template.name}</span>
        </div>
        <div className="segmented editor-view-tabs" aria-label="Chế độ editor">
          <button
            aria-pressed={view === 'edit'}
            onClick={() => setView('edit')}
          >
            Chỉnh sửa
          </button>
          <button
            aria-pressed={view === 'preview'}
            onClick={() => setView('preview')}
          >
            Xem trước
          </button>
        </div>
        <span
          className={`save-status ${saveState === 'error' || saveState === 'conflict' ? 'error-text' : ''}`}
          role="status"
        >
          {saveState === 'saving' ? (
            <Busy>{savedText}</Busy>
          ) : (
            <>
              <Check size={15} />
              {savedText}
            </>
          )}
        </span>
        <Button
          variant="secondary"
          className="manual-save"
          disabled={busy}
          onClick={() => save()}
        >
          Lưu
        </Button>
        <Button disabled={busy} onClick={() => void publish()}>
          {busy ? (
            <Busy>
              {publishState === 'pending' ? 'Đang chờ…' : 'Đang xuất bản…'}
            </Busy>
          ) : (
            <>
              <Send size={16} />
              Xuất bản
            </>
          )}
        </Button>
      </header>
      {(errors.form || saveState === 'error' || saveState === 'conflict') && (
        <div className="customer-save-feedback">
          {errors.form && <Notice tone="error">{errors.form}</Notice>}
          {(saveState === 'error' || saveState === 'conflict') && (
            <Notice tone="error">
              {saveState === 'conflict'
                ? 'Bản trên máy chủ đã thay đổi. Nội dung bạn nhập vẫn được giữ. Kiểm tra lại trước khi lưu tiếp.'
                : 'Chưa thể lưu thay đổi. Nội dung bạn nhập vẫn được giữ.'}
              <Button
                variant="secondary"
                onClick={() => {
                  setScenario('normal');
                  setSaveState('dirty');
                }}
              >
                Kiểm tra lại và thử lưu
              </Button>
            </Notice>
          )}
        </div>
      )}
      {view === 'edit' ? (
        <div className="customer-form-stack">
          <p className="editor-intro muted">
            Thêm câu chuyện của hai bạn. Thiết kế được giữ theo mẫu đã chọn.
          </p>
          {available.map(({ id: key, label, icon: Icon }) => (
            <details
              className="customer-form-section"
              key={key}
              open={key === 'couple'}
            >
              <summary>
                <ChevronRight size={16} />
                <Icon size={18} />
                <h2>{label === 'Hai bạn' ? 'Thông tin cơ bản' : label}</h2>
              </summary>
              {panel(key)}
            </details>
          ))}
        </div>
      ) : (
        <section className="customer-preview-page" aria-label="Xem trước thiệp">
          <div className="row between editor-preview-label">
            <span className="muted small">Bản nháp · Khung mobile</span>
            <button className="text-link" onClick={() => setFullscreen(true)}>
              <Expand size={16} />
              Toàn màn hình
            </button>
          </div>
          <LivePreview
            template={template}
            document={invitation.document}
            data={data}
          />
        </section>
      )}
      {media && (
        <MediaLibrary
          onClose={() => setMedia(false)}
          onSelect={(assetId) =>
            edit((d) => {
              d[assetTarget] = { ...d[assetTarget], photo: assetId };
            })
          }
        />
      )}
      {fullscreen && (
        <Dialog
          title="Xem trước thiệp"
          onClose={() => setFullscreen(false)}
          large
        >
          <div className="fullscreen-preview">
            <LivePreview
              template={template}
              document={invitation.document}
              data={data}
            />
          </div>
        </Dialog>
      )}
      {publishState === 'success' && (
        <Dialog
          title="Xuất bản thành công"
          onClose={() => setPublishState('idle')}
        >
          <div className="publish-success">
            <span className="success-emblem">
              <Check size={30} />
            </span>
            <h3>
              Thiệp của bạn đã sẵn sàng
              <br />
              để chia sẻ.
            </h3>
            <p className="muted">Gửi lời mời và cùng chờ một ngày thật đẹp.</p>
            <Field
              id="public-link"
              label="Liên kết thiệp minh họa"
              readOnly
              value={`${location.origin}/#/i/${id}`}
            />
            <Button
              onClick={() =>
                void navigator.clipboard
                  .writeText(`${location.origin}/#/i/${id}`)
                  .then(() => toast('Đã sao chép liên kết'))
                  .catch(() => toast('Hãy sao chép liên kết ở ô phía trên.'))
              }
            >
              <Copy size={17} />
              Sao chép liên kết
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/i/${id}`)}>
              Xem thiệp <ArrowRight size={16} />
            </Button>
          </div>
        </Dialog>
      )}
      {leaveTarget && (
        <Dialog
          title="Rời khi chưa lưu thay đổi?"
          onClose={() => setLeaveTarget(null)}
        >
          <p>
            Nội dung vừa nhập chưa được lưu. Bạn có thể ở lại để hoàn thiện
            trước khi rời trang.
          </p>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setLeaveTarget(null)}>
              Ở lại chỉnh sửa
            </Button>
            <Button variant="destructive" onClick={() => navigate(leaveTarget)}>
              Rời mà chưa lưu
            </Button>
          </div>
        </Dialog>
      )}
      {confirmUnpublish && (
        <Dialog
          title="Ngừng xuất bản thiệp?"
          onClose={() => setConfirmUnpublish(false)}
        >
          <p>
            Khách mời sẽ không mở được đường dẫn cho tới khi bạn xuất bản lại.
            Bản nháp vẫn được giữ.
          </p>
          <div className="dialog-actions">
            <Button
              variant="secondary"
              onClick={() => setConfirmUnpublish(false)}
            >
              Giữ thiệp công khai
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setInvitations((items) =>
                  items.map((i) =>
                    i.id === id ? { ...i, status: 'UNPUBLISHED' } : i,
                  ),
                );
                setConfirmUnpublish(false);
              }}
            >
              Ngừng xuất bản
            </Button>
          </div>
        </Dialog>
      )}
    </main>
  );
}

export function RsvpManagement({ id }: { id: string }) {
  const { invitations, setInvitations, scenario, setScenario } = usePrototype();
  const invitation = invitations.find((i) => i.id === id);
  const [limit, setLimit] = useState(1),
    [tick, setTick] = useState(0);
  const items = scenario === 'empty' ? [] : (mockState.itemsBySlug[id] ?? []);
  if (!invitation)
    return (
      <main className="page">
        <Empty title="Không tìm thấy thiệp" />
      </main>
    );
  return (
    <main className="page" tabIndex={-1}>
      <Back to="/invitations">Về thiệp của tôi</Back>
      <PageHeading
        title="Những lời hẹn đến chung vui"
        description={`${invitation.data.bride?.name} & ${invitation.data.groom?.name} · Phản hồi RSVP`}
      />
      <div className="rsvp-control">
        <div>
          <strong>
            {invitation.rsvpOpen
              ? 'Đang nhận phản hồi'
              : 'Đã đóng nhận phản hồi'}
          </strong>
          <p className="muted small">
            Khách mời xác nhận tham dự trực tiếp trên thiệp.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            if (scenario === 'conflict') {
              setScenario('normal');
              return;
            }
            setInvitations((all) =>
              all.map((i) =>
                i.id === id ? { ...i, rsvpOpen: !i.rsvpOpen } : i,
              ),
            );
            mockState.openBySlug[id] = !invitation.rsvpOpen;
          }}
        >
          {invitation.rsvpOpen ? 'Đóng nhận RSVP' : 'Mở nhận RSVP'}
        </Button>
      </div>
      {scenario === 'conflict' && (
        <Notice tone="error">
          Trạng thái đã thay đổi ở một phiên khác. Kiểm tra lại trước khi cập
          nhật.
        </Notice>
      )}
      <div className="row between results-caption">
        <span className="muted">Danh sách phản hồi · Dữ liệu minh họa</span>
        <button
          className="text-link"
          onClick={() => {
            setTick(tick + 1);
            setScenario('normal');
          }}
        >
          Làm mới
        </button>
      </div>
      <ScenarioContent>
        {!items.length ? (
          <Empty
            title="Chưa có lời hẹn nào"
            description="Chia sẻ thiệp để khách mời gửi phản hồi tham dự."
          />
        ) : (
          <>
            <div className="rsvp-list">
              {items.slice(0, limit).map((item) => (
                <article key={item.id}>
                  <div className="row between">
                    <h2>{item.name}</h2>
                    <span
                      className={`status ${item.attendance === 'ATTENDING' ? 'success' : ''}`}
                    >
                      {item.attendance === 'ATTENDING'
                        ? `Có tham dự · ${item.partySize} người`
                        : 'Không tham dự'}
                    </span>
                  </div>
                  <p>{item.message || 'Không có lời nhắn.'}</p>
                  <span className="muted small">
                    {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                  </span>
                </article>
              ))}
            </div>
            {limit < items.length && (
              <div className="load-more">
                <Button
                  variant="secondary"
                  onClick={() => setLimit(limit + 10)}
                >
                  Tải thêm phản hồi <ChevronRight size={16} />
                </Button>
              </div>
            )}
          </>
        )}
      </ScenarioContent>
    </main>
  );
}
export function GuestInvitation({ id }: { id: string }) {
  const { invitations, catalog, navigate, scenario } = usePrototype();
  const invitation = invitations.find((i) => i.id === id);
  if (
    !invitation ||
    invitation.status !== 'PUBLISHED' ||
    !invitation.publishedData
  )
    return (
      <main className="guest-unavailable">
        <h1 tabIndex={-1}>Lời mời chưa khả dụng</h1>
        <p>Thiệp chưa được xuất bản hoặc đã ngừng chia sẻ.</p>
        <Button variant="secondary" onClick={() => navigate('/home')}>
          Về tiệm
        </Button>
      </main>
    );
  const template =
    catalog.find((t) => t.id === invitation.templateId) ?? templates[0];
  mockState.openBySlug[id] = invitation.rsvpOpen;
  return (
    <main className="guest-page" tabIndex={-1}>
      <h1 className="sr-only" tabIndex={-1}>
        Thiệp cưới {invitation.publishedData.bride?.name} và{' '}
        {invitation.publishedData.groom?.name}
      </h1>
      <LivePreview
        key={`${id}-${scenario}-${invitation.rsvpOpen}`}
        template={template}
        document={invitation.document}
        data={invitation.publishedData}
        slug={id}
        publicMode
        hostPolicy="adaptive"
        open={invitation.rsvpOpen}
      />
    </main>
  );
}
