import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBlankDocument,
  documentAssetIds,
  resolveEditorDocument,
  validateEditorDocument,
} from '../../src/features/invitation-builder/document/editor-document';
import {
  defaultOpeningEffect,
  OPENING_KINDS,
  openingAssetIds,
} from '../../src/features/invitation-builder/document/effects';
import { primitiveNode } from '../../src/features/invitation-builder/editor/defaults';
import { applyPagePreset } from '../../src/features/invitation-builder/editor/effect-presets';
import {
  applyDocumentCommand,
  commitDocument,
  undoDocument,
  redoDocument,
} from '../../src/features/invitation-builder/editor/editor-commands';
import { EffectsPanel } from '../../src/features/invitation-builder/editor/effects-panel';
import { FallingEffects } from '../../src/features/invitation-builder/renderer/falling-effects';
import { OpeningPlayer } from '../../src/features/invitation-builder/renderer/opening-effects';
import { CanvasRenderer } from '../../src/features/invitation-builder/renderer/canvas-renderer';
vi.mock(
  '../../src/features/invitation-builder/assets/use-asset-preview',
  () => ({ useAssetPreview: () => ({}) }),
);
const ids = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
];
const context = {
  mode: 'capture' as const,
  asOf: '2026-10-15T00:00:00Z',
  assetUrls: {},
};
function documentWithNodes() {
  const doc = createBlankDocument();
  doc.nodes.ROOT.nodes = ids;
  ids.forEach((id, i) => {
    const node = primitiveNode('Text');
    node.props.box = { ...node.props.box, x: i * 200, width: 80 };
    doc.nodes[id] = node;
  });
  return doc;
}
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('effect data and transactions', () => {
  it.each(OPENING_KINDS)(
    'validates %s and rejects unexpected configuration keys',
    (kind) => {
      const doc = createBlankDocument();
      doc.settings.openingEffect = defaultOpeningEffect(kind);
      expect(validateEditorDocument(doc).valid).toBe(true);
      Object.assign(doc.settings.openingEffect, { unrecognized: true });
      expect(validateEditorDocument(doc).valid).toBe(false);
    },
  );
  it('tracks opening images through authored assets and resolved scenes', () => {
    const doc = createBlankDocument();
    const effect = defaultOpeningEffect('photobooth');
    if (effect.kind !== 'photobooth') throw Error();
    effect.images = [
      { assetId: ids[0], preset: null },
      { assetId: ids[1], preset: null },
      { assetId: ids[0], preset: null },
    ];
    doc.settings.openingEffect = effect;
    expect(openingAssetIds(effect)).toEqual(ids.slice(0, 2));
    expect(documentAssetIds(doc)).toEqual(ids.slice(0, 2));
    expect(
      resolveEditorDocument(doc, { schemaVersion: 1 }, context).visibleAssetIds,
    ).toEqual(ids.slice(0, 2));
  });
  it('rejects external image URLs and out of range durations', () => {
    const doc = createBlankDocument();
    doc.settings.openingEffect = defaultOpeningEffect('animated-image');
    Object.assign(doc.settings.openingEffect, { duration: 11 });
    expect(validateEditorDocument(doc).valid).toBe(false);
    Object.assign(doc.settings.openingEffect, {
      duration: 5,
      image: { assetId: null, preset: 'https://example.test/a.gif' },
    });
    expect(validateEditorDocument(doc).valid).toBe(false);
  });
  it('materializes geometry-based presets atomically and preserves independent options', () => {
    const doc = documentWithNodes();
    doc.nodeOptions[ids[0]] = {
      continuous: 'float',
      action: { kind: 'link', value: 'https://example.test' },
    };
    const next = applyPagePreset(doc, 'fade-mix');
    expect(ids.map((id) => next.nodeOptions[id].entrance)).toEqual([
      'slide-right',
      'fade',
      'slide-left',
    ]);
    expect(next.nodeOptions[ids[0]].continuous).toBe('float');
    expect(next.nodeOptions[ids[0]].entranceDelay).toBe(0.2);
    expect(doc.nodeOptions[ids[1]]).toBeUndefined();
    const h = commitDocument(
      { past: [], present: doc, future: [] },
      { type: 'replace', value: next },
    );
    expect(h.past).toHaveLength(1);
    expect(undoDocument(h).present).toEqual(doc);
    expect(redoDocument(undoDocument(h)).present).toEqual(next);
    const added = applyDocumentCommand(next, {
      type: 'add',
      node: primitiveNode('Text'),
    });
    expect(added.settings.pageAnimation).toBe('none');
    expect(added.nodeOptions[added.nodes.ROOT.nodes.at(-1)!]).toBeUndefined();
  });
  it('None disables all authored entrances', () => {
    const next = applyPagePreset(
      applyPagePreset(documentWithNodes(), 'flip-all'),
      'none',
    );
    expect(
      ids.every((id) => next.nodeOptions[id].entranceEnabled === false),
    ).toBe(true);
    expect(validateEditorDocument(next).valid).toBe(true);
  });
});
describe('effects panel draft lifecycle', () => {
  function panel() {
    const doc = documentWithNodes();
    const onChange = vi.fn();
    render(
      <EffectsPanel
        document={doc}
        scene={resolveEditorDocument(doc, { schemaVersion: 1 }, context).scene}
        assetUrls={{}}
        onChange={onChange}
      />,
    );
    return { doc, onChange };
  }
  it('cancels a configuration without committing and confirms once', () => {
    const { onChange } = panel();
    fireEvent.click(
      screen.getByRole('button', { name: /Hiệu ứng mở màn.*Ấn tượng/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Phong bì' }));
    fireEvent.change(screen.getByLabelText('Tên chú rể'), {
      target: { value: 'Minh Anh' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Phong bì' }));
    expect(screen.getByLabelText('Tên chú rể')).toHaveValue('Tuấn Minh');
    fireEvent.change(screen.getByLabelText('Tên chú rể'), {
      target: { value: 'Minh Anh' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0].settings.openingEffect.groom).toBe(
      'Minh Anh',
    );
  });
  it('selection and preview do not commit until Apply', () => {
    const { onChange } = panel();
    fireEvent.click(
      screen.getByRole('button', {
        name: /Hiệu ứng động.*Hiệu ứng chuyển động/,
      }),
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Slide Up All' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước' }));
    expect(
      screen.getByRole('dialog', { name: 'Xem trước hiệu ứng' }),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Áp dụng',
      }),
    );
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0].nodeOptions[ids[0]].entranceDuration).toBe(
      1.5,
    );
  });
  it.each(OPENING_KINDS)('opens functional configuration for %s', (kind) => {
    const { onChange } = panel();
    fireEvent.click(
      screen.getByRole('button', { name: /Hiệu ứng mở màn.*Ấn tượng/ }),
    );
    const labels = {
      envelope: 'Phong bì',
      invitation: 'Thiệp mở đầu',
      intro: 'Intro Page',
      curtain: 'Curtain',
      'sliding-door': 'Cửa trượt',
      'animated-image': 'Animated Image',
      photobooth: 'Photobooth',
    };
    fireEvent.click(screen.getByRole('button', { name: labels[kind] }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(onChange.mock.calls[0][0].settings.openingEffect.kind).toBe(kind);
    expect(validateEditorDocument(onChange.mock.calls[0][0]).valid).toBe(true);
  });
});
describe('effect accessibility', () => {
  it('supports arrow navigation without committing a preset', () => {
    const doc = documentWithNodes(),
      onChange = vi.fn();
    render(
      <EffectsPanel
        document={doc}
        scene={resolveEditorDocument(doc, { schemaVersion: 1 }, context).scene}
        assetUrls={{}}
        onChange={onChange}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Hiệu ứng động.*cuộn trang/ }),
    );
    const none = screen.getByRole('radio', { name: 'None' });
    none.focus();
    fireEvent.keyDown(none, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Fade In All' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Fade In All' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(onChange).not.toHaveBeenCalled();
  });
  it('uses static video posters when reduced motion is enabled', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const doc = createBlankDocument();
    const view = render(
      <EffectsPanel
        document={doc}
        scene={resolveEditorDocument(doc, { schemaVersion: 1 }, context).scene}
        assetUrls={{}}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Hiệu ứng mở màn.*Ấn tượng/ }),
    );
    expect(view.container.querySelectorAll('video[autoplay]')).toHaveLength(0);
    expect(
      view.container.querySelector('video')?.getAttribute('poster'),
    ).toContain('.jpg');
  });
  it('mounts public particles outside the transformed invitation and cleans up on disable', () => {
    const view = render(<FallingEffects kind="mix" viewport />);
    expect(view.container.querySelector('[data-falling-effect]')).toBeNull();
    expect(
      document.body.querySelector('[data-falling-effect="mix"]'),
    ).not.toBeNull();
    view.rerender(<FallingEffects kind="none" viewport />);
    expect(document.body.querySelector('[data-falling-effect]')).toBeNull();
  });
});
describe('opening renderer lifecycle', () => {
  it('completes an automatic intro after dwell and reveal even when both durations match', () => {
    vi.useFakeTimers();
    const done = vi.fn();
    render(
      <OpeningPlayer
        effect={defaultOpeningEffect('intro')}
        assetUrls={{}}
        onComplete={done}
      />,
    );
    act(() => vi.advanceTimersByTime(1000));
    expect(done).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(done).toHaveBeenCalledOnce();
  });
  it('pauses automatic countdown and resumes the remaining duration', () => {
    vi.useFakeTimers();
    const done = vi.fn();
    const effect = defaultOpeningEffect('animated-image');
    if (effect.kind !== 'animated-image') throw Error();
    effect.duration = 4;
    const view = render(
      <OpeningPlayer effect={effect} assetUrls={{}} onComplete={done} />,
    );
    act(() => vi.advanceTimersByTime(1000));
    view.rerender(
      <OpeningPlayer effect={effect} assetUrls={{}} paused onComplete={done} />,
    );
    act(() => vi.advanceTimersByTime(10000));
    expect(done).not.toHaveBeenCalled();
    view.rerender(
      <OpeningPlayer effect={effect} assetUrls={{}} onComplete={done} />,
    );
    act(() => vi.advanceTimersByTime(3000));
    expect(done).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(done).toHaveBeenCalledOnce();
  });
  it('explicit null overrides a legacy envelope and capture bypasses all effects', () => {
    const doc = documentWithNodes();
    doc.settings.envelope = true;
    doc.settings.openingEffect = null;
    doc.settings.particles = 'mix';
    const scene = resolveEditorDocument(
      doc,
      { schemaVersion: 1 },
      context,
    ).scene;
    const view = render(
      <CanvasRenderer
        scene={scene}
        context={{ ...context, mode: 'preview' }}
      />,
    );
    expect(view.container.querySelector('[data-opening-effect]')).toBeNull();
    view.rerender(
      <CanvasRenderer
        scene={{
          ...scene,
          settings: {
            ...scene.settings,
            openingEffect: defaultOpeningEffect('envelope'),
          },
        }}
        context={context}
      />,
    );
    expect(view.container.querySelector('[data-opening-effect]')).toBeNull();
    expect(view.container.querySelector('[data-falling-effect]')).toBeNull();
  });
  it('manual opening completes immediately with reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const done = vi.fn();
    render(
      <OpeningPlayer
        effect={defaultOpeningEffect('envelope')}
        assetUrls={{}}
        onComplete={done}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'CHẠM ĐỂ MỞ' }));
    expect(done).toHaveBeenCalledOnce();
  });
});
