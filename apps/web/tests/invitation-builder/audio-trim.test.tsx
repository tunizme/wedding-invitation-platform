import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../src/features/invitation-builder/api/client', async (load) => ({
  ...(await load<
    typeof import('../../src/features/invitation-builder/api/client')
  >()),
  builderRequest: mocks.request,
}));
import { AudioTrimDialog } from '../../src/features/invitation-builder/editor/audio-trim-dialog';
import {
  audioTrimRange,
  selectAudioTrack,
} from '../../src/features/invitation-builder/editor/audio-trim';
import { defaultEditorSettings } from '../../src/features/invitation-builder/document/editor-document';
import { EditorMusicButton } from '../../src/features/invitation-builder/editor/editor-music-button';
import { sessionStore } from '../../src/features/identity-access/session/store';
import { privateSession } from '../identity-access/private-session-fixture';
import type { AssetSummary } from '../../src/features/invitation-builder/api/client';

const asset: AssetSummary = {
  id: 'track-a',
  name: 'Bài nhạc thử',
  kind: 'AUDIO',
  durationMs: 12000,
  mimeType: 'audio/mpeg',
  byteSize: 100,
  width: 0,
  height: 0,
  createdAt: '2026-10-14',
  previewUrl: '/api/v1/assets/track-a/content',
};
beforeEach(() => {
  sessionStore.set(privateSession());
  mocks.request.mockResolvedValue(new Blob(['music'], { type: 'audio/mpeg' }));
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:music');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
});
afterEach(() => {
  cleanup();
  sessionStore.clear();
  vi.restoreAllMocks();
  mocks.request.mockReset();
});

describe('track trim persistence', () => {
  it('clears a previous track range while preserving volume, loop and icon', () => {
    const current = {
      ...defaultEditorSettings().audio,
      assetId: 'old',
      trimStartMs: 10000,
      trimEndMs: 50000,
      iconStyle: 4,
    };
    expect(selectAudioTrack(current, 'new')).toEqual({
      ...defaultEditorSettings().audio,
      assetId: 'new',
      iconStyle: 4,
    });
    expect(selectAudioTrack(current, 'old')).toEqual(current);
  });
  it('stores only a bounded excerpt and removes the range when the whole track is selected', () => {
    const current = {
      ...defaultEditorSettings().audio,
      assetId: asset.id,
      trimStartMs: 3000,
      trimEndMs: 9000,
    };
    expect(
      selectAudioTrack(current, asset.id, {
        startMs: 2000,
        endMs: 8000,
        durationMs: 12000,
      }),
    ).toMatchObject({ trimStartMs: 2000, trimEndMs: 8000 });
    expect(
      selectAudioTrack(current, asset.id, {
        startMs: 0,
        endMs: 12000,
        durationMs: 12000,
      }),
    ).not.toHaveProperty('trimStartMs');
    expect(
      selectAudioTrack(current, asset.id, {
        startMs: 0,
        endMs: 12000,
        durationMs: 12000,
      }),
    ).not.toHaveProperty('trimEndMs');
    expect(audioTrimRange(12000, 15000, 100)).toEqual({
      startMs: 11750,
      endMs: 12000,
    });
  });
});

async function ready(container: HTMLElement) {
  await waitFor(() =>
    expect(container.querySelector('audio')).toHaveAttribute(
      'src',
      'blob:music',
    ),
  );
  const audio = container.querySelector('audio')!;
  Object.defineProperty(audio, 'duration', { value: 12, configurable: true });
  fireEvent.loadedMetadata(audio);
  return audio;
}

