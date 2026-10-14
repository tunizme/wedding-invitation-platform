'use client';
import { ContentFields } from '../invitation-builder/editor/content-fields';
import {
  usePrivateOwner,
  scopedDelay,
  useOperationLifetime,
} from '../identity-access/session/operation-scope';
import Link from 'next/link';
import Image from 'next/image';
import { Check, ImagePlus } from 'lucide-react';
import { ModalSurface } from '../../ui/platform/modal-surface';
import { AssetLibrary } from '../invitation-builder/assets/asset-library';
import { eventIsoTime, eventLocalTime } from './event-local-time';
import styles from './customer-invitation-form.module.css';
import { Button } from '../../ui/platform/button';
import { InlineAlert, LocalStatus } from '../../ui/platform/feedback';
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
function fieldGroup(field: Field): string {
  if (field.type === 'asset') return 'Hình ảnh';
  if (field.id.startsWith('wedding.') || field.id.startsWith('venue'))
    return 'Lễ & tiệc';
  if (field.id.startsWith('parents.')) return 'Gia đình hai bên';
  if (field.id === 'story') return 'Câu chuyện';
  if (field.id === 'timeline') return 'Dòng thời gian';
  if (field.id.startsWith('bank')) return 'Mừng cưới';
  return 'Thông tin cơ bản';
}
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

