import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';

vi.mock('../../src/features/identity-access/session/session-provider', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) =>
    createElement('div', { 'data-product-session': true }, children),
}));
vi.mock(
  '../../src/features/identity-access/session/auth-recovery-notice',
  () => ({
    AuthRecoveryNotice: () =>
      createElement('span', { 'data-auth-recovery': true }),
  }),
);

import RootLayout from '../../src/app/layout';
import ProductLayout from '../../src/app/(product)/layout';
import { startPeerSync } from '../../src/features/identity-access/session/refresh-coordinator';

describe('product and public route ownership (005 US2)', () => {
  it('keeps root free of session chrome and effects', () => {
    const markup = renderToStaticMarkup(
      createElement(
        RootLayout,
        null,
        createElement('main', null, 'Public scene'),
      ),
    );
    expect(markup).toContain('<html lang="vi">');
    expect(markup).toContain('Public scene');
    expect(markup).not.toContain('data-product-session');
    expect(markup).not.toContain('data-auth-recovery');
  });
  it('mounts session UI only in the product route group', () => {
    const markup = renderToStaticMarkup(
      createElement(
        ProductLayout,
        null,
        createElement('main', null, 'Account'),
      ),
    );
    expect(markup).toContain('data-product-session');
    expect(markup).toContain('data-auth-recovery');
    expect(markup).toContain('Account');
    const container = document.createElement('div');
    container.innerHTML = markup;
    expect(
      container
        .querySelector('[data-product-session]')
        ?.closest('.platformTokens'),
    ).not.toBeNull();
  });

  it('owns and releases one peer channel for overlapping product providers', () => {
    const previous = globalThis.BroadcastChannel;
    const channel = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      close: vi.fn(),
      postMessage: vi.fn(),
    };
    const constructor = vi.fn();
    class OwnedChannel {
      constructor() {
        constructor();
        return channel;
      }
    }
    vi.stubGlobal('BroadcastChannel', OwnedChannel);
    try {
      const stopA = startPeerSync();
      const stopB = startPeerSync();
      expect(constructor).toHaveBeenCalledTimes(1);
      stopA();
      expect(channel.close).not.toHaveBeenCalled();
      stopB();
      stopB();
      expect(channel.removeEventListener).toHaveBeenCalledTimes(1);
      expect(channel.close).toHaveBeenCalledTimes(1);
    } finally {
      vi.stubGlobal('BroadcastChannel', previous);
    }
  });
});
