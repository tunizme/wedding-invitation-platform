import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorSettingsPanel } from '../../src/features/invitation-builder/editor/editor-properties';
import { InvitationPresentation } from '../../src/features/invitation-builder/renderer/invitation-presentation';
import {
  createBlankDocument,
  type EditorScene,
} from '../../src/features/invitation-builder/document/editor-document';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('temporary social feature visibility and page customization', () => {
  it('keeps description and language controls separate from toolbar and gradient controls', () => {
    render(
      <EditorSettingsPanel
        view="settings"
        document={createBlankDocument()}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Mô tả')).toBeInTheDocument();
    expect(screen.getByLabelText('Ngôn ngữ nhãn')).toBeInTheDocument();
    expect(screen.queryByLabelText('QR mừng cưới')).toBeNull();
    expect(screen.queryByLabelText('Dùng gradient')).toBeNull();
    expect(screen.queryByLabelText('Tiêu đề')).toBeNull();
  });
  it('edits gift and gradient settings while preserving hidden social flags', () => {
    const document = createBlankDocument();
    document.settings.toolbar.wishes = true;
    document.settings.toolbar.likes = true;
    const change = vi.fn();
    render(
      <EditorSettingsPanel
        view="customize"
        document={document}
        onChange={change}
      />,
    );
    expect(screen.queryByLabelText('Lời chúc')).toBeNull();
    expect(screen.queryByLabelText('Lượt thích')).toBeNull();
    fireEvent.click(screen.getByLabelText('QR mừng cưới'));
    expect(change.mock.lastCall?.[0].toolbar).toEqual({
      ...document.settings.toolbar,
      gift: true,
    });
    fireEvent.click(screen.getByLabelText('Dùng gradient'));
    expect(change.mock.lastCall?.[0].gradient).toEqual({
      from: '#FDFBF7FF',
      to: '#F1EAE0FF',
      angle: 180,
    });
  });
  it('hides social tools and skips likes requests even for an older published design', () => {
    const document = createBlankDocument();
    document.settings.toolbar.wishes = true;
    document.settings.toolbar.likes = true;
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const scene: EditorScene = {
      schemaVersion: 3,
      rendererContractVersion: 3,
      canvas: document.nodes.ROOT.props.canvas,
      elements: [],
      nodeOptions: {},
      settings: document.settings,
    };
    render(
      <InvitationPresentation
        scene={scene}
        context={{
          mode: 'public',
          asOf: '2026-10-15T00:00:00Z',
          assetUrls: {},
          invitation: { slug: 'review', publicVersion: 1, rsvpOpen: true },
        }}
      >
        <p>Thiệp</p>
      </InvitationPresentation>,
    );
    expect(screen.queryByRole('button', { name: 'Lời chúc' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yêu thích' })).toBeNull();
    expect(screen.getByRole('button', { name: /Chia sẻ/ })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
