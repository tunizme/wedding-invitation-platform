import type { EditorSettings } from '../document/editor-document';

export interface AudioTrimSelection {
  startMs: number;
  endMs: number;
  durationMs: number;
}
export const minimumAudioClip = (durationMs: number) =>
  Math.min(250, durationMs);

export function audioTrimRange(
  durationMs: number,
  startMs = 0,
  endMs = durationMs,
) {
  const gap = minimumAudioClip(durationMs);
  const start = Math.max(0, Math.min(Math.round(startMs), durationMs - gap));
  return {
    startMs: start,
    endMs: Math.max(start + gap, Math.min(Math.round(endMs), durationMs)),
  };
}

export function audioTime(ms: number) {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}.${tenths % 10}`;
}

/** Trim belongs to the selected track; choosing another track clears its old range. */
export function selectAudioTrack(
  current: EditorSettings['audio'],
  assetId: string | null,
  selection?: AudioTrimSelection,
): EditorSettings['audio'] {
  const audio = { ...current, assetId };
  if (assetId !== current.assetId || selection || !assetId) {
    delete audio.trimStartMs;
    delete audio.trimEndMs;
  }
  if (selection && assetId) {
    const range = audioTrimRange(
      selection.durationMs,
      selection.startMs,
      selection.endMs,
    );
    if (range.startMs > 0) audio.trimStartMs = range.startMs;
    if (range.endMs < selection.durationMs) audio.trimEndMs = range.endMs;
  }
  return audio;
}
