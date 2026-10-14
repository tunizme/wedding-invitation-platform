import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  createBlankDocument,
  resolveEditorDocument,
} from '../../src/features/invitation-builder/document/editor-document';
import { primitiveNode } from '../../src/features/invitation-builder/editor/defaults';
import { CanvasElement } from '../../src/features/invitation-builder/renderer/canvas-renderer';
import { GiftAccounts } from '../../src/features/invitation-builder/renderer/gift-accounts';

afterEach(cleanup);
describe('customization presentation', () => {
  it('applies timing and keeps authored flips separate from continuous transforms', () => {
    const document = createBlankDocument(),
      id = '00000000-0000-4000-8000-000000000001';
    document.nodes[id] = primitiveNode('Text');
    document.nodes.ROOT.nodes = [id];
    const context = {
      mode: 'preview' as const,
      asOf: '2026-10-13T00:00:00Z',
      assetUrls: {},
    };
    const element = resolveEditorDocument(
      document,
      { schemaVersion: 1 },
      context,
    ).scene.elements[0];
    const options = {
      entrance: 'slide-left' as const,
      entranceDuration: 2,
      entranceDelay: 0.5,
      entranceEasing: 'linear' as const,
      continuous: 'spin' as const,
      continuousDuration: 3,
      continuousDelay: 1,
      flipX: true,
    };
    const { container, rerender } = render(
      <CanvasElement
        element={element}
        context={context}
        options={options}
        locale="vi"
      />,
    );
    const animated = container.querySelector<HTMLElement>('[data-entrance]')!;
    expect(animated.dataset.entrance).toBe('slide-left');
    expect(animated.style.getPropertyValue('--entrance-duration')).toBe('2s');
    expect(animated.style.getPropertyValue('--continuous-delay')).toBe('1s');
    expect(
      (animated.firstElementChild!.firstElementChild as HTMLElement).style
        .transform,
    ).toContain('scale(-1,1)');
    rerender(
      <CanvasElement
        element={element}
        context={context}
        options={{ ...options, entranceEnabled: false }}
        locale="vi"
      />,
    );
    expect(container.querySelector('[data-entrance]')).toHaveAttribute(
      'data-entrance',
      'none',
    );
  });
  it('opens a gift through configured account details and renders both QR codes', () => {
    const document = createBlankDocument(),
      id = '00000000-0000-4000-8000-000000000001';
    document.nodes[id] = primitiveNode('Text');
    document.nodes.ROOT.nodes = [id];
    const accounts = [
      { bin: '970436', account: '12345678', recipientName: 'FIRST ACCOUNT' },
      { bin: '970415', account: '87654321', recipientName: 'SECOND ACCOUNT' },
    ];
    const context = {
      mode: 'public' as const,
      asOf: '2026-10-13T00:00:00Z',
      assetUrls: {},
    };
    const element = resolveEditorDocument(
      document,
      { schemaVersion: 1 },
      context,
    ).scene.elements[0];
    const handler = vi.fn();
    window.addEventListener('invitation-gift', handler);
    try {
      render(
        <CanvasElement
          element={element}
          context={context}
          options={{
            action: { kind: 'gift', value: '' },
            giftAccounts: accounts,
            giftTitle: 'Tặng quà',
          }}
          locale="vi"
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Mở Text' }));
      expect(handler).toHaveBeenCalledOnce();
      expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({
        accounts,
        title: 'Tặng quà',
      });
      render(<GiftAccounts accounts={accounts} locale="vi" />);
      expect(
        screen.getAllByRole('img', { name: /Tài khoản .* QR/ }),
      ).toHaveLength(2);
      expect(screen.getByText('FIRST ACCOUNT')).toBeVisible();
    } finally {
      window.removeEventListener('invitation-gift', handler);
    }
  });
});
