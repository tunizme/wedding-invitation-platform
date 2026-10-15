'use client';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Music2, Pause, Play, RotateCcw } from 'lucide-react';
import { ModalSurface } from '../../../ui/platform/modal-surface';
import { useOperationLifetime } from '../../identity-access/session/operation-scope';
import {
  builderRequest,
  BuilderApiError,
  scopedAssetPath,
  type AssetSummary,
} from '../api/client';
import {
  audioTime,
  audioTrimRange,
  minimumAudioClip,
  type AudioTrimSelection,
} from './audio-trim';
import styles from './audio-trim-dialog.module.css';

export function AudioTrimDialog({
  asset,
  startMs,
  endMs,
  onCancel,
  onConfirm,
}: {
  asset: AssetSummary;
  startMs?: number;
  endMs?: number;
  onCancel: () => void;
  onConfirm: (selection: AudioTrimSelection) => void;
}) {
  const lifetime = useOperationLifetime(`AudioTrim:${asset.id}`);
  const player = useRef<HTMLAudioElement>(null),
    track = useRef<HTMLDivElement>(null);
  const drag = useRef<'start' | 'end' | null>(null);
  const [source, setSource] = useState(''),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  const [duration, setDuration] = useState(asset.durationMs ?? 0);
  const [range, setRange] = useState(() =>
    audioTrimRange(asset.durationMs ?? 0, startMs, endMs),
  );
  const [playing, setPlaying] = useState(false),
    [position, setPosition] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Pause the canvas audition before opening a separate excerpt player.
    document
      .querySelectorAll<HTMLAudioElement>('[data-editor-music] audio')
      .forEach((element) => element.pause());
  }, []);

  useEffect(() => {
    const scope = lifetime.capture();
    void builderRequest<Blob>(scopedAssetPath(asset.previewUrl), {
      bytes: true,
      scope,
    })
      .then((blob) => {
        if (!scope.isActive()) return;
        const url = URL.createObjectURL(blob);
        scope.onDispose(() => URL.revokeObjectURL(url));
        setSource(url);
      })
      .catch((cause) => {
        if (scope.isActive())
          setError(
            cause instanceof BuilderApiError && cause.status === 404
              ? 'Tệp nhạc không còn trong kho lưu trữ. Vui lòng tải lại MP3 gốc hoặc chọn bài khác.'
              : 'Không tải được bài nhạc. Vui lòng thử lại.',
          );
      });
    return () => scope.dispose();
  }, [asset.previewUrl, attempt, lifetime]);

  useEffect(() => {
    const element = player.current;
    return () => element?.pause();
  }, [source]);

  const stop = () => {
    player.current?.pause();
    setPlaying(false);
  };
  const update = (edge: 'start' | 'end', value: number) => {
    stop();
    const gap = minimumAudioClip(duration);
    setRange((current) =>
      edge === 'start'
        ? {
            ...current,
            startMs: Math.max(
              0,
              Math.min(Math.round(value), current.endMs - gap),
            ),
          }
        : {
            ...current,
            endMs: Math.min(
              duration,
              Math.max(Math.round(value), current.startMs + gap),
            ),
          },
    );
  };
  const fromPointer = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    return (
      Math.round((((clientX - rect.left) / rect.width) * duration) / 100) * 100
    );
  };
  const startDrag = (
    event: PointerEvent<HTMLButtonElement>,
    edge: 'start' | 'end',
  ) => {
    if (!ready || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    drag.current = edge;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const keyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    edge: 'start' | 'end',
  ) => {
    const value = edge === 'start' ? range.startMs : range.endMs;
    const step = event.shiftKey ? 1000 : 100;
    const next = {
      ArrowLeft: value - step,
      ArrowDown: value - step,
      ArrowRight: value + step,
      ArrowUp: value + step,
      Home: edge === 'start' ? 0 : range.startMs + minimumAudioClip(duration),
      End: edge === 'end' ? duration : range.endMs - minimumAudioClip(duration),
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    update(edge, next);
  };
  const listen = async () => {
    const element = player.current;
    if (!element || !ready) return;
    if (!element.paused) {
      stop();
      return;
    }
    try {
      element.currentTime = range.startMs / 1000;
      setPosition(range.startMs);
      await element.play();
    } catch (cause) {
      // Dragging or closing can intentionally interrupt a pending play().
      if (
        lifetime.isActive() &&
        !(cause instanceof DOMException && cause.name === 'AbortError')
      )
        setError('Không phát được bài nhạc. Vui lòng thử lại.');
    }
  };
  const percent = (value: number) => (duration ? (value / duration) * 100 : 0);
  const canApply = ready && !error && duration > 0;
  return (
    <ModalSurface
      label="Cắt nhạc"
      variant="centered"
      className={styles.dialog}
      onClose={onCancel}
    >
      <div className={styles.song}>
        <span className={styles.songIcon}>
          <Music2 size={24} aria-hidden="true" />
        </span>
        <div>
          <strong>{asset.name}</strong>
          <p>Kéo hai đầu thanh thời gian để chọn đoạn nhạc.</p>
        </div>
      </div>
      {source && (
        <audio
          ref={player}
          src={source}
          preload="metadata"
          onLoadedMetadata={(event) => {
            const ms = Math.round(event.currentTarget.duration * 1000);
            if (!Number.isFinite(ms) || ms <= 0 || ms > 600000) {
              setError('Không đọc được thời lượng bài nhạc.');
              return;
            }
            setDuration(ms);
            setRange(audioTrimRange(ms, startMs, endMs));
            setReady(true);
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => {
            setReady(false);
            setError('Không đọc được bài nhạc. Vui lòng thử lại.');
          }}
          onTimeUpdate={(event) => {
            const element = event.currentTarget,
              ms = element.currentTime * 1000;
            setPosition(ms);
            if (ms >= range.endMs) {
              element.pause();
              element.currentTime = range.startMs / 1000;
              setPosition(range.startMs);
            }
          }}
        />
      )}
      {!ready && !error && (
        <p role="status" className={styles.loading}>
          Đang tải bài nhạc…
        </p>
      )}
      {error && (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              stop();
              setError('');
              setSource('');
              setReady(false);
              setAttempt((n) => n + 1);
            }}
          >
            Thử lại
          </button>
        </div>
      )}
      <div className={styles.timeline}>
        <div className={styles.rangeLabels}>
          <span>
            Bắt đầu <strong>{audioTime(range.startMs)}</strong>
          </span>
          <span>
            Kết thúc <strong>{audioTime(range.endMs)}</strong>
          </span>
        </div>
        <div
          ref={track}
          className={styles.track}
          data-audio-trim-track
          aria-disabled={!canApply}
          onPointerDown={(event) => {
            if (!canApply || event.button !== 0) return;
            const value = fromPointer(event.clientX);
            update(
              Math.abs(value - range.startMs) <= Math.abs(value - range.endMs)
                ? 'start'
                : 'end',
              value,
            );
          }}
        >
          <div className={styles.rail} aria-hidden="true" />
          <div
            className={styles.selection}
            aria-hidden="true"
            style={{
              left: `${percent(range.startMs)}%`,
              width: `${percent(range.endMs - range.startMs)}%`,
            }}
          />
          {playing && (
            <span
              className={styles.playhead}
              aria-hidden="true"
              style={{ left: `${percent(position)}%` }}
            />
          )}
          {(['start', 'end'] as const).map((edge) => (
            <button
              type="button"
              key={edge}
              role="slider"
              className={styles.handle}
              aria-label={edge === 'start' ? 'Điểm bắt đầu' : 'Điểm kết thúc'}
              aria-orientation="horizontal"
              aria-valuemin={
                edge === 'start'
                  ? 0
                  : range.startMs + minimumAudioClip(duration)
              }
              aria-valuemax={
                edge === 'end'
                  ? duration
                  : Math.max(0, range.endMs - minimumAudioClip(duration))
              }
              aria-valuenow={edge === 'start' ? range.startMs : range.endMs}
              aria-valuetext={audioTime(
                edge === 'start' ? range.startMs : range.endMs,
              )}
              disabled={!canApply}
              style={{
                left: `${percent(edge === 'start' ? range.startMs : range.endMs)}%`,
              }}
              onKeyDown={(event) => keyboard(event, edge)}
              onPointerDown={(event) => startDrag(event, edge)}
              onPointerMove={(event) => {
                if (drag.current === edge && track.current)
                  update(edge, fromPointer(event.clientX));
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className={styles.ticks} aria-hidden="true">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <span key={ratio}>{audioTime(duration * ratio)}</span>
          ))}
        </div>
      </div>
      <div className={styles.playback}>
        <button
          type="button"
          className={styles.listen}
          disabled={!canApply}
          aria-pressed={playing}
          onClick={() => void listen()}
        >
          {playing ? (
            <Pause size={18} aria-hidden="true" />
          ) : (
            <Play size={18} aria-hidden="true" />
          )}
          {playing ? 'Tạm dừng' : 'Nghe đoạn đã chọn'}
        </button>
        <span>
          Đã chọn <strong>{audioTime(range.endMs - range.startMs)}</strong>
        </span>
        <button
          type="button"
          className={styles.reset}
          disabled={!canApply}
          onClick={() => {
            stop();
            setRange({ startMs: 0, endMs: duration });
          }}
        >
          <RotateCcw size={16} aria-hidden="true" />
          Chọn toàn bộ
        </button>
      </div>
      <footer className={styles.footer}>
        <button type="button" onClick={onCancel}>
          Hủy
        </button>
        <button
          type="button"
          className={styles.apply}
          disabled={!canApply}
          onClick={() => {
            stop();
            onConfirm({ ...range, durationMs: duration });
          }}
        >
          Áp dụng
        </button>
      </footer>
    </ModalSurface>
  );
}
