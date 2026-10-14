import { scalePrimitiveDocument } from '../../src/features/invitation-builder/document/editor-document';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { sessionStore } from '../../src/features/identity-access/session/store';
import { privateSession } from './private-session-fixture';
import {
  CustomerInvitationList,
  CustomerTemplatePicker,
} from '../../src/features/invitations/customer-pages';
import { AdminCustomerList } from '../../src/features/identity-access/admin/customer-management';
import { ProfileForm } from '../../src/features/identity-access/forms/profile-form';
const { list, choices, create, revision, auth, push } = vi.hoisted(() => ({
  list: vi.fn(),
  choices: vi.fn(),
  create: vi.fn(),
  revision: vi.fn(),
  auth: vi.fn(),
  push: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('../../src/features/invitations/api', () => ({
  listInvitations: list,
  listTemplateChoices: choices,
  createInvitation: create,
  getTemplateRevision: revision,
}));
vi.mock(
  '../../src/features/identity-access/session/refresh-coordinator',
  () => ({ authenticatedRequest: auth, clearLocalSession: vi.fn() }),
);
vi.mock('../../src/features/invitations/public-invitation-view', () => ({
  PublicInvitationView: () => <div data-testid="private-preview" />,
}));
const corpus = JSON.parse(
  readFileSync(
    resolvePath(
      __dirname,
      '../../../../specs/004-invitation-builder/contracts/fixtures/binding-optional-fallback.json',
    ),
    'utf8',
  ),
);
const a = privateSession();
beforeEach(() => {
  list.mockReset();
  choices.mockReset();
  create.mockReset();
  revision.mockResolvedValue({
    id: 'template',
    revisionId: 'revision',
    document: scalePrimitiveDocument(corpus.document),
    sampleData: corpus.weddingData,
    formFields: [],
  });
  auth.mockReset();
  push.mockReset();
  sessionStore.clear();
  sessionStore.set(a);
});
afterEach(() => {
  cleanup();
  sessionStore.clear();
});
it('removes A private list before failed B load with same role', async () => {
  list
    .mockResolvedValueOnce({
      items: [{ id: 'private-A', status: 'DRAFT' }],
      nextCursor: null,
    })
    .mockRejectedValueOnce(new Error('B unavailable'));
  render(<CustomerInvitationList />);
  await screen.findByRole('link', { name: 'Chỉnh thông tin thiệp' });
  act(() => sessionStore.set({ ...a, user: { ...a.user, id: 'B' } }));
  expect(
    screen.queryByRole('link', { name: 'Chỉnh thông tin thiệp' }),
  ).toBeNull();
  await screen.findByRole('alert');
  expect(list).toHaveBeenCalledTimes(2);
});
it('does not admit old A after rapid A to B to A', async () => {
  let resolve!: (v: unknown) => void;
  list
    .mockImplementationOnce(() => new Promise((done) => (resolve = done)))
    .mockResolvedValue({ items: [], nextCursor: null });
  render(<CustomerInvitationList />);
  act(() => {
    sessionStore.set({ ...a, user: { ...a.user, id: 'B' } });
    sessionStore.set(a);
  });
  await act(async () =>
    resolve({ items: [{ id: 'old-A', status: 'DRAFT' }], nextCursor: null }),
  );
  expect(
    screen.queryByRole('link', { name: 'Chỉnh thông tin thiệp' }),
  ).toBeNull();
});
it('cancels old picker create navigation after owner switch', async () => {
  choices.mockResolvedValue({
    items: [
      {
        id: 'template',
        name: 'Mẫu A',
        category: 'Wedding',
        coverUrl: '/api/v1/templates/template/cover',
        publishedRevisionId: 'revision',
      },
    ],
    nextCursor: null,
  });
  let resolve!: (v: unknown) => void;
  create.mockImplementation(() => new Promise((done) => (resolve = done)));
  render(<CustomerTemplatePicker />);
  fireEvent.click(await screen.findByRole('button', { name: 'Xem mẫu Mẫu A' }));
  await screen.findByTestId('private-preview');
  fireEvent.click(screen.getByRole('button', { name: 'Chọn mẫu này' }));
  act(() => sessionStore.set({ ...a, user: { ...a.user, id: 'B' } }));
  await act(async () => resolve({ id: 'private-A' }));
  expect(push).not.toHaveBeenCalled();
});
it('resets Admin records filters and cursor when another Admin is admitted', async () => {
  sessionStore.set({ ...a, user: { ...a.user, role: 'ADMIN' } });
  auth
    .mockResolvedValueOnce({
      items: [
        { ...a.user, email: 'private-customer@example.test', status: 'ACTIVE' },
      ],
      page: { hasMore: false, nextCursor: null },
    })
    .mockRejectedValueOnce(new Error('B unavailable'));
  render(<AdminCustomerList />);
  await screen.findByText('private-customer@example.test');
  fireEvent.change(screen.getByLabelText('Tìm kiếm'), {
    target: { value: 'secret filter' },
  });
  act(() =>
    sessionStore.set({
      ...a,
      user: { ...a.user, id: 'admin-B', role: 'ADMIN' },
    }),
  );
  expect(screen.queryByText('private-customer@example.test')).toBeNull();
  expect(screen.getByLabelText('Tìm kiếm')).toHaveValue('');
  await screen.findByRole('alert');
});
it('keeps edited profile and passwords during same-owner renewal', async () => {
  auth.mockResolvedValue(a.user);
  render(<ProfileForm />);
  await screen.findByLabelText('Tên hiển thị');
  fireEvent.change(screen.getByLabelText('Tên hiển thị'), {
    target: { value: 'Local draft' },
  });
  fireEvent.change(screen.getByLabelText('Mật khẩu mới'), {
    target: { value: 'Local passphrase' },
  });
  act(() => sessionStore.set({ ...a, accessToken: 'renewed' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Tên hiển thị')).toHaveValue('Local draft'),
  );
  expect(screen.getByLabelText('Mật khẩu mới')).toHaveValue('Local passphrase');
  expect(auth).toHaveBeenCalledTimes(1);
});
