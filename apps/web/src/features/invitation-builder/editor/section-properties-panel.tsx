import type {
  InvitationSection,
  LeafV2,
  SectionRule,
  TextStyle,
  Background,
  Padding,
  Appearance,
} from '../document/types';
import { PROPERTY_MATRIX } from '../document/types';
import type { AssetSummary } from '../api/client';
import { NumberField, ColorField } from './section-fields';
import { SectionArtworkControls } from './section-artwork-controls';
const deviceLabel = { mobile: 'mobile', desktop: 'desktop' };
function BackgroundFields({
  label,
  value,
  assets,
  onChange,
}: {
  label: string;
  value: Background;
  assets: AssetSummary[];
  onChange: (value: Background) => void;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <label>
        {label}: kiểu
        <select
          value={value.kind}
          onChange={(e) =>
            onChange(
              e.target.value === 'solid'
                ? { kind: 'solid', color: '#FFFFFF00' }
                : {
                    kind: 'asset',
                    assetId: assets[0].id,
                    fit: 'cover',
                    positionX: 0.5,
                    positionY: 0.5,
                  },
            )
          }
        >
          <option value="solid">Màu</option>
          <option value="asset" disabled={!assets.length}>
            Ảnh
          </option>
        </select>
      </label>
      {value.kind === 'solid' ? (
        <ColorField
          label={`${label}: màu`}
          value={value.color}
          onChange={(color) => onChange({ ...value, color })}
        />
      ) : (
        <>
          <label>
            {label}: ảnh
            <select
              value={value.assetId}
              onChange={(e) => onChange({ ...value, assetId: e.target.value })}
            >
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {label}: cách lấp đầy
            <select
              value={value.fit}
              onChange={(e) =>
                onChange({
                  ...value,
                  fit: e.target.value as 'cover' | 'contain',
                })
              }
            >
              <option value="cover">Lấp đầy</option>
              <option value="contain">Giữ toàn ảnh</option>
            </select>
          </label>
          {(['positionX', 'positionY'] as const).map((key) => (
            <NumberField
              key={key}
              label={`${label}: ${key === 'positionX' ? 'vị trí ngang' : 'vị trí dọc'}`}
              value={value[key]}
              min={0}
              max={1}
              step={0.1}
              onChange={(n) => onChange({ ...value, [key]: n })}
            />
          ))}
        </>
      )}
    </fieldset>
  );
}
function PaddingFields({
  label,
  value,
  max = 128,
  onChange,
}: {
  label: string;
  value: Partial<Padding>;
  max?: number;
  onChange: (value: Padding) => void;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      {(['top', 'right', 'bottom', 'left'] as const).map((key, index) => (
        <NumberField
          key={key}
          label={`${label}: ${['trên', 'phải', 'dưới', 'trái'][index]}`}
          value={value[key] ?? 0}
          min={0}
          max={max}
          onChange={(n) =>
            onChange({
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              ...value,
              [key]: n ?? 0,
            })
          }
        />
      ))}
    </fieldset>
  );
}
export function SectionPropertiesPanel({
  section,
  node,
  assets,
  onSection,
  onNode,
  disabled,
}: {
  section?: InvitationSection;
  node?: LeafV2;
  assets: AssetSummary[];
  onSection: (section: InvitationSection) => void;
  onNode: (node: LeafV2) => void;
  disabled: boolean;
}) {
  if (section)
    return (
      <fieldset disabled={disabled}>
        <legend>Thuộc tính section</legend>
        <label>
          Tên section
          <input
            maxLength={120}
            value={section.label}
            onChange={(e) => onSection({ ...section, label: e.target.value })}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={section.hidden}
            onChange={(e) =>
              onSection({ ...section, hidden: e.target.checked })
            }
          />
          Ẩn section
        </label>
        <BackgroundFields
          label="Nền section"
          value={section.background}
          assets={assets}
          onChange={(background) => onSection({ ...section, background })}
        />
        {(['mobile', 'desktop'] as const).map((device) => {
          const rule = {
            ...section.mobile,
            ...section.desktop,
            ...(device === 'mobile' ? section.mobile : {}),
            padding:
              device === 'mobile'
                ? section.mobile.padding
                : { ...section.mobile.padding, ...section.desktop.padding },
          };
          const update = (patch: Partial<SectionRule>) =>
            onSection({
              ...section,
              [device]: { ...section[device], ...patch },
            });
          return (
            <fieldset key={device}>
              <legend>{device === 'mobile' ? 'Mobile' : 'Desktop'}</legend>
              <label>
                Bố cục {deviceLabel[device]}
                <select
                  value={rule.layout}
                  onChange={(e) =>
                    update({
                      layout: e.target.value as 'stack' | 'grid',
                      columns: e.target.value === 'stack' ? 1 : rule.columns,
                    })
                  }
                >
                  <option value="stack">Một cột</option>
                  <option value="grid">Lưới</option>
                </select>
              </label>
              <label>
                Số cột {deviceLabel[device]}
                <select
                  value={rule.columns}
                  disabled={rule.layout !== 'grid'}
                  onChange={(e) =>
                    update({ columns: Number(e.target.value) as 1 | 2 })
                  }
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </label>
              <label>
                Độ rộng nội dung {deviceLabel[device]}
                <select
                  value={rule.contentPreset}
                  onChange={(e) =>
                    update({
                      contentPreset: e.target
                        .value as SectionRule['contentPreset'],
                      customMaxWidth:
                        e.target.value === 'custom'
                          ? (rule.customMaxWidth ?? 400)
                          : null,
                    })
                  }
                >
                  {[
                    ['full', 'Toàn khung'],
                    ['information', 'Thông tin'],
                    ['story', 'Câu chuyện'],
                    ['form', 'Biểu mẫu'],
                    ['custom', 'Tùy chỉnh'],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {rule.contentPreset === 'custom' && (
                <NumberField
                  label={`Rộng nội dung (px) ${device}`}
                  value={rule.customMaxWidth ?? 400}
                  min={200}
                  max={900}
                  onChange={(n) => update({ customMaxWidth: n ?? 400 })}
                />
              )}
              <NumberField
                label={`Khoảng cách ${device}`}
                value={rule.gap}
                min={0}
                max={128}
                onChange={(n) => update({ gap: n ?? 0 })}
              />
              <NumberField
                label={`Chiều cao tối thiểu ${device}`}
                value={rule.minHeight}
                min={0}
                max={12000}
                onChange={(n) => update({ minHeight: n ?? 0 })}
              />
              <label>
                Căn nội dung {device}
                <select
                  value={rule.align}
                  onChange={(e) =>
                    update({ align: e.target.value as SectionRule['align'] })
                  }
                >
                  {[
                    ['start', 'Đầu'],
                    ['center', 'Giữa'],
                    ['end', 'Cuối'],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <PaddingFields
                label={`Padding section ${device}`}
                value={rule.padding}
                onChange={(padding) => update({ padding })}
              />
              {device === 'desktop' && (
                <button
                  type="button"
                  onClick={() => onSection({ ...section, desktop: {} })}
                >
                  Dùng section mobile
                </button>
              )}
            </fieldset>
          );
        })}
      </fieldset>
    );
  if (!node) return <p>Chọn section hoặc phần tử để chỉnh sửa.</p>;
  const content = node.content as unknown as Record<string, unknown>;
  const patchContent = (patch: Record<string, unknown>) =>
    onNode({ ...node, content: { ...content, ...patch } } as LeafV2);
  const appearance = (patch: Partial<Appearance>) =>
    onNode({ ...node, appearance: { ...node.appearance, ...patch } });
  const textStyle =
    'textStyle' in content ? (content.textStyle as TextStyle) : undefined;
  const text = (patch: Partial<TextStyle>) =>
    patchContent({ textStyle: { ...textStyle, ...patch } });
  const matrix = PROPERTY_MATRIX[node.type];
  const flow = (
    device: 'mobile' | 'desktop',
    part: 'layout' | 'typography' | 'appearance',
    patch: Record<string, unknown>,
  ) => {
    if (node.role !== 'flow') return;
    const values: Record<string, unknown> = {
      ...(node[device][part] ?? {}),
      ...patch,
    };
    for (const key of Object.keys(values))
      if (values[key] === undefined) delete values[key];
    onNode({
      ...node,
      [device]: { ...node[device], [part]: values },
    } as LeafV2);
  };
  return (
    <fieldset disabled={disabled}>
      <legend>Thuộc tính phần tử</legend>
      <label>
        <input
          type="checkbox"
          checked={node.custom.locked}
          onChange={(e) =>
            onNode({
              ...node,
              custom: { ...node.custom, locked: e.target.checked },
            })
          }
        />
        Khóa phần tử
      </label>
      <fieldset disabled={node.custom.locked}>
        <label>
          Tên phần tử
          <input
            maxLength={120}
            value={node.custom.layerName}
            onChange={(e) =>
              onNode({
                ...node,
                custom: { ...node.custom, layerName: e.target.value },
              })
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={node.hidden}
            onChange={(e) => onNode({ ...node, hidden: e.target.checked })}
          />
          Ẩn phần tử
        </label>
        <label>
          <input
            type="checkbox"
            checked={node.custom.optional}
            onChange={(e) =>
              onNode({
                ...node,
                custom: { ...node.custom, optional: e.target.checked },
              })
            }
          />
          Ẩn khi thiếu dữ liệu
        </label>
        {node.type === 'Text' && (
          <label>
            Nội dung
            <textarea
              maxLength={5000}
              rows={4}
              value={String(content.text)}
              onChange={(e) => patchContent({ text: e.target.value })}
            />
          </label>
        )}
        {(
          [
            'title',
            'label',
            'closedLabel',
            'successLabel',
            'endedLabel',
          ] as const
        )
          .filter((key) => key in content)
          .map((key) => (
            <label key={key}>
              {
                {
                  title: 'Tiêu đề',
                  label: 'Nhãn',
                  closedLabel: 'Thông báo đã đóng',
                  successLabel: 'Thông báo thành công',
                  endedLabel: 'Thông báo hết thời gian',
                }[key]
              }
              <input
                value={String(content[key])}
                maxLength={500}
                onChange={(e) => patchContent({ [key]: e.target.value })}
              />
            </label>
          ))}
        {(node.type === 'Image' || node.type === 'Decoration') && (
          <>
            <label>
              Ảnh mẫu
              <select
                value={String(content.assetId ?? '')}
                onChange={(e) =>
                  patchContent({ assetId: e.target.value || null })
                }
              >
                <option value="">Chọn ảnh</option>
                {assets
                  .filter((a) => a.kind !== 'THUMBNAIL')
                  .map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Mô tả ảnh
              <input
                maxLength={300}
                value={String(content.alt)}
                onChange={(e) => patchContent({ alt: e.target.value })}
              />
            </label>
            {node.role === 'flow' && (
              <NumberField
                label="Tỉ lệ ảnh"
                value={Number(content.aspectRatio)}
                min={0.1}
                max={10}
                step={0.1}
                onChange={(n) => patchContent({ aspectRatio: n })}
              />
            )}
            <label>
              Cách lấp ảnh
              <select
                value={String(content.fit)}
                onChange={(e) => patchContent({ fit: e.target.value })}
              >
                <option value="cover">Lấp đầy</option>
                <option value="contain">Giữ toàn ảnh</option>
              </select>
            </label>
            {(['positionX', 'positionY'] as const).map((key) => (
              <NumberField
                key={key}
                label={
                  key === 'positionX' ? 'Vị trí ảnh ngang' : 'Vị trí ảnh dọc'
                }
                value={Number(content[key])}
                min={0}
                max={1}
                step={0.1}
                onChange={(n) => patchContent({ [key]: n })}
              />
            ))}
          </>
        )}
        {node.type === 'Shape' && (
          <>
            <label>
              Hình dạng
              <select
                value={String(content.primitive)}
                onChange={(e) => patchContent({ primitive: e.target.value })}
              >
                <option value="rectangle">Chữ nhật</option>
                <option value="ellipse">Ellipse</option>
                <option value="line">Đường</option>
              </select>
            </label>
            <ColorField
              label="Màu hình"
              value={String(content.fill)}
              onChange={(fill) => patchContent({ fill })}
            />
          </>
        )}
        {'accentColor' in content && (
          <ColorField
            label="Màu nhấn"
            value={String(content.accentColor)}
            onChange={(accentColor) => patchContent({ accentColor })}
          />
        )}
        {textStyle && (
          <fieldset>
            <legend>Chữ cơ sở</legend>
            <label>
              Font
              <select
                value={textStyle.fontId}
                onChange={(e) =>
                  text({ fontId: e.target.value as TextStyle['fontId'] })
                }
              >
                <option value="noto-sans-v1">Noto Sans</option>
                <option value="noto-serif-v1">Noto Serif</option>
              </select>
            </label>
            <label>
              Độ đậm
              <select
                value={textStyle.fontWeight}
                onChange={(e) =>
                  text({ fontWeight: Number(e.target.value) as 400 | 700 })
                }
              >
                <option value="400">Thường</option>
                <option value="700">Đậm</option>
              </select>
            </label>
            <ColorField
              label="Màu chữ"
              value={textStyle.color}
              onChange={(color) => text({ color })}
            />
            {(['italic', 'underline'] as const).map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={textStyle[key]}
                  onChange={(e) => text({ [key]: e.target.checked })}
                />
                {key === 'italic' ? 'Nghiêng' : 'Gạch chân'}
              </label>
            ))}
            <label>
              Kiểu chữ
              <select
                value={textStyle.textTransform}
                onChange={(e) =>
                  text({
                    textTransform: e.target.value as TextStyle['textTransform'],
                  })
                }
              >
                {['none', 'uppercase', 'lowercase', 'capitalize'].map(
                  (value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ),
                )}
              </select>
            </label>
          </fieldset>
        )}
        <NumberField
          label="Độ hiển thị"
          value={node.appearance.opacity}
          min={0}
          max={1}
          step={0.1}
          onChange={(n) => appearance({ opacity: n ?? 1 })}
        />
        {matrix.borderRadius && (
          <NumberField
            label="Bo góc cơ sở"
            value={node.appearance.borderRadius ?? 0}
            min={0}
            max={128}
            onChange={(n) => appearance({ borderRadius: n })}
          />
        )}
        <NumberField
          label="Độ dày viền"
          value={node.appearance.border.width}
          min={0}
          max={20}
          onChange={(n) =>
            appearance({ border: { ...node.appearance.border, width: n ?? 0 } })
          }
        />
        <ColorField
          label="Màu viền"
          value={node.appearance.border.color}
          onChange={(color) =>
            appearance({ border: { ...node.appearance.border, color } })
          }
        />
        <label>
          Kiểu viền
          <select
            value={node.appearance.border.style}
            onChange={(e) =>
              appearance({
                border: {
                  ...node.appearance.border,
                  style: e.target.value as 'solid' | 'dashed' | 'dotted',
                },
              })
            }
          >
            {['solid', 'dashed', 'dotted'].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        {matrix.background && (
          <BackgroundFields
            label="Nền phần tử"
            value={node.appearance.background!}
            assets={assets}
            onChange={(background) => appearance({ background })}
          />
        )}{' '}
        {matrix.padding && (
          <PaddingFields
            label="Padding cơ sở"
            max={100}
            value={node.appearance.padding!}
            onChange={(padding) => appearance({ padding })}
          />
        )}
        <label>
          <input
            type="checkbox"
            checked={!!node.appearance.shadow}
            onChange={(e) =>
              appearance({
                shadow: e.target.checked
                  ? {
                      offsetX: 0,
                      offsetY: 4,
                      blur: 12,
                      spread: 0,
                      color: '#00000020',
                    }
                  : null,
              })
            }
          />
          Đổ bóng
        </label>
        {node.appearance.shadow && (
          <fieldset>
            <legend>Bóng</legend>
            {(['offsetX', 'offsetY', 'blur', 'spread'] as const).map((key) => (
              <NumberField
                key={key}
                label={`Bóng ${key}`}
                value={node.appearance.shadow![key]}
                min={key === 'blur' ? 0 : key === 'spread' ? -50 : -100}
                max={key === 'spread' ? 50 : 100}
                step={0.1}
                onChange={(n) =>
                  appearance({
                    shadow: { ...node.appearance.shadow!, [key]: n ?? 0 },
                  })
                }
              />
            ))}
            <ColorField
              label="Màu bóng"
              value={node.appearance.shadow.color}
              onChange={(color) =>
                appearance({ shadow: { ...node.appearance.shadow!, color } })
              }
            />
          </fieldset>
        )}
        {node.role === 'flow' &&
          (['mobile', 'desktop'] as const).map((device) => {
            const layout = {
              ...node.mobile.layout,
              ...(device === 'desktop' ? node.desktop.layout : {}),
            };
            return (
              <fieldset key={device}>
                <legend>{device === 'mobile' ? 'Mobile' : 'Desktop'}</legend>
                <NumberField
                  label={`Rộng phần tử (%) ${device}`}
                  value={layout.widthPercent}
                  min={1}
                  max={100}
                  onChange={(n) => flow(device, 'layout', { widthPercent: n })}
                />
                <NumberField
                  label={`Rộng tối đa (px) ${device}`}
                  value={layout.maxWidth ?? undefined}
                  min={1}
                  max={900}
                  inherit
                  onChange={(n) =>
                    flow(device, 'layout', { maxWidth: n ?? null })
                  }
                />
                <label>
                  Căn phần tử {device}
                  <select
                    value={layout.align}
                    onChange={(e) =>
                      flow(device, 'layout', { align: e.target.value })
                    }
                  >
                    {[
                      ['start', 'Đầu'],
                      ['center', 'Giữa'],
                      ['end', 'Cuối'],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {matrix.textStyle && (
                  <>
                    <NumberField
                      label={`Cỡ chữ (${device})`}
                      value={node[device].typography?.fontSize}
                      min={8}
                      max={96}
                      step={0.1}
                      inherit
                      onChange={(n) =>
                        flow(device, 'typography', { fontSize: n })
                      }
                    />
                    <NumberField
                      label={`Giãn dòng (${device})`}
                      value={node[device].typography?.lineHeight}
                      min={1}
                      max={3}
                      step={0.1}
                      inherit
                      onChange={(n) =>
                        flow(device, 'typography', { lineHeight: n })
                      }
                    />
                    <NumberField
                      label={`Giãn chữ (${device})`}
                      value={node[device].typography?.letterSpacing}
                      min={-5}
                      max={20}
                      step={0.1}
                      inherit
                      onChange={(n) =>
                        flow(device, 'typography', { letterSpacing: n })
                      }
                    />
                    <label>
                      Căn chữ {device}
                      <select
                        value={node[device].typography?.textAlign ?? ''}
                        onChange={(e) =>
                          flow(device, 'typography', {
                            textAlign: e.target.value || undefined,
                          })
                        }
                      >
                        <option value="">Kế thừa</option>
                        {['left', 'center', 'right', 'justify'].map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {matrix.padding && (
                  <PaddingFields
                    label={`Padding phần tử ${device}`}
                    value={node[device].appearance?.padding ?? {}}
                    onChange={(padding) =>
                      flow(device, 'appearance', { padding })
                    }
                  />
                )}
                <NumberField
                  label={`Bo góc (${device})`}
                  value={node[device].appearance?.borderRadius}
                  min={0}
                  max={128}
                  inherit
                  onChange={(n) =>
                    flow(device, 'appearance', { borderRadius: n })
                  }
                />
                {device === 'desktop' && (
                  <button
                    type="button"
                    onClick={() => onNode({ ...node, desktop: {} })}
                  >
                    Dùng phần tử mobile
                  </button>
                )}
              </fieldset>
            );
          })}
      </fieldset>
      <SectionArtworkControls node={node} onChange={onNode} />
    </fieldset>
  );
}
