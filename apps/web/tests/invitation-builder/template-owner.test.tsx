import { scalePrimitiveDocument } from '../../src/features/invitation-builder/document/editor-document';
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
vi.mock(
  '../../src/features/invitation-builder/editor/invitation-editor',
  () => ({
    default: ({ initial }: { initial: { name: string } }) => (
      <h1>{initial.name}</h1>
    ),
  }),
);
vi.mock('../../src/features/invitation-builder/api/client', async (load) => ({
  ...(await load<
    typeof import('../../src/features/invitation-builder/api/client')
  >()),
  builderRequest: mocks.request,
}));
import {
  TemplateList,
  NewTemplate,
  EditTemplate,
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
describe('template pages owner lifetime (005 US1)', () => {
  it('does not reload B after a duplicate requested by A completes', async () => {
    let finish!: (value: unknown) => void;
    mocks.request.mockImplementation(
      (path: string, options?: { method?: string }) => {
        if (options?.method === 'POST')
          return new Promise((done) => {
            finish = done;
          });
        if (path.includes('templates'))
          return Promise.resolve({
            items: [{ id: 'A', name: 'Template A', editVersion: 1 }],
            nextCursor: null,
          });
      },
    );
    render(<TemplateList />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Nhân bản Template A' }),
    );
    fireEvent.change(screen.getByLabelText('Tên bản sao'), {
      target: { value: 'Copy' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Nhân bản mẫu' }));
    const scope = mocks.request.mock.calls.find(
      ([, options]) => options?.method === 'POST',
    )?.[1].scope as OperationScope;
    expect(scope).toBeDefined();
    switchOwner();
    const calls = mocks.request.mock.calls.length;
    await act(async () => finish({ id: 'copy-A' }));
    expect(scope.signal.aborted).toBe(true);
    expect(mocks.request).toHaveBeenCalledTimes(calls);
    vi.restoreAllMocks();
  });
  it('disposes A list request and never restores its records after B load fails', async () => {
    let resolveA!: (value: unknown) => void;
    mocks.request.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolveA = done;
        }),
    );
    mocks.request.mockRejectedValue(new Error('B unavailable'));
    render(<TemplateList />);
    const scope = mocks.request.mock.calls[0][1]?.scope as OperationScope;
    expect(scope).toBeDefined();
    switchOwner();
    await act(async () =>
      resolveA({ items: [{ id: 'A', name: 'Private A' }], nextCursor: null }),
    );
    await screen.findByRole('alert');
    expect(scope.signal.aborted).toBe(true);
    expect(screen.queryByText('Private A')).toBeNull();
  });
  it('does not navigate after A create completes in B and keeps fields on renewal', async () => {
    let resolveA!: (value: unknown) => void;
    mocks.request.mockImplementation(
      () =>
        new Promise((done) => {
          resolveA = done;
        }),
    );
    render(<NewTemplate />);
    fireEvent.change(screen.getByLabelText('Tên mẫu'), {
      target: { value: 'Draft A' },
    });
    act(() => sessionStore.set({ ...admin, accessToken: 'renewed' }));
    expect(screen.getByLabelText('Tên mẫu')).toHaveValue('Draft A');
    fireEvent.click(screen.getByRole('button', { name: 'Tạo mẫu' }));
    const scope = mocks.request.mock.calls[0][1]?.scope as OperationScope;
    expect(scope).toBeDefined();
    switchOwner();
    await act(async () => resolveA({ id: 'created-A' }));
    expect(scope.signal.aborted).toBe(true);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Tên mẫu')).toHaveValue('');
  });
  it('disposes detail requests when the template resource changes', async () => {
    let resolveA!: (value: unknown) => void;
    mocks.request.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolveA = done;
        }),
    );
    mocks.request.mockResolvedValue({
      id: 'B',
      name: 'Template B',
      draftDocument: { schemaVersion: 1 },
    });
    const view = render(<EditTemplate id="A" />);
    const scope = mocks.request.mock.calls[0][1]?.scope as OperationScope;
    expect(scope).toBeDefined();
    view.rerender(<EditTemplate id="B" />);
    await act(async () => resolveA({ id: 'A', name: 'Private A' }));
    await waitFor(() =>
      expect(screen.getByRole('heading')).toHaveTextContent('Template B'),
    );
    expect(scope.signal.aborted).toBe(true);
    expect(screen.queryByText('Private A')).toBeNull();
  });
});

