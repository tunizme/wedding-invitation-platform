'use client';
import { useState } from 'react';
import type { ElementNode, TextStyle } from '../document/types';
import type { EditorCommand } from './commands';
import { BindingPanel } from './binding-panel';

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ display: 'block' }}>
      {label}
      <input
        key={value}
        aria-label={label}
        type="number"
        step="any"
        defaultValue={value}
        onBlur={(event) => {
          if (event.target.value !== '') onChange(Number(event.target.value));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </label>
  );
}
export function PropertiesPanel({
  id,
  node,
  index,
  count,
  onCommand,
  onReplace,
  disabled,
}: {
  id: string;
  node: ElementNode;
  index: number;
  count: number;
  onCommand: (command: EditorCommand) => void;
  /** Receives the button so the library can return focus to it explicitly. */
  onReplace: (trigger: HTMLElement | null) => void;
  disabled: boolean;
}) {
  const [error, setError] = useState('');
  const command = (value: EditorCommand) => {
    try {
      onCommand(value);
      setError('');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Thuộc tính không hợp lệ.',
      );
    }
  };
  const content = node.props.content,
    appearance = node.props.appearance;
  const updateText = (value: Partial<TextStyle>) => {
    if ('textStyle' in content)
      command({
        type: 'content',
        id,
        value: { textStyle: { ...content.textStyle, ...value } },
      });
  };
  return (
    <section aria-label="Thuộc tính">
      <h2>Thuộc tính</h2>
      {error && <p role="alert">{error}</p>}
      <button
        disabled={disabled}
        onClick={() =>
          command({ type: 'lock', id, value: !node.custom.locked })
        }
      >
        {node.custom.locked ? 'Mở khóa phần tử' : 'Khóa phần tử'}
      </button>
      <fieldset
        disabled={disabled || node.custom.locked}
        style={{ border: 0, padding: 0 }}
      >
        <BindingPanel
          id={id}
          node={node}
          onCommand={command}
          disabled={disabled}
        />
        <label>
          Tên lớp
          <input
            aria-label="Tên lớp"
            key={node.custom.layerName}
            defaultValue={node.custom.layerName}
            onBlur={(event) =>
              command({ type: 'rename', id, value: event.target.value })
            }
          />
        </label>
        {(['x', 'y', 'width', 'height', 'rotation'] as const).map((key, i) => (
          <NumberField
            key={key}
            label={['X', 'Y', 'Chiều rộng', 'Chiều cao', 'Góc xoay'][i]}
            value={node.props.box[key]}
            onChange={(value) =>
              command({ type: 'box', id, value: { [key]: value } })
            }
          />
        ))}
        <NumberField
          label="Độ mờ"
          value={appearance.opacity}
          onChange={(opacity) =>
            command({ type: 'appearance', id, value: { opacity } })
          }
        />
        <NumberField
          label="Độ dày viền"
          value={appearance.border.width}
          onChange={(width) =>
            command({
              type: 'appearance',
              id,
              value: { border: { ...appearance.border, width } },
            })
          }
        />
        <label>
          Màu viền
          <input
            aria-label="Màu viền"
            key={appearance.border.color}
            defaultValue={appearance.border.color}
            onBlur={(event) =>
              command({
                type: 'appearance',
                id,
                value: {
                  border: { ...appearance.border, color: event.target.value },
                },
              })
            }
          />
        </label>
        <label>
          Kiểu viền
          <select
            value={appearance.border.style}
            onChange={(event) =>
              command({
                type: 'appearance',
                id,
                value: {
                  border: {
                    ...appearance.border,
                    style: event.target.value as 'solid' | 'dashed' | 'dotted',
                  },
                },
              })
            }
          >
            {['solid', 'dashed', 'dotted'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        {appearance.borderRadius !== undefined && (
          <NumberField
            label="Bo góc"
            value={appearance.borderRadius}
            onChange={(borderRadius) =>
              command({ type: 'appearance', id, value: { borderRadius } })
            }
          />
        )}
        {appearance.background?.kind === 'solid' && (
          <label>
            Màu nền
            <input
              aria-label="Màu nền"
              key={appearance.background.color}
              defaultValue={appearance.background.color}
              onBlur={(event) =>
                command({
                  type: 'appearance',
                  id,
                  value: {
                    background: { kind: 'solid', color: event.target.value },
                  },
                })
              }
            />
          </label>
        )}
        {appearance.padding &&
          (['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <NumberField
              key={side}
              label={'Padding ' + side}
              value={appearance.padding![side]}
              onChange={(value) =>
                command({
                  type: 'appearance',
                  id,
                  value: { padding: { ...appearance.padding!, [side]: value } },
                })
              }
            />
          ))}
        <label>
          <input
            type="checkbox"
            checked={appearance.shadow !== null}
            onChange={(event) =>
              command({
                type: 'appearance',
                id,
                value: {
                  shadow: event.target.checked
                    ? {
                        offsetX: 0,
                        offsetY: 2,
                        blur: 6,
                        spread: 0,
                        color: '#00000040',
                      }
                    : null,
                },
              })
            }
          />
          Đổ bóng
        </label>
        {appearance.shadow && (
          <>
            {(['offsetX', 'offsetY', 'blur', 'spread'] as const).map((key) => (
              <NumberField
                key={key}
                label={'Shadow ' + key}
                value={appearance.shadow![key]}
                onChange={(value) =>
                  command({
                    type: 'appearance',
                    id,
                    value: { shadow: { ...appearance.shadow!, [key]: value } },
                  })
                }
              />
            ))}
            <label>
              Màu bóng
              <input
                defaultValue={appearance.shadow.color}
                key={appearance.shadow.color}
                onBlur={(event) =>
                  command({
                    type: 'appearance',
                    id,
                    value: {
                      shadow: {
                        ...appearance.shadow!,
                        color: event.target.value,
                      },
                    },
                  })
                }
              />
            </label>
          </>
        )}
        {node.type.resolvedName === 'Calendar' && 'accentColor' in content && (
          <label>
            Màu nhấn
            <input
              aria-label="Màu nhấn"
              value={content.accentColor}
              onChange={(event) =>
                command({
                  type: 'content',
                  id,
                  value: { accentColor: event.target.value },
                })
              }
            />
          </label>
        )}
        {node.type.resolvedName === 'Countdown' && 'label' in content && (
          <>
            <label>
              Nhãn đếm ngược
              <input
                aria-label="Nhãn đếm ngược"
                value={content.label}
                onChange={(event) =>
                  command({
                    type: 'content',
                    id,
                    value: { label: event.target.value },
                  })
                }
              />
            </label>
            <label>
              Nhãn kết thúc
              <input
                aria-label="Nhãn kết thúc"
                value={
                  (
                    content as import('../document/types').ContentByKind['Countdown']
                  ).endedLabel
                }
                onChange={(event) =>
                  command({
                    type: 'content',
                    id,
                    value: { endedLabel: event.target.value },
                  })
                }
              />
            </label>
          </>
        )}
        {node.type.resolvedName === 'Map' && 'label' in content && (
          <label>
            Nhãn bản đồ
            <input
              aria-label="Nhãn bản đồ"
              value={content.label}
              onChange={(event) =>
                command({
                  type: 'content',
                  id,
                  value: { label: event.target.value },
                })
              }
            />
          </label>
        )}
        {node.type.resolvedName === 'RSVP' && 'title' in content && (
          <>
            <label>
              Tiêu đề RSVP
              <input
                aria-label="Tiêu đề RSVP"
                value={content.title}
                onChange={(event) =>
                  command({
                    type: 'content',
                    id,
                    value: { title: event.target.value },
                  })
                }
              />
            </label>
            <label>
              Nhãn đóng RSVP
              <input
                aria-label="Nhãn đóng RSVP"
                value={content.closedLabel}
                onChange={(event) =>
                  command({
                    type: 'content',
                    id,
                    value: { closedLabel: event.target.value },
                  })
                }
              />
            </label>
            <label>
              Nhãn RSVP thành công
              <input
                aria-label="Nhãn RSVP thành công"
                value={content.successLabel}
                onChange={(event) =>
                  command({
                    type: 'content',
                    id,
                    value: { successLabel: event.target.value },
                  })
                }
              />
            </label>
          </>
        )}
        {node.type.resolvedName === 'QRBank' && 'label' in content && (
          <label>
            Nhãn QR ngân hàng
            <input
              aria-label="Nhãn QR ngân hàng"
              value={content.label}
              onChange={(event) =>
                command({
                  type: 'content',
                  id,
                  value: { label: event.target.value },
                })
              }
            />
          </label>
        )}
        {node.type.resolvedName === 'Timeline' && 'accentColor' in content && (
          <label>
            Màu nhấn
            <input
              aria-label="Màu nhấn"
              value={content.accentColor}
              onChange={(event) =>
                command({
                  type: 'content',
                  id,
                  value: { accentColor: event.target.value },
                })
              }
            />
          </label>
        )}

        {'text' in content && (
          <label>
            Nội dung
            <textarea
              aria-label="Nội dung"
              disabled={node.props.bindings.some(
                (binding) => binding.target === 'text',
              )}
              key={content.text}
              defaultValue={content.text}
              onBlur={(event) =>
                command({
                  type: 'content',
                  id,
                  value: { text: event.target.value },
                })
              }
            />
          </label>
        )}
        {'textStyle' in content && (
          <>
            <label>
              Phông chữ
              <select
                value={content.textStyle.fontId}
                onChange={(event) =>
                  updateText({
                    fontId: event.target.value as TextStyle['fontId'],
                  })
                }
              >
                <option value="noto-sans-v1">Noto Sans</option>
                <option value="noto-serif-v1">Noto Serif</option>
              </select>
            </label>
            <NumberField
              label="Cỡ chữ"
              value={content.textStyle.fontSize}
              onChange={(fontSize) => updateText({ fontSize })}
            />
            <NumberField
              label="Giãn ký tự"
              value={content.textStyle.letterSpacing}
              onChange={(letterSpacing) => updateText({ letterSpacing })}
            />
            <NumberField
              label="Giãn dòng"
              value={content.textStyle.lineHeight}
              onChange={(lineHeight) => updateText({ lineHeight })}
            />
            <label>
              Màu chữ
              <input
                aria-label="Màu chữ"
                key={content.textStyle.color}
                defaultValue={content.textStyle.color}
                onBlur={(event) => updateText({ color: event.target.value })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={content.textStyle.fontWeight === 700}
                onChange={(event) =>
                  updateText({ fontWeight: event.target.checked ? 700 : 400 })
                }
              />
              Đậm
            </label>
            <label>
              <input
                type="checkbox"
                checked={content.textStyle.italic}
                onChange={(event) =>
                  updateText({ italic: event.target.checked })
                }
              />
              Nghiêng
            </label>
            <label>
              <input
                type="checkbox"
                checked={content.textStyle.underline}
                onChange={(event) =>
                  updateText({ underline: event.target.checked })
                }
              />
              Gạch chân
            </label>
            <label>
              Căn chữ
              <select
                value={content.textStyle.textAlign}
                onChange={(event) =>
                  updateText({
                    textAlign: event.target.value as TextStyle['textAlign'],
                  })
                }
              >
                {['left', 'center', 'right', 'justify'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Kiểu chữ
              <select
                value={content.textStyle.textTransform}
                onChange={(event) =>
                  updateText({
                    textTransform: event.target
                      .value as TextStyle['textTransform'],
                  })
                }
              >
                {['none', 'uppercase', 'lowercase', 'capitalize'].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
            </label>
          </>
        )}
        {'assetId' in content && (
          <>
            <button
              disabled={node.props.bindings.some(
                (binding) => binding.target === 'assetId',
              )}
              onClick={(event) => onReplace(event.currentTarget)}
            >
              Thay ảnh
            </button>
            <label>
              Khớp ảnh
              <select
                value={content.fit}
                onChange={(event) =>
                  command({
                    type: 'content',
                    id,
                    value: { fit: event.target.value },
                  })
                }
              >
                <option value="cover">Phủ kín</option>
                <option value="contain">Vừa khung</option>
              </select>
            </label>
            <NumberField
              label="Căn ảnh ngang"
              value={content.positionX}
              onChange={(positionX) =>
                command({ type: 'content', id, value: { positionX } })
              }
            />
            <NumberField
              label="Căn ảnh dọc"
              value={content.positionY}
              onChange={(positionY) =>
                command({ type: 'content', id, value: { positionY } })
              }
            />
          </>
        )}
        {'primitive' in content && (
          <>
            <label>
              Hình dạng
              <select
                value={content.primitive}
                onChange={(event) =>
                  command({
                    type: 'content',
                    id,
                    value: { primitive: event.target.value },
                  })
                }
              >
                {['rectangle', 'ellipse', 'line'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Màu hình
              <input
                key={content.fill}
                defaultValue={content.fill}
                onBlur={(event) =>
                  command({
                    type: 'content',
                    id,
                    value: { fill: event.target.value },
                  })
                }
              />
            </label>
          </>
        )}
        <button
          onClick={() => command({ type: 'hide', id, value: !node.hidden })}
        >
          {node.hidden ? 'Hiện phần tử' : 'Ẩn phần tử'}
        </button>
        <button onClick={() => command({ type: 'duplicate', id })}>
          Nhân bản phần tử
        </button>
        <button onClick={() => command({ type: 'delete', id })}>
          Xóa phần tử
        </button>
        <button
          disabled={index === count - 1}
          onClick={() => command({ type: 'reorder', id, index: index + 1 })}
        >
          Đưa lên một lớp
        </button>
        <button
          disabled={index === 0}
          onClick={() => command({ type: 'reorder', id, index: index - 1 })}
        >
          Đưa xuống một lớp
        </button>
        <button
          disabled={index === count - 1}
          onClick={() => command({ type: 'reorder', id, index: count - 1 })}
        >
          Đưa lên trên cùng
        </button>
        <button
          disabled={index === 0}
          onClick={() => command({ type: 'reorder', id, index: 0 })}
        >
          Đưa xuống dưới cùng
        </button>
      </fieldset>
    </section>
  );
}
