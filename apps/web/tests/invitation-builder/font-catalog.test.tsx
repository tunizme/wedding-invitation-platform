import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FONT_CATALOG,
  getInvitationFont,
  supportsFontFace,
} from '../../src/features/invitation-builder/document/font-catalog';
import { primitiveNode } from '../../src/features/invitation-builder/editor/defaults';
import {
  createBlankDocument,
  validateEditorDocument,
} from '../../src/features/invitation-builder/document/editor-document';
import { FontPicker } from '../../src/features/invitation-builder/editor/font-picker';
import {
  loadInvitationFontFace,
  loadInvitationFonts,
} from '../../src/features/invitation-builder/renderer/font-registry';
import { PropertiesPanel } from '../../src/features/invitation-builder/editor/properties-panel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function documentWith(
  fontId: (typeof FONT_CATALOG)[number]['id'],
  weight: 400 | 700,
  italic: boolean,
) {
  const d = createBlankDocument(),
    id = '00000000-0000-4000-8000-000000000002',
    node = primitiveNode('Text');
  if (!('textStyle' in node.props.content)) throw Error('text');
  Object.assign(node.props.content.textStyle, {
    fontId,
    fontWeight: weight,
    italic,
  });
  d.nodes[id] = node;
  d.nodes.ROOT.nodes = [id];
  return d;
}
describe('Vietnamese font catalog and supported faces', () => {
  it('accepts every packaged face and rejects unsupported styles without changing legacy fonts', () => {
    expect(FONT_CATALOG).toHaveLength(26);
    for (const font of FONT_CATALOG) {
      for (const weight of [400, 700] as const)
        for (const italic of [false, true]) {
          expect(
            validateEditorDocument(documentWith(font.id, weight, italic)).valid,
            `${font.id} ${weight} ${italic}`,
          ).toBe(supportsFontFace(font.id, weight, italic));
        }
    }
  });
  it('loads only the explicitly requested family, with no eager catalog download', async () => {
    const load = vi.fn().mockResolvedValue([{ status: 'loaded' }]);
    const doc = {
      fonts: { load, ready: Promise.resolve() },
    } as unknown as Document;
    await loadInvitationFonts(doc, ['great-vibes-v1']);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][0]).toContain('Invitation Great Vibes v1');
    load.mockResolvedValueOnce([]);
    await expect(
      loadInvitationFontFace(doc, {
        fontId: 'inter-v1',
        fontSize: 18,
        fontWeight: 400,
        italic: false,
      }),
    ).rejects.toThrow('FONT_UNAVAILABLE');
  });
  it('filters the font chooser and keeps disabled controls inert', () => {
    const onChange = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    render(
      <FontPicker
        value="noto-sans-v1"
        disabled={false}
        loading={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Phông chữ' }));
    const dialog = screen.getByRole('dialog', { hidden: true });
    // jsdom has no native top-layer popover rendering; browser coverage checks that separately.
    dialog.removeAttribute('popover');
    fireEvent.change(within(dialog).getByRole('searchbox'), {
      target: { value: 'Vietnam' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Be Vietnam Pro' }),
    );
    expect(onChange).toHaveBeenCalledWith('be-vietnam-pro-v1');
    fireEvent.change(within(dialog).getByRole('searchbox'), {
      target: { value: 'not-a-font' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('Không tìm thấy');
    expect(getInvitationFont('noto-sans-v1').family).toBe(
      'Invitation Noto Sans v1',
    );
  });
  it('disables unsupported bold and italic instead of synthesizing a script style', () => {
    const node = primitiveNode('Text');
    if (!('textStyle' in node.props.content)) throw Error('text');
    node.props.content.textStyle.fontId = 'great-vibes-v1';
    render(
      <PropertiesPanel
        id="node"
        node={node}
        options={{}}
        assetUrls={{}}
        index={0}
        count={1}
        onCommand={vi.fn()}
        onReplace={vi.fn()}
        disabled={false}
      />,
    );
    expect(screen.getByRole('button', { name: 'Đậm' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Nghiêng' })).toBeDisabled();
  });
});