// 005 US6: catalog selection is now a modal before pinned creation.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CustomerTemplatePicker } from '../../src/features/invitations/customer-pages';
import { TemplateDemo } from '../../src/features/invitations/template-demo';
vi.mock('../../src/features/invitations/public-invitation-view', () => ({
  PublicInvitationView: ({
    context,
    hostPolicy,
  }: {
    context: { mode: string };
    hostPolicy: string;
  }) => (
    <div
      data-testid="catalog-renderer"
      data-mode={context.mode}
      data-policy={hostPolicy}
    />
  ),
}));
const templateId = '30000000-0000-4000-8000-000000000002';
const revisionId = '40000000-0000-4000-8000-000000000002';
const choice = {
  id: templateId,
  name: 'Mẫu riêng A',
  category: 'Tối giản',
  tags: ['Thanh lịch'],
  coverUrl: `/api/v1/templates/${templateId}/cover`,
  publishedRevisionId: revisionId,
};
const corpus = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      '../../../../specs/004-invitation-builder/contracts/fixtures/binding-optional-fallback.json',
    ),
    'utf8',
  ),
);
const revision = {
  id: templateId,
  revisionId,
  document: scalePrimitiveDocument(corpus.document),
  sampleData: corpus.weddingData,
  formFields: [],
};
describe('catalog popup and demo (005 US6)', () => {
  beforeEach(() => {
    sessionStore.set(a);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cover');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    mocks.request.mockImplementation(
      (path: string, options?: { method?: string }) => {
        if (options?.method === 'POST')
          return Promise.resolve({ id: 'created' });
        if (path.includes('/revisions/')) return Promise.resolve(revision);
        if (path.includes('/cover')) return Promise.resolve(new Blob());
        return Promise.resolve({ items: [choice], nextCursor: null });
      },
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('opens a popup without creating or navigating, then creates exactly the selected revision', async () => {
    render(<CustomerTemplatePicker />);
    const trigger = await screen.findByRole('button', {
      name: 'Xem mẫu Mẫu riêng A',
    });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole('dialog', { name: 'Mẫu riêng A' });
    await screen.findByTestId('catalog-renderer');
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.request.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(
      false,
    );
    expect(screen.getByTestId('catalog-renderer')).toHaveAttribute(
      'data-policy',
      'mobile',
    );
    expect(screen.getByRole('link', { name: 'Xem demo' })).toHaveAttribute(
      'href',
      `/templates/${templateId}/demo?revision=${revisionId}`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Chọn mẫu này' }));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/invitations/created/edit'),
    );
    expect(mocks.request).toHaveBeenCalledWith(
      '/invitations',
      expect.objectContaining({
        method: 'POST',
        body: { templateId, designRevisionId: revisionId },
        scope: expect.anything(),
      }),
    );
  });
  it('cancels a pending revision on close and ignores its late result', async () => {
    let finish!: (value: unknown) => void;
    mocks.request.mockImplementation((path: string) =>
      path.includes('/revisions/')
        ? new Promise((done) => {
            finish = done;
          })
        : Promise.resolve(
            path.includes('/cover')
              ? new Blob()
              : { items: [choice], nextCursor: null },
          ),
    );
    render(<CustomerTemplatePicker />);
    const trigger = await screen.findByRole('button', {
      name: 'Xem mẫu Mẫu riêng A',
    });
    trigger.focus();
    fireEvent.click(trigger);
    const call = mocks.request.mock.calls.find(([path]) =>
      path.includes('/revisions/'),
    )!;
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(trigger).toHaveFocus();
    expect(call[1].scope.signal.aborted).toBe(true);
    await act(async () => finish(revision));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTestId('catalog-renderer')).toBeNull();
  });
  it('never admits a pending create after the account changes', async () => {
    let finish!: (value: unknown) => void;
    mocks.request.mockImplementation(
      (path: string, options?: { method?: string }) =>
        options?.method === 'POST'
          ? new Promise((done) => {
              finish = done;
            })
          : Promise.resolve(
              path.includes('/revisions/')
                ? revision
                : path.includes('/cover')
                  ? new Blob()
                  : { items: [choice], nextCursor: null },
            ),
    );
    render(<CustomerTemplatePicker />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Xem mẫu Mẫu riêng A' }),
    );
    await screen.findByTestId('catalog-renderer');
    fireEvent.click(screen.getByRole('button', { name: 'Chọn mẫu này' }));
    const call = mocks.request.mock.calls.find(
      ([, options]) => options?.method === 'POST',
    )!;
    act(() => sessionStore.set({ ...a, user: { ...a.user, id: 'B' } }));
    await act(async () => finish({ id: 'private-A' }));
    expect(call[1].scope.signal.aborted).toBe(true);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('requires reloading an unavailable revision rather than creating from it', async () => {
    const { BuilderApiError } =
      await import('../../src/features/invitation-builder/api/client');
    mocks.request.mockImplementation((path: string) =>
      path.includes('/revisions/')
        ? Promise.reject(new BuilderApiError(404, 'TEMPLATE_UNAVAILABLE'))
        : Promise.resolve(
            path.includes('/cover')
              ? new Blob()
              : { items: [choice], nextCursor: null },
          ),
    );
    render(<CustomerTemplatePicker />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Xem mẫu Mẫu riêng A' }),
    );
    await screen.findByText(/Mẫu đã thay đổi hoặc không còn khả dụng/);
    expect(screen.getByRole('button', { name: 'Chọn mẫu này' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Tải lại kho mẫu' }),
    ).toBeEnabled();
  });
  it('blocks replay of an uncertain create even after closing and reopening the popup', async () => {
    const { BuilderApiError } =
      await import('../../src/features/invitation-builder/api/client');
    mocks.request.mockImplementation(
      (path: string, options?: { method?: string }) => {
        if (options?.method === 'POST')
          return Promise.reject(new BuilderApiError(0, 'NETWORK_ERROR'));
        if (path.includes('/revisions/')) return Promise.resolve(revision);
        if (path.includes('/cover')) return Promise.resolve(new Blob());
        return Promise.resolve({ items: [choice], nextCursor: null });
      },
    );
    render(<CustomerTemplatePicker />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Xem mẫu Mẫu riêng A' }),
    );
    await screen.findByTestId('catalog-renderer');
    fireEvent.click(screen.getByRole('button', { name: 'Chọn mẫu này' }));
    await screen.findByText(/Chưa xác định thiệp đã được tạo/);
    expect(screen.getByRole('button', { name: 'Chọn mẫu này' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Xem mẫu Mẫu riêng A' }),
    );
    await screen.findByTestId('catalog-renderer');
    expect(screen.getByRole('button', { name: 'Chọn mẫu này' })).toBeDisabled();
    expect(
      mocks.request.mock.calls.filter(
        ([, options]) => options?.method === 'POST',
      ),
    ).toHaveLength(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it('aborts pending protected assets on close without admitting late object URLs', async () => {
    const document = scalePrimitiveDocument(corpus.document);
    document.nodes.ROOT.props.canvas.background = {
      kind: 'asset',
      assetId: '70000000-0000-4000-8000-000000000100',
      fit: 'cover',
      positionX: 0.5,
      positionY: 0.5,
    };
    document.settings.shareImageId = '70000000-0000-4000-8000-000000000101';
    const completions: Array<() => void> = [];
    mocks.request.mockImplementation((path: string) => {
      if (path.includes('/assets/'))
        return new Promise((done) => completions.push(() => done(new Blob())));
      if (path.includes('/revisions/'))
        return Promise.resolve({
          ...revision,
          document,
          sampleData: { ...revision.sampleData, bride: { name: 'Anh' } },
        });
      if (path.includes('/cover')) return Promise.resolve(new Blob());
      return Promise.resolve({ items: [choice], nextCursor: null });
    });
    render(<CustomerTemplatePicker />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Xem mẫu Mẫu riêng A' }),
    );
    await waitFor(() => expect(completions).toHaveLength(2));
    const assets = mocks.request.mock.calls.filter(([path]) =>
      path.includes('/assets/'),
    );
    const before = vi.mocked(URL.createObjectURL).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(assets.every(([, options]) => options.scope.signal.aborted)).toBe(
      true,
    );
    await act(async () => completions.forEach((complete) => complete()));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(before);
    expect(screen.queryByTestId('catalog-renderer')).toBeNull();
  });
  it('opens demo only on user action with inert RSVP and adaptive renderer', async () => {
    render(<TemplateDemo id={templateId} revisionId={revisionId} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Mở thiệp' })).toBeEnabled(),
    );
    expect(screen.queryByTestId('catalog-renderer')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mở thiệp' }));
    expect(await screen.findByTestId('catalog-renderer')).toHaveAttribute(
      'data-mode',
      'preview',
    );
    expect(screen.getByTestId('catalog-renderer')).toHaveAttribute(
      'data-policy',
      'adaptive',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Xem lại lời mời' }));
    expect(screen.queryByTestId('catalog-renderer')).toBeNull();
  });
});
