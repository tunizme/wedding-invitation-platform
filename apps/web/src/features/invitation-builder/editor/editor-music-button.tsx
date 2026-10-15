'use client';
import { useEffect, useRef, useState } from 'react';
import type { EditorSettings } from '../document/editor-document';
import { MusicIcon } from '../renderer/music-icon';
import styles from './editor-music-button.module.css';

/** Audition the authored music without turning it into a selectable canvas node. */
export function EditorMusicButton({
  value,
  source,
}: {
  value: EditorSettings['audio'];
  source?: string;
}) {
  const player = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (player.current) player.current.volume = value.volume;
  }, [value.volume]);
  useEffect(() => {
    const element = player.current;
    return () => element?.pause();
  }, []);
  const toggle = async () => {
    const element = player.current;
    if (!element || !source) return;
    if (!element.paused) {
      element.pause();
      return;
    }
    try {
      setError('');
      const start = (value.trimStartMs ?? 0) / 1000;
      if (
        element.currentTime < start ||
        (value.trimEndMs !== undefined &&
          element.currentTime * 1000 >= value.trimEndMs)
      )
        element.currentTime = start;
      await element.play();
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError'))
        setError('Không phát được nhạc. Vui lòng thử lại.');
    }
  };
  return (
    <div className={styles.preview} data-editor-music>
      <audio
        ref={player}
        src={source}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={(event) => {
          const element = event.currentTarget;
          setPlaying(false);
          element.currentTime = (value.trimStartMs ?? 0) / 1000;
          if (value.loop)
            void element.play().catch(() => setError('Không phát được nhạc.'));
        }}
        onTimeUpdate={(event) => {
          const element = event.currentTarget;
          if (
            value.trimEndMs === undefined ||
            element.currentTime * 1000 < value.trimEndMs
          )
            return;
          if (!value.loop) element.pause();
          element.currentTime = (value.trimStartMs ?? 0) / 1000;
        }}
      />
      <button
        type="button"
        className={styles.button}
        title={playing ? 'Tạm dừng nhạc' : 'Nghe nhạc trên canvas'}
        aria-label={
          playing ? 'Tạm dừng nhạc trên canvas' : 'Phát nhạc trên canvas'
        }
        aria-pressed={playing}
        disabled={!source}
        style={{ color: value.iconColor ?? '#202938' }}
        onClick={() => void toggle()}
      >
        <MusicIcon index={value.iconStyle} size={26} />
      </button>
      {error && (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </div>
  );
}
