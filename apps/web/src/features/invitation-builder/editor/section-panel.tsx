'use client';
import { useState } from 'react';
import type { TemplateDesignV2, ComponentName } from '../document/types';
import { newSection, newLeaf, type SectionCommand } from './section-commands';
export function SectionPanel({
  document,
  selected,
  onSelect,
  onCommand,
  disabled,
}: {
  document: TemplateDesignV2;
  selected: string;
  onSelect: (id: string) => void;
  onCommand: (command: SectionCommand) => void;
  disabled: boolean;
}) {
  const [name, setName] = useState('Section mới');
  const sectionId = document.sections[selected]
    ? selected
    : document.sectionOrder.find((id) =>
        [
          ...document.sections[id].flowNodeIds,
          ...document.sections[id].artworkNodeIds,
        ].includes(selected),
      );
  return (
    <fieldset disabled={disabled}>
      <legend>Sections và thứ tự đọc</legend>
      <label>
        Tên section mới
        <input
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button
        type="button"
        onClick={() =>
          onCommand({
            type: 'section-add',
            section: newSection(name.trim() || 'Section mới'),
          })
        }
      >
        Thêm section
      </button>
      <ol>
        {document.sectionOrder.map((id, index) => {
          const section = document.sections[id];
          return (
            <li key={id}>
              <button
                type="button"
                aria-pressed={selected === id}
                onClick={() => onSelect(id)}
              >
                Chọn section {section.label}
              </button>
              <button
                type="button"
                aria-label={`Đưa section ${section.label} lên`}
                disabled={index === 0}
                onClick={() =>
                  onCommand({ type: 'section-reorder', id, index: index - 1 })
                }
              >
                Lên
              </button>
              <button
                type="button"
                aria-label={`Đưa section ${section.label} xuống`}
                disabled={index === document.sectionOrder.length - 1}
                onClick={() =>
                  onCommand({ type: 'section-reorder', id, index: index + 1 })
                }
              >
                Xuống
              </button>
              <button
                type="button"
                aria-label={`Xóa section ${section.label}`}
                disabled={document.sectionOrder.length === 1}
                onClick={() => onCommand({ type: 'section-delete', id })}
              >
                Xóa
              </button>
              <ol>
                {[...section.flowNodeIds, ...section.artworkNodeIds].map(
                  (childId) => {
                    const node = document.nodes[childId];
                    const ids =
                      node.role === 'flow'
                        ? section.flowNodeIds
                        : section.artworkNodeIds;
                    const index = ids.indexOf(childId);
                    return (
                      <li key={childId}>
                        <button
                          type="button"
                          aria-pressed={selected === childId}
                          onClick={() => onSelect(childId)}
                        >
                          Chọn {node.custom.layerName}
                        </button>
                        {node.role === 'artwork' && <span>Trang trí</span>}
                        <button
                          type="button"
                          aria-label={`Đưa ${node.custom.layerName} lên`}
                          disabled={node.custom.locked || index === 0}
                          onClick={() =>
                            onCommand({
                              type: 'leaf-reorder',
                              id: childId,
                              index: index - 1,
                            })
                          }
                        >
                          Lên
                        </button>
                        <button
                          type="button"
                          aria-label={`Đưa ${node.custom.layerName} xuống`}
                          disabled={
                            node.custom.locked || index === ids.length - 1
                          }
                          onClick={() =>
                            onCommand({
                              type: 'leaf-reorder',
                              id: childId,
                              index: index + 1,
                            })
                          }
                        >
                          Xuống
                        </button>
                        <button
                          type="button"
                          aria-label={`Xóa ${node.custom.layerName}`}
                          disabled={node.custom.locked}
                          onClick={() =>
                            onCommand({ type: 'leaf-delete', id: childId })
                          }
                        >
                          Xóa
                        </button>
                      </li>
                    );
                  },
                )}
              </ol>
            </li>
          );
        })}
      </ol>
      <fieldset disabled={!sectionId}>
        <legend>Thêm nội dung vào section đang chọn</legend>
        {(
          [
            'Text',
            'Image',
            'Shape',
            'Calendar',
            'Countdown',
            'Map',
            'RSVP',
            'QRBank',
            'Timeline',
          ] as ComponentName[]
        ).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() =>
              onCommand({
                type: 'leaf-add',
                sectionId: sectionId!,
                node: newLeaf(type),
              })
            }
          >
            Thêm {type}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            const node = newLeaf('Shape', 'artwork');
            node.custom.layerName = 'Hình trang trí';
            onCommand({ type: 'leaf-add', sectionId: sectionId!, node });
          }}
        >
          Thêm hình trang trí
        </button>
        <button
          type="button"
          onClick={() =>
            onCommand({
              type: 'leaf-add',
              sectionId: sectionId!,
              node: newLeaf('Decoration', 'artwork'),
            })
          }
        >
          Thêm ảnh trang trí
        </button>
      </fieldset>
    </fieldset>
  );
}
