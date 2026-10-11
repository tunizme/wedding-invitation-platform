import type { LeafV2 } from '../document/types';
import { NumberField } from './section-fields';
export function SectionArtworkControls({
  node,
  onChange,
}: {
  node: LeafV2;
  onChange: (node: LeafV2) => void;
}) {
  if (node.role !== 'artwork') return null;
  return (
    <fieldset disabled={node.custom.locked}>
      <legend>Hình trang trí trong section</legend>
      <p>Hình được cắt trong section và nằm dưới nội dung.</p>
      {(['mobile', 'desktop'] as const).map((device) => {
        const effective = {
          ...node.mobile.layout,
          ...(device === 'desktop' ? node.desktop.layout : {}),
        };
        return (
          <fieldset key={device}>
            <legend>{device === 'mobile' ? 'Mobile' : 'Desktop'}</legend>
            {(
              [
                ['xPercent', 'X (%)', -100, 200],
                ['yPercent', 'Y (%)', -100, 200],
                ['widthPercent', 'Rộng (%)', 1, 200],
                ['aspectRatio', 'Tỉ lệ hình', 0.1, 10],
                ['rotation', 'Góc xoay', -180, 180],
              ] as const
            ).map(([key, label, min, max]) => (
              <NumberField
                key={key}
                label={`${label}${device === 'desktop' ? ' desktop' : ''}`}
                value={effective[key]}
                min={min}
                max={max}
                step={0.1}
                onChange={(value) =>
                  onChange({
                    ...node,
                    [device]: {
                      layout: {
                        ...(device === 'mobile'
                          ? node.mobile.layout
                          : node.desktop.layout),
                        [key]: value,
                      },
                    },
                  })
                }
              />
            ))}
            {device === 'desktop' && (
              <button
                type="button"
                onClick={() => onChange({ ...node, desktop: {} })}
              >
                Dùng hình mobile
              </button>
            )}
          </fieldset>
        );
      })}
    </fieldset>
  );
}