function OwnedCustomerInvitationForm({ id }: { id: string }) {
  const lifetime = useOperationLifetime(`CustomerInvitationForm:${id}`);
  const customer =
    useSyncExternalStore(sessionStore.subscribe, sessionStore.get, () => null)
      ?.user.role === 'CUSTOMER';
  const [detail, setDetail] = useState<InvitationDetail | null>(null),
    [data, setData] = useState<WeddingData | null>(null);
  const versionRef = useRef<number | null>(null);
  const [assetLibraryError, setAssetLibraryError] = useState(false);
  const [assetCursor, setAssetCursor] = useState<string | null>(null);
  const [assets, setAssets] = useState<AssetSummary[]>([]),
    [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [assetField, setAssetField] = useState<Field | null>(null);
  const assetTrigger = useRef<HTMLElement | null>(null);
  const workspace = useRef<HTMLElement | null>(null);
  const publishTrigger = useRef<HTMLButtonElement | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [localTimeError, setLocalTimeError] = useState<Record<string, string>>(
    {},
  );
  const confirmedShare = useRef(false);
  type PendingPublication = {
    resourceId: string;
    expectedVersion: number;
    key: string;
    operationId?: string;
  };
  const pendingPublication = useRef<PendingPublication | null>(null);
  const [publicationPending, setPublicationPending] = useState(false);
  useEffect(() => {
    if (!customer) return;
    let active = true;
    const scope = lifetime.capture();
    void getInvitation(id, { scope })
      .then((invitation) => {
        if (active && scope.isActive()) {
          versionRef.current = invitation.editVersion;
          setDetail(invitation);
          setData(invitation.draftWeddingData);
        }
      })
      .catch((cause) => {
        if (active && scope.isActive()) setError(errorMessage(cause));
      });
    void builderRequest<ListPage<AssetSummary>>('/assets', { scope })
      .then((library) => {
        if (active && scope.isActive()) {
          setAssets(library.items);
          setAssetCursor(library.nextCursor);
        }
      })
      .catch(() => {
        if (active && scope.isActive()) setAssetLibraryError(true);
      });
    return () => {
      active = false;
      scope.dispose();
    };
  }, [customer, id, lifetime]);
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
  const templateId = detail?.templateId;
  const designRevisionId = detail?.designRevisionId;
  useEffect(() => {
    if (!templateId || !designRevisionId || !visibleKey) return;
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
            `/templates/${templateId}/revisions/${designRevisionId}/assets/${assetId}`,
            { bytes: true, signal: abort.signal },
          );
        }
        if (!active || !lifetime.isActive()) return [assetId, ''] as const;
        const url = URL.createObjectURL(blob);
        created.push(url);
        return [assetId, url] as const;
      }),
    )
      .then((entries) => {
        if (!lifetime.isActive()) return;
        if (active && lifetime.isActive())
          setAssetUrls(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!lifetime.isActive()) return;
        if (active && lifetime.isActive()) {
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
  }, [templateId, designRevisionId, visibleKey, lifetime]);
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
  async function retryAssetLibrary() {
    if (busy) return;
    const scope = lifetime.capture();
    setBusy(true);
    try {
      const library = await builderRequest<ListPage<AssetSummary>>('/assets', {
        scope,
      });
      if (!scope.isActive()) return;
      setAssets(library.items);
      setAssetCursor(library.nextCursor);
      setAssetLibraryError(false);
    } catch {
      if (scope.isActive()) setAssetLibraryError(true);
    } finally {
      if (scope.isActive()) setBusy(false);
      scope.dispose();
    }
  }
  async function moreAssets() {
    const scope = lifetime.capture();
    if (!scope.isActive()) return;

    if (!assetCursor || busy) return;
    setBusy(true);
    try {
      const page = await builderRequest<ListPage<AssetSummary>>(
        '/assets?' + new URLSearchParams({ cursor: assetCursor }),
        { scope },
      );
      if (!scope.isActive()) return;
      setAssets((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((prior) => prior.id === item.id),
        ),
      ]);
      setAssetCursor(page.nextCursor);
    } catch (cause) {
      if (!scope.isActive()) return;
      setError(errorMessage(cause));
    } finally {
      if (scope.isActive()) setBusy(false);
      scope.dispose();
    }
  }
  async function upload(field: Field, event: ChangeEvent<HTMLInputElement>) {
    const scope = lifetime.capture();
    if (!scope.isActive()) return;

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
        scope,
      });
      if (!scope.isActive()) return;
      setAssets((current) => [asset, ...current]);
      edit(field, asset.id);
    } catch (cause) {
      if (!scope.isActive()) return;
      setError(errorMessage(cause));
    } finally {
      if (!scope.isActive()) return;
      setBusy(false);
      event.target.value = '';
      scope.dispose();
    }
  }
  useDirtyNavigationGuard(dirty);
  async function reload() {
    const scope = lifetime.capture();
    if (!scope.isActive()) return;

    if (
      busy ||
      pendingPublication.current ||
      (dirty &&
        !window.confirm('Bỏ các thay đổi chưa lưu và tải lại bản đã lưu?'))
    )
      return;
    setBusy(true);
    try {
      const current = await getInvitation(id, { scope });
      if (!scope.isActive()) return;
      versionRef.current = current.editVersion;
      setDetail(current);
      setData(current.draftWeddingData);
      setDirty(false);
      setError('');
      setLocalTimeError({});
      setStatus('Đã tải lại bản đã lưu.');
    } catch (cause) {
      if (!scope.isActive()) return;
      setError(errorMessage(cause));
    } finally {
      if (scope.isActive()) setBusy(false);
      scope.dispose();
    }
  }
  async function save(): Promise<InvitationDetail | null> {
    const scope = lifetime.capture();
    if (!scope.isActive()) return null;

    if (!detail || !data || busy || pendingPublication.current) return null;
    if (Object.values(localTimeError).some(Boolean)) {
      setError('Kiểm tra ngày và giờ tổ chức trước khi lưu.');
      return null;
    }
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
        { scope },
      );
      if (!scope.isActive()) return null;
      versionRef.current = saved.editVersion;
      setDetail(saved);
      setData(saved.draftWeddingData);
      setDirty(false);
      setStatus('Đã lưu bản nháp.');
      return saved;
    } catch (cause) {
      if (!scope.isActive()) return null;
      setError(errorMessage(cause));
      return null;
    } finally {
      if (scope.isActive()) setBusy(false);
      scope.dispose();
    }
  }
  const [refreshPending, setRefreshPending] = useState(false);
  async function refreshLifecycle() {
    const scope = lifetime.capture();
    if (!scope.isActive()) return;

    try {
      const refreshed = await getInvitation(id, { scope });
      if (!scope.isActive()) return;
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
      if (confirmedShare.current && refreshed.publicUrl) {
        confirmedShare.current = false;
        setSuccessOpen(true);
      }
      setError('');
    } catch (cause) {
      if (!scope.isActive()) return;
      setRefreshPending(true);
      setError(
        cause instanceof BuilderApiError && cause.code === 'VERSION_CONFLICT'
          ? cause.message
          : 'Thao tác đã thành công nhưng chưa tải được thông tin hoặc đường dẫn thiệp.',
      );
    } finally {
      scope.dispose();
    }
  }
  async function retryRefresh() {
    const scope = lifetime.capture();
    if (!scope.isActive()) return;

    if (busy) return;
    setBusy(true);
    try {
      await refreshLifecycle();
      if (!scope.isActive()) return;
    } finally {
      if (scope.isActive()) setBusy(false);
      scope.dispose();
    }
  }
  async function publish(recover = false) {
    const scope = lifetime.capture();
    if (!scope.isActive()) return;

    if (!detail || busy) return;
    if (pendingPublication.current && !recover) {
      scope.dispose();
      return;
    }
    const current = pendingPublication.current
      ? detail
      : dirty
        ? await save()
        : detail;
    if (!scope.isActive()) return;
    if (!current) {
      scope.dispose();
      return;
    }
    const attempt = pendingPublication.current ?? {
      resourceId: current.id,
      expectedVersion: current.editVersion,
      key: crypto.randomUUID(),
    };
    pendingPublication.current = attempt;
    setPublicationPending(true);
    setBusy(true);
    setStatus('Đang kiểm tra thiệp…');
    setError('');
    try {
      let operation = attempt.operationId
        ? await getPublicationOperation(attempt.operationId, { scope })
        : await publishInvitation(
            attempt.resourceId,
            attempt.expectedVersion,
            attempt.key,
            { scope },
          );
      if (!scope.isActive()) return;
      attempt.operationId = operation.id;
      const deadline = Date.now() + 90_000;
      while (
        Date.now() < deadline &&
        ['PENDING', 'RUNNING'].includes(operation.status)
      ) {
        await scopedDelay(1000, scope);
        if (!scope.isActive()) return;
        operation = await getPublicationOperation(operation.id, { scope });
        if (!scope.isActive()) return;
      }
      if (operation.status === 'SUCCEEDED') {
        const result = publicationResult(operation, current.id);
        if (
          !Number.isInteger(result.publicVersion) ||
          result.publicVersion! < 1
        )
          throw new Error('Missing public version');
        pendingPublication.current = null;
        setPublicationPending(false);
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
        confirmedShare.current = true;
        setStatus('Đã xuất bản thiệp.');
        await refreshLifecycle();
        if (!scope.isActive()) return;
      } else if (operation.status === 'FAILED') {
        pendingPublication.current = null;
        setPublicationPending(false);
        setStatus('');
        const issue = operation.error?.issues[0];
        setError(
          `Chưa xuất bản được: ${operation.error?.code ?? 'RENDER_UNAVAILABLE'}${issue ? ` tại ${issue.path}` : ''}. Bản công khai cũ vẫn được giữ.`,
        );
      } else setStatus('Tác vụ vẫn đang xử lý. Bạn có thể kiểm tra lại sau.');
    } catch (cause) {
      if (!scope.isActive()) return;
      setStatus('');
      if (
        !attempt.operationId &&
        cause instanceof BuilderApiError &&
        cause.status >= 400 &&
        cause.status < 500
      ) {
        pendingPublication.current = null;
        setPublicationPending(false);
      }
      setError(
        pendingPublication.current
          ? 'Chưa xác định kết quả xuất bản. Kiểm tra lại tác vụ trước khi xuất bản tiếp; dữ liệu đang nhập vẫn được giữ.'
          : errorMessage(cause),
      );
    } finally {
      if (scope.isActive()) setBusy(false);
      scope.dispose();
    }
  }
  async function unpublish() {
    const scope = lifetime.capture();
    if (!scope.isActive()) return;

    if (!detail || busy || pendingPublication.current) return;
    setBusy(true);
    setError('');
    try {
      const committed = await unpublishInvitation(
        detail.id,
        detail.editVersion,
        { scope },
      );
      if (!scope.isActive()) return;
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
      if (!scope.isActive()) return;
    } catch (cause) {
      if (!scope.isActive()) return;
      setError(errorMessage(cause));
    } finally {
      if (scope.isActive()) setBusy(false);
      scope.dispose();
    }
  }
  async function copyPublicLink() {
    if (!detail?.publicUrl) return;
    const scope = lifetime.capture();
    try {
      scope.assertActive();
      await navigator.clipboard.writeText(
        new URL(detail.publicUrl, window.location.origin).href,
      );
      if (scope.isActive()) setStatus('Đã sao chép liên kết thiệp.');
    } catch {
      if (scope.isActive())
        setError(
          'Không thể sao chép. Bạn có thể mở thiệp công khai và sao chép địa chỉ.',
        );
    } finally {
      scope.dispose();
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
    <section
      ref={workspace}
      tabIndex={-1}
      aria-label="Thông tin thiệp"
      className={styles.editor}
    >
      <div className={styles.toolbar}>
        <Link href="/invitations">← Thiệp của tôi</Link>
        <div className={styles.tabs} aria-label="Chế độ chỉnh thiệp">
          <button
            type="button"
            aria-pressed={view === 'edit'}
            onClick={() => setView('edit')}
          >
            Chỉnh sửa
          </button>
          <button
            type="button"
            aria-pressed={view === 'preview'}
            onClick={() => setView('preview')}
          >
            Xem trước
          </button>
        </div>
        <span className={styles.saveState}>
          {busy
            ? 'Đang xử lý…'
            : dirty
              ? 'Có thay đổi chưa lưu'
              : 'Bản nháp đã lưu'}
        </span>
        <button
          form={`invitation-data-${id}`}
          type="submit"
          disabled={busy || !dirty || publicationPending}
        >
          Lưu bản nháp
        </button>
        <button
          type="button"
          disabled={busy || publicationPending}
          ref={publishTrigger}
          onClick={() => void publish()}
        >
          Xuất bản thiệp
        </button>
      </div>
      <p className={styles.templateName}>
        Mẫu: {detail.templateName} · {detail.status}
      </p>
      {detail.publicUrl && !successOpen && (
        <div className={styles.share}>
          <Link href={detail.publicUrl}>Xem thiệp công khai</Link>
          <Button variant="secondary" onClick={() => void copyPublicLink()}>
            Sao chép liên kết
          </Button>
        </div>
      )}
      <form
        id={`invitation-data-${id}`}
        className={styles.form}
        hidden={view !== 'edit'}
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
          <ContentFields
            fields={fields}
            data={data}
            disabled={busy}
            onChange={(next) => {
              setData(next);
              setDirty(true);
              setStatus('');
            }}
          />
          {Object.entries(
            Object.groupBy(
              fields.filter((f) => !f.id.startsWith('fields.')),
              fieldGroup,
            ),
          ).map(([group, groupFields]) => (
            <details key={group} className={styles.group} open>
              <summary>{group}</summary>
              <div className={styles.fields}>
                {groupFields!.map((field) => {
                  const key = fieldIdentity(field),
                    label =
                      field.label +
                      (field.eventKey ? ` · ${field.eventKey}` : '');
                  if (field.type === 'asset')
                    return (
                      <fieldset key={key}>
                        <legend>{label}</legend>
                        <div className={styles.photoChoice}>
                          {assetUrls[valueOf(data, field)] ? (
                            <Image
                              unoptimized
                              width={140}
                              height={170}
                              src={assetUrls[valueOf(data, field)]}
                              alt={`Ảnh đã chọn · ${field.label}`}
                            />
                          ) : (
                            <div className={styles.photoPlaceholder}>
                              <ImagePlus size={28} aria-hidden="true" />
                              <span>
                                {valueOf(data, field)
                                  ? 'Ảnh đang sử dụng'
                                  : 'Chưa chọn ảnh'}
                              </span>
                            </div>
                          )}
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            onClick={(event) => {
                              assetTrigger.current = event.currentTarget;
                              setAssetField(field);
                            }}
                          >
                            <ImagePlus size={18} aria-hidden="true" />
                            Chọn ảnh từ thư viện
                          </Button>
                        </div>
                        <label>
                          Ảnh đã tải lên{' '}
                          <select
                            value={valueOf(data, field)}
                            onChange={(event) =>
                              edit(field, event.target.value)
                            }
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
                          <button
                            type="button"
                            onClick={() => void moreAssets()}
                          >
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
                              onChange={(event) =>
                                editBank(prop, event.target.value)
                              }
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
                                  next.timeline![index].title =
                                    event.target.value;
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
                        {(
                          ['name', 'address', 'latitude', 'longitude'] as const
                        ).map((prop) => (
                          <label
                            key={prop}
                            className={
                              prop === 'address' ? styles.fullRow : undefined
                            }
                          >
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
                                data.events?.[eventKey(field)]?.venue?.[prop] ??
                                ''
                              }
                              onChange={(event) =>
                                editEvent(field, prop, event.target.value)
                              }
                            />
                          </label>
                        ))}
                      </fieldset>
                    );
                  if (field.type === 'date-time')
                    return (
                      <fieldset key={key} className={styles.eventTime}>
                        <legend>{label}</legend>
                        <label>
                          Ngày và giờ tổ chức
                          <input
                            type="datetime-local"
                            aria-label="Ngày và giờ tổ chức"
                            step="1"
                            value={eventLocalTime(
                              valueOf(data, field),
                              data.events?.[eventKey(field)]?.timeZone ??
                                'Asia/Ho_Chi_Minh',
                            )}
                            aria-invalid={!!localTimeError[key]}
                            aria-describedby={`event-local-help-${key}`}
                            onChange={(event) => {
                              try {
                                const iso = eventIsoTime(
                                  event.target.value,
                                  data.events?.[eventKey(field)]?.timeZone ??
                                    'Asia/Ho_Chi_Minh',
                                );
                                edit(field, iso);
                                setLocalTimeError((previous) => ({
                                  ...previous,
                                  [key]: '',
                                }));
                              } catch (cause) {
                                setLocalTimeError((previous) => ({
                                  ...previous,
                                  [key]:
                                    cause instanceof Error
                                      ? cause.message
                                      : 'Ngày giờ chưa hợp lệ.',
                                }));
                              }
                            }}
                          />
                          <span
                            id={`event-local-help-${key}`}
                            className={styles.timeHelp}
                          >
                            {localTimeError[key] ||
                              `Múi giờ sự kiện · ${data.events?.[eventKey(field)]?.timeZone ?? 'Asia/Ho_Chi_Minh'}`}
                          </span>
                        </label>
                        <label>
                          Ngày giờ ISO{' '}
                          <input
                            value={valueOf(data, field)}
                            onChange={(event) => {
                              edit(field, event.target.value);
                              setLocalTimeError((previous) => ({
                                ...previous,
                                [key]: '',
                              }));
                            }}
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
                    <label
                      key={key}
                      className={
                        field.id === 'venue.address'
                          ? styles.fullRow
                          : undefined
                      }
                    >
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
              </div>
            </details>
          ))}
        </fieldset>
        <button
          type="button"
          disabled={busy || publicationPending}
          onClick={() => void reload()}
        >
          Tải lại bản đã lưu
        </button>
        {detail.status === 'PUBLISHED' && (
          <button
            type="button"
            disabled={busy || publicationPending}
            onClick={() => void unpublish()}
          >
            Gỡ xuất bản
          </button>
        )}
      </form>
      {assetLibraryError && (
        <InlineAlert tone="error">
          Không thể tải thư viện ảnh. Bạn vẫn có thể chỉnh sửa thông tin thiệp.
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void retryAssetLibrary()}
          >
            Thử tải lại thư viện ảnh
          </Button>
        </InlineAlert>
      )}
      {publicationPending && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void publish(true)}
        >
          Kiểm tra lại xuất bản
        </Button>
      )}
      {refreshPending && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void retryRefresh()}
        >
          Thử tải lại thông tin
        </button>
      )}
      {assetField && (
        <AssetLibrary
          expectedRole="CUSTOMER"
          choice="Image"
          returnFocusRef={assetTrigger}
          fallbackFocusRef={workspace}
          onClose={() => setAssetField(null)}
          onSelect={(asset) => {
            if (!lifetime.isActive() || busy) return;
            setAssets((current) => [
              asset,
              ...current.filter((item) => item.id !== asset.id),
            ]);
            edit(assetField, asset.id);
            setAssetField(null);
          }}
        />
      )}
      {successOpen && detail.publicUrl && (
        <ModalSurface
          variant="centered"
          label="Thiệp đã sẵn sàng gửi"
          closeLabel="Đóng thông tin chia sẻ"
          onClose={() => setSuccessOpen(false)}
          returnFocusRef={publishTrigger}
          fallbackFocusRef={workspace}
        >
          <div className={styles.publishSuccess}>
            <span className={styles.successEmblem}>
              <Check size={28} aria-hidden="true" />
            </span>
            <p>Đã xuất bản thiệp. Lời mời của bạn đã sẵn sàng.</p>
            <label>
              Đường dẫn thiệp
              <input
                readOnly
                value={
                  typeof window === 'undefined'
                    ? detail.publicUrl
                    : new URL(detail.publicUrl, window.location.origin).href
                }
              />
            </label>
            <div className={styles.successActions}>
              <Link href={detail.publicUrl}>Xem thiệp công khai</Link>
              <Button variant="secondary" onClick={() => void copyPublicLink()}>
                Sao chép liên kết
              </Button>
              <Button variant="secondary" onClick={() => setSuccessOpen(false)}>
                Tiếp tục chỉnh sửa
              </Button>
            </div>
            {status && <LocalStatus tone="neutral">{status}</LocalStatus>}
            {error && <InlineAlert tone="error">{error}</InlineAlert>}
          </div>
        </ModalSurface>
      )}
      <Link href={`/invitations/${id}/rsvps`}>Phản hồi RSVP</Link>
      {detail.document.schemaVersion === 3 && (
        <Link href={`/invitations/${id}/interactions`}>
          Lời chúc & phản hồi biểu mẫu
        </Link>
      )}
      {!successOpen && status && (
        <LocalStatus tone="neutral">{status}</LocalStatus>
      )}
      {!successOpen && error && <InlineAlert tone="error">{error}</InlineAlert>}
      <section
        aria-label="Xem trước thiệp"
        className={styles.preview}
        hidden={view !== 'preview'}
      >
        <h2>Xem trước</h2>
        {resolution?.issues.length ? (
          <p role="alert">Cần bổ sung: {resolution.issues[0].path}</p>
        ) : null}
        {resolution && view === 'preview' && (
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
              data-testid="customer-preview-host"
              style={{
                width: 390,
                maxWidth: '100%',
              }}
            >
              <PublicInvitationView
                scene={resolution.scene}
                hostPolicy="mobile"
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

export function CustomerInvitationForm({ id }: { id: string }) {
  const owner = usePrivateOwner(`CustomerInvitationForm:${id}`, 'CUSTOMER');
  return owner ? (
    <OwnedCustomerInvitationForm key={owner} id={id} />
  ) : (
    <p role="alert">Khu vực này chỉ dành cho CUSTOMER.</p>
  );
}