describe('audio trim modal', () => {
  it('stages keyboard edits to both handles and commits them only on Apply', async () => {
    const confirm = vi.fn(),
      cancel = vi.fn();
    const { container } = render(
      <AudioTrimDialog
        asset={asset}
        startMs={1000}
        endMs={11000}
        onCancel={cancel}
        onConfirm={confirm}
      />,
    );
    expect(screen.getByRole('button', { name: 'Áp dụng' })).toBeDisabled();
    await ready(container);
    const start = screen.getByRole('slider', { name: 'Điểm bắt đầu' }),
      end = screen.getByRole('slider', { name: 'Điểm kết thúc' });
    fireEvent.keyDown(start, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(end, { key: 'ArrowLeft', shiftKey: true });
    expect(start).toHaveAttribute('aria-valuenow', '2000');
    expect(end).toHaveAttribute('aria-valuenow', '10000');
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    expect(confirm).toHaveBeenCalledWith({
      startMs: 2000,
      endMs: 10000,
      durationMs: 12000,
    });
    expect(cancel).not.toHaveBeenCalled();
  });
  it('clamps keyboard movement at the other handle and cancels without applying', async () => {
    const confirm = vi.fn(),
      cancel = vi.fn();
    const { container } = render(
      <AudioTrimDialog asset={asset} onCancel={cancel} onConfirm={confirm} />,
    );
    await ready(container);
    const start = screen.getByRole('slider', { name: 'Điểm bắt đầu' }),
      end = screen.getByRole('slider', { name: 'Điểm kết thúc' });
    fireEvent.keyDown(start, { key: 'End' });
    fireEvent.keyDown(start, { key: 'ArrowRight', shiftKey: true });
    expect(Number(start.getAttribute('aria-valuenow'))).toBeLessThan(
      Number(end.getAttribute('aria-valuenow')),
    );
    fireEvent(
      screen.getByRole('dialog', { name: 'Cắt nhạc' }),
      new Event('cancel', { cancelable: true }),
    );
    expect(cancel).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
  });
  it('plays only the selected excerpt and stops preview at its end', async () => {
    const { container } = render(
      <AudioTrimDialog
        asset={asset}
        startMs={2000}
        endMs={4000}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const audio = await ready(container);
    fireEvent.click(screen.getByRole('button', { name: 'Nghe đoạn đã chọn' }));
    expect(audio.currentTime).toBe(2);
    expect(audio.play).toHaveBeenCalled();
    audio.currentTime = 4.2;
    fireEvent.timeUpdate(audio);
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.currentTime).toBe(2);
  });
  it('shows download failure, retries, and releases private audio on close', async () => {
    mocks.request
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce(new Blob(['music']));
    const { container, unmount } = render(
      <AudioTrimDialog asset={asset} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không tải được bài nhạc',
    );
    expect(screen.getByRole('button', { name: 'Áp dụng' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await ready(container);
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:music');
  });
  it('keeps trimming enabled when preview playback is intentionally interrupted', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(
      new DOMException('Paused', 'AbortError'),
    );
    const { container } = render(
      <AudioTrimDialog asset={asset} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    await ready(container);
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Nghe đoạn đã chọn' }),
      ),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Áp dụng' })).toBeEnabled();
  });
  it('does not create a private URL after the dialog has unmounted', async () => {
    let finish!: (value: Blob) => void;
    mocks.request.mockImplementation(
      () =>
        new Promise<Blob>((resolve) => {
          finish = resolve;
        }),
    );
    const { unmount } = render(
      <AudioTrimDialog asset={asset} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    unmount();
    await act(async () => finish(new Blob(['late'])));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});

it('the editor music icon plays the saved trim and stops at its end without looping', () => {
  const { container } = render(
    <EditorMusicButton
      value={{
        ...defaultEditorSettings().audio,
        assetId: asset.id,
        trimStartMs: 2000,
        trimEndMs: 4000,
        loop: false,
        iconStyle: 4,
      }}
      source="blob:music"
    />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Phát nhạc trên canvas' }),
  );
  const audio = container.querySelector('audio')!;
  expect(audio.currentTime).toBe(2);
  expect(audio.play).toHaveBeenCalled();
  audio.currentTime = 4.1;
  fireEvent.timeUpdate(audio);
  expect(audio.pause).toHaveBeenCalled();
  expect(audio.currentTime).toBe(2);
});
