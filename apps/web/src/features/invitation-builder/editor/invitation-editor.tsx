'use client';
import { directEditorDocument } from '../document/direct-editor-document';
import { ManagedAssetsContext } from './managed-assets-context';
import { ElementContextMenu, type ContextAction } from './element-context-menu';
import { canonicalJson } from '../document/validation-helpers';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  Undo2,
  Redo2,
  Save,
  Eye,
  Type,
  Image as ImageIcon,
  Shapes,
  Paintbrush,
  Music2,
  CalendarDays,
  Layers,
  Sparkles,
  Copy,
  Menu,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Scan,
  PenLine,
  Trash2,
  MoreHorizontal,
  Square,
  Circle,
  Triangle,
  Minus,
  Timer,
  MapPin,
  ClipboardCheck,
  QrCode,
  ListOrdered,
  Images,
  GalleryHorizontal,
  Video,
  Phone,
  BellRing,
  UserRound,
  FileText,
  Lock,
  Unlock,
  EyeOff,
  ChevronUp,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';

// One glyph per tool card (ui-ux-pro-max: consistent icon set, labelled controls).
const WIDGET_ICONS: Partial<Record<string, LucideIcon>> = {
  Calendar: CalendarDays,
  Countdown: Timer,
  Map: MapPin,
  RSVP: ClipboardCheck,
  QRBank: QrCode,
  Timeline: ListOrdered,
  Album: Images,
  Carousel: GalleryHorizontal,
  YouTube: Video,
  Contact: Phone,
  Reminder: BellRing,
  GuestName: UserRound,
  CustomForm: FileText,
};
const SHAPE_CARDS = [
  ['rectangle', 'Chữ nhật', Square],
  ['ellipse', 'Tròn', Circle],
  ['triangle', 'Tam giác', Triangle],
  ['line', 'Đường thẳng', Minus],
] as const;
import {
  usePrivateOwner,
  useOperationLifetime,
} from '../../identity-access/session/operation-scope';
import { sessionStore } from '../../identity-access/session/store';
import { useDirtyNavigationGuard } from '../../identity-access/session/navigation-guard';
import {
  builderRequest,
  BuilderApiError,
  type TemplateDetail,
  type AssetSummary,
} from '../api/client';
import { useAssetPreview } from '../assets/use-asset-preview';
import {
  createBlankDocument,
  isAdvanced,
  documentAssetIds,
  contentFieldAssetIds,
  type NodeKind,
  type CanvasNode,
  type AdvancedKind,
  type EditorDocument,
} from '../document/editor-document';
import { resolveEditorDocument } from '../document/editor-document';
import { CanvasElement } from '../renderer/canvas-renderer';
import { PublicInvitationView } from '../../invitations/public-invitation-view';
import { ScenePreview } from '../renderer/scene-preview';
import { PreviewExit } from './preview-exit';
import { primitiveNode, widgetNode } from './defaults';
import {
  EditorProperties,
  EditorSettingsPanel,
  NumberProperty,
} from './editor-properties';
import { AssetLibrary, type Preset } from './asset-library';
import { EffectsPanel } from './effects-panel';
import { FallingEffects } from '../renderer/falling-effects';
import { MusicSettingsPanel } from './music-settings-panel';
import { EditorMusicButton } from './editor-music-button';
import { selectAudioTrack } from './audio-trim';
import {
  applyDocumentCommand,
  commitDocument,
  checkedDocument,
  undoDocument,
  redoDocument,
  duplicateSelection,
  nodesUsingAsset,
  type DocumentCommand,
  type DocumentHistory,
} from './editor-commands';
import {
  saveBackup,
  loadBackup,
  removeBackup,
  installRecoveryLifecycle,
  type Backup,
} from './draft-recovery';
import { GeometryControls } from './geometry-controls';
import { textMinimumBox } from './text-measurement';
import { PublicationControls } from './publication-controls';
import { AssetImage } from '../renderer/asset-image';
import { ModalSurface } from '../../../ui/platform/modal-surface';
import { backgroundStyle, textStyle } from '../renderer/primitives';
import styles from './invitation-editor.module.css';

