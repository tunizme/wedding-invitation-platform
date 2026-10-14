import { createBlankDocument } from '../../src/features/invitation-builder/document/editor-document';
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
import type { TemplateDetail } from '../../src/features/invitation-builder/api/client';
import type { OperationScope } from '../../src/features/identity-access/session/operation-scope';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  unpublish: vi.fn(),
  poll: vi.fn(),
  request: vi.fn(),
}));
vi.mock(
  '../../src/features/invitation-builder/api/operations',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../src/features/invitation-builder/api/operations')
    >()),
    enqueueTemplatePublication: mocks.enqueue,
    unpublishTemplate: mocks.unpublish,
    getPublicationOperation: mocks.poll,
  }),
);
vi.mock(
  '../../src/features/invitation-builder/api/client',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../src/features/invitation-builder/api/client')
    >()),
    builderRequest: mocks.request,
  }),
);
vi.mock(
  '../../src/features/invitation-builder/editor/geometry-controls',
  () => ({ GeometryControls: () => null }),
);
vi.mock('../../src/features/invitation-builder/renderer/scene-preview', () => ({
  ScenePreview: () => null,
}));
import TemplateEditor from '../../src/features/invitation-builder/editor/invitation-editor';
import { BuilderApiError } from '../../src/features/invitation-builder/api/client';
import { PublicationControls } from '../../src/features/invitation-builder/editor/publication-controls';
const template = {
  id: 'template',
  editVersion: 2,
  status: 'PUBLISHED',
} as TemplateDetail;
afterEach(cleanup);
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  sessionStore.clear();
  const session = privateSession();
  sessionStore.set({ ...session, user: { ...session.user, role: 'ADMIN' } });
  vi.clearAllMocks();
  mocks.enqueue.mockResolvedValue({
    status: 'SUCCEEDED',
    result: { resourceId: 'template', editVersion: 5, revisionId: 'revision' },
  });
  mocks.unpublish.mockResolvedValue(template);
});
describe('publication admission and owned workflow', () => {
  for (const status of ['DRAFT', 'PUBLISHED'] as const)
    for (const dirty of [false, true])
      it(`delivers confirmed ${status} publish lifecycle with dirty=${dirty} before a failed refresh`, async () => {
        const changed = vi.fn().mockRejectedValue(new Error('503'));
        render(
          <PublicationControls
            template={{ ...template, status }}
            dirty={dirty}
            saveBeforePublish={vi
              .fn()
              .mockResolvedValue({ ...template, editVersion: 4 })}
            onChanged={changed}
          />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Xuất bản' }));
        await waitFor(() =>
          expect(changed).toHaveBeenCalledWith({
            status: 'PUBLISHED',
            editVersion: 5,
            publishedRevisionId: 'revision',
          }),
        );
        await screen.findByText(/Đã xuất bản.*chưa tải/);
        fireEvent.click(
          screen.getByRole('button', { name: 'Thử tải lại thông tin' }),
        );
        await waitFor(() => expect(changed).toHaveBeenCalledTimes(2));
        expect(mocks.enqueue).toHaveBeenCalledOnce();
      });
  for (const operation of [
    {
      status: 'FAILED',
      result: null,
      error: { code: 'CONTENT_OVERFLOW', issues: [] },
    },
    {
      status: 'SUCCEEDED',
      result: {
        resourceId: 'another-template',
        editVersion: 99,
        revisionId: 'other-revision',
      },
    },
  ])
    it(`does not adopt ${operation.status} results for an unconfirmed resource`, async () => {
      mocks.enqueue.mockResolvedValue(operation);
      const changed = vi.fn();
      render(
        <PublicationControls
          template={template}
          dirty={false}
          saveBeforePublish={vi.fn()}
          onChanged={changed}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Xuất bản' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Xuất bản' })).toBeEnabled(),
      );
      expect(changed).not.toHaveBeenCalled();
    });
  it('delivers the committed unpublish result even when refresh fails', async () => {
    const committed = { ...template, status: 'UNPUBLISHED', editVersion: 3 };
    mocks.unpublish.mockResolvedValue(committed);
    const changed = vi.fn().mockRejectedValue(new Error('Refresh failed'));
    render(
      <PublicationControls
        template={template}
        dirty
        saveBeforePublish={vi.fn()}
        onChanged={changed}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ xuất bản' }));
    await waitFor(() => expect(changed).toHaveBeenCalledWith(committed));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Xuất bản' })).toBeEnabled(),
    );
  });
  it('does not advance the editor baseline when unpublish fails', async () => {
    mocks.unpublish.mockRejectedValue(new Error('Unpublish failed'));
    const changed = vi.fn();
    render(
      <PublicationControls
        template={template}
        dirty
        saveBeforePublish={vi.fn()}
        onChanged={changed}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ xuất bản' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Gỡ xuất bản' })).toBeEnabled(),
    );
    expect(changed).not.toHaveBeenCalled();
  });
  for (const dirty of [false, true])
    it(`blocks external operations with dirty=${dirty}, then recovers`, async () => {
      const save = vi.fn().mockResolvedValue({ ...template, editVersion: 3 });
      const changed = vi.fn().mockResolvedValue(undefined);
      const view = render(
        <PublicationControls
          template={template}
          dirty={dirty}
          externalBusy
          saveBeforePublish={save}
          onChanged={changed}
        />,
      );
      const publish = screen.getByRole('button', {
        name: 'Xuất bản',
      });
      const unpublish = screen.getByRole('button', { name: 'Gỡ xuất bản' });
      expect(publish).toBeDisabled();
      expect(unpublish).toBeDisabled();
      fireEvent.click(publish);
      fireEvent.click(unpublish);
      expect(save).not.toHaveBeenCalled();
      expect(mocks.enqueue).not.toHaveBeenCalled();
      expect(mocks.unpublish).not.toHaveBeenCalled();
      view.rerender(
        <PublicationControls
          template={template}
          dirty={dirty}
          externalBusy={false}
          saveBeforePublish={save}
          onChanged={changed}
        />,
      );
      fireEvent.click(publish);
      await waitFor(() => expect(changed).toHaveBeenCalledOnce());
      expect(mocks.enqueue).toHaveBeenCalledWith(
        'template',
        dirty ? 3 : 2,
        expect.any(String),
        expect.objectContaining({ scope: expect.any(Object) }),
      );
      expect(publish).toBeEnabled();
      fireEvent.click(unpublish);
      await waitFor(() => expect(mocks.unpublish).toHaveBeenCalledOnce());
    });
  it('checks the live gesture guard even before external state commits', () => {
    const save = vi.fn();
    render(
      <PublicationControls
        template={template}
        dirty={false}
        canStart={() => false}
        saveBeforePublish={save}
        onChanged={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Xuất bản' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ xuất bản' }));
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.unpublish).not.toHaveBeenCalled();
  });
  it('finishes its own save and refresh while external busy changes, without re-admission', async () => {
    let release!: (value: TemplateDetail) => void;
    const save = vi.fn(
      () =>
        new Promise<TemplateDetail>((resolve) => {
          release = resolve;
        }),
    );
    const changed = vi.fn().mockResolvedValue(undefined);
    const props = {
      template,
      dirty: true,
      saveBeforePublish: save,
      onChanged: changed,
    };
    const view = render(
      <PublicationControls {...props} externalBusy={false} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Xuất bản' }));
    view.rerender(<PublicationControls {...props} externalBusy />);
    release({ ...template, editVersion: 4 });
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(mocks.enqueue).toHaveBeenCalledWith(
      'template',
      4,
      expect.any(String),
      expect.objectContaining({ scope: expect.any(Object) }),
    );
    view.rerender(<PublicationControls {...props} externalBusy={false} />);
    expect(screen.getByRole('button', { name: 'Xuất bản' })).toBeEnabled();
  });
});

