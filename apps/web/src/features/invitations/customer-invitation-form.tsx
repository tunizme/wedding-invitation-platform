'use client';
import Link from 'next/link';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
} from 'react';
import { useDirtyNavigationGuard } from '../identity-access/session/navigation-guard';
import { sessionStore } from '../identity-access/session/store';
import {
  builderRequest,
  BuilderApiError,
  type AssetSummary,
  type ListPage,
} from '../invitation-builder/api/client';
import type { FormField } from '../invitation-builder/document/binding-catalog';
import type {
  EventKey,
  WeddingData,
  WeddingEvent,
} from '../invitation-builder/document/types';
import { resolveDesign } from '../invitation-builder/document/resolve-design';
import { ScenePreview } from '../invitation-builder/renderer/scene-preview';
import { PublicInvitationView } from './public-invitation-view';
import { validateWeddingData } from './wedding-data.schema';
import {
  getPublicationOperation,
  publicationResult,
} from '../invitation-builder/api/operations';
import {
  getInvitation,
  publishInvitation,
  saveInvitation,
  unpublishInvitation,
  type InvitationDetail,
} from './api';

type Field = FormField & { required: boolean; eventKey?: string };
const errorMessage = (error: unknown) =>
  error instanceof BuilderApiError
    ? error.message
    : 'Không thể hoàn tất thao tác. Dữ liệu đang nhập vẫn được giữ.';
const eventKey = (field: Field): EventKey =>
  (field.eventKey || 'ceremony') as EventKey;
function fieldIdentity(field: Field): string {
  if (['wedding.date', 'wedding.time', 'wedding.event'].includes(field.id))
    return `events.${eventKey(field)}.datetime`;
  if (field.id === 'venue') return `events.${eventKey(field)}.venue`;
  if (field.id.startsWith('venue.'))
    return `events.${eventKey(field)}.${field.id}`;
  return field.id;
}
function valueOf(data: WeddingData, field: Field): string {
  const event = data.events?.[eventKey(field)];
  switch (field.id) {
    case 'bride.name':
      return data.bride?.name ?? '';
    case 'groom.name':
      return data.groom?.name ?? '';
    case 'bride.photo':
      return data.bride?.photo ?? '';
    case 'groom.photo':
      return data.groom?.photo ?? '';
    case 'couple.photo':
      return data.couple?.photo ?? '';
    case 'parents.bride.fatherName':
      return data.parents?.bride?.fatherName ?? '';
    case 'parents.bride.motherName':
      return data.parents?.bride?.motherName ?? '';
    case 'parents.groom.fatherName':
      return data.parents?.groom?.fatherName ?? '';
    case 'parents.groom.motherName':
      return data.parents?.groom?.motherName ?? '';
    case 'story':
      return data.story ?? '';
    case 'wedding.date':
    case 'wedding.time':
    case 'wedding.event':
      return event?.datetime ?? '';
    case 'venue.name':
      return event?.venue?.name ?? '';
    case 'venue.address':
      return event?.venue?.address ?? '';
    default:
      return '';
  }
}
function changed(data: WeddingData, field: Field, value: string): WeddingData {
  const next = structuredClone(data),
    key = eventKey(field);
  const ensureEvent = (): WeddingEvent => {
    next.events ??= {};
    next.events[key] ??= {};
    return next.events[key]!;
  };
  switch (field.id) {
    case 'bride.name':
      next.bride = { ...next.bride, name: value };
      break;
    case 'groom.name':
      next.groom = { ...next.groom, name: value };
      break;
    case 'bride.photo':
      next.bride = { ...next.bride };
      if (value) next.bride.photo = value;
      else delete next.bride.photo;
      break;
    case 'groom.photo':
      next.groom = { ...next.groom };
      if (value) next.groom.photo = value;
      else delete next.groom.photo;
      break;
    case 'couple.photo':
      next.couple = { ...next.couple };
      if (value) next.couple.photo = value;
      else delete next.couple.photo;
      break;
    case 'parents.bride.fatherName':
      next.parents = {
        ...next.parents,
        bride: { ...next.parents?.bride, fatherName: value },
      };
      break;
    case 'parents.bride.motherName':
      next.parents = {
        ...next.parents,
        bride: { ...next.parents?.bride, motherName: value },
      };
      break;
    case 'parents.groom.fatherName':
      next.parents = {
        ...next.parents,
        groom: { ...next.parents?.groom, fatherName: value },
      };
      break;
    case 'parents.groom.motherName':
      next.parents = {
        ...next.parents,
        groom: { ...next.parents?.groom, motherName: value },
      };
      break;
    case 'story':
      next.story = value;
      break;
    case 'wedding.date':
    case 'wedding.time':
    case 'wedding.event':
      ensureEvent().datetime = value;
      ensureEvent().timeZone ??= 'Asia/Ho_Chi_Minh';
      break;
    case 'venue.name':
      ensureEvent().venue = { ...ensureEvent().venue, name: value };
      break;
    case 'venue.address':
      ensureEvent().venue = { ...ensureEvent().venue, address: value };
      break;
  }
  return next;
}

