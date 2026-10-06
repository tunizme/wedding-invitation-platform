import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateDetail } from '../../src/features/invitation-builder/api/client';
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
import TemplateEditor from '../../src/features/invitation-builder/editor/template-editor';
import { BuilderApiError } from '../../src/features/invitation-builder/api/client';
import { PublicationControls } from '../../src/features/invitation-builder/editor/publication-controls';
const template = {
  id: 'template',
  editVersion: 2,
  status: 'PUBLISHED',
} as TemplateDetail;
afterEach(cleanup);
beforeEach(() => {
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
    );
    view.rerender(<PublicationControls {...props} externalBusy={false} />);
    expect(screen.getByRole('button', { name: 'Xuất bản' })).toBeEnabled();
  });
});

describe('template publication refresh versus external edits', () => {
  for (const retry of [false, true])
    for (const dirty of [false, true])
      it(`preserves the write baseline with retry=${retry} and save-before-publish=${dirty}`, async () => {
        const document = JSON.parse(
          readFileSync(
            resolve(
              __dirname,
              '../../../../specs/004-invitation-builder/contracts/fixtures/blank.json',
            ),
            'utf8',
          ),
        );
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
        await screen.findByLabelText('Chiều cao thiệp');
        if (dirty) {
          fireEvent.change(screen.getByLabelText('Chiều cao thiệp'), {
            target: { value: '1800' },
          });
          fireEvent.blur(screen.getByLabelText('Chiều cao thiệp'));
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
        expect(screen.getByLabelText('Chiều cao thiệp')).toHaveValue(
          dirty ? 1800 : 1600,
        );
        expect(screen.getByLabelText('Tên mẫu')).toHaveValue('Template A');
        fireEvent.change(screen.getByLabelText('Chiều cao thiệp'), {
          target: { value: '1900' },
        });
        fireEvent.blur(screen.getByLabelText('Chiều cao thiệp'));
        fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
        await waitFor(() => expect(patches.at(-1)?.expectedVersion).toBe(5));
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        fireEvent.click(
          screen.getByRole('button', {
            name: 'Tải lại bản đã lưu',
          }),
        );
        await waitFor(() =>
          expect(screen.getByLabelText('Chiều cao thiệp')).toHaveValue(2200),
        );
        expect(onSaved.mock.calls.at(-1)?.[0].editVersion).toBe(6);
        vi.restoreAllMocks();
      });
});
