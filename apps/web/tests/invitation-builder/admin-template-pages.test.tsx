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
import type { OperationScope } from '../../src/features/identity-access/session/operation-scope';
const mocks = vi.hoisted(() => ({ request: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('next/dynamic', () => ({ default: () => () => <p>Editor loaded</p> }));
vi.mock('../../src/features/invitation-builder/api/client', async (load) => ({
  ...(await load<
    typeof import('../../src/features/invitation-builder/api/client')
  >()),
  builderRequest: mocks.request,
}));
import {
  NewTemplate,
  TemplateList,
} from '../../src/features/invitation-builder/editor/template-pages';
const a = privateSession();
const admin = { ...a, user: { ...a.user, role: 'ADMIN' as const } };
function switchOwner() {
  act(() =>
    sessionStore.set({ ...admin, user: { ...admin.user, id: 'admin-B' } }),
  );
}
beforeEach(() => {
  mocks.request.mockReset();
  mocks.push.mockReset();
  sessionStore.clear();
  sessionStore.set(admin);
});
afterEach(() => {
  cleanup();
  sessionStore.clear();
});
describe('guided Admin template creation', () => {
  it('validates trimmed metadata and describes the single500 canvas without sending whitespace', async () => {
    render(<NewTemplate />);
    fireEvent.change(screen.getByLabelText('Tên mẫu'), {
      target: { value: '   ' },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: 'Tạo mẫu' }).closest('form')!,
    );
    expect(mocks.request).not.toHaveBeenCalled();
    expect(await screen.findByText('Nhập tên mẫu để tiếp tục.')).toBeVisible();
    expect(screen.getByText(/canvas 500px/)).toBeVisible();
    expect(screen.queryByLabelText('Kiểu thiết kế')).not.toBeInTheDocument();
  });
  it('retains metadata on a known failure and submits one trimmed draft on retry', async () => {
    mocks.request
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ id: 'new-draft' });
    render(<NewTemplate />);
    fireEvent.change(screen.getByLabelText('Tên mẫu'), {
      target: { value: '  Mùa thu  ' },
    });
    fireEvent.change(screen.getByLabelText('Danh mục'), {
      target: { value: '  Thanh lịch  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo mẫu' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Tên mẫu')).toHaveValue('  Mùa thu  ');
    fireEvent.click(screen.getByRole('button', { name: 'Tạo mẫu' }));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        '/admin/templates/new-draft/edit',
      ),
    );
    expect(mocks.request.mock.calls[1][1].body).toEqual({
      name: 'Mùa thu',
      category: 'Thanh lịch',
    });
  });
  it('admits only one pending create and blocks replay after an uncertain transport result', async () => {
    let reject!: (cause: unknown) => void;
    mocks.request.mockImplementation(
      () =>
        new Promise((_resolve, failed) => {
          reject = failed;
        }),
    );
    render(<NewTemplate />);
    fireEvent.change(screen.getByLabelText('Tên mẫu'), {
      target: { value: 'Một mẫu' },
    });
    const form = screen
      .getByRole('button', { name: 'Tạo mẫu' })
      .closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(mocks.request).toHaveBeenCalledOnce();
    const { BuilderApiError } =
      await import('../../src/features/invitation-builder/api/client');
    await act(async () => reject(new BuilderApiError(0, 'NETWORK_ERROR')));
    expect(screen.getByRole('button', { name: 'Tạo mẫu' })).toBeDisabled();
    expect(
      screen.getByRole('link', { name: 'Kiểm tra danh sách mẫu' }),
    ).toHaveAttribute('href', '/admin/templates');
    fireEvent.submit(form);
    expect(mocks.request).toHaveBeenCalledOnce();
  });
  it('aborts pending creation on an owner change and never navigates to the former owner draft', async () => {
    let complete!: (value: unknown) => void;
    mocks.request.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    render(<NewTemplate />);
    fireEvent.change(screen.getByLabelText('Tên mẫu'), {
      target: { value: 'Owner A draft' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo mẫu' }));
    const scope = mocks.request.mock.calls[0][1].scope as OperationScope;
    switchOwner();
    await act(async () => complete({ id: 'owner-A-draft' }));
    expect(scope.signal.aborted).toBe(true);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Tên mẫu')).toHaveValue('');
  });
});

describe('Admin template copy recovery', () => {
  const template = {
    id: 'source',
    name: 'Mẫu nguồn',
    category: 'Wedding',
    editVersion: 7,
    tags: [],
    coverUrl: null,
    status: 'DRAFT',
  };
  it('keeps the copy name on failure and retries the pinned version through one native form', async () => {
    mocks.request.mockImplementation(
      (path: string, options?: { method?: string }) =>
        options?.method === 'POST'
          ? Promise.reject(new Error('rejected'))
          : Promise.resolve({ items: [template], nextCursor: null }),
    );
    render(<TemplateList />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Nhân bản Mẫu nguồn' }),
    );
    fireEvent.change(screen.getByLabelText('Tên bản sao'), {
      target: { value: '  Bản sao riêng  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Nhân bản mẫu' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Tên bản sao')).toHaveValue(
      '  Bản sao riêng  ',
    );
    const post = mocks.request.mock.calls.find(
      ([, options]) => options?.method === 'POST',
    );
    expect(post?.[1].body).toEqual({
      expectedVersion: 7,
      name: 'Bản sao riêng',
    });
    expect(screen.getByRole('dialog')).toBeVisible();
  });
  it('does not permit another copy after an uncertain result even when the dialog closes', async () => {
    const { BuilderApiError } =
      await import('../../src/features/invitation-builder/api/client');
    mocks.request.mockImplementation(
      (_path: string, options?: { method?: string }) =>
        options?.method === 'POST'
          ? Promise.reject(new BuilderApiError(0, 'NETWORK_ERROR'))
          : Promise.resolve({ items: [template], nextCursor: null }),
    );
    render(<TemplateList />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Nhân bản Mẫu nguồn' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Nhân bản mẫu' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(
      screen.getByRole('button', { name: 'Nhân bản Mẫu nguồn' }),
    ).toBeDisabled();
    expect(
      mocks.request.mock.calls.filter(
        ([, options]) => options?.method === 'POST',
      ),
    ).toHaveLength(1);
  });
});
