import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AdminCustomerDetail,
  AdminCustomerList,
} from '../../src/features/identity-access/admin/customer-management';
import type {
  AccessSession,
  UserProfile,
} from '../../src/features/identity-access/api/client';
import { authenticatedRequest } from '../../src/features/identity-access/session/refresh-coordinator';
import { sessionStore } from '../../src/features/identity-access/session/store';

vi.mock(
  '../../src/features/identity-access/session/refresh-coordinator',
  () => ({
    authenticatedRequest: vi.fn(),
  }),
);

const profile: UserProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'customer@example.test',
  emailVerified: true,
  loginMethod: 'LOCAL',
  role: 'CUSTOMER',
  status: 'ACTIVE',
  displayName: 'Khách hàng',
  phoneNumber: null,
  avatarUrl: null,
};
const session = (role: 'CUSTOMER' | 'ADMIN'): AccessSession => ({
  accessToken: 'memory-only',
  tokenType: 'Bearer',
  expiresIn: 900,
  csrfToken: 'csrf',
  user: { ...profile, role },
});
const detail = {
  ...profile,
  createdAt: '2026-09-27T00:00:00.000Z',
  updatedAt: '2026-09-27T00:00:00.000Z',
};

beforeEach(() => {
  vi.mocked(authenticatedRequest).mockReset();
  sessionStore.clear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Admin Customer management UI', () => {
  it('denies unauthenticated and CUSTOMER principals without making a request', () => {
    const { rerender } = render(<AdminCustomerList />);
    expect(screen.getByText(/chỉ dành cho Admin/)).toBeInTheDocument();
    sessionStore.set(session('CUSTOMER'));
    rerender(<AdminCustomerList />);
    expect(screen.getByText(/chỉ dành cho Admin/)).toBeInTheDocument();
    expect(authenticatedRequest).not.toHaveBeenCalled();
  });

  it('searches, filters, renders safe results, and follows the cursor', async () => {
    sessionStore.set(session('ADMIN'));
    vi.mocked(authenticatedRequest)
      .mockResolvedValueOnce({
        items: [detail],
        page: { hasMore: true, nextCursor: 'next' },
      })
      .mockResolvedValueOnce({
        items: [],
        page: { hasMore: false, nextCursor: null },
      })
      .mockResolvedValueOnce({
        items: [],
        page: { hasMore: false, nextCursor: null },
      });
    render(<AdminCustomerList />);
    expect(
      await screen.findByText('customer@example.test'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Trang tiếp' }));
    await waitFor(() =>
      expect(authenticatedRequest).toHaveBeenCalledWith(
        '/admin/customers?limit=20&cursor=next',
        { scope: expect.objectContaining({ resource: 'AdminCustomerList' }) },
      ),
    );
    fireEvent.change(screen.getByLabelText('Tìm kiếm'), {
      target: { value: ' alice ' },
    });
    fireEvent.change(screen.getByLabelText('Trạng thái'), {
      target: { value: 'LOCKED' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));
    await waitFor(() =>
      expect(authenticatedRequest).toHaveBeenCalledWith(
        '/admin/customers?limit=20&q=alice&status=LOCKED',
        { scope: expect.objectContaining({ resource: 'AdminCustomerList' }) },
      ),
    );
    expect(
      await screen.findByText('Không có Customer phù hợp.'),
    ).toBeInTheDocument();
  });

  it('loads detail and confirms lock/unlock without editing protected fields', async () => {
    sessionStore.set(session('ADMIN'));
    vi.mocked(authenticatedRequest)
      .mockResolvedValueOnce(detail)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ ...detail, status: 'LOCKED' })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(detail);
    render(<AdminCustomerDetail customerId={profile.id} />);
    expect(
      await screen.findByText('customer@example.test'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Khóa Customer' }));
    await waitFor(() =>
      expect(authenticatedRequest).toHaveBeenCalledWith(
        `/admin/customers/${profile.id}/lock`,
        {
          method: 'POST',
          scope: expect.objectContaining({
            resource: expect.stringContaining('AdminCustomerDetail'),
          }),
        },
      ),
    );
    expect(
      await screen.findByRole('button', { name: 'Mở khóa Customer' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mở khóa Customer' }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalledTimes(2));
  });

  it('does not keep old results visible after a failed load for a new filter by the same Admin', async () => {
    sessionStore.set(session('ADMIN'));
    vi.mocked(authenticatedRequest)
      .mockResolvedValueOnce({
        items: [detail],
        page: { hasMore: false, nextCursor: null },
      })
      .mockRejectedValueOnce(new Error('offline'));
    render(<AdminCustomerList />);
    await screen.findByText('customer@example.test');
    fireEvent.change(screen.getByLabelText('Tìm kiếm'), {
      target: { value: 'other' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Không thể tải/);
    expect(screen.queryByText('customer@example.test')).toBeNull();
  });

  it('ignores a lock completion of Admin A after Admin B is admitted', async () => {
    sessionStore.set(session('ADMIN'));
    let resolveLock!: (value: undefined) => void;
    vi.mocked(authenticatedRequest).mockResolvedValueOnce(detail);
    vi.mocked(authenticatedRequest).mockImplementationOnce(
      () => new Promise((done) => (resolveLock = done)),
    );
    // B's own detail load.
    vi.mocked(authenticatedRequest).mockResolvedValue({
      ...detail,
      email: 'admin-b-view@example.test',
    });
    render(<AdminCustomerDetail customerId={profile.id} />);
    await screen.findByText('customer@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Khóa Customer' }));
    await waitFor(() => expect(authenticatedRequest).toHaveBeenCalledTimes(2));
    act(() =>
      sessionStore.set({
        ...session('ADMIN'),
        user: { ...session('ADMIN').user, id: 'admin-b' },
      }),
    );
    await act(async () => resolveLock(undefined));
    expect(
      await screen.findByText('admin-b-view@example.test'),
    ).toBeInTheDocument();
    // A's follow-up detail reload after the lock never ran.
    const detailReads = vi
      .mocked(authenticatedRequest)
      .mock.calls.filter(
        ([path, options]) =>
          path === `/admin/customers/${profile.id}` &&
          (options as { scope?: { resource: string } }).scope !== undefined,
      );
    expect(detailReads).toHaveLength(2);
  });

  it('shows an actionable error state', async () => {
    sessionStore.set(session('ADMIN'));
    vi.mocked(authenticatedRequest).mockRejectedValue(new Error('offline'));
    render(<AdminCustomerList />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Không thể tải/);
  });
});
