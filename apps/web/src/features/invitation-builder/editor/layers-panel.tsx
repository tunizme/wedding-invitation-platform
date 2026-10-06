'use client';
import type { TemplateDesign } from '../document/types';
import type { EditorCommand } from './commands';
export function LayersPanel({
  document,
  selected,
  onSelect,
  onCommand,
  disabled,
}: {
  document: TemplateDesign;
  selected?: string;
  onSelect: (id: string) => void;
  onCommand: (command: EditorCommand) => void;
  disabled: boolean;
}) {
  return (
    <section aria-label="Lớp">
      <h2>Lớp</h2>
      <ol style={{ padding: 0, listStyle: 'none' }}>
        {[...document.nodes.ROOT.nodes].reverse().map((id) => {
          const node = document.nodes[id];
          if (node.isCanvas) return null;
          return (
            <li
              key={id}
              data-testid="layer-item"
              draggable={!disabled && !node.custom.locked}
              onDragStart={(event) =>
                event.dataTransfer.setData('text/plain', id)
              }
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const source = event.dataTransfer.getData('text/plain');
                if (document.nodes[source] && !disabled)
                  onCommand({
                    type: 'reorder',
                    id: source,
                    index: document.nodes.ROOT.nodes.indexOf(id),
                  });
              }}
            >
              <button
                type="button"
                aria-pressed={selected === id}
                onClick={() => onSelect(id)}
                disabled={disabled}
              >
                {node.custom.layerName}
                {node.hidden ? ' (ẩn)' : ''}
                {node.custom.locked ? ' 🔒' : ''}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