type EditorDetail = TemplateDetail & { draftDocument: EditorDocument };
const templateCategories = [
  'Thiệp cưới',
  'Thiệp sinh nhật',
  'Thiệp tốt nghiệp',
  'Sự kiện',
  'Kỷ niệm',
  'Lời chúc',
  'Khác',
];
const componentNames: Record<NodeKind, string> = {
  Text: 'Văn bản',
  Image: 'Hình ảnh',
  Decoration: 'Trang trí',
  Shape: 'Hình dạng',
  Calendar: 'Lịch',
  Countdown: 'Đếm ngược',
  Map: 'Bản đồ',
  RSVP: 'Xác nhận tham dự',
  QRBank: 'QR mừng cưới',
  Timeline: 'Dòng thời gian',
  Album: 'Album ảnh',
  Carousel: 'Carousel ảnh',
  YouTube: 'Video YouTube',
  Contact: 'Nút gọi',
  Reminder: 'Nhắc lịch',
  GuestName: 'Tên khách mời',
  CustomForm: 'Form tùy chỉnh',
};
const tabs = [
  ['text', 'Văn bản', Type],
  ['image', 'Hình ảnh', ImageIcon],
  ['stock', 'Stock', Sparkles],
  ['shape', 'Hình dạng', Shapes],
  ['background', 'Nền', Paintbrush],
  ['music', 'Âm nhạc', Music2],
  ['widgets', 'Tiện ích', CalendarDays],
  ['preset', 'Preset', Copy],
  ['effects', 'Hiệu ứng', Sparkles],
  ['layers', 'Lớp', Layers],
] as const;
type Tab = (typeof tabs)[number][0];
function subscribeNarrow(callback: () => void) {
  const media = window.matchMedia('(max-width: 767px)');
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
function ToolPanel({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children: ReactNode;
}) {
  const narrow = useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia('(max-width: 767px)').matches,
    () => false,
  );
  const [open, setOpen] = useState(false);
  // Explicit return target: WebKit does not focus a button on click.
  const opener = useRef<HTMLButtonElement>(null);
  if (!narrow)
    return (
      <aside className={className} aria-label={label}>
        {children}
      </aside>
    );
  return (
    <div className={styles.mobilePanel}>
      <button
        ref={opener}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open && (
        <ModalSurface
          label={label}
          variant="drawer"
          returnFocusRef={opener}
          onClose={() => setOpen(false)}
        >
          <div className={className}>{children}</div>
        </ModalSurface>
      )}
    </div>
  );
}
function newNode(kind: NodeKind): CanvasNode {
  if (['Text', 'Image', 'Decoration', 'Shape'].includes(kind))
    return primitiveNode(kind as 'Text' | 'Image' | 'Decoration' | 'Shape');
  if (
    ['Calendar', 'Countdown', 'Map', 'RSVP', 'QRBank', 'Timeline'].includes(
      kind,
    )
  )
    return widgetNode(kind as Parameters<typeof widgetNode>[0]);
  const type = kind as AdvancedKind,
    base = primitiveNode('Text');
  return {
    ...base,
    type: { resolvedName: type },
    displayName: type,
    props: {
      ...base.props,
      box: {
        x: 30,
        y: 40,
        width:
          type === 'GuestName'
            ? base.props.box.width
            : type === 'Contact'
              ? 130
              : type === 'Reminder'
                ? 180
                : 440,
        height:
          type === 'GuestName'
            ? base.props.box.height
            : type === 'Contact' || type === 'Reminder'
              ? 40
              : type === 'CustomForm'
                ? 440
                : type === 'Carousel'
                  ? 480
                  : type === 'Album'
                    ? 360
                    : 240,
        rotation: 0,
      },
      bindings: [],
      content: {
        label: componentNames[kind],
        ...(kind === 'GuestName' && 'textStyle' in base.props.content
          ? { textStyle: base.props.content.textStyle }
          : {}),
        field: ['Album', 'Carousel', 'YouTube', 'Contact'].includes(kind)
          ? kind.toLowerCase() + '_' + crypto.randomUUID().slice(0, 8)
          : null,
        ...(kind === 'Album' || kind === 'Carousel' ? { assetIds: [] } : {}),
        ...(kind === 'Carousel' ? { carouselLayout: 'stack' as const } : {}),
        ...(kind === 'YouTube' ? { videoId: '', posterId: null } : {}),
        ...(kind === 'Contact'
          ? {
              phone: '',
              label: 'Gọi ngay',
              showIcon: true,
              iconSize: 16,
              iconColor: '#FFFFFFFF',
              fontSize: 16,
              buttonColor: '#FF5057FF',
              textColor: '#FFFFFFFF',
            }
          : {}),
        ...(kind === 'Reminder'
          ? {
              eventKey: 'ceremony' as const,
              label: 'Thêm lời nhắc',
              fontSize: 14,
              buttonColor: '#FF5057FF',
              textColor: '#FFFFFFFF',
            }
          : {}),
        ...(kind === 'CustomForm'
          ? {
              fields: [
                {
                  id: 'name',
                  label: 'Họ và tên',
                  type: 'text' as const,
                  required: true,
                  options: [],
                },
              ],
            }
          : {}),
      },
    },
  } as CanvasNode;
}
export default function InvitationEditor(props: {
  initial: TemplateDetail;
  onSaved: (value: TemplateDetail) => void;
}) {
  const owner = usePrivateOwner(
    `InvitationEditor:${props.initial.id}`,
    'ADMIN',
  );
  if (!owner || props.initial.draftDocument.schemaVersion !== 3) return null;
  return (
    <ManagedAssetsContext.Provider
      value={
        props.initial.resourceKind === 'INVITATION'
          ? props.initial.id
          : undefined
      }
    >
      <OwnedInvitationEditor
        key={owner}
        initial={props.initial as EditorDetail}
        onSaved={props.onSaved}
      />
    </ManagedAssetsContext.Provider>
  );
}
function OwnedInvitationEditor({
  initial,
  onSaved,
}: {
  initial: EditorDetail;
  onSaved: (v: TemplateDetail) => void;
}) {
  const managed = initial.resourceKind === 'INVITATION';
  const [previewAsOf] = useState(() => new Date().toISOString());
  const resourcePath = managed
    ? `/admin/invitations/${initial.id}`
    : `/admin/templates/${initial.id}`;
  const listPath = managed ? '/admin/invitations' : '/admin/templates';
  const lifetime = useOperationLifetime(`InvitationEditor:${initial.id}`),
    owner = sessionStore.get()!.user.id;
  const [history, setHistory] = useState<DocumentHistory>({
      past: [],
      present: directEditorDocument(
        initial.draftDocument,
        initial.draftSampleData,
      ),
      future: [],
    }),
    historyRef = useRef(history),
    [sample, setSample] = useState(initial.draftSampleData),
    sampleRef = useRef(sample),
    [saved, setSaved] = useState<TemplateDetail>(initial),
    version = useRef(initial.editVersion),
    ack = useRef(
      canonicalJson([initial.draftDocument, initial.draftSampleData]),
    );
  const [selected, setSelected] = useState<string[]>([]),
    [tab, setTab] = useState<Tab>('image'),
    [libraryOpen, setLibraryOpen] = useState(false),
    [editingShare, setEditingShare] = useState(false),
    [scrollPicker, setScrollPicker] = useState<string | null>(null),
    [shareDraft, setShareDraft] = useState({
      title: '',
      imageId: null as string | null,
    }),
    [shareError, setShareError] = useState(''),
    [backgroundTab, setBackgroundTab] = useState<'color' | 'image'>('color'),
    [zoom, setZoom] = useState(1),
    [preview, setPreview] = useState(false),
    [previewWidth, setPreviewWidth] = useState(500),
    [error, setError] = useState(''),
    [status, setStatus] = useState('Đã lưu'),
    [saving, setSaving] = useState(false),
    [conflict, setConflict] = useState(false),
    [publicationBusy, setPublishing] = useState(false),
    [deletingAsset, setDeletingAsset] = useState(false),
    [backup, setBackup] = useState<Backup | null>(null),
    [library, setLibrary] = useState<{
      kind: 'IMAGE' | 'BACKGROUND';
      target: 'replace' | 'album' | 'poster' | 'share';
    } | null>(null),
    [snapping, setSnapping] = useState(true),
    [inline, setInline] = useState<string | null>(null),
    [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(
      null,
    ),
    [canPaste, setCanPaste] = useState(false),
    [layerQuery, setLayerQuery] = useState('');
  const [presetName, setPresetName] = useState(''),
    [presetCategory, setPresetCategory] = useState('Lời mời');
  const publishing = publicationBusy || deletingAsset;
  const pending = useRef<Promise<TemplateDetail | null> | null>(null),
    clipboard = useRef<ReturnType<typeof duplicateSelection> | null>(null),
    canvas = useRef<HTMLDivElement>(null),
    [target, setTarget] = useState<HTMLElement | null>(null);
  const router = useRouter();
  const [canvasElement, setCanvasElement] = useState<HTMLDivElement | null>(
    null,
  );
  const bindTarget = useCallback(
    (element: HTMLDivElement | null) => setTarget(element),
    [],
  );
  const bindCanvas = useCallback((element: HTMLDivElement | null) => {
    canvas.current = element;
    setCanvasElement(element);
  }, []);
  const document = history.present,
    dirty =
      canonicalJson([document, sample]) !==
      canonicalJson([saved.draftDocument, saved.draftSampleData]);
  useDirtyNavigationGuard(dirty || saving);
  const command = useCallback(
    (c: DocumentCommand) => {
      if (!lifetime.isActive() || publishing) return;
      try {
        let operation = c;
        if (c.type === 'appearance') {
          const candidate = structuredClone(historyRef.current.present);
          const edited = candidate.nodes[c.id] as CanvasNode;
          if (
            ['Text', 'GuestName'].includes(edited.type.resolvedName) &&
            !edited.custom.locked
          ) {
            edited.props.appearance = {
              ...edited.props.appearance,
              ...c.value,
            };
            const minimum = textMinimumBox(edited);
            if (minimum) {
              edited.props.box.width = minimum.width;
              edited.props.box.height = Math.max(
                edited.props.box.height,
                minimum.height,
              );
            }
            operation = { type: 'replace', value: checkedDocument(candidate) };
          }
        }
        const next = commitDocument(historyRef.current, operation);
        if (
          next !== historyRef.current &&
          (c.type === 'box' || c.type === 'content' || c.type === 'appearance')
        ) {
          const edited = next.present.nodes[c.id] as CanvasNode;
          const minimum = textMinimumBox(edited);
          if (minimum) {
            edited.props.box.width = minimum.width;
            edited.props.box.height = Math.max(
              edited.props.box.height,
              minimum.height,
            );
            next.present = checkedDocument(next.present);
          }
        }
        historyRef.current = next;
        setHistory(next);
        setError('');
        setStatus('Chưa lưu');
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Không sửa được thiết kế',
        );
      }
    },
    [lifetime, publishing],
  );

  useEffect(() => {
    installRecoveryLifecycle();
    const scope = lifetime.capture();
    void loadBackup(owner, initial.id, scope)
      .then((value) => {
        if (
          scope.isActive() &&
          value &&
          canonicalJson([value.document, value.sampleData]) !== ack.current
        )
          setBackup(value);
      })
      .catch(() => {
        if (scope.isActive())
          setError(
            'Trình duyệt không hỗ trợ khôi phục cục bộ. Lưu server vẫn hoạt động.',
          );
      });
    return () => {
      scope.dispose();
      clipboard.current = null;
    };
  }, [owner, initial.id, lifetime]);
  const save = useCallback(async (): Promise<TemplateDetail | null> => {
    if (conflict || publishing || !lifetime.isActive()) return null;
    while (pending.current) {
      await pending.current;
      if (!lifetime.isActive()) return null;
    }
    const snapshot = historyRef.current.present,
      data = structuredClone(sampleRef.current),
      stamp = canonicalJson([snapshot, data]);
    if (stamp === ack.current)
      return { ...saved, editVersion: version.current };
    const scope = lifetime.capture();
    const checkpoint = {
      baseVersion: version.current,
      savedBefore: Date.now(),
    };
    setSaving(true);
    setStatus('Đang lưu…');
    const operation = (async () => {
      try {
        const value = await builderRequest<TemplateDetail>(
          `${resourcePath}/draft`,
          {
            scope,
            method: 'PATCH',
            body: {
              expectedVersion: version.current,
              document: snapshot,
              ...(managed ? { weddingData: data } : { sampleData: data }),
            },
          },
        );
        if (!scope.isActive()) return null;
        const unchanged =
          canonicalJson([historyRef.current.present, sampleRef.current]) ===
          stamp;
        version.current = value.editVersion;
        ack.current = canonicalJson([
          value.draftDocument,
          value.draftSampleData,
        ]);
        if (unchanged) {
          sampleRef.current = structuredClone(value.draftSampleData);
          setSample(sampleRef.current);
        }
        setSaved(value);
        onSaved(value);
        if (unchanged)
          await removeBackup(owner, initial.id, stamp, checkpoint).catch(
            () => {},
          );
        if (scope.isActive()) setStatus(unchanged ? 'Đã lưu' : 'Chưa lưu');
        return value;
      } catch (cause) {
        if (scope.isActive()) {
          if (cause instanceof BuilderApiError && cause.status === 409)
            setConflict(true);
          setError(cause instanceof Error ? cause.message : 'Lưu lỗi');
          setStatus('Lưu lỗi');
        }
        return null;
      } finally {
        if (scope.isActive()) setSaving(false);
        scope.dispose();
        pending.current = null;
      }
    })();
    pending.current = operation;
    return operation;
  }, [
    conflict,
    publishing,
    lifetime,
    initial.id,
    owner,
    onSaved,
    saved,
    managed,
    resourcePath,
  ]);
  useEffect(() => {
    if (!dirty || conflict || publishing) return;
    const scope = lifetime.capture();
    void saveBackup(
      {
        owner,
        templateId: initial.id,
        baseVersion: version.current,
        document,
        sampleData: sample,
      },
      scope,
    ).catch(() => {
      if (scope.isActive())
        setError(
          'Không lưu được bản khôi phục cục bộ; hãy kiểm tra trạng thái lưu server.',
        );
    });
    const timer = setTimeout(() => {
      void save();
    }, 1500);
    return () => {
      clearTimeout(timer);
      scope.dispose();
    };
  }, [
    document,
    sample,
    dirty,
    conflict,
    publishing,
    saving,
    save,
    lifetime,
    owner,
    initial.id,
  ]);
  const assetIds = useMemo(
    () =>
      [
        ...new Set(
          [
            ...documentAssetIds(document),
            shareDraft.imageId,
            ...contentFieldAssetIds(sample.fields),
            sample.bride?.photo,
            sample.groom?.photo,
            sample.couple?.photo,
          ].filter((v): v is string => !!v),
        ),
      ].sort(),
    [document, sample, shareDraft.imageId],
  );
  const assetSummaries = useMemo(
    () =>
      assetIds.map((id) => ({
        id,
        name: id,
        kind: 'IMAGE' as const,
        mimeType: 'image/webp',
        byteSize: 0,
        width: 0,
        height: 0,
        createdAt: '',
        previewUrl: `/api/v1/assets/${id}/content`,
      })),
    [assetIds],
  );
  const urls = useAssetPreview(assetSummaries),
    resolution = useMemo(
      () =>
        resolveEditorDocument(document, sample, {
          mode: 'preview',
          asOf: previewAsOf,
        }),
      [document, sample, previewAsOf],
    );
  const primary = selected[0],
    node = primary ? (document.nodes[primary] as CanvasNode) : undefined;
  const select = (id: string, extend = false) => {
    const group = document.nodeOptions[id]?.groupId;
    const ids = group
      ? document.nodes.ROOT.nodes.filter(
          (n) => document.nodeOptions[n]?.groupId === group,
        )
      : [id];
    setSelected((current) =>
      extend
        ? current.includes(id)
          ? current.filter((n) => !ids.includes(n))
          : [...new Set([...current, ...ids])]
        : ids,
    );
  };
  const copy = () => {
    clipboard.current = duplicateSelection(
      historyRef.current.present,
      selected,
    );
    setCanPaste(true);
    setStatus('Đã sao chép phần tử');
  };
  const cut = () => {
    if (!selected.length) return;
    copy();
    deleteSelected();
    setStatus('Đã cắt phần tử');
  };
  const paste = () => {
    if (clipboard.current) {
      const before = new Set(historyRef.current.present.nodes.ROOT.nodes);
      command({ type: 'paste', ...clipboard.current });
      setSelected(
        historyRef.current.present.nodes.ROOT.nodes.filter(
          (id) => !before.has(id),
        ),
      );
    }
  };
  const runContextAction = (action: ContextAction) => {
    setContextMenu(null);
    const order = historyRef.current.present.nodes.ROOT.nodes;
    const index = order.indexOf(primary);
    const last = order.length - 1;
    if (action === 'copy') copy();
    else if (action === 'cut') cut();
    else if (action === 'paste') paste();
    else if (action === 'duplicate')
      command({
        type: 'paste',
        ...duplicateSelection(historyRef.current.present, selected),
      });
    else if (action === 'delete') deleteSelected();
    else if (action === 'lock')
      command({
        type: 'lock',
        id: primary,
        value: !(historyRef.current.present.nodes[primary] as CanvasNode).custom
          .locked,
      });
    else {
      const target =
        action === 'front'
          ? last
          : action === 'back'
            ? 0
            : action === 'forward'
              ? index + 1
              : index - 1;
      command({ type: 'reorder', id: primary, index: target });
    }
  };
  const add = (kind: NodeKind, asset?: AssetSummary) => {
    const n = newNode(kind);
    if (asset && 'assetId' in n.props.content)
      n.props.content.assetId = asset.id;
    const before = new Set(document.nodes.ROOT.nodes);
    command({ type: 'add', node: n });
    setSelected(
      historyRef.current.present.nodes.ROOT.nodes.filter(
        (id) => !before.has(id),
      ),
    );
  };
  const moveHistory = (direction: 'undo' | 'redo') => {
    const h =
      direction === 'undo'
        ? undoDocument(historyRef.current)
        : redoDocument(historyRef.current);
    historyRef.current = h;
    setHistory(h);
    setSelected((s) => s.filter((id) => Object.hasOwn(h.present.nodes, id)));
  };
  const deleteSelected = () => {
    try {
      let next = historyRef.current.present;
      for (const id of selected)
        next = applyDocumentCommand(next, { type: 'delete', id });
      command({ type: 'replace', value: next });
      setSelected([]);
    } catch (c) {
      setError(c instanceof Error ? c.message : 'Không xóa được');
    }
  };
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.closest(
          'input,textarea,select,dialog,[contenteditable="true"]',
        ) ||
        publishing ||
        preview
      )
        return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        moveHistory(e.shiftKey ? 'redo' : 'undo');
      }
      if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copy();
      }
      if (mod && e.key.toLowerCase() === 'x' && selected.length) {
        e.preventDefault();
        cut();
      }
      if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        paste();
      }
      if (mod && e.key.toLowerCase() === 'd' && selected.length) {
        e.preventDefault();
        command({ type: 'paste', ...duplicateSelection(document, selected) });
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length) {
        e.preventDefault();
        deleteSelected();
      }
      if (e.key === 'Escape') {
        setScrollPicker(null);
        setSelected([]);
        setInline(null);
      }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  });
  const savePreset = async () => {
    if (!presetName.trim() || !selected.length) return;
    const scope = lifetime.capture();
    const fragment = createBlankDocument();
    fragment.nodes.ROOT.props.canvas.height =
      document.nodes.ROOT.props.canvas.height;
    fragment.nodes.ROOT.nodes = selected;
    for (const id of selected) {
      fragment.nodes[id] = structuredClone(document.nodes[id]);
      if (document.nodeOptions[id]) {
        fragment.nodeOptions[id] = structuredClone(document.nodeOptions[id]);
        if (
          fragment.nodeOptions[id].action?.kind === 'scroll' &&
          !selected.includes(fragment.nodeOptions[id].action!.value)
        )
          delete fragment.nodeOptions[id].action;
      }
    }
    try {
      await builderRequest('/admin/editor-presets', {
        scope,
        method: 'POST',
        body: {
          name: presetName.trim(),
          category: presetCategory.trim(),
          document: fragment,
        },
      });
      if (scope.isActive()) {
        setStatus('Đã lưu preset');
        setPresetName('');
      }
    } catch (c) {
      if (scope.isActive())
        setError(c instanceof Error ? c.message : 'Không lưu được preset');
    } finally {
      scope.dispose();
    }
  };
  const insertPreset = (p: Preset) =>
    command({
      type: 'paste',
      sourceIds: p.document.nodes.ROOT.nodes,
      nodes: p.document.nodes.ROOT.nodes.map(
        (id) => p.document.nodes[id] as CanvasNode,
      ),
      options: p.document.nodes.ROOT.nodes.map(
        (id) => p.document.nodeOptions[id] ?? {},
      ),
    });
  const assetUsage = (assetId: string) =>
    nodesUsingAsset(historyRef.current.present, assetId).length;
  const deleteLibraryAsset = async (assetId: string) => {
    // Save authored work first. The API removes references from every resource
    // in one transaction; deleting from local state beforehand would lose edits
    // even if authorization or validation rejects the delete request.
    if (!(await save()))
      throw new Error('Không lưu được bản nháp trước khi xóa ảnh.');
    const scope = lifetime.capture();
    setDeletingAsset(true);
    try {
      try {
        await builderRequest(`/assets/${assetId}`, { scope, method: 'DELETE' });
      } finally {
        // Storage may fail after the database transaction has committed. Always
        // reconcile the new version so retrying cannot resurrect old references.
        if (scope.isActive()) {
          try {
            const current = await builderRequest<TemplateDetail>(resourcePath, {
              scope,
            });
            if (scope.isActive()) {
              const next = {
                past: [],
                present: checkedDocument(current.draftDocument),
                future: [],
              };
              historyRef.current = next;
              sampleRef.current = current.draftSampleData;
              version.current = current.editVersion;
              ack.current = canonicalJson([
                current.draftDocument,
                current.draftSampleData,
              ]);
              setHistory(next);
              setSample(current.draftSampleData);
              setSaved(current);
              setSelected((ids) =>
                ids.filter((id) => Object.hasOwn(next.present.nodes, id)),
              );
              clipboard.current = null;
              setCanPaste(false);
              setBackup(null);
              setShareDraft((value) => ({
                ...value,
                imageId: value.imageId === assetId ? null : value.imageId,
              }));
              onSaved(current);
              setStatus('Đã lưu');
              await removeBackup(owner, initial.id).catch(() => {});
            }
          } catch (cause) {
            if (scope.isActive()) setConflict(true);
            throw cause;
          }
        }
      }
    } finally {
      if (scope.isActive()) setDeletingAsset(false);
      scope.dispose();
    }
  };
  const selectedImage = (asset: AssetSummary) => {
    if (!library) return;
    if (library.target === 'share') {
      setShareDraft((current) => ({ ...current, imageId: asset.id }));
      setLibrary(null);
      setEditingShare(true);
      return;
    }
    if (primary && node) {
      if (library.target === 'album' && isAdvanced(node))
        command({
          type: 'content',
          id: primary,
          value: {
            assetIds: [...(node.props.content.assetIds ?? []), asset.id],
          },
        });
      else
        command({
          type: 'content',
          id: primary,
          value:
            library.target === 'poster'
              ? { posterId: asset.id }
              : { assetId: asset.id },
        });
    }
    setLibrary(null);
  };
  const selectedAlbumImages = (assets: AssetSummary[]) => {
    const current = historyRef.current.present.nodes[primary] as
      CanvasNode | undefined;
    if (
      !current ||
      !isAdvanced(current) ||
      !['Album', 'Carousel'].includes(current.type.resolvedName)
    )
      return;
    const assetIds = [
      ...(current.props.content.assetIds ?? []),
      ...assets.map((a) => a.id),
    ];
    if (assetIds.length > 50) {
      setError('Album/carousel chứa tối đa 50 ảnh.');
      return;
    }
    command({ type: 'content', id: primary, value: { assetIds } });
    setLibrary(null);
  };
  const copyConflict = async () => {
    const scope = lifetime.capture();
    try {
      const fresh = await builderRequest<TemplateDetail>('/admin/templates', {
        scope,
        method: 'POST',
        body: {
          name: initial.name.slice(0, 100) + ' · bản sao',
          category: initial.category,
        },
      });
      if (!scope.isActive()) return;
      const value = await builderRequest<TemplateDetail>(
        `/admin/templates/${fresh.id}/draft`,
        {
          scope,
          method: 'PATCH',
          body: {
            expectedVersion: fresh.editVersion,
            document: historyRef.current.present,
            sampleData: sampleRef.current,
          },
        },
      );
      if (scope.isActive()) router.push(`/admin/templates/${value.id}/edit`);
    } catch (c) {
      if (scope.isActive())
        setError(c instanceof Error ? c.message : 'Không lưu được bản sao');
    } finally {
      scope.dispose();
    }
  };
  const updateCategory = async (category: string) => {
    if (
      managed ||
      publishing ||
      conflict ||
      !category.trim() ||
      category === saved.category
    )
      return;
    const current = await save();
    if (!current || !lifetime.isActive()) return;
    while (pending.current) await pending.current;
    const scope = lifetime.capture();
    if (!scope.isActive()) return;
    setSaving(true);
    const operation = (async () => {
      try {
        const value = await builderRequest<TemplateDetail>(resourcePath, {
          scope,
          method: 'PATCH',
          body: {
            expectedVersion: version.current,
            category: category.trim(),
          },
        });
        if (!scope.isActive()) return null;
        version.current = value.editVersion;
        setSaved(value);
        onSaved(value);
        setStatus('Đã lưu');
        return value;
      } catch (cause) {
        if (scope.isActive()) {
          setError(
            cause instanceof Error ? cause.message : 'Không lưu được danh mục',
          );
          if (cause instanceof BuilderApiError && cause.status === 409)
            setConflict(true);
        }
        return null;
      } finally {
        if (scope.isActive()) setSaving(false);
        scope.dispose();
        pending.current = null;
      }
    })();
    pending.current = operation;
    await operation;
  };
  const context = {
    mode: 'editor' as const,
    asOf: previewAsOf,
    assetUrls: urls,
  };
  return (
    <section
      className={styles.workspace}
      aria-label="Editor500px"
      data-preview={preview}
    >
      <header className={styles.toolbar}>
        <a
          className={styles.menuLink}
          href={listPath}
          aria-label="Danh sách mẫu"
        >
          <Menu size={24} />
        </a>
        <a className={styles.brand} href={listPath}>
          <PenLine size={24} />
          <span>Tiệm Làm Thiệp</span>
        </a>
        <h1 className={styles.documentName}>{saved.name}</h1>
        <button
          type="button"
          disabled={!history.past.length || publishing}
          onClick={() => moveHistory('undo')}
          aria-label="Hoàn tác"
        >
          <Undo2 size={18} />
        </button>
        <button
          type="button"
          disabled={!history.future.length || publishing}
          onClick={() => moveHistory('redo')}
          aria-label="Làm lại"
        >
          <Redo2 size={18} />
        </button>
        <span className={styles.toolbarSpacer} />
        <button
          type="button"
          disabled={saving || conflict || publishing}
          onClick={() => void save()}
        >
          <Save size={18} />
          Lưu
        </button>
        <span className={styles.saveStatus} role="status">
          {status}
        </span>
        <button
          type="button"
          data-preview-trigger
          onClick={() => setPreview((v) => !v)}
        >
          <Eye size={18} />
          {preview ? 'Chỉnh sửa' : 'Xem trước'}
        </button>
        <PublicationControls
          template={saved}
          dirty={dirty}
          externalBusy={saving || conflict}
          canStart={() => !conflict}
          saveBeforePublish={save}
          lifetime={lifetime}
          onBusy={setPublishing}
          onChanged={async (committed) => {
            const scope = lifetime.capture();
            try {
              if (committed) {
                version.current = committed.editVersion;
                const baseline = {
                  ...saved,
                  draftDocument: historyRef.current.present,
                  draftSampleData: sampleRef.current,
                  ...committed,
                };
                setSaved(baseline);
                onSaved(baseline);
              }
              const current = await builderRequest<TemplateDetail>(
                resourcePath,
                { scope },
              );
              if (!scope.isActive()) return;
              if (current.editVersion !== version.current)
                throw new BuilderApiError(409, 'VERSION_CONFLICT');
              setSaved((previous) => ({
                ...previous,
                status: current.status,
                publishedRevisionId: current.publishedRevisionId,
                coverUrl: current.coverUrl,
                updatedAt: current.updatedAt,
              }));
              setStatus('Đã cập nhật xuất bản');
            } finally {
              scope.dispose();
            }
          }}
        />
      </header>
      {error && <p role="alert">{error}</p>}
      {conflict && (
        <div role="alert">
          <p>Phiên bản đã đổi. Bản sửa của bạn vẫn được giữ.</p>
          <button
            type="button"
            disabled={managed}
            onClick={() => void copyConflict()}
          >
            Lưu thành mẫu mới
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Bỏ bản đang sửa và tải lại bản server?'))
                window.location.reload();
            }}
          >
            Tải lại server
          </button>
        </div>
      )}
      {backup && (
        <div role="status">
          <p>Có bản khôi phục chưa lưu.</p>
          <button
            type="button"
            onClick={() => {
              const h = { past: [], present: backup.document, future: [] };
              historyRef.current = h;
              setHistory(h);
              sampleRef.current = backup.sampleData;
              setSample(backup.sampleData);
              if (backup.baseVersion !== version.current) setConflict(true);
              setBackup(null);
            }}
          >
            Khôi phục
          </button>
          <button
            type="button"
            onClick={() => {
              setBackup(null);
              void removeBackup(owner, initial.id).catch(() => {});
            }}
          >
            Bỏ bản khôi phục
          </button>
        </div>
      )}
      <div
        className={styles.layout}
        data-effects={tab === 'effects'}
        data-preview={preview}
        data-library-open={libraryOpen}
      >
        {!preview && (
          <>
            <nav className={styles.rail} aria-label="Công cụ thiết kế">
              {tabs.map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={id !== 'text' && tab === id && libraryOpen}
                  title={id === 'text' ? 'Thêm văn bản' : label}
                  onClick={() => {
                    // Text has no library: the tool adds a text box straight away.
                    if (id === 'text') add('Text');
                    else if (tab === id) setLibraryOpen((open) => !open);
                    else {
                      setTab(id);
                      setLibraryOpen(true);
                    }
                  }}
                >
                  <Icon size={20} />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
            {libraryOpen && (
              <ToolPanel className={styles.library} label="Thư viện công cụ">
                {tab !== 'effects' && (
                  <h2>{tabs.find((t) => t[0] === tab)?.[1]}</h2>
                )}
                {tab === 'shape' && (
                  <div className={styles.toolGrid}>
                    {SHAPE_CARDS.map(([primitive, label, Icon]) => (
                      <button
                        key={primitive}
                        type="button"
                        className={styles.toolCard}
                        onClick={() => {
                          const n = primitiveNode('Shape');
                          n.props.content = {
                            primitive,
                            fill: '#B69A72FF',
                          };
                          if (primitive !== 'rectangle')
                            delete n.props.appearance.borderRadius;
                          command({ type: 'add', node: n });
                        }}
                      >
                        <Icon size={26} aria-hidden="true" />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                )}
                {(tab === 'image' ||
                  tab === 'stock' ||
                  tab === 'background' ||
                  tab === 'music') && (
                  <>
                    {tab === 'background' && (
                      <div className={styles.libraryTabs}>
                        <button
                          type="button"
                          aria-pressed={backgroundTab === 'color'}
                          onClick={() => setBackgroundTab('color')}
                        >
                          Màu nền
                        </button>
                        <button
                          type="button"
                          aria-pressed={backgroundTab === 'image'}
                          onClick={() => setBackgroundTab('image')}
                        >
                          Hình nền
                        </button>
                      </div>
                    )}
                    {(tab !== 'background' || backgroundTab === 'image') && (
                      <AssetLibrary
                        key={tab}
                        usage={assetUsage}
                        onDelete={deleteLibraryAsset}
                        audioSettings={document.settings.audio}
                        onTrimAudio={
                          tab === 'music'
                            ? (asset, selection) =>
                                command({
                                  type: 'settings',
                                  value: {
                                    ...document.settings,
                                    audio: selectAudioTrack(
                                      document.settings.audio,
                                      asset.id,
                                      selection,
                                    ),
                                  },
                                })
                            : undefined
                        }
                        kind={
                          tab === 'music'
                            ? 'AUDIO'
                            : tab === 'stock'
                              ? 'DECORATION'
                              : tab === 'background'
                                ? 'BACKGROUND'
                                : 'IMAGE'
                        }
                        onAsset={(asset) => {
                          if (tab === 'music')
                            command({
                              type: 'settings',
                              value: {
                                ...document.settings,
                                audio: selectAudioTrack(
                                  document.settings.audio,
                                  asset.id,
                                ),
                              },
                            });
                          else if (tab === 'background')
                            command({
                              type: 'canvas-background',
                              value: {
                                kind: 'asset',
                                assetId: asset.id,
                                fit: 'cover',
                                positionX: 0.5,
                                positionY: 0.5,
                              },
                            });
                          else
                            add(
                              tab === 'stock' ? 'Decoration' : 'Image',
                              asset,
                            );
                        }}
                      />
                    )}
                    {tab === 'background' && backgroundTab === 'color' && (
                      <>
                        <h3>Màu nền mặc định</h3>
                        <div className={styles.palette} aria-label="Màu nền">
                          {[
                            '#ffffff',
                            '#000000',
                            '#666666',
                            '#999999',
                            '#cccccc',
                            '#f8f8f8',
                            '#c0392b',
                            '#8e44ad',
                            '#2980b9',
                            '#16a085',
                            '#27ae60',
                            '#e67e22',
                            '#ffb6c1',
                            '#e6e6fa',
                            '#87ceeb',
                            '#98fb98',
                            '#ffffcc',
                            '#ffdab9',
                          ].map((color) => (
                            <button
                              key={color}
                              type="button"
                              aria-label={`Màu nền ${color}`}
                              title={color}
                              style={{ background: color }}
                              onClick={() => {
                                command({
                                  type: 'canvas-background',
                                  value: { kind: 'solid', color: color + 'FF' },
                                });
                                command({
                                  type: 'settings',
                                  value: {
                                    ...document.settings,
                                    gradient: null,
                                  },
                                });
                              }}
                            />
                          ))}
                        </div>
                        <h3>Màu nền gradient</h3>
                        <div
                          className={styles.palette}
                          aria-label="Nền gradient"
                        >
                          {[
                            ['#ff9966', '#ff5e62'],
                            ['#667eea', '#764ba2'],
                            ['#43cea2', '#185a9d'],
                            ['#00f260', '#0575e6'],
                            ['#c9ffbf', '#ffafbd'],
                            ['#f6d365', '#fda085'],
                          ].map(([from, to]) => (
                            <button
                              key={from}
                              type="button"
                              aria-label={`Gradient ${from} ${to}`}
                              style={{
                                background: `linear-gradient(135deg,${from},${to})`,
                              }}
                              onClick={() =>
                                command({
                                  type: 'settings',
                                  value: {
                                    ...document.settings,
                                    gradient: {
                                      from: from + 'FF',
                                      to: to + 'FF',
                                      angle: 135,
                                    },
                                  },
                                })
                              }
                            />
                          ))}
                        </div>

                        <label>
                          Màu nền
                          <input
                            type="color"
                            value={
                              document.nodes.ROOT.props.canvas.background
                                .kind === 'solid'
                                ? document.nodes.ROOT.props.canvas.background.color.slice(
                                    0,
                                    7,
                                  )
                                : '#ffffff'
                            }
                            onChange={(e) =>
                              command({
                                type: 'canvas-background',
                                value: {
                                  kind: 'solid',
                                  color: e.target.value + 'FF',
                                },
                              })
                            }
                          />
                        </label>
                      </>
                    )}
                    {tab === 'music' && (
                      <MusicSettingsPanel
                        value={document.settings.audio}
                        disabled={publishing}
                        onChange={(audio) =>
                          command({
                            type: 'settings',
                            value: { ...document.settings, audio },
                          })
                        }
                      />
                    )}
                  </>
                )}
                {tab === 'widgets' && (
                  <div className={styles.toolGrid}>
                    {(Object.keys(componentNames) as NodeKind[])
                      .filter(
                        (k) =>
                          !['Text', 'Image', 'Decoration', 'Shape'].includes(k),
                      )
                      .sort((a, b) => {
                        const order: NodeKind[] = [
                          'Calendar',
                          'Countdown',
                          'Map',
                          'Contact',
                          'Reminder',
                          'RSVP',
                          'CustomForm',
                          'GuestName',
                          'QRBank',
                          'Album',
                          'Carousel',
                          'YouTube',
                          'Timeline',
                        ];
                        return order.indexOf(a) - order.indexOf(b);
                      })
                      .map((kind) => {
                        const Icon = WIDGET_ICONS[kind] ?? CalendarDays;
                        return (
                          <button
                            type="button"
                            key={kind}
                            className={`${styles.toolCard} ${styles.widgetCard}`}
                            disabled={publishing}
                            onClick={() => {
                              add(kind);
                            }}
                          >
                            <span className={styles.widgetGlyph}>
                              <Icon
                                size={36}
                                strokeWidth={1.6}
                                aria-hidden="true"
                              />
                            </span>
                            <span>{componentNames[kind]}</span>
                          </button>
                        );
                      })}
                  </div>
                )}
                {tab === 'preset' && (
                  <>
                    <label>
                      Tên preset
                      <input
                        value={presetName}
                        maxLength={120}
                        onChange={(e) => setPresetName(e.target.value)}
                      />
                    </label>
                    <label>
                      Danh mục
                      <input
                        value={presetCategory}
                        maxLength={64}
                        onChange={(e) => setPresetCategory(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={!selected.length || !presetName.trim()}
                      onClick={() => void savePreset()}
                    >
                      Lưu phần đã chọn
                    </button>
                    <AssetLibrary
                      kind="PRESET"
                      onAsset={() => {}}
                      onPreset={insertPreset}
                    />
                  </>
                )}
                {tab === 'effects' && (
                  <EffectsPanel
                    document={document}
                    scene={resolution.scene}
                    assetUrls={urls}
                    onChange={(value) => command({ type: 'replace', value })}
                  />
                )}
                {tab === 'layers' && (
                  <>
                    <input
                      type="search"
                      aria-label="Tìm phần tử theo ID hoặc tên lớp"
                      placeholder="Tìm phần tử theo ID hoặc tên lớp"
                      value={layerQuery}
                      onChange={(e) => setLayerQuery(e.target.value)}
                    />
                    <ol className={styles.layers}>
                      {document.nodes.ROOT.nodes.map((id, index) => {
                        const n = document.nodes[id] as CanvasNode;
                        const query = layerQuery.trim().toLowerCase();
                        if (
                          query &&
                          !id.toLowerCase().includes(query) &&
                          !n.custom.layerName.toLowerCase().includes(query)
                        )
                          return null;
                        return (
                          <li
                            key={id}
                            draggable={!n.custom.locked}
                            onDragStart={(e) =>
                              e.dataTransfer.setData('text/plain', id)
                            }
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              const source =
                                e.dataTransfer.getData('text/plain');
                              if (document.nodes.ROOT.nodes.includes(source))
                                command({ type: 'reorder', id: source, index });
                            }}
                          >
                            <button
                              type="button"
                              aria-pressed={selected.includes(id)}
                              onClick={(e) => select(id, e.shiftKey)}
                            >
                              {n.custom.layerName}
                            </button>
                            <button
                              type="button"
                              aria-label={
                                n.custom.locked
                                  ? `Mở khóa ${n.custom.layerName}`
                                  : `Khóa ${n.custom.layerName}`
                              }
                              aria-pressed={n.custom.locked}
                              title={n.custom.locked ? 'Mở khóa' : 'Khóa'}
                              onClick={() =>
                                command({
                                  type: 'lock',
                                  id,
                                  value: !n.custom.locked,
                                })
                              }
                            >
                              {n.custom.locked ? (
                                <Lock size={16} aria-hidden="true" />
                              ) : (
                                <Unlock size={16} aria-hidden="true" />
                              )}
                            </button>
                            <button
                              type="button"
                              aria-label={
                                n.hidden
                                  ? `Hiện ${n.custom.layerName}`
                                  : `Ẩn ${n.custom.layerName}`
                              }
                              aria-pressed={!!n.hidden}
                              title={n.hidden ? 'Hiện' : 'Ẩn'}
                              onClick={() =>
                                command({ type: 'hide', id, value: !n.hidden })
                              }
                            >
                              {n.hidden ? (
                                <EyeOff size={16} aria-hidden="true" />
                              ) : (
                                <Eye size={16} aria-hidden="true" />
                              )}
                            </button>
                            <button
                              type="button"
                              aria-label={`Đưa ${n.custom.layerName} lên một lớp`}
                              title="Lên"
                              disabled={!index}
                              onClick={() =>
                                command({
                                  type: 'reorder',
                                  id,
                                  index: index - 1,
                                })
                              }
                            >
                              <ChevronUp size={16} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Đưa ${n.custom.layerName} xuống một lớp`}
                              title="Xuống"
                              disabled={
                                index === document.nodes.ROOT.nodes.length - 1
                              }
                              onClick={() =>
                                command({
                                  type: 'reorder',
                                  id,
                                  index: index + 1,
                                })
                              }
                            >
                              <ChevronDown size={16} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Xóa ${n.custom.layerName}`}
                              title="Xóa"
                              disabled={n.custom.locked}
                              onClick={() => {
                                command({ type: 'delete', id });
                                setSelected((s) => s.filter((x) => x !== id));
                              }}
                            >
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </>
                )}
              </ToolPanel>
            )}
          </>
        )}
        <div className={styles.stage}>
          {preview && (
            <PreviewExit
              className={styles.previewExit}
              onClose={() => setPreview(false)}
            />
          )}
          {!preview && (
            <button
              className={styles.collapseHandle}
              type="button"
              aria-label={libraryOpen ? 'Thu gọn thư viện' : 'Mở thư viện'}
              aria-expanded={libraryOpen}
              onClick={() => setLibraryOpen((open) => !open)}
            >
              {libraryOpen ? (
                <ChevronLeft size={18} />
              ) : (
                <ChevronRight size={18} />
              )}
            </button>
          )}
          <div className={styles.canvasControls} aria-label="Thu phóng canvas">
            {preview ? (
              <label>
                Chiều rộng xem trước
                <select
                  value={previewWidth}
                  onChange={(e) => setPreviewWidth(Number(e.target.value))}
                >
                  {[320, 375, 390, 500].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <button
                  type="button"
                  aria-label="Phóng to"
                  disabled={zoom >= 2}
                  onClick={() =>
                    setZoom((z) =>
                      Math.min(2, Math.round((z + 0.1) * 100) / 100),
                    )
                  }
                >
                  <ZoomIn size={18} />
                </button>
                <label className={styles.zoomLabel}>
                  <span className={styles.srOnly}>Zoom</span>
                  <select
                    aria-label="Zoom"
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                  >
                    {[...new Set([0.5, 0.75, 1, 1.25, 1.5, 2, zoom])]
                      .sort((a, b) => a - b)
                      .map((v) => (
                        <option key={v} value={v}>
                          {Math.round(v * 100)}%
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  aria-label="Thu nhỏ"
                  disabled={zoom <= 0.25}
                  onClick={() =>
                    setZoom((z) =>
                      Math.max(0.25, Math.round((z - 0.1) * 100) / 100),
                    )
                  }
                >
                  <ZoomOut size={18} />
                </button>
                <button
                  type="button"
                  aria-label="Vừa màn hình"
                  title="Vừa màn hình"
                  onClick={() =>
                    setZoom(
                      Math.min(
                        1,
                        ((canvas.current?.parentElement?.parentElement
                          ?.clientWidth ?? 580) -
                          100) /
                          500,
                      ),
                    )
                  }
                >
                  <Scan size={18} />
                </button>
              </>
            )}
          </div>
          {preview ? (
            <div
              style={{ width: previewWidth, maxWidth: '100%', margin: 'auto' }}
            >
              <ScenePreview
                scene={resolution.scene}
                context={{ ...context, mode: 'preview' }}
                bindingIssues={resolution.issues}
              >
                <PublicInvitationView
                  scene={resolution.scene}
                  context={{ ...context, mode: 'preview' }}
                />
              </ScenePreview>
            </div>
          ) : (
            <div
              className={styles.canvasHost}
              data-picking-scroll={!!scrollPicker}
              style={{
                width: 500 * zoom,
                height: document.nodes.ROOT.props.canvas.height * zoom,
                position: 'relative',
                margin: '0 auto',
              }}
            >
              <div
                ref={bindCanvas}
                data-testid="workarea500"
                style={{
                  width: 500,
                  height: document.nodes.ROOT.props.canvas.height,
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left',
                  position: 'relative',
                  ...backgroundStyle(
                    document.nodes.ROOT.props.canvas.background,
                    urls,
                  ),
                  ...(document.settings.gradient
                    ? {
                        backgroundImage: `linear-gradient(${document.settings.gradient.angle}deg,${document.settings.gradient.from},${document.settings.gradient.to})`,
                      }
                    : {}),
                }}
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget) setSelected([]);
                }}
              >
                {!preview && document.settings.audio.assetId && (
                  <EditorMusicButton
                    key={`${document.settings.audio.assetId}:${document.settings.audio.trimStartMs}:${document.settings.audio.trimEndMs}:${urls[document.settings.audio.assetId]}`}
                    value={document.settings.audio}
                    source={urls[document.settings.audio.assetId]}
                  />
                )}
                {document.nodes.ROOT.nodes.map((id) => {
                  const n = document.nodes[id] as CanvasNode;
                  if (n.hidden) return null;
                  const resolved = resolution.scene.elements.find(
                    (e) => e.id === id,
                  );
                  return (
                    <div
                      key={id}
                      ref={primary === id ? bindTarget : undefined}
                      tabIndex={0}
                      aria-label={n.custom.layerName}
                      data-editor-node={id}
                      data-kind={n.type.resolvedName}
                      data-locked={n.custom.locked}
                      data-selected={selected.includes(id)}
                      data-primary={primary === id}
                      className={styles.node}
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: n.props.box.width,
                        height: n.props.box.height,
                        transform: `translate(${n.props.box.x}px,${n.props.box.y}px) rotate(${n.props.box.rotation}deg)`,
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (scrollPicker) {
                          command({
                            type: 'options',
                            id: scrollPicker,
                            value: {
                              ...historyRef.current.present.nodeOptions[
                                scrollPicker
                              ],
                              action: { kind: 'scroll', value: id },
                            },
                          });
                          setSelected([scrollPicker]);
                          setScrollPicker(null);
                          return;
                        }
                        // Right-click keeps a multi-selection that already contains the node.
                        if (e.button === 2 && selected.includes(id)) return;
                        select(id, e.shiftKey);
                      }}
                      onContextMenu={(e) => {
                        if (!selected.includes(id)) select(id, false);
                        e.currentTarget.focus();
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({ x: e.clientX, y: e.clientY });
                      }}
                      onDoubleClick={() => {
                        if (
                          ['Text', 'GuestName'].includes(n.type.resolvedName) &&
                          !n.custom.locked
                        )
                          setInline(id);
                      }}
                    >
                      {inline === id &&
                      ('text' in n.props.content ||
                        n.type.resolvedName === 'GuestName') ? (
                        <textarea
                          autoFocus
                          aria-label="Sửa văn bản trực tiếp"
                          value={
                            'text' in n.props.content
                              ? n.props.content.text
                              : 'label' in n.props.content
                                ? n.props.content.label
                                : ''
                          }
                          style={{
                            ...('textStyle' in n.props.content &&
                            n.props.content.textStyle
                              ? textStyle(n.props.content.textStyle)
                              : {}),
                            width: '100%',
                            height: '100%',
                            boxSizing: 'border-box',
                          }}
                          onChange={(e) =>
                            command({
                              type: 'content',
                              id,
                              value:
                                n.type.resolvedName === 'GuestName'
                                  ? { label: e.target.value }
                                  : { text: e.target.value },
                            })
                          }
                          onBlur={() => setInline(null)}
                        />
                      ) : resolved ? (
                        <CanvasElement
                          element={{
                            ...resolved,
                            box: {
                              x: 0,
                              y: 0,
                              width: n.props.box.width,
                              height: n.props.box.height,
                              rotation: 0,
                            },
                            appearance: n.props.appearance,
                          }}
                          options={document.nodeOptions[id]}
                          context={context}
                          locale={document.settings.locale}
                        />
                      ) : (
                        <span>
                          {componentNames[n.type.resolvedName]} · cần dữ liệu
                          mẫu
                        </span>
                      )}
                    </div>
                  );
                })}
                <FallingEffects kind={document.settings.particles} />
                {node && !node.custom.locked && !inline && (
                  <GeometryControls
                    target={target}
                    text={['Text', 'GuestName'].includes(
                      node.type.resolvedName,
                    )}
                    textNode={
                      ['Text', 'GuestName'].includes(node.type.resolvedName)
                        ? node
                        : undefined
                    }
                    box={node.props.box}
                    zoom={zoom}
                    rootContainer={canvasElement}
                    onCommit={(value) => {
                      const round = (v: number) =>
                        snapping ? Math.round(v / 10) * 10 : v;
                      command({
                        type: 'box',
                        id: primary,
                        value: {
                          ...value,
                          x: round(value.x),
                          y: round(value.y),
                        },
                      });
                    }}
                    onBusy={() => {}}
                    onError={setError}
                  />
                )}
              </div>
              {node && selected.length > 0 && !inline && !contextMenu && (
                <div
                  role="toolbar"
                  aria-label="Thao tác nhanh"
                  className={styles.floatingToolbar}
                  data-kind={node.type.resolvedName}
                  style={{
                    left: Math.min(
                      Math.max(
                        (node.props.box.x + node.props.box.width / 2) * zoom,
                        72,
                      ),
                      500 * zoom - 72,
                    ),
                    // Above the element; below it when there is no room at the canvas top.
                    top:
                      node.props.box.y * zoom - 52 >= 4
                        ? node.props.box.y * zoom - 52
                        : (node.props.box.y + node.props.box.height) * zoom +
                          12,
                  }}
                >
                  <button
                    type="button"
                    aria-label="Nhân bản phần tử"
                    title="Nhân bản"
                    onClick={() => runContextAction('duplicate')}
                  >
                    <Copy size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Xóa phần tử đã chọn"
                    title="Xóa"
                    disabled={node.custom.locked}
                    onClick={() => runContextAction('delete')}
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Thêm tùy chọn"
                    aria-haspopup="menu"
                    title="Thêm tùy chọn"
                    onClick={(event) => {
                      const box = event.currentTarget.getBoundingClientRect();
                      setContextMenu({ x: box.left, y: box.bottom + 4 });
                    }}
                  >
                    <MoreHorizontal size={18} aria-hidden="true" />
                  </button>
                </div>
              )}
              {contextMenu && node && (
                <ElementContextMenu
                  {...contextMenu}
                  onClose={() => setContextMenu(null)}
                  locked={node.custom.locked}
                  index={document.nodes.ROOT.nodes.indexOf(primary)}
                  last={document.nodes.ROOT.nodes.length - 1}
                  canPaste={canPaste}
                  onAction={runContextAction}
                />
              )}
            </div>
          )}
        </div>
        {!preview && (
          <ToolPanel className={styles.properties} label="Thuộc tính">
            <p className={styles.panelEyebrow}>
              <PenLine size={15} /> Tuỳ chỉnh
            </p>
            {scrollPicker && (
              <p className={styles.hint} role="status">
                Nhấn vào phần tử trên thiệp để chọn đích cuộn. Nhấn Esc để hủy.
              </p>
            )}
            {selected.length > 1 && (
              <>
                <label>
                  Căn chỉnh
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value)
                        command({
                          type: 'align',
                          ids: selected,
                          axis: e.target.value as 'left',
                        });
                      e.target.value = '';
                    }}
                  >
                    <option value="">Chọn căn chỉnh</option>
                    {[
                      ['left', 'Trái'],
                      ['center', 'Giữa ngang'],
                      ['right', 'Phải'],
                      ['top', 'Trên'],
                      ['middle', 'Giữa dọc'],
                      ['bottom', 'Dưới'],
                    ].map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={selected.length < 3}
                  onClick={() =>
                    command({ type: 'distribute', ids: selected, axis: 'x' })
                  }
                >
                  Đều ngang
                </button>
                <button
                  type="button"
                  disabled={selected.length < 3}
                  onClick={() =>
                    command({ type: 'distribute', ids: selected, axis: 'y' })
                  }
                >
                  Đều dọc
                </button>
              </>
            )}
            {node ? (
              <EditorProperties
                key={primary}
                id={primary}
                node={node}
                options={document.nodeOptions[primary] ?? {}}
                index={document.nodes.ROOT.nodes.indexOf(primary)}
                count={document.nodes.ROOT.nodes.length}
                command={command}
                disabled={publishing}
                assetUrls={urls}
                targets={document.nodes.ROOT.nodes.map((id) => ({
                  id,
                  label: (document.nodes[id] as CanvasNode).custom.layerName,
                }))}
                onPickTarget={() => setScrollPicker(primary)}
                onLocateTarget={(id) =>
                  canvas.current
                    ?.querySelector<HTMLElement>(`[data-editor-node="${id}"]`)
                    ?.scrollIntoView({ block: 'center', behavior: 'auto' })
                }
                onChoose={(target) =>
                  setLibrary({
                    kind: 'IMAGE',
                    target: target === 'image' ? 'replace' : target,
                  })
                }
              />
            ) : (
              <>
                <label>
                  Danh mục{' '}
                  <span aria-hidden="true" style={{ color: '#dc2626' }}>
                    *
                  </span>
                  <select
                    aria-label="Danh mục"
                    required
                    value={saved.category}
                    disabled={managed || saving || publishing || conflict}
                    onChange={(e) => void updateCategory(e.target.value)}
                  >
                    <option value="" disabled>
                      Chọn danh mục
                    </option>
                    {[
                      ...templateCategories,
                      ...(saved.category &&
                      !templateCategories.includes(saved.category)
                        ? [saved.category]
                        : []),
                    ].map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Trạng thái
                  <input
                    readOnly
                    value={
                      saved.status === 'PUBLISHED'
                        ? 'Công khai'
                        : saved.status === 'UNPUBLISHED'
                          ? 'Đã gỡ xuất bản'
                          : 'Bản nháp'
                    }
                  />
                </label>
                <p className={styles.hint}>
                  Xuất bản để khách có thể xem thiệp từ đường dẫn công khai.
                </p>
                <div className={styles.shareHeading}>
                  <h2>Bản xem trước</h2>
                  <button
                    type="button"
                    onClick={() => {
                      setShareDraft({
                        title: document.settings.title,
                        imageId: document.settings.shareImageId,
                      });
                      setShareError('');
                      setEditingShare(true);
                    }}
                  >
                    <PenLine size={14} />
                    Chỉnh sửa
                  </button>
                </div>
                <div className={styles.shareCard}>
                  <div className={styles.shareArtwork}>
                    {document.settings.shareImageId ? (
                      <AssetImage
                        source={urls[document.settings.shareImageId]}
                        alt="Ảnh chia sẻ thiệp"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      <div>
                        <PenLine size={28} />
                        <span>Tiệm Làm Thiệp</span>
                      </div>
                    )}
                  </div>
                  <strong>{document.settings.title || saved.name}</strong>
                  {document.settings.description && (
                    <p>{document.settings.description}</p>
                  )}
                </div>
                <p className={styles.hint}>
                  Tiêu đề và hình ảnh hiển thị khi chia sẻ thiệp lên Facebook,
                  Zalo hoặc mạng xã hội.
                </p>
                <EditorSettingsPanel
                  view="settings"
                  document={document}
                  onChange={(value) => command({ type: 'settings', value })}
                />
                <EditorSettingsPanel
                  view="customize"
                  document={document}
                  onChange={(value) => command({ type: 'settings', value })}
                />
                <h2>Kích thước thiệp</h2>
                <NumberProperty
                  label="Chiều cao"
                  min={500}
                  max={16000}
                  value={document.nodes.ROOT.props.canvas.height}
                  onChange={(value) => command({ type: 'height', value })}
                />
                <div className={styles.heightStepper}>
                  <button
                    type="button"
                    aria-label="Giảm chiều dài"
                    disabled={document.nodes.ROOT.props.canvas.height <= 500}
                    onClick={() =>
                      command({
                        type: 'height',
                        value: Math.max(
                          500,
                          document.nodes.ROOT.props.canvas.height - 100,
                        ),
                      })
                    }
                  >
                    −
                  </button>
                  <span>{document.nodes.ROOT.props.canvas.height}px</span>
                  <button
                    type="button"
                    aria-label="Tăng chiều dài"
                    disabled={document.nodes.ROOT.props.canvas.height >= 16000}
                    onClick={() =>
                      command({
                        type: 'height',
                        value: Math.min(
                          16000,
                          document.nodes.ROOT.props.canvas.height + 100,
                        ),
                      })
                    }
                  >
                    +
                  </button>
                </div>
                <label className={styles.snapToggle}>
                  <input
                    type="checkbox"
                    checked={snapping}
                    onChange={(e) => setSnapping(e.target.checked)}
                  />{' '}
                  Bắt dính khi di chuyển
                </label>
                <p className={styles.hint}>
                  Chọn phần tử trên thiệp hoặc trong Lớp để chỉnh sửa.
                </p>
              </>
            )}
          </ToolPanel>
        )}
      </div>
      {editingShare && !library && (
        <ModalSurface
          label="Cài đặt tiêu đề và hình đại diện"
          variant="centered"
          className={styles.shareModal}
          onClose={() => setEditingShare(false)}
          closeLabel="Đóng"
        >
          <form
            className={styles.shareForm}
            onSubmit={(event) => {
              event.preventDefault();
              const title = shareDraft.title.trim();
              if (!title) {
                setShareError('Nhập tiêu đề trang để tiếp tục.');
                return;
              }
              command({
                type: 'settings',
                value: {
                  ...historyRef.current.present.settings,
                  title,
                  shareImageId: shareDraft.imageId,
                },
              });
              setEditingShare(false);
              void save();
            }}
          >
            <label htmlFor="share-page-title">
              <span className={styles.required}>*</span> Tiêu đề trang
            </label>
            <input
              id="share-page-title"
              maxLength={120}
              required
              placeholder="VD: Cine & Love Wedding"
              value={shareDraft.title}
              onChange={(event) => {
                setShareDraft((current) => ({
                  ...current,
                  title: event.target.value,
                }));
                setShareError('');
              }}
              aria-invalid={!!shareError}
              aria-describedby={shareError ? 'share-title-error' : undefined}
            />
            {shareError && (
              <p id="share-title-error" role="alert">
                {shareError}
              </p>
            )}
            <span className={styles.shareImageLabel}>Hình đại diện</span>
            <div className={styles.shareModalArtwork}>
              {shareDraft.imageId ? (
                <AssetImage
                  key={shareDraft.imageId}
                  source={urls[shareDraft.imageId]}
                  alt="Hình đại diện hiện tại"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div className={styles.shareModalPlaceholder}>
                  Chưa chọn hình đại diện
                </div>
              )}
            </div>
            <p className={styles.shareRatio}>Tỉ lệ khuyến nghị: 16:9</p>
            <button
              type="button"
              className={styles.shareImageButton}
              onClick={() => {
                setEditingShare(false);
                setLibrary({ kind: 'IMAGE', target: 'share' });
              }}
            >
              <Eye size={16} /> Chọn hình đại diện khác
            </button>
            <p className={styles.shareImageHint}>
              Ảnh sẽ được cắt theo tỉ lệ được chọn (4:3, 16:9, 3:2) để tối ưu
              hiển thị
            </p>
            <div className={styles.shareActions}>
              <button type="button" onClick={() => setEditingShare(false)}>
                Hủy
              </button>
              <button type="submit" disabled={saving || publishing || conflict}>
                Lưu thay đổi
              </button>
            </div>
          </form>
        </ModalSurface>
      )}
      {library && (
        <ModalSurface
          label="Chọn ảnh"
          onClose={() => {
            if (library.target === 'share') setEditingShare(true);
            setLibrary(null);
          }}
        >
          <AssetLibrary
            kind={library.kind}
            onAsset={selectedImage}
            onAssets={
              library.target === 'album' ? selectedAlbumImages : undefined
            }
            selectionLimit={
              library.target === 'album' && node && isAdvanced(node)
                ? Math.max(0, 50 - (node.props.content.assetIds?.length ?? 0))
                : 50
            }
            usage={assetUsage}
            onDelete={deleteLibraryAsset}
          />
        </ModalSurface>
      )}
    </section>
  );
}
