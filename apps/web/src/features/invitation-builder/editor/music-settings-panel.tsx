'use client';
import type { EditorSettings } from '../document/editor-document';
import { MUSIC_ICON_CHOICES, MusicIcon } from '../renderer/music-icon';
import { selectAudioTrack } from './audio-trim';
import styles from './music-settings-panel.module.css';

export function MusicSettingsPanel({
  value,
  disabled,
  onChange,
}: {
  value: EditorSettings['audio'];
  disabled: boolean;
  onChange: (value: EditorSettings['audio']) => void;
}) {
  return (
    <fieldset className={styles.panel} disabled={disabled}>
      <legend className={styles.heading}>Tuỳ chỉnh nhạc</legend>
      <div className={styles.iconLabel}>Biểu tượng nhạc</div>
      <div
        className={styles.icons}
        role="group"
        aria-label="Kiểu biểu tượng nhạc"
      >
        {MUSIC_ICON_CHOICES.map(({ label }, index) => (
          <button
            type="button"
            key={label}
            aria-label={label}
            aria-pressed={(value.iconStyle ?? 0) === index}
            title={label}
            className={styles.icon}
            style={{ color: value.iconColor ?? '#202938' }}
            onClick={() => onChange({ ...value, iconStyle: index })}
          >
            <MusicIcon index={index} size={24} />
          </button>
        ))}
      </div>
      <label className={styles.color}>
        Màu biểu tượng nhạc
        <input
          type="color"
          value={(value.iconColor ?? '#000000FF').slice(0, 7)}
          onChange={(event) =>
            onChange({
              ...value,
              iconColor: event.target.value.toUpperCase() + 'FF',
            })
          }
        />
      </label>
      <label className={styles.volume}>
        Âm lượng <output>{Math.round(value.volume * 100)}%</output>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value.volume}
          onChange={(event) =>
            onChange({ ...value, volume: Number(event.target.value) })
          }
        />
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={value.loop}
          onChange={(event) =>
            onChange({ ...value, loop: event.target.checked })
          }
        />
        Lặp lại
      </label>
      <button
        type="button"
        className={styles.remove}
        disabled={!value.assetId}
        onClick={() => onChange(selectAudioTrack(value, null))}
      >
        Bỏ nhạc
      </button>
    </fieldset>
  );
}
