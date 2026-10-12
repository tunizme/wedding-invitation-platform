import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '../../src/features/identity-access/session/store';
import { privateSession } from '../identity-access/private-session-fixture';
const api = vi.hoisted(() => ({
  state: vi.fn(),
  submit: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  control: vi.fn(),
}));
vi.mock('../../src/features/invitations/rsvp-api', async (original) => ({
  ...(await original<
    typeof import('../../src/features/invitations/rsvp-api')
  >()),
  getPublicRsvpState: api.state,
  submitPublicRsvp: api.submit,
}));
vi.mock('../../src/features/invitations/api', () => ({
  getInvitation: api.get,
}));
vi.mock('../../src/features/invitations/rsvp-owner-api', () => ({
  listRsvps: api.list,
  setRsvpState: api.control,
}));
import { RsvpManagement } from '../../src/features/invitations/rsvp-management';
import { PublicRsvpError } from '../../src/features/invitations/rsvp-api';
import { BuilderApiError } from '../../src/features/invitation-builder/api/client';
import { PublicRsvp } from '../../src/features/invitations/public-rsvp';
const props = {
  slug: '00000000-0000-4000-8000-000000000001',
  title: 'Xác nhận',
  closedLabel: 'Đã đóng',
  successLabel: 'Đã lưu',
};
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  vi.resetAllMocks();
  sessionStore.clear();
  const session = privateSession();
  sessionStore.set({ ...session, user: { ...session.user, id: 'owner-A' } });
  api.state.mockResolvedValue({ open: true, available: true });
});
async function fill() {
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Gửi phản hồi' }),
    ).not.toBeDisabled(),
  );
  fireEvent.change(screen.getByLabelText('Tên khách mời'), {
    target: { value: 'Khách' },
  });
}
describe('public RSVP persistence UX', () => {
  it('retains uncertain key and payload, only confirms persistence and makes edits a new action', async () => {
    api.submit.mockRejectedValueOnce(new Error()).mockResolvedValueOnce({
      receiptId: 'receipt',
      acceptedAt: '2026-01-01',
    });
    render(<PublicRsvp {...props} />);
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi phản hồi' }));
    await screen.findByRole('alert');
    expect(screen.queryByText('Đã lưu')).toBeNull();
    expect(screen.getByLabelText('Tên khách mời')).toHaveValue('Khách');
    fireEvent.click(screen.getByRole('button', { name: 'Thử gửi lại' }));
    await screen.findByText('Đã lưu');
    expect(api.submit.mock.calls[1]).toEqual(api.submit.mock.calls[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Gửi phản hồi mới' }));
    fireEvent.change(screen.getByLabelText('Tên khách mời'), {
      target: { value: 'Khách khác' },
    });
    api.submit.mockResolvedValueOnce({
      receiptId: 'new',
      acceptedAt: '2026-01-01',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi phản hồi' }));
    await screen.findByText('Đã lưu');
    expect(api.submit.mock.calls[2][1]).not.toBe(api.submit.mock.calls[0][1]);
  });
  it('sets declined party size to zero and keeps plain-text message', async () => {
    api.submit.mockResolvedValue({
      receiptId: 'receipt',
      acceptedAt: '2026-01-01',
    });
    render(<PublicRsvp {...props} />);
    await fill();
    fireEvent.change(screen.getByLabelText('Tham dự'), {
      target: { value: 'DECLINED' },
    });
    fireEvent.change(screen.getByLabelText('Lời nhắn'), {
      target: { value: '<script>alert(1)</script>' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi phản hồi' }));
    await screen.findByText('Đã lưu');
    expect(api.submit.mock.calls[0][2]).toMatchObject({
      attendance: 'DECLINED',
      partySize: 0,
      message: '<script>alert(1)</script>',
    });
  });
  it('polls focus and closes without losing input, reopens and never submits invalid code-point fields', async () => {
    render(<PublicRsvp {...props} />);
    await fill();
    api.state.mockResolvedValue({ open: false, available: true });
    fireEvent(window, new Event('focus'));
    await screen.findByText('Đã đóng');
    api.state.mockResolvedValue({ open: true, available: true });
    fireEvent(window, new Event('focus'));
    await screen.findByLabelText('Tên khách mời');
    expect(screen.getByLabelText('Tên khách mời')).toHaveValue('Khách');
    fireEvent.change(screen.getByLabelText('Tên khách mời'), {
      target: { value: '😀'.repeat(121) },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Xác nhận' }));
    await screen.findByRole('alert');
    expect(api.submit).not.toHaveBeenCalled();
  });
  it('polls every 30 seconds only while visible and does not send in preview/capture', async () => {
    vi.useFakeTimers();
    render(<PublicRsvp {...props} />);
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(api.state).toHaveBeenCalledTimes(2);
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(api.state).toHaveBeenCalledTimes(2);
    visibility.mockRestore();
  });
});

describe('RSVP owner list/control', () => {
  beforeEach(() => {
    changeSession('owner-A');
    api.get.mockResolvedValue({ rsvpOpen: true, controlVersion: 1 });
    api.list.mockResolvedValue({ items: [], nextCursor: null });
  });
  it('shows empty/error/retry states and CAS conflicts require explicit reload', async () => {
    render(<RsvpManagement id="invitation" />);
    await screen.findByText('Chưa có phản hồi.');
    api.control.mockRejectedValueOnce(
      new BuilderApiError(409, 'VERSION_CONFLICT'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Đóng nhận RSVP' }));
    await screen.findByRole('alert');
    expect(
      screen.getByRole('button', { name: 'Đóng nhận RSVP' }),
    ).toBeDisabled();
    api.get.mockResolvedValue({ rsvpOpen: false, controlVersion: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại phản hồi' }));
    await screen.findByRole('button', { name: 'Mở nhận RSVP' });
    api.control.mockResolvedValue({ rsvpOpen: true, controlVersion: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Mở nhận RSVP' }));
    await screen.findByRole('button', { name: 'Đóng nhận RSVP' });
    expect(api.control).toHaveBeenLastCalledWith('invitation', 2, true, {
      scope: expect.objectContaining({ resource: 'RsvpManagement:invitation' }),
    });
  });
  it('renders newest pages and inert messages and does not request data for an admin', async () => {
    const item = {
      id: 'one',
      name: 'Tên',
      attendance: 'DECLINED',
      partySize: 0,
      message: '<script>alert(1)</script>',
      createdAt: '2026-01-01T00:00:00Z',
    };
    api.list
      .mockResolvedValueOnce({ items: [item], nextCursor: 'cursor' })
      .mockResolvedValueOnce({
        items: [{ ...item, id: 'two', name: 'Khách khác' }],
        nextCursor: null,
      });
    const view = render(<RsvpManagement id="invitation" />);
    await screen.findByText(item.message);
    expect(document.querySelector('script')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Phản hồi tiếp' }));
    await screen.findByText('Khách khác');
    expect(api.list).toHaveBeenLastCalledWith('invitation', 'cursor', {
      scope: expect.objectContaining({ resource: 'RsvpManagement:invitation' }),
    });
    view.unmount();
    changeSession('admin', 'ADMIN');
    api.list.mockClear();
    api.get.mockClear();
    render(<RsvpManagement id="invitation" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Customer');
    expect(api.list).not.toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalled();
  });
});
describe('RSVP failed requests', () => {
  it('keeps a submitted payload across close/unpublish polling and safely replays it', async () => {
    api.submit
      .mockRejectedValueOnce(new PublicRsvpError(0, 'NETWORK_ERROR'))
      .mockResolvedValueOnce({ receiptId: 'prior', acceptedAt: '2026-01-01' });
    render(<PublicRsvp {...props} />);
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi phản hồi' }));
    await screen.findByRole('alert');
    api.state.mockRejectedValue(new PublicRsvpError(404, 'NOT_FOUND'));
    fireEvent(window, new Event('focus'));
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Thử gửi lại' }));
    await screen.findByText('Đã lưu');
    expect(api.submit.mock.calls[1]).toEqual(api.submit.mock.calls[0]);
  });
  it('editing uncertain input starts a new key, definitive closed errors preserve input through reopen', async () => {
    api.submit
      .mockRejectedValueOnce(new PublicRsvpError(0, 'NETWORK_ERROR'))
      .mockRejectedValueOnce(new PublicRsvpError(409, 'RSVP_CLOSED'));
    render(<PublicRsvp {...props} />);
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi phản hồi' }));
    await screen.findByRole('alert');
    fireEvent.change(screen.getByLabelText('Tên khách mời'), {
      target: { value: 'Sửa tên' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi phản hồi' }));
    await screen.findByText('Đã đóng');
    expect(api.submit.mock.calls[1][1]).not.toBe(api.submit.mock.calls[0][1]);
    fireEvent(window, new Event('focus'));
    await screen.findByLabelText('Tên khách mời');
    expect(screen.getByLabelText('Tên khách mời')).toHaveValue('Sửa tên');
  });
  it('displays Retry-After, keeps valid values and waits before allowing another new action', async () => {
    api.submit.mockRejectedValue(new PublicRsvpError(429, 'RATE_LIMITED', 10));
    render(<PublicRsvp {...props} />);
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi phản hồi' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Gửi phản hồi' })).toBeDisabled();
    expect(screen.getByLabelText('Tên khách mời')).toHaveValue('Khách');
    expect(screen.getByRole('status')).toHaveTextContent('10 giây');
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function changeSession(
  id: string | null,
  role: 'CUSTOMER' | 'ADMIN' = 'CUSTOMER',
  token = 'new-token',
) {
  act(() => {
    if (!id) sessionStore.clear();
    else {
      const session = privateSession();
      sessionStore.set({
        ...session,
        accessToken: token,
        user: { ...session.user, id, role },
      });
    }
  });
}
const privateItem = {
  id: 'receipt-A',
  name: 'Owner A guest',
  attendance: 'ATTENDING' as const,
  partySize: 1,
  message: 'Owner A private response',
  createdAt: '2026-10-06T00:00:00Z',
};
const privatePage = { items: [privateItem], nextCursor: 'cursor-A' };
describe('RSVP principal and resource isolation', () => {
  it('disposes the mounted resource scope while a transport is still pending', async () => {
    api.get.mockImplementation(() => new Promise(() => {}));
    api.list.mockImplementation(() => new Promise(() => {}));
    const view = render(<RsvpManagement id="invitation-A" />);
    await waitFor(() => expect(api.list).toHaveBeenCalledOnce());
    const scope = api.list.mock.calls[0][2].scope;
    expect(scope.isActive()).toBe(true);
    expect(api.get.mock.calls[0][1].scope).toBe(scope);
    view.unmount();
    expect(scope.signal.aborted).toBe(true);
    expect(scope.isActive()).toBe(false);
  });
  it('replaces the request scope when the invitation resource changes', async () => {
    api.get.mockImplementation(() => new Promise(() => {}));
    api.list.mockImplementation(() => new Promise(() => {}));
    const view = render(<RsvpManagement id="invitation-A" />);
    await waitFor(() => expect(api.list).toHaveBeenCalledOnce());
    const old = api.list.mock.calls[0][2].scope;
    view.rerender(<RsvpManagement id="invitation-B" />);
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(old.signal.aborted).toBe(true);
    const current = api.list.mock.calls[1][2].scope;
    expect(current.resource).toBe('RsvpManagement:invitation-B');
    expect(current.isActive()).toBe(true);
  });
  it('rejects the first A completion after A → B → A using the real identity epoch', async () => {
    const old = deferred<typeof privatePage>();
    api.list
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue({ items: [], nextCursor: null });
    render(<RsvpManagement id="invitation-A" />);
    await waitFor(() => expect(api.list).toHaveBeenCalledOnce());
    const epoch = sessionStore.identityEpoch();
    changeSession('owner-B');
    changeSession('owner-A');
    expect(sessionStore.identityEpoch()).toBeGreaterThan(epoch);
    await screen.findByText('Chưa có phản hồi.');
    await act(async () => old.resolve(privatePage));
    expect(screen.queryByText(privateItem.message)).toBeNull();
  });
  beforeEach(() => {
    api.get.mockResolvedValue({ rsvpOpen: true, controlVersion: 1 });
    api.list.mockResolvedValue(privatePage);
  });
  it.each([403, 404])(
    'hides prior owner data immediately when another Customer receives %s',
    async (status) => {
      render(<RsvpManagement id="invitation-A" />);
      await screen.findByText(privateItem.message);
      api.get.mockRejectedValue(new BuilderApiError(status, 'NOT_FOUND'));
      api.list.mockRejectedValue(new BuilderApiError(status, 'NOT_FOUND'));
      changeSession('customer-B');
      expect(screen.queryByText(privateItem.message)).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Đóng nhận RSVP' }),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Phản hồi tiếp' }),
      ).toBeNull();
      await screen.findByRole('alert');
      expect(api.get).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(privateItem.message)).toBeNull();
    },
  );
  it('clears private state through logout then another Customer and denies Admin without reads', async () => {
    render(<RsvpManagement id="invitation-A" />);
    await screen.findByText(privateItem.message);
    changeSession(null);
    expect(screen.queryByText(privateItem.message)).toBeNull();
    api.get.mockRejectedValue(new BuilderApiError(404, 'NOT_FOUND'));
    api.list.mockRejectedValue(new BuilderApiError(404, 'NOT_FOUND'));
    changeSession('customer-B');
    expect(screen.queryByText(privateItem.message)).toBeNull();
    await screen.findByRole('alert');
    const reads = api.get.mock.calls.length;
    changeSession('admin', 'ADMIN');
    await act(async () => {});
    expect(api.get).toHaveBeenCalledTimes(reads);
    expect(screen.queryByText(privateItem.message)).toBeNull();
  });
  it('discards an initial owner read that completes after identity changes', async () => {
    const old = deferred<typeof privatePage>();
    api.list
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    render(<RsvpManagement id="invitation-A" />);
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1));
    changeSession('customer-B');
    await screen.findByText('Chưa có phản hồi.');
    await act(async () => old.resolve(privatePage));
    expect(screen.queryByText(privateItem.message)).toBeNull();
  });
  it.each([
    ['page', 'success'],
    ['page', 'error'],
    ['control', 'success'],
    ['control', 'error'],
  ])(
    'old %s %s completion cannot release the new identity read guard',
    async (operation, outcome) => {
      const old = deferred<unknown>();
      const next = deferred<typeof privatePage>();
      render(<RsvpManagement id="invitation-A" />);
      await screen.findByText(privateItem.message);
      if (operation === 'page') {
        api.list.mockReturnValueOnce(old.promise);
        fireEvent.click(screen.getByRole('button', { name: 'Phản hồi tiếp' }));
      } else {
        api.control.mockReturnValueOnce(old.promise);
        fireEvent.click(screen.getByRole('button', { name: 'Đóng nhận RSVP' }));
      }
      api.list.mockReturnValueOnce(next.promise);
      changeSession('customer-B');
      await waitFor(() =>
        expect(api.list).toHaveBeenCalledTimes(operation === 'page' ? 3 : 2),
      );
      await act(async () => {
        if (outcome === 'error')
          old.reject(new BuilderApiError(409, 'VERSION_CONFLICT'));
        else
          old.resolve(
            operation === 'page'
              ? privatePage
              : { rsvpOpen: false, controlVersion: 99 },
          );
      });
      expect(
        screen.getByRole('button', { name: 'Tải lại phản hồi' }),
      ).toBeDisabled();
      expect(screen.queryByText(privateItem.message)).toBeNull();
      expect(screen.queryByText(/Trạng thái đã đổi ở nơi khác/)).toBeNull();
      await act(async () => next.reject(new BuilderApiError(404, 'NOT_FOUND')));
      await screen.findByRole('alert');
      expect(
        screen.getByRole('button', { name: 'Tải lại phản hồi' }),
      ).not.toBeDisabled();
    },
  );
  it('retains authorized data across token renewal for the same Customer', async () => {
    render(<RsvpManagement id="invitation-A" />);
    await screen.findByText(privateItem.message);
    changeSession('owner-A', 'CUSTOMER', 'renewed-token');
    await act(async () => {});
    expect(screen.getByText(privateItem.message)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenCalledTimes(1);
  });
  it('invalidates private data when the invitation changes without remounting the route', async () => {
    const view = render(<RsvpManagement id="invitation-A" />);
    await screen.findByText(privateItem.message);
    api.get.mockRejectedValue(new BuilderApiError(404, 'NOT_FOUND'));
    api.list.mockRejectedValue(new BuilderApiError(404, 'NOT_FOUND'));
    view.rerender(<RsvpManagement id="invitation-B" />);
    expect(screen.queryByText(privateItem.message)).toBeNull();
    await screen.findByRole('alert');
  });
});

describe('RSVP errors belong to individual fields', () => {
  const nameError = 'Tên cần 1–120 ký tự sau khi bỏ khoảng trắng ở hai đầu.';
  const sizeError = 'Số người phải là số nguyên từ 1 đến 20, gồm bạn.';
  const messageError = 'Lời nhắn tối đa 1000 ký tự.';
  it.each([
    ['Tên khách mời', '', nameError],
    ['Tên khách mời', '😀'.repeat(121), nameError],
    ['Số người (gồm bạn)', '0', sizeError],
    ['Số người (gồm bạn)', '21', sizeError],
    ['Số người (gồm bạn)', '1.5', sizeError],
    ['Lời nhắn', '😀'.repeat(1001), messageError],
  ])(
    'associates a validation error only with %s (case %#)',
    async (label, value, error) => {
      render(<PublicRsvp {...props} />);
      await fill();
      fireEvent.change(screen.getByLabelText('Lời nhắn'), {
        target: { value: 'Valid message' },
      });
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
      fireEvent.click(screen.getByRole('button', { name: 'Gửi phản hồi' }));
      expect(screen.getByLabelText(label)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      expect(screen.getByLabelText(label)).toHaveAccessibleDescription(error);
      for (const other of [
        'Tên khách mời',
        'Số người (gồm bạn)',
        'Lời nhắn',
      ].filter((x) => x !== label)) {
        expect(screen.getByLabelText(other)).not.toHaveAttribute(
          'aria-invalid',
          'true',
        );
        expect(screen.getByLabelText(other)).not.toHaveAttribute(
          'aria-describedby',
        );
      }
      expect(api.submit).not.toHaveBeenCalled();
      if (label !== 'Tên khách mời')
        expect(screen.getByLabelText('Tên khách mời')).toHaveValue('Khách');
      if (label !== 'Lời nhắn')
        expect(screen.getByLabelText('Lời nhắn')).toHaveValue('Valid message');
    },
  );
  it('fixing one invalid field keeps the other errors and preserves valid values', async () => {
    render(<PublicRsvp {...props} />);
    await fill();
    fireEvent.change(screen.getByLabelText('Tên khách mời'), {
      target: { value: ' ' },
    });
    fireEvent.change(screen.getByLabelText('Số người (gồm bạn)'), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByLabelText('Lời nhắn'), {
      target: { value: 'a'.repeat(1001) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi phản hồi' }));
    expect(screen.getAllByRole('alert')).toHaveLength(3);
    fireEvent.change(screen.getByLabelText('Tên khách mời'), {
      target: { value: 'Valid name' },
    });
    expect(screen.queryByText(nameError)).toBeNull();
    expect(
      screen.getByLabelText('Số người (gồm bạn)'),
    ).toHaveAccessibleDescription(sizeError);
    expect(screen.getByLabelText('Lời nhắn')).toHaveAccessibleDescription(
      messageError,
    );
    fireEvent.change(screen.getByLabelText('Tham dự'), {
      target: { value: 'DECLINED' },
    });
    expect(screen.queryByText(sizeError)).toBeNull();
    expect(screen.getByLabelText('Lời nhắn')).toHaveAccessibleDescription(
      messageError,
    );
    fireEvent.change(screen.getByLabelText('Lời nhắn'), {
      target: { value: 'Fixed' },
    });
    expect(screen.queryByRole('alert')).toBeNull();
    api.submit.mockResolvedValue({
      receiptId: 'receipt',
      acceptedAt: '2026-10-06T00:00:00Z',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi phản hồi' }));
    await screen.findByText('Đã lưu');
    expect(api.submit.mock.calls[0][2]).toEqual({
      name: 'Valid name',
      attendance: 'DECLINED',
      partySize: 0,
      message: 'Fixed',
    });
  });
  it('accepts trimmed Unicode code-point boundaries without field errors', async () => {
    api.submit.mockResolvedValue({
      receiptId: 'receipt',
      acceptedAt: '2026-10-06T00:00:00Z',
    });
    render(<PublicRsvp {...props} />);
    await fill();
    fireEvent.change(screen.getByLabelText('Tên khách mời'), {
      target: { value: '  ' + '😀'.repeat(120) + '  ' },
    });
    fireEvent.change(screen.getByLabelText('Số người (gồm bạn)'), {
      target: { value: '20' },
    });
    fireEvent.change(screen.getByLabelText('Lời nhắn'), {
      target: { value: '😀'.repeat(1000) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi phản hồi' }));
    await screen.findByText('Đã lưu');
    expect(api.submit.mock.calls[0][2].name).toBe('😀'.repeat(120));
  });
  it.each([0, 429])(
    'keeps transport status %s separate from valid fields',
    async (status) => {
      api.submit.mockRejectedValue(
        new PublicRsvpError(
          status,
          status ? 'RATE_LIMITED' : 'NETWORK_ERROR',
          10,
        ),
      );
      render(<PublicRsvp {...props} />);
      await fill();
      fireEvent.click(screen.getByRole('button', { name: 'Gửi phản hồi' }));
      await screen.findByRole('alert');
      for (const label of ['Tên khách mời', 'Số người (gồm bạn)', 'Lời nhắn']) {
        expect(screen.getByLabelText(label)).not.toHaveAttribute(
          'aria-invalid',
          'true',
        );
        expect(screen.getByLabelText(label)).not.toHaveAttribute(
          'aria-describedby',
        );
      }
    },
  );
});

describe('RSVP combined feedback during polling failure', () => {
  it.each(['focus', 'timer'])(
    'keeps three field errors and input through %s failure and recovery',
    async (trigger) => {
      vi.useFakeTimers();
      render(<PublicRsvp {...props} />);
      await act(async () => {});
      const values = [
        ['Tên khách mời', '😀'.repeat(121)],
        ['Số người (gồm bạn)', '0'],
        ['Lời nhắn', '😀'.repeat(1001)],
      ];
      for (const [label, value] of values)
        fireEvent.change(screen.getByLabelText(label), { target: { value } });
      fireEvent.submit(screen.getByRole('form', { name: props.title }));
      expect(screen.getAllByRole('alert')).toHaveLength(3);
      api.state.mockRejectedValue(new Error('offline'));
      await act(async () => {
        if (trigger === 'focus') fireEvent(window, new Event('focus'));
        else await vi.advanceTimersByTimeAsync(30000);
      });
      expect(screen.getByRole('status')).toHaveTextContent(
        'Hãy thử lại khi có kết nối',
      );
      expect(screen.getAllByRole('alert')).toHaveLength(3);
      expect(
        screen.getByRole('button', { name: 'Gửi phản hồi' }),
      ).toBeDisabled();
      api.state.mockResolvedValue({ open: true, available: true });
      await act(async () => {
        fireEvent(window, new Event('focus'));
      });
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.getAllByRole('alert')).toHaveLength(3);
      expect(screen.getByLabelText('Tên khách mời')).toHaveValue(values[0][1]);
      expect(screen.getByLabelText('Lời nhắn')).toHaveValue(values[2][1]);
      expect(
        screen.getByRole('button', { name: 'Gửi phản hồi' }),
      ).toBeEnabled();
      expect(api.submit).not.toHaveBeenCalled();
    },
  );
});

describe('RSVP request feedback with unavailable polling', () => {
  it.each(['preflight', 'rate-limit'])(
    'retains %s feedback and valid input until connectivity recovers',
    async (kind) => {
      render(<PublicRsvp {...props} />);
      await fill();
      fireEvent.change(screen.getByLabelText('Lời nhắn'), {
        target: { value: 'Giữ lời nhắn' },
      });
      if (kind === 'preflight')
        api.state.mockRejectedValueOnce(new Error('offline'));
      else
        api.submit.mockRejectedValueOnce(
          new PublicRsvpError(429, 'RATE_LIMITED', 600),
        );
      fireEvent.click(screen.getByRole('button', { name: 'Gửi phản hồi' }));
      const feedback = await screen.findByRole('alert');
      const text = feedback.textContent;
      api.state.mockRejectedValueOnce(new Error('offline'));
      fireEvent(window, new Event('focus'));
      await screen.findByText(/Hãy thử lại khi có kết nối/);
      expect(screen.getByRole('alert')).toHaveTextContent(text!);
      expect(screen.getByLabelText('Tên khách mời')).toHaveValue('Khách');
      expect(screen.getByLabelText('Lời nhắn')).toHaveValue('Giữ lời nhắn');
      expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(
        0,
      );
      if (kind === 'rate-limit')
        expect(screen.getByText(/Có thể thử lại sau/)).toBeInTheDocument();
      fireEvent(window, new Event('focus'));
      await waitFor(() =>
        expect(screen.queryByText(/Hãy thử lại khi có kết nối/)).toBeNull(),
      );
      expect(screen.getByRole('alert')).toHaveTextContent(text!);
      if (kind === 'preflight') {
        expect(api.submit).not.toHaveBeenCalled();
        expect(
          screen.getByRole('button', { name: 'Gửi phản hồi' }),
        ).toBeEnabled();
      } else {
        expect(api.submit).toHaveBeenCalledTimes(1);
        expect(
          screen.getByRole('button', { name: 'Gửi phản hồi' }),
        ).toBeDisabled();
      }
    },
  );
});