export function CustomerInvitationForm({ id }: { id: string }) {
  const customer =
    useSyncExternalStore(sessionStore.subscribe, sessionStore.get, () => null)
      ?.user.role === 'CUSTOMER';
  const [detail, setDetail] = useState<InvitationDetail | null>(null),
    [data, setData] = useState<WeddingData | null>(null);
  const versionRef = useRef<number | null>(null);
  const [assetCursor, setAssetCursor] = useState<string | null>(null);
  const [assets, setAssets] = useState<AssetSummary[]>([]),
    [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [status, setStatus] = useState(''),
    [preview, setPreview] = useState<'mobile' | 'desktop'>('mobile');
  useEffect(() => {
    if (!customer) return;
    let active = true;
    void Promise.all([
      getInvitation(id),
      builderRequest<ListPage<AssetSummary>>('/assets'),
    ])
      .then(([invitation, library]) => {
        if (active) {
          versionRef.current = invitation.editVersion;
          setDetail(invitation);
          setData(invitation.draftWeddingData);
          setAssets(library.items);
          setAssetCursor(library.nextCursor);
        }
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, [customer, id]);
  const fields = useMemo(() => {
    const deduped = new Map<string, Field>();
    for (const field of detail?.formFields ?? []) {
      const key = fieldIdentity(field),
        prior = deduped.get(key);
      if (!prior) deduped.set(key, field);
      else
        deduped.set(key, {
          ...prior,
          required: prior.required || field.required,
        });
    }
    const fullVenues = new Set(
      [...deduped.values()]
        .filter((field) => field.id === 'venue')
        .map((field) => eventKey(field)),
    );
    return [...deduped.values()].filter(
      (field) =>
        !field.id.startsWith('venue.') || !fullVenues.has(eventKey(field)),
    );
  }, [detail]);
  const resolution = useMemo(
    () =>
      detail && data
        ? resolveDesign(detail.document, data, {
            mode: 'preview',
            asOf: new Date().toISOString(),
          })
        : null,
    [detail, data],
  );
  const visibleKey = resolution?.visibleAssetIds.join('|') ?? '';
  useEffect(() => {
    if (!detail || !visibleKey) return;
    const ids = visibleKey.split('|'),
      abort = new AbortController(),
      created: string[] = [];
    let active = true;
    void Promise.all(
      ids.map(async (assetId) => {
        let blob: Blob;
        try {
          blob = await builderRequest<Blob>(`/assets/${assetId}/content`, {
            bytes: true,
            signal: abort.signal,
          });
        } catch {
          blob = await builderRequest<Blob>(
            `/templates/${detail.templateId}/revisions/${detail.designRevisionId}/assets/${assetId}`,
            { bytes: true, signal: abort.signal },
          );
        }
        if (!active) return [assetId, ''] as const;
        const url = URL.createObjectURL(blob);
        created.push(url);
        return [assetId, url] as const;
      }),
    )
      .then((entries) => {
        if (active) setAssetUrls(Object.fromEntries(entries));
      })
      .catch(() => {
        if (active) {
          setAssetUrls({});
          setError(
            'Không thể tải ảnh xem trước. Dữ liệu vẫn được giữ; bạn có thể tải lại bản đã lưu.',
          );
        }
      });
    return () => {
      active = false;
      abort.abort();
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [detail, visibleKey]);
  function edit(field: Field, value: string) {
    if (!data || busy) return;
    setData(changed(data, field, value));
    setDirty(true);
    setStatus('');
  }
  function editEvent(
    field: Field,
    prop: 'timeZone' | 'name' | 'address' | 'latitude' | 'longitude',
    value: string,
  ) {
    if (!data || busy) return;
    const next = structuredClone(data),
      key = eventKey(field);
    next.events ??= {};
    next.events[key] ??= {};
    if (prop === 'timeZone') next.events[key]!.timeZone = value;
    else {
      next.events[key]!.venue ??= {};
      if (prop === 'latitude' || prop === 'longitude') {
        if (!value) delete next.events[key]!.venue![prop];
        else next.events[key]!.venue![prop] = Number(value);
      } else next.events[key]!.venue![prop] = value;
    }
    setData(next);
    setDirty(true);
    setStatus('');
  }
  function editBank(
    prop: 'bin' | 'account' | 'recipientName' | 'message',
    value: string,
  ) {
    if (!data || busy) return;
    setData({ ...data, bank: { ...data.bank, [prop]: value } });
    setDirty(true);
    setStatus('');
  }
  async function moreAssets() {
    if (!assetCursor || busy) return;
    setBusy(true);
    try {
      const page = await builderRequest<ListPage<AssetSummary>>(
        '/assets?' + new URLSearchParams({ cursor: assetCursor }),
      );
      setAssets((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((prior) => prior.id === item.id),
        ),
      ]);
      setAssetCursor(page.nextCursor);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function upload(field: Field, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set('file', file);
    form.set('name', file.name);
    form.set('kind', 'IMAGE');
    setBusy(true);
    setError('');
    try {
      const asset = await builderRequest<AssetSummary>('/assets', {
        method: 'POST',
        form,
      });
      setAssets((current) => [asset, ...current]);
      edit(field, asset.id);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }
  useDirtyNavigationGuard(dirty);
  async function reload() {
    if (
      busy ||
      (dirty &&
        !window.confirm('Bỏ các thay đổi chưa lưu và tải lại bản đã lưu?'))
    )
      return;
    setBusy(true);
    try {
      const current = await getInvitation(id);
      versionRef.current = current.editVersion;
      setDetail(current);
      setData(current.draftWeddingData);
      setDirty(false);
      setError('');
      setStatus('Đã tải lại bản đã lưu.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function save(): Promise<InvitationDetail | null> {
    if (!detail || !data || busy) return null;
    const parsed = validateWeddingData(data);
    if (!parsed.valid) {
      setError(`Dữ liệu chưa hợp lệ: ${parsed.issues[0]?.path ?? '/'}.`);
      return null;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await saveInvitation(
        detail.id,
        detail.editVersion,
        parsed.value,
      );
      versionRef.current = saved.editVersion;
      setDetail(saved);
      setData(saved.draftWeddingData);
      setDirty(false);
      setStatus('Đã lưu bản nháp.');
      return saved;
    } catch (cause) {
      setError(errorMessage(cause));
      return null;
    } finally {
      setBusy(false);
    }
  }
  const [refreshPending, setRefreshPending] = useState(false);
  async function refreshLifecycle() {
    try {
      const refreshed = await getInvitation(id);
      if (refreshed.id !== id || refreshed.editVersion !== versionRef.current)
        throw new BuilderApiError(409, 'VERSION_CONFLICT');
      setDetail(
        (previous) =>
          previous && {
            ...previous,
            status: refreshed.status,
            editVersion: refreshed.editVersion,
            publicVersion: refreshed.publicVersion,
            publicUrl: refreshed.publicUrl,
            updatedAt: refreshed.updatedAt,
            controlVersion: refreshed.controlVersion,
            rsvpOpen: refreshed.rsvpOpen,
          },
      );
      setRefreshPending(false);
      setError('');
    } catch (cause) {
      setRefreshPending(true);
      setError(
        cause instanceof BuilderApiError && cause.code === 'VERSION_CONFLICT'
          ? cause.message
          : 'Thao tác đã thành công nhưng chưa tải được thông tin hoặc đường dẫn thiệp.',
      );
    }
  }
  async function retryRefresh() {
    if (busy) return;
    setBusy(true);
    try {
      await refreshLifecycle();
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!detail || busy) return;
    const current = dirty ? await save() : detail;
    if (!current) return;
    setBusy(true);
    setStatus('Đang kiểm tra thiệp…');
    setError('');
    try {
      let operation = await publishInvitation(
        current.id,
        current.editVersion,
        crypto.randomUUID(),
      );
      const deadline = Date.now() + 90_000;
      while (
        Date.now() < deadline &&
        ['PENDING', 'RUNNING'].includes(operation.status)
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        operation = await getPublicationOperation(operation.id);
      }
      if (operation.status === 'SUCCEEDED') {
        const result = publicationResult(operation, current.id);
        if (
          !Number.isInteger(result.publicVersion) ||
          result.publicVersion! < 1
        )
          throw new Error('Missing public version');
        versionRef.current = result.editVersion;
        setDetail(
          (previous) =>
            previous && {
              ...previous,
              status: 'PUBLISHED',
              editVersion: result.editVersion,
              publicVersion: result.publicVersion!,
            },
        );
        setStatus('Đã xuất bản thiệp.');
        await refreshLifecycle();
      } else if (operation.status === 'FAILED') {
        setStatus('');
        const issue = operation.error?.issues[0];
        setError(
          `Chưa xuất bản được: ${operation.error?.code ?? 'RENDER_UNAVAILABLE'}${issue ? ` tại ${issue.path}` : ''}. Bản công khai cũ vẫn được giữ.`,
        );
      } else setStatus('Tác vụ vẫn đang xử lý. Bạn có thể kiểm tra lại sau.');
    } catch (cause) {
      setStatus('');
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function unpublish() {
    if (!detail || busy) return;
    setBusy(true);
    setError('');
    try {
      const committed = await unpublishInvitation(
        detail.id,
        detail.editVersion,
      );
      if (committed.id !== detail.id) throw new Error('Invalid resource');
      versionRef.current = committed.editVersion;
      setDetail(
        (previous) =>
          previous && {
            ...previous,
            status: committed.status,
            editVersion: committed.editVersion,
            publicVersion: committed.publicVersion,
            publicUrl: committed.publicUrl,
            updatedAt: committed.updatedAt,
            createdAt: committed.createdAt,
            controlVersion: committed.controlVersion,
            rsvpOpen: committed.rsvpOpen,
          },
      );
      setStatus('Đã gỡ thiệp công khai.');
      await refreshLifecycle();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  if (!customer) return <p role="alert">Khu vực này chỉ dành cho Customer.</p>;
  if (!detail || !data)
    return error ? (
      <p role="alert">{error}</p>
    ) : (
      <p>Đang tải thông tin thiệp…</p>
    );
  return (
    <section aria-label="Thông tin thiệp">
      <p>
        Mẫu: {detail.templateName} · {detail.status}
      </p>
      {detail.publicUrl && (
        <Link href={detail.publicUrl}>Xem thiệp công khai</Link>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset
          disabled={busy}
          style={{ border: 0, padding: 0, minWidth: 0 }}
        >
          <legend>Dữ liệu đám cưới</legend>
          {fields.map((field) => {
            const key = fieldIdentity(field),
              label =
                field.label + (field.eventKey ? ` · ${field.eventKey}` : '');
            if (field.type === 'asset')
              return (
                <fieldset key={key}>
                  <legend>{label}</legend>
                  <label>
                    Ảnh đã tải lên{' '}
                    <select
                      value={valueOf(data, field)}
                      onChange={(event) => edit(field, event.target.value)}
                    >
                      <option value="">Chọn ảnh</option>
                      {valueOf(data, field) &&
                        !assets.some(
                          (asset) => asset.id === valueOf(data, field),
                        ) && (
                          <option value={valueOf(data, field)}>
                            Ảnh đang sử dụng
                          </option>
                        )}
                      {assets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tải ảnh mới{' '}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => void upload(field, event)}
                    />
                  </label>
                  {assetCursor && (
                    <button type="button" onClick={() => void moreAssets()}>
                      Tải thêm ảnh của tôi
                    </button>
                  )}
                </fieldset>
              );
            if (field.id === 'bank')
              return (
                <fieldset key={key}>
                  <legend>{label}</legend>
                  {(
                    [
                      ['bin', 'Mã BIN ngân hàng'],
                      ['account', 'Số tài khoản'],
                      ['recipientName', 'Tên người nhận'],
                      ['message', 'Nội dung chuyển khoản'],
                    ] as const
                  ).map(([prop, name]) => (
                    <label key={prop}>
                      {name}
                      <input
                        value={data.bank?.[prop] ?? ''}
                        onChange={(event) => editBank(prop, event.target.value)}
                      />
                    </label>
                  ))}
                </fieldset>
              );
            if (field.id === 'bank.message') return null;
            if (field.id === 'timeline')
              return (
                <fieldset key={key}>
                  <legend>{label}</legend>
                  {(data.timeline ?? []).map((entry, index) => (
                    <div key={entry.id}>
                      <label>
                        Tiêu đề{' '}
                        <input
                          value={entry.title}
                          onChange={(event) => {
                            const next = structuredClone(data);
                            next.timeline![index].title = event.target.value;
                            setData(next);
                            setDirty(true);
                          }}
                        />
                      </label>
                      <label>
                        Mô tả{' '}
                        <input
                          value={entry.description ?? ''}
                          onChange={(event) => {
                            const next = structuredClone(data);
                            next.timeline![index].description =
                              event.target.value;
                            setData(next);
                            setDirty(true);
                          }}
                        />
                      </label>
                      <label>
                        Thời gian mốc{' '}
                        <input
                          maxLength={80}
                          value={entry.dateLabel ?? ''}
                          onChange={(event) => {
                            const next = structuredClone(data);
                            next.timeline![index].dateLabel =
                              event.target.value;
                            setData(next);
                            setDirty(true);
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setData({
                            ...data,
                            timeline: data.timeline?.filter(
                              (item) => item.id !== entry.id,
                            ),
                          });
                          setDirty(true);
                        }}
                      >
                        Xóa mốc
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={(data.timeline?.length ?? 0) >= 20}
                    onClick={() => {
                      setData({
                        ...data,
                        timeline: [
                          ...(data.timeline ?? []),
                          { id: crypto.randomUUID(), title: '' },
                        ],
                      });
                      setDirty(true);
                    }}
                  >
                    Thêm mốc
                  </button>
                </fieldset>
              );
            if (field.id === 'venue')
              return (
                <fieldset key={key}>
                  <legend>{label}</legend>
                  {(['name', 'address', 'latitude', 'longitude'] as const).map(
                    (prop) => (
                      <label key={prop}>
                        {
                          {
                            name: 'Tên địa điểm',
                            address: 'Địa chỉ',
                            latitude: 'Vĩ độ',
                            longitude: 'Kinh độ',
                          }[prop]
                        }
                        <input
                          type={
                            prop === 'latitude' || prop === 'longitude'
                              ? 'number'
                              : 'text'
                          }
                          step="any"
                          min={
                            prop === 'latitude'
                              ? -90
                              : prop === 'longitude'
                                ? -180
                                : undefined
                          }
                          max={
                            prop === 'latitude'
                              ? 90
                              : prop === 'longitude'
                                ? 180
                                : undefined
                          }
                          value={
                            data.events?.[eventKey(field)]?.venue?.[prop] ?? ''
                          }
                          onChange={(event) =>
                            editEvent(field, prop, event.target.value)
                          }
                        />
                      </label>
                    ),
                  )}
                </fieldset>
              );
            if (field.type === 'date-time')
              return (
                <fieldset key={key}>
                  <legend>{label}</legend>
                  <label>
                    Ngày giờ ISO{' '}
                    <input
                      value={valueOf(data, field)}
                      onChange={(event) => edit(field, event.target.value)}
                      aria-required={field.required}
                    />
                  </label>
                  <label>
                    Múi giờ IANA{' '}
                    <input
                      value={
                        data.events?.[eventKey(field)]?.timeZone ??
                        'Asia/Ho_Chi_Minh'
                      }
                      onChange={(event) =>
                        editEvent(field, 'timeZone', event.target.value)
                      }
                    />
                  </label>
                </fieldset>
              );
            return (
              <label key={key}>
                {label}
                {field.type === 'textarea' ? (
                  <textarea
                    value={valueOf(data, field)}
                    onChange={(event) => edit(field, event.target.value)}
                    aria-required={field.required}
                  />
                ) : (
                  <input
                    value={valueOf(data, field)}
                    onChange={(event) => edit(field, event.target.value)}
                    aria-required={field.required}
                  />
                )}
              </label>
            );
          })}
        </fieldset>
        <button type="button" disabled={busy} onClick={() => void reload()}>
          Tải lại bản đã lưu
        </button>
        <button type="submit" disabled={busy || !dirty}>
          Lưu bản nháp
        </button>
        <button type="button" disabled={busy} onClick={() => void publish()}>
          Xuất bản thiệp
        </button>
        {detail.status === 'PUBLISHED' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void unpublish()}
          >
            Gỡ xuất bản
          </button>
        )}
      </form>
      {refreshPending && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void retryRefresh()}
        >
          Thử tải lại thông tin
        </button>
      )}
      <Link href={`/invitations/${id}/rsvps`}>Phản hồi RSVP</Link>
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
      <section aria-label="Xem trước thiệp">
        <h2>Xem trước</h2>
        <label>
          Thiết bị{' '}
          <select
            value={preview}
            onChange={(event) =>
              setPreview(event.target.value as 'mobile' | 'desktop')
            }
          >
            <option value="mobile">Mobile</option>
            <option value="desktop">Desktop</option>
          </select>
        </label>
        {resolution?.issues.length ? (
          <p role="alert">Cần bổ sung: {resolution.issues[0].path}</p>
        ) : null}
        {resolution && (
          <ScenePreview
            scene={resolution.scene}
            context={{
              mode: 'preview',
              asOf: new Date().toISOString(),
              assetUrls,
            }}
            bindingIssues={resolution.issues}
          >
            <div
              style={{
                width: preview === 'mobile' ? 360 : 780,
                maxWidth: '100%',
              }}
            >
              <PublicInvitationView
                scene={resolution.scene}
                context={{
                  mode: 'preview',
                  asOf: new Date().toISOString(),
                  assetUrls,
                }}
              />
            </div>
          </ScenePreview>
        )}
      </section>
    </section>
  );
}
