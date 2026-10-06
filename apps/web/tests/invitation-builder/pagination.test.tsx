import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  templates: vi.fn(),
  invitations: vi.fn(),
  request: vi.fn(),
  push: vi.fn(),
  session: { user: { role: 'CUSTOMER' } },
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('../../src/features/identity-access/session/store', () => ({
  sessionStore: { subscribe: () => () => {}, get: () => mocks.session },
}));
vi.mock('../../src/features/invitations/api', () => ({
  listTemplateChoices: mocks.templates,
  listInvitations: mocks.invitations,
  createInvitation: vi.fn(),
}));
vi.mock('../../src/features/invitation-builder/api/client', () => ({
  builderRequest: mocks.request,
  scopedAssetPath: (value: string) => value,
  BuilderApiError: class extends Error {},
}));
import {
  CustomerInvitationList,
  CustomerTemplatePicker,
} from '../../src/features/invitations/customer-pages';
describe('customer list pagination', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.request.mockResolvedValue(new Blob());
  });
  it('loads further template pages and resets pagination with catalog filters', async () => {
    mocks.templates
      .mockResolvedValueOnce({
        items: [
          { id: 'a', name: 'Mẫu A', category: 'Wedding', coverUrl: '/cover' },
        ],
        nextCursor: 'next-page',
      })
      .mockResolvedValueOnce({
        items: [
          { id: 'b', name: 'Mẫu B', category: 'Wedding', coverUrl: '/cover' },
        ],
        nextCursor: null,
      })
      .mockResolvedValue({ items: [], nextCursor: null });
    render(<CustomerTemplatePicker />);
    await screen.findByText('Mẫu A');
    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm mẫu' }));
    await screen.findByText('Mẫu B');
    expect(mocks.templates).toHaveBeenNthCalledWith(2, 'cursor=next-page');
    expect(screen.getByText('Mẫu A')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Danh mục'), {
      target: { value: 'Spring' },
    });
    await waitFor(() =>
      expect(mocks.templates).toHaveBeenLastCalledWith('category=Spring'),
    );
    expect(screen.queryByRole('button', { name: 'Tải thêm mẫu' })).toBeNull();
  });
  it('loads additional owned invitations using the returned cursor', async () => {
    mocks.invitations
      .mockResolvedValueOnce({
        items: [{ id: 'a', status: 'DRAFT' }],
        nextCursor: 'cursor',
      })
      .mockResolvedValueOnce({
        items: [{ id: 'b', status: 'PUBLISHED' }],
        nextCursor: null,
      });
    render(<CustomerInvitationList />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Tải thêm thiệp' }),
    );
    await screen.findByText(/PUBLISHED/);
    expect(mocks.invitations).toHaveBeenLastCalledWith('cursor=cursor');
    expect(
      screen.getAllByRole('link', { name: 'Chỉnh thông tin thiệp' }),
    ).toHaveLength(2);
  });
});

import { TemplateList } from '../../src/features/invitation-builder/editor/template-pages';
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const listPage = (name: string, cursor: string | null = null) => ({
  items: [{ id: name, name, category: name, status: 'DRAFT', editVersion: 1 }],
  nextCursor: cursor,
});
describe('admin template query ownership', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.user.role = 'ADMIN';
  });
  function search(category: string) {
    fireEvent.change(screen.getByLabelText('Danh mục'), {
      target: { value: category },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm kiếm' }));
  }
  it('invalidates the previous cursor while a filter loads and admits only one next-page request', async () => {
    const pending = deferred<ReturnType<typeof listPage>>();
    mocks.request
      .mockResolvedValueOnce(listPage('Winter', 'winter-cursor'))
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(listPage('Spring page 2'));
    render(<TemplateList />);
    await screen.findByRole('link', { name: 'Winter' });
    search('Spring');
    expect(screen.queryByRole('button', { name: 'Trang tiếp' })).toBeNull();
    pending.resolve(listPage('Spring', 'spring-cursor'));
    await screen.findByRole('link', { name: 'Spring' });
    const next = screen.getByRole('button', { name: 'Trang tiếp' });
    fireEvent.click(next);
    fireEvent.click(next);
    await screen.findByRole('link', { name: 'Spring page 2' });
    expect(mocks.request.mock.calls.map((call) => call[0])).toEqual([
      '/admin/templates?',
      '/admin/templates?category=Spring',
      '/admin/templates?category=Spring&cursor=spring-cursor',
    ]);
  });
  it('refreshes the current filter when duplicate completes after a search', async () => {
    const mutation = deferred<unknown>();
    vi.spyOn(window, 'prompt').mockReturnValue('Copy');
    mocks.request
      .mockResolvedValueOnce(listPage('Winter'))
      .mockReturnValueOnce(mutation.promise)
      .mockResolvedValue(listPage('Spring'));
    render(<TemplateList />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Nhân bản Winter' }),
    );
    search('Spring');
    await screen.findByRole('link', { name: 'Spring' });
    mutation.resolve({});
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(4));
    expect(mocks.request.mock.calls[3][0]).toBe(
      '/admin/templates?category=Spring',
    );
    vi.restoreAllMocks();
  });
  it('ignores a duplicate refresh that resolves after a newer filter', async () => {
    const refresh = deferred<ReturnType<typeof listPage>>();
    vi.spyOn(window, 'prompt').mockReturnValue('Copy');
    mocks.request
      .mockResolvedValueOnce(listPage('Winter'))
      .mockResolvedValueOnce({})
      .mockReturnValueOnce(refresh.promise)
      .mockResolvedValue(listPage('Spring'));
    render(<TemplateList />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Nhân bản Winter' }),
    );
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(3));
    search('Spring');
    await screen.findByRole('link', { name: 'Spring' });
    await act(async () => {
      refresh.resolve(listPage('Old copy', 'old-cursor'));
    });
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Old copy' })).toBeNull(),
    );
    expect(screen.queryByRole('button', { name: 'Trang tiếp' })).toBeNull();
    vi.restoreAllMocks();
  });
  it('ignores obsolete refresh errors and retries the same filter after a current GET error', async () => {
    const old = deferred<ReturnType<typeof listPage>>();
    mocks.request
      .mockReturnValueOnce(old.promise)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(listPage('Spring'));
    render(<TemplateList />);
    search('Spring');
    await screen.findByRole('alert');
    fireEvent.click(
      screen.getByRole('button', { name: 'Thử tải lại danh sách' }),
    );
    await screen.findByRole('link', { name: 'Spring' });
    await act(async () => {
      old.reject(new Error('late'));
    });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(mocks.request.mock.calls[2][0]).toBe(
      '/admin/templates?category=Spring',
    );
  });
});