describe('publication owner disposal (005 US1)', () => {
  it('cancels the polling timer on unmount before any next request', async () => {
    vi.useFakeTimers();
    try {
      mocks.enqueue.mockResolvedValue({ id: 'operation-A', status: 'PENDING' });
      const view = render(
        <PublicationControls
          template={template}
          dirty={false}
          saveBeforePublish={vi.fn()}
          onChanged={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Xuất bản' }));
      await act(async () => {});
      view.unmount();
      await act(async () => vi.advanceTimersByTimeAsync(1000));
      expect(mocks.poll).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  function switchOwner() {
    const current = sessionStore.get()!;
    act(() =>
      sessionStore.set({
        ...current,
        user: { ...current.user, id: 'admin-B' },
      }),
    );
  }
  it('passes the captured scope to enqueue and stops polling after owner disposal', async () => {
    let finish!: (value: unknown) => void;
    mocks.enqueue.mockImplementation(
      () =>
        new Promise((done) => {
          finish = done;
        }),
    );
    const changed = vi.fn();
    render(
      <PublicationControls
        template={template}
        dirty={false}
        saveBeforePublish={vi.fn()}
        onChanged={changed}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Xuất bản' }));
    const scope = mocks.enqueue.mock.calls[0][3]?.scope as OperationScope;
    expect(scope).toBeDefined();
    switchOwner();
    await act(async () => finish({ id: 'operation-A', status: 'PENDING' }));
    expect(scope.signal.aborted).toBe(true);
    expect(mocks.poll).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });
  it('does not enqueue after a save completes on an unmounted editor', async () => {
    let finish!: (value: TemplateDetail) => void;
    const save = vi.fn(
      () =>
        new Promise<TemplateDetail>((done) => {
          finish = done;
        }),
    );
    const view = render(
      <PublicationControls
        template={template}
        dirty
        saveBeforePublish={save}
        onChanged={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Xuất bản' }));
    view.unmount();
    await act(async () => finish(template));
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it('fences retry feedback and busy callbacks when owner changes during reload', async () => {
    let finish!: () => void;
    const changed = vi
      .fn()
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockImplementationOnce(
        () =>
          new Promise<void>((done) => {
            finish = done;
          }),
      );
    const busy = vi.fn();
    render(
      <PublicationControls
        template={template}
        dirty={false}
        saveBeforePublish={vi.fn()}
        onChanged={changed}
        onBusy={busy}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Xuất bản' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Thử tải lại thông tin' }),
    );
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(2));
    busy.mockClear();
    switchOwner();
    await act(async () => finish());
    expect(screen.queryByText('Đã tải lại thông tin xuất bản.')).toBeNull();
    expect(busy).not.toHaveBeenCalled();
  });
  it('disposes an unpublish request before its onChanged continuation', async () => {
    let finish!: (value: TemplateDetail) => void;
    mocks.unpublish.mockImplementation(
      () =>
        new Promise<TemplateDetail>((done) => {
          finish = done;
        }),
    );
    const changed = vi.fn();
    const view = render(
      <PublicationControls
        template={template}
        dirty={false}
        saveBeforePublish={vi.fn()}
        onChanged={changed}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ xuất bản' }));
    const scope = mocks.unpublish.mock.calls[0][2]?.scope as OperationScope;
    expect(scope).toBeDefined();
    view.unmount();
    await act(async () => finish(template));
    expect(scope.signal.aborted).toBe(true);
    expect(changed).not.toHaveBeenCalled();
  });
});

describe('template publication refresh versus external edits', () => {
  it('disposes editor asset and save scopes on owner switch while renewal retains edits', async () => {
    const document = createBlankDocument();
    const initial = {
      ...template,
      name: 'Template A',
      category: 'Wedding',
      tags: [],
      sortOrder: 0,
      coverAssetId: null,
      draftDocument: document,
      draftSampleData: { schemaVersion: 1 },
    } as TemplateDetail;
    let finish!: (value: TemplateDetail) => void;
    mocks.request.mockImplementation(
      (path: string, options?: { method?: string }) => {
        if (options?.method === 'PATCH')
          return new Promise<TemplateDetail>((done) => {
            finish = done;
          });
        return Promise.resolve({ items: [], nextCursor: null });
      },
    );
    const saved = vi.fn();
    render(<TemplateEditor initial={initial} onSaved={saved} />);
    fireEvent.change(await screen.findByLabelText('Chiều cao'), {
      target: { value: '1800' },
    });
    fireEvent.blur(screen.getByLabelText('Chiều cao'));
    const a = sessionStore.get()!;
    act(() => sessionStore.set({ ...a, accessToken: 'renewed' }));
    expect(screen.getByLabelText('Chiều cao')).toHaveValue(1800);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    const request = mocks.request.mock.calls.find(
      ([, options]) => options?.method === 'PATCH',
    );
    const scope = request?.[1]?.scope as OperationScope;
    expect(scope).toBeDefined();
    act(() => sessionStore.set({ ...a, user: { ...a.user, id: 'admin-B' } }));
    await act(async () => finish({ ...initial, editVersion: 3 }));
    expect(scope.signal.aborted).toBe(true);
    expect(saved).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Chiều cao')).toHaveValue(2000);
  });
  for (const retry of [false, true])
    for (const dirty of [false, true])
      it(`preserves the write baseline with retry=${retry} and save-before-publish=${dirty}`, async () => {
        const document = createBlankDocument();
        const initial: TemplateDetail = {
          ...template,
          status: 'DRAFT',
          name: 'Template A',
          category: 'Wedding',
          tags: [],
          sortOrder: 0,
          coverAssetId: null,
          coverUrl: null,
          publishedRevisionId: null,
          draftDocument: document,
          draftSampleData: { schemaVersion: 1 },
          createdBy: 'admin',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        };
        const remote: TemplateDetail = {
          ...initial,
          editVersion: 6,
          status: 'PUBLISHED',
          name: 'Remote metadata',
          draftDocument: structuredClone(document),
          draftSampleData: {
            schemaVersion: 1,
            bride: { name: 'Remote sample' },
          },
          publishedRevisionId: 'revision',
        };
        if (remote.draftDocument.schemaVersion !== 3)
          throw new Error('Expected500 fixture');
        remote.draftDocument.nodes.ROOT.props.canvas.height = 2200;
        let failRead = retry;
        const patches: { expectedVersion: number }[] = [];
        mocks.request.mockImplementation(
          async (
            path: string,
            options?: {
              method?: string;
              body?: {
                expectedVersion: number;
                document: TemplateDetail['draftDocument'];
                sampleData: TemplateDetail['draftSampleData'];
              };
            },
          ) => {
            if (path.startsWith('/admin/template-assets'))
              return { items: [], nextCursor: null };
            if (options?.method === 'PATCH') {
              patches.push(options.body!);
              if (patches.length === 1 && dirty)
                return {
                  ...initial,
                  editVersion: 4,
                  draftDocument: options.body!.document,
                  draftSampleData: options.body!.sampleData,
                };
              throw new BuilderApiError(409, 'VERSION_CONFLICT');
            }
            if (failRead) throw new BuilderApiError(503, 'STORAGE_UNAVAILABLE');
            return remote;
          },
        );
        const onSaved = vi.fn();
        render(<TemplateEditor initial={initial} onSaved={onSaved} />);
        await screen.findByLabelText('Chiều cao');
        if (dirty) {
          fireEvent.change(screen.getByLabelText('Chiều cao'), {
            target: { value: '1800' },
          });
          fireEvent.blur(screen.getByLabelText('Chiều cao'));
        }
        fireEvent.click(screen.getByRole('button', { name: 'Xuất bản' }));
        await screen.findByRole('button', { name: 'Thử tải lại thông tin' });
        if (retry) {
          failRead = false;
          fireEvent.click(
            screen.getByRole('button', { name: 'Thử tải lại thông tin' }),
          );
        }
        await screen.findByText(/phiên bản mới.*Bản sửa/);
        expect(onSaved.mock.calls.at(-1)?.[0].editVersion).toBe(5);
        expect(screen.getByLabelText('Chiều cao')).toHaveValue(
          dirty ? 1800 : 2000,
        );
        expect(
          screen.getByRole('heading', { name: 'Template A' }),
        ).toBeVisible();
        fireEvent.change(screen.getByLabelText('Chiều cao'), {
          target: { value: '1900' },
        });
        fireEvent.blur(screen.getByLabelText('Chiều cao'));
        fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
        await waitFor(() => expect(patches.at(-1)?.expectedVersion).toBe(5));
        expect(
          screen.getByText('Phiên bản đã đổi. Bản sửa của bạn vẫn được giữ.'),
        ).toBeVisible();
      });
});
