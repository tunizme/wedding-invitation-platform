'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  usePrivateOwner,
  useOperationLifetime,
} from '../../identity-access/session/operation-scope';
import { useDirtyNavigationGuard } from '../../identity-access/session/navigation-guard';
import {
  builderRequest,
  BuilderApiError,
  type TemplateDetail,
  type TemplateSummary,
  type AssetSummary,
  type ListPage,
} from '../api/client';
import { canonicalJson } from '../document/validation-helpers';
import type {
  TemplateDesign,
  ElementNode,
  LeafV2,
  WeddingData,
} from '../document/types';
import { resolveDesign } from '../document/resolve-design';
import { ScenePreview } from '../renderer/scene-preview';
import { InvitationRenderer } from '../renderer/invitation-renderer';
import {
  applySectionCommand,
  newLeaf,
  type SectionCommand,
} from './section-commands';
import {
  createSectionHistory,
  executeSectionHistory,
  undoSectionHistory,
  redoSectionHistory,
  exportSectionDesign,
  leafAsLegacyNode,
} from './section-adapter';
import { SectionPanel } from './section-panel';
import { SectionPropertiesPanel } from './section-properties-panel';
import { AssetLibrary, type AssetChoice } from '../assets/asset-library';
import { BindingPanel } from './binding-panel';
import { SampleDataPanel, sampleWeddingData } from './sample-data-panel';
import { PublicationControls } from './publication-controls';
import type { TemplateLifecycle } from '../api/operations';
import styles from './section-editor.module.css';
import workspace from './authoring-workspace.module.css';
import { EditorHeading } from './editor-heading';
import { PreviewExit } from './preview-exit';
import { Undo2, Redo2, Save, Eye } from 'lucide-react';
function OwnedSectionEditor({
  initial,
  onSaved,
}: {
  initial: TemplateDetail;
  onSaved: (value: TemplateDetail) => void;
}) {
  const lifetime = useOperationLifetime(`SectionEditor:${initial.id}`);
  const [history, setHistory] = useState(() =>
    createSectionHistory(initial.draftDocument),
  );
  const historyRef = useRef(history);
  const [saved, setSaved] = useState(initial);
  const savedRef = useRef(saved);
  const [selected, setSelected] = useState(history.present.sectionOrder[0]);
  const [sample, setSample] = useState(initial.draftSampleData);
  const sampleRef = useRef(sample);
  const [selectedSample, setSelectedSample] = useState<'A' | 'B'>('A');
  const [taskPanel, setTaskPanel] = useState<
    'canvas' | 'components' | 'properties'
  >('canvas');
  const [previewOnly, setPreviewOnly] = useState(false);
  const [width, setWidth] = useState<390 | 900>(390);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [assetState, setAssetState] = useState<{
    key: string;
    urls: Record<string, string>;
  }>({ key: '', urls: {} });
  const [sourceId, setSourceId] = useState('');
  const sourceGeneration = useRef(0);
  const sourceRequest = useRef<ReturnType<typeof lifetime.capture> | null>(
    null,
  );
  const [source, setSource] = useState<TemplateDesign | null>(null);
  const [sourceLeaf, setSourceLeaf] = useState('');
  const [sourceOptions, setSourceOptions] = useState<TemplateSummary[]>([]);
  const [assetChoice, setAssetChoice] = useState<AssetChoice | null>(null);
  const assetTrigger = useRef<HTMLButtonElement>(null);
  const document = history.present;
  const dirty =
    canonicalJson(document) !== canonicalJson(saved.draftDocument) ||
    canonicalJson(sample) !== canonicalJson(saved.draftSampleData);
  useDirtyNavigationGuard(dirty);
  const resolution = useMemo(
    () =>
      resolveDesign(document, sample, {
        mode: 'preview',
        asOf: new Date().toISOString(),
      }),
    [document, sample],
  );
  const visibleKey = resolution.visibleAssetIds.join('|');
  const assetUrls = assetState.key === visibleKey ? assetState.urls : {};
  useEffect(() => {
    const scope = lifetime.capture();
    void Promise.all([
      builderRequest<ListPage<AssetSummary>>(
        '/admin/template-assets?limit=100',
        { scope },
      ),
      builderRequest<ListPage<TemplateSummary>>('/admin/templates?limit=100', {
        scope,
      }),
    ])
      .then(([images, templates]) => {
        if (scope.isActive()) {
          setAssets(images.items);
          setSourceOptions(templates.items);
        }
      })
      .catch((cause) => {
        if (scope.isActive())
          setError(
            cause instanceof Error
              ? cause.message
              : 'Không thể tải thư viện ảnh.',
          );
      });
    return () => scope.dispose();
  }, [lifetime]);
  useEffect(() => {
    const scope = lifetime.capture();
    const urls: string[] = [];
    let alive = true;
    void Promise.all(
      visibleKey
        ? visibleKey.split('|').map(async (id) => {
            const blob = await builderRequest<Blob>(`/assets/${id}/content`, {
              scope,
              bytes: true,
            });
            if (!scope.isActive() || !alive) return [id, ''] as const;
            const url = URL.createObjectURL(blob);
            urls.push(url);
            return [id, url] as const;
          })
        : [],
    )
      .then((entries) => {
        if (alive && scope.isActive())
          setAssetState({ key: visibleKey, urls: Object.fromEntries(entries) });
      })
      .catch((cause) => {
        if (alive && scope.isActive())
          setError(
            cause instanceof Error ? cause.message : 'Ảnh chưa sẵn sàng.',
          );
      });
    return () => {
      alive = false;
      scope.dispose();
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [visibleKey, lifetime]);
  function command(value: SectionCommand) {
    if (busyRef.current || !lifetime.isActive()) return;
    try {
      const next = executeSectionHistory(historyRef.current, value);
      const selection = applySectionCommand(
        historyRef.current.present,
        value,
      ).selectedId;
      historyRef.current = next;
      setHistory(next);
      if (selection) setSelected(selection);
      else if (
        !next.present.sections[selected] &&
        !next.present.nodes[selected]
      )
        setSelected(next.present.sectionOrder[0]);
      setError('');
      setStatus('');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Thiết kế không hợp lệ.',
      );
    }
  }
  function changeSample(value: WeddingData) {
    if (busyRef.current) return;
    sampleRef.current = value;
    setSample(value);
    setStatus('');
  }
  async function save(): Promise<TemplateDetail | null> {
    const scope = lifetime.capture();
    if (!scope.isActive() || busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const draft = exportSectionDesign(historyRef.current.present),
        data = structuredClone(sampleRef.current);
      const result = await builderRequest<TemplateDetail>(
        `/admin/templates/${initial.id}/draft`,
        {
          scope,
          method: 'PATCH',
          body: {
            expectedVersion: savedRef.current.editVersion,
            document: draft,
            sampleData: data,
          },
        },
      );
      if (!scope.isActive()) return null;
      savedRef.current = result;
      setSaved(result);
      onSaved(result);
      setStatus('Đã lưu thiết kế.');
      return result;
    } catch (cause) {
      if (scope.isActive())
        setError(
          cause instanceof Error
            ? cause.message
            : 'Không thể lưu. Thay đổi vẫn được giữ.',
        );
      return null;
    } finally {
      if (scope.isActive()) {
        busyRef.current = false;
        setBusy(false);
      }
      scope.dispose();
    }
  }
  async function refresh(committed?: TemplateLifecycle) {
    const scope = lifetime.capture();
    try {
      if (committed) {
        const merged = { ...savedRef.current, ...committed };
        savedRef.current = merged;
        setSaved(merged);
        onSaved(merged);
      }
      const result = await builderRequest<TemplateDetail>(
        `/admin/templates/${initial.id}`,
        { scope },
      );
      if (!scope.isActive()) return;
      if (committed && result.editVersion !== committed.editVersion)
        throw new BuilderApiError(409, 'VERSION_CONFLICT');
      savedRef.current = result;
      setSaved(result);
      onSaved(result);
    } finally {
      scope.dispose();
    }
  }
  async function loadSource() {
    sourceRequest.current?.dispose();
    const generation = ++sourceGeneration.current;
    const scope = lifetime.capture();
    sourceRequest.current = scope;
    try {
      const result = await builderRequest<TemplateDetail>(
        `/admin/templates/${sourceId}`,
        { scope },
      );
      if (!scope.isActive() || generation !== sourceGeneration.current) return;
      if (result.draftDocument.schemaVersion !== 1)
        throw new Error('Mẫu này đã dùng sections. Chọn mẫu canvas cũ.');
      setSource(result.draftDocument);
      setSourceLeaf(result.draftDocument.nodes.ROOT.nodes[0] ?? '');
    } catch (cause) {
      if (scope.isActive() && generation === sourceGeneration.current)
        setError(
          cause instanceof Error ? cause.message : 'Không thể tải mẫu cũ.',
        );
    } finally {
      scope.dispose();
    }
  }
  function copyLegacy() {
    if (!source || !sourceLeaf) return;
    const old = source.nodes[sourceLeaf] as ElementNode;
    const sectionId = document.sections[selected]
      ? selected
      : document.sectionOrder.find((id) =>
          [
            ...document.sections[id].flowNodeIds,
            ...document.sections[id].artworkNodeIds,
          ].includes(selected),
        );
    if (!sectionId) return;
    const type = old.type.resolvedName;
    const role = type === 'Decoration' ? 'artwork' : 'flow';
    const node = newLeaf(type, role);
    const imported = {
      ...node,
      content: {
        ...old.props.content,
        ...(type === 'Image' || type === 'Decoration'
          ? {
              alt: type === 'Image' ? 'Ảnh tái sử dụng từ mẫu cũ' : '',
              ...(role === 'flow' ? { aspectRatio: 4 / 3 } : {}),
            }
          : {}),
      },
      appearance: structuredClone(old.props.appearance),
      bindings: structuredClone(old.props.bindings),
      custom: { ...old.custom, locked: false },
      hidden: old.hidden,
    } as LeafV2;
    command({ type: 'leaf-add', sectionId, node: imported });
  }
  const node = document.nodes[selected],
    section = document.sections[selected];
  return (
    <section
      className={`${styles.editor} ${workspace.workspace}`}
      data-task-panel={taskPanel}
      data-preview={previewOnly}
      aria-label="Trình thiết kế sections"
    >
      {previewOnly && <PreviewExit onClose={() => setPreviewOnly(false)} />}
      <EditorHeading title={saved.name} dirty={dirty} responsive />
      <div
        data-section-controls
        className={`${workspace.toolbar} ${styles.controls}`}
      >
        <button
          type="button"
          disabled={busy || !history.past.length}
          onClick={() => {
            const next = undoSectionHistory(historyRef.current);
            historyRef.current = next;
            setHistory(next);
          }}
        >
          <Undo2 size={18} aria-hidden="true" /> Hoàn tác
        </button>
        <button
          type="button"
          disabled={busy || !history.future.length}
          onClick={() => {
            const next = redoSectionHistory(historyRef.current);
            historyRef.current = next;
            setHistory(next);
          }}
        >
          <Redo2 size={18} aria-hidden="true" /> Làm lại
        </button>
        <button
          className={workspace.saveButton}
          type="button"
          disabled={busy}
          onClick={() => void save()}
        >
          <Save size={17} aria-hidden="true" /> Lưu thiết kế
        </button>
        <button
          className={workspace.previewButton}
          data-preview-trigger
          type="button"
          aria-pressed={previewOnly}
          onClick={() => setPreviewOnly((value) => !value)}
        >
          <Eye size={17} aria-hidden="true" />{' '}
          {previewOnly ? 'Quay lại chỉnh sửa' : 'Chỉ xem thiệp'}
        </button>
        <label>
          Chiều rộng xem trước
          <select
            value={width}
            onChange={(e) => setWidth(Number(e.target.value) as 390 | 900)}
          >
            <option value="390">Mobile ·390px</option>
            <option value="900">Desktop ·900px</option>
          </select>
        </label>
      </div>
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
      <div
        className={`${workspace.taskTabs} ${styles.controls}`}
        aria-label="Khu vực thiết kế"
      >
        {(
          [
            ['canvas', 'Thiệp'],
            ['components', 'Các phần'],
            ['properties', 'Thuộc tính'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={taskPanel === value}
            onClick={() => setTaskPanel(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className={`${workspace.layout} ${previewOnly ? workspace.previewLayout : ''}`}
      >
        <aside
          hidden={previewOnly}
          className={`${workspace.components} ${styles.controls}`}
          data-section-controls
          aria-label="Các phần của thiệp"
        >
          <h2>Bố cục thiệp</h2>
          <p className={workspace.helper}>
            Sắp xếp từng phần để kể câu chuyện của bạn.
          </p>
          <SectionPanel
            document={document}
            selected={selected}
            onSelect={(id) => {
              setSelected(id);
              setTaskPanel('properties');
            }}
            onCommand={command}
            disabled={busy}
          />
        </aside>
        <div className={workspace.canvas}>
          <div className={workspace.canvasLabel}>
            <span>{previewOnly ? 'XEM TRƯỚC' : 'THIẾT KẾ RESPONSIVE'}</span>
            <span>{width}px</span>
          </div>
          <div
            className={styles.preview}
            style={{ width, maxWidth: '100%' }}
            data-testid="admin-responsive-preview"
          >
            <ScenePreview
              scene={resolution.scene}
              context={{
                mode: 'preview',
                asOf: new Date().toISOString(),
                assetUrls,
              }}
              bindingIssues={resolution.issues}
            >
              <InvitationRenderer
                scene={resolution.scene}
                context={{
                  mode: 'preview',
                  asOf: new Date().toISOString(),
                  assetUrls,
                }}
              />
            </ScenePreview>
          </div>
        </div>
        <aside
          hidden={previewOnly}
          className={`${workspace.properties} ${styles.controls}`}
          data-section-controls
          aria-label="Thuộc tính phần"
        >
          <h2>Thuộc tính</h2>

          {(section ||
            node?.type === 'Image' ||
            node?.type === 'Decoration') && (
            <button
              ref={assetTrigger}
              type="button"
              disabled={busy || node?.custom.locked}
              onClick={() =>
                setAssetChoice(
                  section
                    ? 'background'
                    : node?.type === 'Decoration'
                      ? 'Decoration'
                      : 'Image',
                )
              }
            >
              Mở thư viện ảnh
            </button>
          )}
          <SectionPropertiesPanel
            key={selected}
            node={node}
            section={section}
            assets={assets}
            disabled={busy}
            onSection={(section) =>
              command({ type: 'section-update', id: section.id, section })
            }
            onNode={(node) =>
              command({ type: 'leaf-update', id: node.id, node })
            }
          />
          {node && (
            <BindingPanel
              id={node.id}
              node={leafAsLegacyNode(node)}
              disabled={busy}
              onCommand={(value) => {
                if (value.type === 'binding')
                  command({
                    type: 'leaf-update',
                    id: node.id,
                    node: { ...node, bindings: value.value },
                  });
              }}
            />
          )}
        </aside>
      </div>
      <details className={styles.disclosure}>
        <summary>Dữ liệu mẫu</summary>
        <fieldset
          data-section-controls
          className={styles.controls}
          disabled={busy}
        >
          <SampleDataPanel
            selected={selectedSample}
            data={sample}
            assets={assets}
            onSelect={(value) => {
              setSelectedSample(value);
              changeSample(sampleWeddingData(value));
            }}
            onChange={changeSample}
          />
        </fieldset>
      </details>
      <details className={styles.disclosure}>
        <summary>Nhập nội dung từ mẫu cũ</summary>
        <fieldset
          data-section-controls
          className={styles.controls}
          disabled={busy}
        >
          <legend>Tái author mẫu canvas cũ</legend>
          <p>
            Chọn nội dung và đặt vào section đang chọn. Kiểm tra bố cục mới
            trước khi xuất bản.
          </p>
          <label>
            Mẫu cũ
            <select
              value={sourceId}
              onChange={(e) => {
                sourceGeneration.current++;
                sourceRequest.current?.dispose();
                sourceRequest.current = null;
                setSourceId(e.target.value);
                setSource(null);
                setSourceLeaf('');
              }}
            >
              <option value="">Chọn mẫu</option>
              {sourceOptions
                .filter((option) => option.id !== initial.id)
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!sourceId}
            onClick={() => void loadSource()}
          >
            Tải mẫu cũ
          </button>
          {source && (
            <>
              <label>
                Nội dung từ mẫu cũ
                <select
                  value={sourceLeaf}
                  onChange={(e) => setSourceLeaf(e.target.value)}
                >
                  {source.nodes.ROOT.nodes.map((id) => (
                    <option key={id} value={id}>
                      {(source.nodes[id] as ElementNode).custom.layerName}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" disabled={!sourceLeaf} onClick={copyLegacy}>
                Đưa nội dung vào section
              </button>
            </>
          )}
        </fieldset>
      </details>
      {assetChoice && (
        <AssetLibrary
          choice={assetChoice}
          returnFocusRef={assetTrigger}
          onClose={() => setAssetChoice(null)}
          onSelect={(asset) => {
            setAssets((previous) => [
              ...previous.filter((item) => item.id !== asset.id),
              asset,
            ]);
            if (section)
              command({
                type: 'section-update',
                id: section.id,
                section: {
                  ...section,
                  background: {
                    kind: 'asset',
                    assetId: asset.id,
                    fit: 'cover',
                    positionX: 0.5,
                    positionY: 0.5,
                  },
                },
              });
            else if (
              node &&
              (node.type === 'Image' || node.type === 'Decoration')
            )
              command({
                type: 'leaf-update',
                id: node.id,
                node: {
                  ...node,
                  content: { ...node.content, assetId: asset.id },
                } as LeafV2,
              });
            setAssetChoice(null);
          }}
        />
      )}
      <div data-section-controls className={styles.controls}>
        <PublicationControls
          template={saved}
          dirty={dirty}
          externalBusy={busy}
          lifetime={lifetime}
          canStart={() => !busyRef.current}
          saveBeforePublish={save}
          onChanged={refresh}
          onBusy={(value) => {
            busyRef.current = value;
            setBusy(value);
          }}
        />
      </div>
    </section>
  );
}
export default function SectionEditor(props: {
  initial: TemplateDetail;
  onSaved: (value: TemplateDetail) => void;
}) {
  const owner = usePrivateOwner(props.initial.id, 'ADMIN');
  return owner ? (
    <OwnedSectionEditor key={owner} {...props} />
  ) : (
    <p role="alert">Khu vực này chỉ dành cho Admin.</p>
  );
}
