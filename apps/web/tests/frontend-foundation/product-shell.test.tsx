import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogLink } from '../../src/ui/product/catalog-link';
import { ProductShell } from '../../src/ui/product/product-shell';
import { sessionStore } from '../../src/features/identity-access/session/store';
import type { AccessSession } from '../../src/features/identity-access/api/client';

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  logoutAll: vi.fn(),
  discard: vi.fn(() => true),
}));
vi.mock(
  '../../src/features/identity-access/session/refresh-coordinator',
  () => ({ logoutCurrent: mocks.logout, logoutAll: mocks.logoutAll }),
);
vi.mock('../../src/features/identity-access/session/navigation-guard', () => ({
  confirmDiscardChanges: mocks.discard,
}));
const customer = {
  accessToken: 'test',
  tokenType: 'Bearer',
  expiresIn: 900,
  csrfToken: 'test',
  user: {
    id: 'A',
    email: 'a@example.test',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    displayName: 'An',
    phoneNumber: null,
    avatarUrl: null,
    emailVerified: true,
    loginMethod: 'LOCAL',
  },
} as AccessSession;
beforeEach(() => {
  sessionStore.clear();
  vi.clearAllMocks();
  mocks.discard.mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  sessionStore.clear();
});

describe('005 US5 product shell', () => {
  it('shows branding and plain contact text with no session-only actions anonymously', () => {
    render(
      <ProductShell>
        <main>Nội dung</main>
      </ProductShell>,
    );
    expect(screen.getAllByText('Tiệm làm thiệp')).toHaveLength(2);
    expect(screen.getByText('tiemlamthiep@gmail.com').closest('a')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Tài khoản' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute(
      'href',
      '/login',
    );
  });
  it('routes discovery through current role authorization', () => {
    render(<CatalogLink>Khám phá</CatalogLink>);
    expect(screen.getByRole('link', { name: 'Khám phá' })).toHaveAttribute(
      'href',
      '/login',
    );
    act(() => sessionStore.set(customer));
    expect(screen.getByRole('link', { name: 'Khám phá' })).toHaveAttribute(
      'href',
      '/templates',
    );
    act(() =>
      sessionStore.set({
        ...customer,
        user: { ...customer.user, role: 'ADMIN' },
      }),
    );
    expect(screen.getByRole('link', { name: 'Khám phá' })).toHaveAttribute(
      'href',
      '/admin/templates',
    );
  });
  it('supports Escape focus return, outside click and dirty logout confirmation', () => {
    sessionStore.set(customer);
    render(
      <ProductShell>
        <main>Nội dung</main>
      </ProductShell>,
    );
    const trigger = screen.getByRole('button', { name: 'Tài khoản' });
    fireEvent.click(trigger);
    expect(screen.getByRole('link', { name: 'Thiệp của tôi' })).toHaveAttribute(
      'href',
      '/invitations',
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger).toHaveFocus();
    expect(
      screen.queryByRole('link', { name: 'Thiệp của tôi' }),
    ).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    mocks.discard.mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(mocks.logout).not.toHaveBeenCalled();
    mocks.discard.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(mocks.logout).toHaveBeenCalledOnce();
  });
  it('drops disclosure on owner change and reflects profile updates without retaining old identity', () => {
    sessionStore.set(customer);
    render(
      <ProductShell>
        <main>Nội dung</main>
      </ProductShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tài khoản' }));
    act(() =>
      sessionStore.set({
        ...customer,
        user: { ...customer.user, displayName: 'An mới' },
      }),
    );
    expect(screen.getByText('An mới')).toBeVisible();
    act(() =>
      sessionStore.set({
        ...customer,
        user: {
          ...customer.user,
          id: 'B',
          role: 'ADMIN',
          email: 'b@example.test',
        },
      }),
    );
    expect(screen.queryByText('a@example.test')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tài khoản' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tài khoản' }));
    expect(screen.getByRole('link', { name: 'Quản lý mẫu' })).toHaveAttribute(
      'href',
      '/admin/templates',
    );
    expect(
      screen.queryByRole('link', { name: 'Thiệp của tôi' }),
    ).not.toBeInTheDocument();
  });
});
