'use client';
import { vietnameseLocalDateTime } from './direct-widget-controls';
import type {
  CanvasNode,
  NodeOptions,
  EditorDocument,
  CustomField,
} from '../document/editor-document';
import { isAdvanced } from '../document/editor-document';
import type { ElementNode } from '../document/types';
import type { DocumentCommand } from './editor-commands';
import { defaultTextStyle } from './defaults';
import { PropertiesPanel } from './properties-panel';
import { MotionControls } from './motion-controls';
import { ClickActionControls } from './click-action-controls';
import { ColorField, PropertySection, NumberRow } from './property-controls';
import styles from './property-controls.module.css';

export function NumberProperty({
  label,
  value,
  onChange,
  min,
  max,
  step = 'any',
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number | 'any';
}) {
  return (
    <label>
      {label}
      <input
        key={value}
        type="number"
        defaultValue={value}
        min={min}
        max={max}
        step={step}
        onBlur={(e) => {
          if (e.target.value !== '') onChange(Number(e.target.value));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}
export function EditorProperties({
  id,
  node,
  options,
  index,
  count,
  command,
  onChoose,
  disabled,
  assetUrls,
  targets = [],
  onPickTarget,
  onLocateTarget,
}: {
  id: string;
  node: CanvasNode;
  options: NodeOptions;
  index: number;
  count: number;
  command: (c: DocumentCommand) => void;
  onChoose: (target: 'image' | 'album' | 'poster') => void;
  disabled: boolean;
  assetUrls: Record<string, string>;
  targets?: { id: string; label: string }[];
  onPickTarget?: () => void;
  onLocateTarget?: (id: string) => void;
}) {
  const content = (value: Record<string, unknown>) =>
    command({ type: 'content', id, value });
  const option = (value: NodeOptions) =>
    command({ type: 'options', id, value: { ...options, ...value } });
  return (
    <section aria-label="Thuộc tính phần tử">
      {node.type.resolvedName === 'GuestName' &&
      'label' in node.props.content ? (
        <>
          <label>
            Tên hiển thị mẫu
            <input
              value={node.props.content.label}
              maxLength={120}
              disabled={disabled || node.custom.locked}
              onChange={(e) => content({ label: e.target.value })}
            />
          </label>
          <PropertiesPanel
            id={id}
            node={
              {
                ...node,
                type: { resolvedName: 'Text' },
                displayName: 'Text',
                props: {
                  ...node.props,
                  content: {
                    text: node.props.content.label,
                    textStyle: node.props.content.textStyle ?? {
                      ...defaultTextStyle,
                      fontSize: 13,
                    },
                  },
                },
              } as ElementNode
            }
            options={options}
            assetUrls={assetUrls}
            index={index}
            count={count}
            onCommand={(value) => {
              if (value.type === 'content' && 'text' in value.value) {
                const { text, ...rest } = value.value;
                command({ ...value, value: { ...rest, label: text } });
              } else command(value);
            }}
            onReplace={() => onChoose('image')}
            disabled={disabled}
          />
        </>
      ) : !isAdvanced(node) ? (
        <PropertiesPanel
          id={id}
          node={node as ElementNode}
          options={options}
          assetUrls={assetUrls}
          index={index}
          count={count}
          onCommand={command}
          onReplace={() => onChoose('image')}
          disabled={disabled}
        />
      ) : (
        <div className={styles.legacyForm}>
          <h3>{node.custom.layerName}</h3>
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              command({ type: 'lock', id, value: !node.custom.locked })
            }
          >
            {node.custom.locked ? 'Mở khóa' : 'Khóa phần tử'}
          </button>
          <fieldset
            disabled={disabled || node.custom.locked}
            style={{ border: 0, padding: 0 }}
          >
            {node.type.resolvedName !== 'Carousel' && (
              <label>
                Nhãn hiển thị
                <input
                  key={node.props.content.label}
                  defaultValue={node.props.content.label}
                  maxLength={120}
                  onBlur={(e) => content({ label: e.target.value })}
                />
              </label>
            )}
            {(node.type.resolvedName === 'Album' ||
              node.type.resolvedName === 'Carousel') && (
              <>
                <button type="button" onClick={() => onChoose('album')}>
                  Thêm ảnh
                </button>
                <ol>
                  {(node.props.content.assetIds ?? []).map((a, i) => (
                    <li key={a + ':' + i}>
                      Ảnh{i + 1}
                      <button
                        type="button"
                        disabled={!i}
                        onClick={() => {
                          const ids = [...(node.props.content.assetIds ?? [])];
                          [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                          content({ assetIds: ids });
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          content({
                            assetIds: (
                              node.props.content.assetIds ?? []
                            ).filter((_, j) => j !== i),
                          })
                        }
                      >
                        Bỏ
                      </button>
                    </li>
                  ))}
                </ol>
                {node.type.resolvedName === 'Carousel' && (
                  <>
                    <label>
                      Kiểu carousel
                      <select
                        value={
                          node.props.content.carouselLayout === 'feature'
                            ? 'feature'
                            : 'stack'
                        }
                        onChange={(e) =>
                          content({ carouselLayout: e.target.value })
                        }
                      >
                        <option value="stack">Stack — Xếp chồng</option>
                        <option value="feature">Feature — Ảnh nổi bật</option>
                      </select>
                    </label>
                    <NumberProperty
                      label="Thời gian chuyển (s)"
                      min={0.2}
                      max={10}
                      step={0.1}
                      value={node.props.content.durationSec ?? 1.5}
                      onChange={(durationSec) => content({ durationSec })}
                    />
                    <NumberProperty
                      label="Độ trễ (s)"
                      min={0}
                      max={10}
                      step={0.1}
                      value={node.props.content.delaySec ?? 0}
                      onChange={(delaySec) => content({ delaySec })}
                    />
                    <label>
                      <input
                        type="checkbox"
                        checked={node.props.content.autoplay ?? false}
                        onChange={(e) =>
                          content({ autoplay: e.target.checked })
                        }
                      />
                      Tự động chạy (khách có thể tạm dừng)
                    </label>
                  </>
                )}
              </>
            )}
            {node.type.resolvedName === 'YouTube' && (
              <>
                <label>
                  Mã video YouTube
                  <input
                    key={node.props.content.videoId}
                    defaultValue={node.props.content.videoId}
                    maxLength={11}
                    onBlur={(e) => content({ videoId: e.target.value.trim() })}
                  />
                </label>
                <button type="button" onClick={() => onChoose('poster')}>
                  Chọn poster
                </button>
              </>
            )}
            {node.type.resolvedName === 'Contact' && (
              <label>
                Số điện thoại
                <input
                  type="tel"
                  key={node.props.content.phone}
                  defaultValue={node.props.content.phone}
                  maxLength={30}
                  onBlur={(e) => content({ phone: e.target.value })}
                />
              </label>
            )}
            {node.type.resolvedName === 'Contact' && (
              <PropertySection title="Biểu tượng điện thoại" defaultOpen>
                <label>
                  <input
                    type="checkbox"
                    checked={node.props.content.showIcon !== false}
                    onChange={(e) => content({ showIcon: e.target.checked })}
                  />
                  Hiển thị icon điện thoại
                </label>
                {node.props.content.showIcon !== false && (
                  <>
                    <NumberRow
                      label="Icon size"
                      min={8}
                      max={80}
                      value={node.props.content.iconSize ?? 18}
                      onChange={(iconSize) => content({ iconSize })}
                    />
                    <ColorField
                      label="Màu icon"
                      value={
                        node.props.content.iconColor ??
                        node.props.content.textColor ??
                        '#000000FF'
                      }
                      onPick={(iconColor) => content({ iconColor })}
                    />
                  </>
                )}
              </PropertySection>
            )}
            {['Contact', 'Reminder'].includes(node.type.resolvedName) && (
              <PropertySection title="Giao diện nút" defaultOpen>
                <ColorField
                  label="Màu nền nút"
                  value={node.props.content.buttonColor ?? '#FFFFFF00'}
                  onPick={(buttonColor) => content({ buttonColor })}
                />
                <ColorField
                  label="Màu chữ nút"
                  value={node.props.content.textColor ?? '#000000FF'}
                  onPick={(textColor) => content({ textColor })}
                />
                <NumberRow
                  label="Cỡ chữ nút"
                  min={8}
                  max={160}
                  value={node.props.content.fontSize ?? 16}
                  onChange={(fontSize) => content({ fontSize })}
                />
              </PropertySection>
            )}
            {node.type.resolvedName === 'Reminder' && (
              <label>
                Ngày giờ nhắc lịch
                <input
                  type="datetime-local"
                  value={vietnameseLocalDateTime(
                    node.props.content.event?.datetime,
                  )}
                  onChange={(e) => {
                    if (e.target.value)
                      content({
                        event: {
                          datetime: e.target.value + ':00+07:00',
                          timeZone: 'Asia/Ho_Chi_Minh',
                        },
                      });
                  }}
                />
              </label>
            )}
            {node.type.resolvedName === 'CustomForm' && (
              <FormComposer
                fields={node.props.content.fields ?? []}
                onChange={(fields) => content({ fields })}
              />
            )}
            <label>
              <input
                type="checkbox"
                checked={node.custom.optional}
                onChange={(e) =>
                  command({ type: 'optional', id, value: e.target.checked })
                }
              />
              Phần tùy chọn khi thiếu dữ liệu
            </label>
          </fieldset>
        </div>
      )}
      <fieldset
        disabled={disabled || node.custom.locked}
        className={styles.fieldset}
      >
        {['Text', 'Image', 'Decoration', 'Shape'].includes(
          node.type.resolvedName,
        ) && (
          <ClickActionControls
            id={id}
            options={options}
            targets={targets}
            onChange={option}
            onPickTarget={onPickTarget}
            onLocateTarget={onLocateTarget}
          />
        )}
        <MotionControls options={options} onChange={option} />
      </fieldset>
    </section>
  );
}
function FormComposer({
  fields,
  onChange,
}: {
  fields: CustomField[];
  onChange: (fields: CustomField[]) => void;
}) {
  const update = (i: number, patch: Partial<CustomField>) =>
    onChange(fields.map((f, j) => (i === j ? { ...f, ...patch } : f)));
  return (
    <section>
      <h3>Trường biểu mẫu</h3>
      {fields.map((f, i) => (
        <fieldset key={f.id}>
          <label>
            Nhãn
            <input
              key={f.label}
              defaultValue={f.label}
              maxLength={120}
              onBlur={(e) => update(i, { label: e.target.value })}
            />
          </label>
          <label>
            Loại
            <select
              value={f.type}
              onChange={(e) =>
                update(i, {
                  type: e.target.value as CustomField['type'],
                  options: ['select', 'multiselect'].includes(e.target.value)
                    ? f.options.length
                      ? f.options
                      : ['Có', 'Không']
                    : [],
                })
              }
            >
              {[
                'text',
                'textarea',
                'email',
                'tel',
                'number',
                'date',
                'select',
                'multiselect',
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={f.required}
              onChange={(e) => update(i, { required: e.target.checked })}
            />
            Bắt buộc
          </label>
          {['select', 'multiselect'].includes(f.type) && (
            <label>
              Mỗi lựa chọn một dòng
              <textarea
                key={f.options.join('\n')}
                defaultValue={f.options.join('\n')}
                onBlur={(e) =>
                  update(i, {
                    options: e.target.value
                      .split('\n')
                      .map((v) => v.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
          )}
          <button
            type="button"
            onClick={() => onChange(fields.filter((_, j) => j !== i))}
          >
            Xóa trường
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={fields.length >= 20}
        onClick={() =>
          onChange([
            ...fields,
            {
              id: 'field_' + crypto.randomUUID().slice(0, 8),
              label: 'Trường mới',
              type: 'text',
              required: false,
              options: [],
            },
          ])
        }
      >
        Thêm trường
      </button>
    </section>
  );
}
export function EditorSettingsPanel({
  document,
  onChange,
  view = 'settings',
}: {
  document: EditorDocument;
  onChange: (value: EditorDocument['settings']) => void;
  /** `settings` keeps description/language/scroll; `customize` controls toolbar/background. */
  view?: 'settings' | 'customize';
}) {
  const s = document.settings,
    update = (value: Partial<typeof s>) => onChange({ ...s, ...value });
  if (view === 'settings')
    return (
      <section aria-label="Cài đặt thiệp" className={styles.legacyForm}>
        <h3>Chia sẻ</h3>
        <label>
          Mô tả
          <textarea
            maxLength={500}
            value={s.description}
            onChange={(e) => update({ description: e.target.value })}
          />
        </label>
        <h3>Ngôn ngữ & cuộn trang</h3>
        <label>
          Ngôn ngữ nhãn
          <select
            value={s.locale}
            onChange={(e) => update({ locale: e.target.value as 'vi' | 'en' })}
          >
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </select>
        </label>
        <NumberProperty
          label="Tự cuộn (px/giây,0=tắt)"
          value={s.autoScroll}
          min={0}
          max={100}
          onChange={(autoScroll) => update({ autoScroll })}
        />
      </section>
    );
  return (
    <section
      aria-label="Thanh tiện ích và nền thiệp"
      className={styles.legacyForm}
    >
      <h3>Thanh tiện ích</h3>
      {(
        [
          ['gift', 'QR mừng cưới'],
          ['share', 'Chia sẻ'],
        ] as const
      ).map(([k, l]) => (
        <label key={k}>
          <input
            type="checkbox"
            checked={s.toolbar[k]}
            onChange={(e) =>
              update({ toolbar: { ...s.toolbar, [k]: e.target.checked } })
            }
          />
          {l}
        </label>
      ))}
      <h3>Nền chuyển màu</h3>
      <label>
        <input
          type="checkbox"
          checked={!!s.gradient}
          onChange={(e) =>
            update({
              gradient: e.target.checked
                ? { from: '#FDFBF7FF', to: '#F1EAE0FF', angle: 180 }
                : null,
            })
          }
        />
        Dùng gradient
      </label>
      {s.gradient && (
        <>
          <ColorField
            label="Màu đầu"
            value={s.gradient.from}
            onPick={(from) => update({ gradient: { ...s.gradient!, from } })}
          />
          <ColorField
            label="Màu cuối"
            value={s.gradient.to}
            onPick={(to) => update({ gradient: { ...s.gradient!, to } })}
          />
          <NumberProperty
            label="Góc gradient"
            min={0}
            max={360}
            value={s.gradient.angle}
            onChange={(angle) =>
              update({ gradient: { ...s.gradient!, angle } })
            }
          />
        </>
      )}
    </section>
  );
}
