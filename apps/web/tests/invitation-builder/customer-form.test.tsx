import { scalePrimitiveDocument } from '../../src/features/invitation-builder/document/editor-document';
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
import type { TemplateDesign } from '../../src/features/invitation-builder/document/types';
import type { InvitationDetail } from '../../src/features/invitations/api';

const mocks = vi.hoisted(() => ({
  getInvitation: vi.fn(),
  saveInvitation: vi.fn(),
  publishInvitation: vi.fn(),
  unpublishInvitation: vi.fn(),
  builderRequest: vi.fn(),
  getPublicationOperation: vi.fn(),
  // Trailing scope options passed to the invitation API, recorded per request.
  scoped: [] as { request: string; options: unknown }[],
  session: {
    user: { id: 'fixture-customer', role: 'CUSTOMER', status: 'ACTIVE' },
  },
}));
vi.mock('../../src/features/identity-access/session/store', () => ({
  sessionStore: {
    identityEpoch: () => 1,
    subscribe: () => () => undefined,
    get: () => mocks.session,
  },
}));
vi.mock('../../src/features/invitations/api', () => {
  // Strip the trailing { scope } options so existing assertions keep checking
  // only the domain arguments; the options are recorded for the scope test.
  const strip =
    (name: string, fn: (...args: unknown[]) => unknown, domainArgs: number) =>
    (...args: unknown[]) => {
      mocks.scoped.push({ request: name, options: args[domainArgs] });
      return fn(...args.slice(0, domainArgs));
    };
  return {
    getInvitation: strip('getInvitation', mocks.getInvitation, 1),
    saveInvitation: strip('saveInvitation', mocks.saveInvitation, 3),
    publishInvitation: strip('publishInvitation', mocks.publishInvitation, 3),
    unpublishInvitation: strip(
      'unpublishInvitation',
      mocks.unpublishInvitation,
      2,
    ),
  };
});
vi.mock(
  '../../src/features/invitation-builder/api/client',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../src/features/invitation-builder/api/client')
    >()),
    builderRequest: mocks.builderRequest,
  }),
);
vi.mock(
  '../../src/features/invitation-builder/api/operations',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../src/features/invitation-builder/api/operations')
    >()),
    getPublicationOperation: mocks.getPublicationOperation,
  }),
);
vi.mock('../../src/features/invitations/public-invitation-view', () => ({
  PublicInvitationView: () => <div data-testid="preview-scene" />,
}));
vi.mock('../../src/features/invitation-builder/renderer/scene-preview', () => ({
  ScenePreview: ({ children }: { children: import('react').ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock('../../src/ui/platform/modal-surface', () => ({
  ModalSurface: ({
    label,
    children,
    onClose,
    closeLabel = 'Đóng',
  }: {
    label: string;
    children: import('react').ReactNode;
    onClose: () => void;
    closeLabel?: string;
  }) => (
    <div role="dialog" aria-label={label}>
      <button onClick={onClose}>{closeLabel}</button>
      {children}
    </div>
  ),
}));
import { BuilderApiError } from '../../src/features/invitation-builder/api/client';
import { CustomerInvitationForm } from '../../src/features/invitations/customer-invitation-form';

const fixturePath = resolve(
  __dirname,
  '../../../../specs/004-invitation-builder/contracts/fixtures/binding-optional-fallback.json',
);
const design = (
  JSON.parse(readFileSync(fixturePath, 'utf8')) as { document: TemplateDesign }
).document;
const detail: InvitationDetail = {
  id: '00000000-0000-4000-8000-000000000001',
  status: 'DRAFT',
  publicUrl: null,
  publicVersion: 0,
  editVersion: 1,
  controlVersion: 1,
  rsvpOpen: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ownerId: '00000000-0000-4000-8000-000000000002',
  createdBy: '00000000-0000-4000-8000-000000000002',
  templateId: '00000000-0000-4000-8000-000000000003',
  designRevisionId: '00000000-0000-4000-8000-000000000004',
  draftWeddingData: { schemaVersion: 1 },
  templateName: 'Mẫu mùa xuân',
  document: scalePrimitiveDocument(design),
  formFields: [
    {
      id: 'bride.name',
      label: 'Tên cô dâu',
      type: 'text',
      essential: true,
      required: true,
    },
    {
      id: 'groom.name',
      label: 'Tên chú rể',
      type: 'text',
      essential: true,
      required: false,
    },
    {
      id: 'wedding.date',
      label: 'Ngày cưới',
      type: 'date-time',
      essential: true,
      required: true,
      eventKey: 'ceremony',
    },
    {
      id: 'wedding.time',
      label: 'Giờ cưới',
      type: 'date-time',
      essential: true,
      required: true,
      eventKey: 'ceremony',
    },
  ],
};

describe('customer invitation form', () => {
  it('writes native calendar edits in the declared event zone using valid offset ISO', async () => {
    mocks.getInvitation.mockResolvedValue({
      ...detail,
      draftWeddingData: {
        schemaVersion: 1,
        bride: { name: 'Mai' },
        events: {
          ceremony: {
            datetime: '2027-01-10T10:00:00+07:00',
            timeZone: 'Asia/Ho_Chi_Minh',
          },
        },
      },
    });
    mocks.saveInvitation.mockImplementation(
      async (_id, _version, weddingData) => ({
        ...detail,
        editVersion: 2,
        draftWeddingData: weddingData,
      }),
    );
    render(<CustomerInvitationForm id={detail.id} />);
    const date = await screen.findByLabelText('Ngày và giờ tổ chức');
    expect(date).toHaveValue('2027-01-10T10:00');
    fireEvent.change(date, { target: { value: '2027-01-10T11:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    await waitFor(() =>
      expect(mocks.saveInvitation).toHaveBeenCalledWith(
        detail.id,
        1,
        expect.objectContaining({
          events: {
            ceremony: {
              datetime: '2027-01-10T11:30:00+07:00',
              timeZone: 'Asia/Ho_Chi_Minh',
            },
          },
        }),
      ),
    );
  });
  afterEach(cleanup);
  beforeEach(() => {
    mocks.scoped.length = 0;
    for (const key of [
      'getInvitation',
      'saveInvitation',
      'publishInvitation',
      'unpublishInvitation',
      'builderRequest',
      'getPublicationOperation',
    ] as const)
      mocks[key].mockReset();
    mocks.getInvitation.mockResolvedValue(structuredClone(detail));
    mocks.builderRequest.mockResolvedValue({ items: [], nextCursor: null });
    mocks.saveInvitation.mockImplementation(
      (
        _id: string,
        _version: number,
        data: InvitationDetail['draftWeddingData'],
      ) =>
        Promise.resolve({ ...detail, editVersion: 2, draftWeddingData: data }),
    );
  });

  it('retains loaded preview image URLs across a save with unchanged assets and revokes them on unmount', async () => {
    const assetId = '00000000-0000-4000-8000-000000000005';
    const document = structuredClone(design);
    document.nodes.ROOT.props.canvas.background = {
      kind: 'asset',
      assetId,
      fit: 'cover',
      positionX: 0.5,
      positionY: 0.5,
    };
    const initial = { ...detail, document: scalePrimitiveDocument(document) };
    mocks.getInvitation.mockResolvedValue(initial);
    mocks.saveInvitation.mockImplementation(
      (
        _id: string,
        _version: number,
        data: InvitationDetail['draftWeddingData'],
      ) =>
        Promise.resolve({ ...initial, editVersion: 2, draftWeddingData: data }),
    );
    mocks.builderRequest.mockImplementation((path: string) =>
      Promise.resolve(
        path === '/assets'
          ? { items: [], nextCursor: null }
          : new Blob(['image'], { type: 'image/png' }),
      ),
    );
    const createUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:stable-preview');
    const revokeUrl = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});
    try {
      const view = render(<CustomerInvitationForm id={detail.id} />);
      await waitFor(() => expect(createUrl).toHaveBeenCalledOnce());
      fireEvent.change(screen.getByLabelText('Tên cô dâu'), {
        target: { value: 'Ngọc Anh' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
      await screen.findByText('Đã lưu bản nháp.');
      expect(
        mocks.builderRequest.mock.calls.filter(
          ([path]) => path === `/assets/${assetId}/content`,
        ),
      ).toHaveLength(1);
      expect(createUrl).toHaveBeenCalledOnce();
      expect(revokeUrl).not.toHaveBeenCalled();
      view.unmount();
      expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:stable-preview');
    } finally {
      createUrl.mockRestore();
      revokeUrl.mockRestore();
    }
  });

  it('retains one set of dirty fields and accordion state across edit and preview tabs', async () => {
    render(<CustomerInvitationForm id={detail.id} />);
    fireEvent.change(await screen.findByLabelText('Tên cô dâu'), {
      target: { value: 'Ngọc Anh' },
    });
    const group = screen.getByText('Thông tin cơ bản').closest('details')!;
    group.open = false;
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước' }));
    expect(
      screen.getByRole('region', { name: 'Xem trước thiệp' }),
    ).toBeVisible();
    expect(screen.getAllByLabelText('Tên cô dâu')).toHaveLength(1);
    expect(mocks.saveInvitation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
    expect(screen.getByLabelText('Tên cô dâu')).toHaveValue('Ngọc Anh');
    expect(group.open).toBe(false);
    expect(screen.getByRole('button', { name: 'Lưu bản nháp' })).toBeEnabled();
  });
  it('reports a failed clipboard share without changing or republishing the saved invitation', async () => {
    mocks.getInvitation.mockResolvedValue({
      ...detail,
      status: 'PUBLISHED',
      publicUrl: '/i/saved',
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(<CustomerInvitationForm id={detail.id} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Sao chép liên kết' }),
    );
    await screen.findByText(
      'Không thể sao chép. Bạn có thể mở thiệp công khai và sao chép địa chỉ.',
    );
    expect(mocks.publishInvitation).not.toHaveBeenCalled();
    expect(
      screen.getByRole('link', { name: 'Xem thiệp công khai' }),
    ).toHaveAttribute('href', '/i/saved');
  });
  it('recovers an uncertain publication with the original key and version while retaining newer local edits', async () => {
    mocks.publishInvitation.mockRejectedValueOnce(
      new BuilderApiError(0, 'NETWORK_ERROR'),
    );
    render(<CustomerInvitationForm id={detail.id} />);
    fireEvent.change(await screen.findByLabelText('Tên cô dâu'), {
      target: { value: 'Saved name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xuất bản thiệp' }));
    await screen.findByText(/Chưa xác định kết quả xuất bản/);
    const original = mocks.publishInvitation.mock.calls[0];
    fireEvent.change(screen.getByLabelText('Tên cô dâu'), {
      target: { value: 'Newer local name' },
    });
    expect(
      screen.getByRole('button', { name: 'Xuất bản thiệp' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lưu bản nháp' })).toBeDisabled();
    mocks.publishInvitation.mockResolvedValueOnce({
      id: 'operation-1',
      status: 'SUCCEEDED',
      result: { resourceId: detail.id, editVersion: 3, publicVersion: 1 },
    });
    mocks.getInvitation.mockResolvedValue({
      ...detail,
      status: 'PUBLISHED',
      editVersion: 3,
      publicVersion: 1,
      publicUrl: '/i/confirmed',
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Kiểm tra lại xuất bản' }),
    );
    await screen.findByRole('link', { name: 'Xem thiệp công khai' });
    expect(mocks.publishInvitation.mock.calls[1]).toEqual(original);
    expect(mocks.saveInvitation).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Tên cô dâu')).toHaveValue('Newer local name');
    expect(
      screen.queryByRole('button', { name: 'Kiểm tra lại xuất bản' }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Lưu bản nháp' })).toBeEnabled();
  });

  it('recovers a known pending operation with GET only after polling fails', async () => {
    mocks.publishInvitation.mockResolvedValueOnce({
      id: 'operation-known',
      status: 'PENDING',
    });
    mocks.getPublicationOperation.mockRejectedValueOnce(
      new BuilderApiError(0, 'REQUEST_CANCELLED'),
    );
    render(<CustomerInvitationForm id={detail.id} />);
    await screen.findByLabelText('Tên cô dâu');
    fireEvent.click(screen.getByRole('button', { name: 'Xuất bản thiệp' }));
    await screen.findByText(
      /Chưa xác định kết quả xuất bản/,
      {},
      { timeout: 2500 },
    );
    mocks.getPublicationOperation.mockResolvedValueOnce({
      id: 'operation-known',
      status: 'FAILED',
      error: { code: 'RENDER_UNAVAILABLE', issues: [] },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Kiểm tra lại xuất bản' }),
    );
    await screen.findByText(/Chưa xuất bản được: RENDER_UNAVAILABLE/);
    expect(mocks.publishInvitation).toHaveBeenCalledOnce();
    expect(mocks.getPublicationOperation).toHaveBeenLastCalledWith(
      'operation-known',
      expect.objectContaining({ scope: expect.anything() }),
    );
    expect(
      screen.getByRole('button', { name: 'Xuất bản thiệp' }),
    ).toBeEnabled();
  });

  it('keeps the editor usable when its asset library fails and retries the library without losing edits', async () => {
    mocks.builderRequest.mockRejectedValueOnce(
      new BuilderApiError(503, 'ASSETS_UNAVAILABLE'),
    );
    render(<CustomerInvitationForm id={detail.id} />);
    fireEvent.change(await screen.findByLabelText('Tên cô dâu'), {
      target: { value: 'Kept edit' },
    });
    mocks.builderRequest.mockResolvedValueOnce({ items: [], nextCursor: null });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Thử tải lại thư viện ảnh' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Thử tải lại thư viện ảnh' }),
      ).toBeNull(),
    );
    expect(screen.getByLabelText('Tên cô dâu')).toHaveValue('Kept edit');
    expect(mocks.getInvitation).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    await waitFor(() => expect(mocks.saveInvitation).toHaveBeenCalledOnce());
  });

  it('binds an uploaded customer image using the captured owner scope and retains other draft data', async () => {
    const assetId = '00000000-0000-4000-8000-000000000005';
    mocks.getInvitation.mockResolvedValue({
      ...detail,
      formFields: [
        ...detail.formFields,
        {
          id: 'bride.photo',
          label: 'Ảnh cô dâu',
          type: 'asset',
          essential: true,
          required: false,
        },
      ],
    });
    render(<CustomerInvitationForm id={detail.id} />);
    fireEvent.change(await screen.findByLabelText('Tên cô dâu'), {
      target: { value: 'Kept name' },
    });
    mocks.builderRequest.mockResolvedValueOnce({
      id: assetId,
      name: 'Uploaded photo',
    });
    const file = new File(['photo'], 'wedding.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Tải ảnh mới'), {
      target: { files: [file] },
    });
    await screen.findByRole('option', { name: 'Uploaded photo' });
    expect(screen.getByLabelText('Ảnh đã tải lên')).toHaveValue(assetId);
    expect(mocks.builderRequest).toHaveBeenLastCalledWith(
      '/assets',
      expect.objectContaining({
        method: 'POST',
        form: expect.any(FormData),
        scope: expect.objectContaining({
          resource: expect.stringContaining('CustomerInvitation'),
        }),
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    await waitFor(() =>
      expect(mocks.saveInvitation).toHaveBeenCalledWith(
        detail.id,
        1,
        expect.objectContaining({
          bride: { name: 'Kept name', photo: assetId },
        }),
      ),
    );
  });

  it('passes a captured owner scope to every invitation request so owner disposal can cancel it', async () => {
    mocks.publishInvitation.mockResolvedValue({
      status: 'SUCCEEDED',
      result: { resourceId: detail.id, editVersion: 3, publicVersion: 2 },
    });
    render(<CustomerInvitationForm id={detail.id} />);
    fireEvent.change(await screen.findByLabelText('Tên cô dâu'), {
      target: { value: 'Scoped edit' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xuất bản thiệp' }));
    await waitFor(() => expect(mocks.publishInvitation).toHaveBeenCalled());
    const seen = new Set(mocks.scoped.map((entry) => entry.request));
    expect(seen).toEqual(
      new Set(['getInvitation', 'saveInvitation', 'publishInvitation']),
    );
    for (const entry of mocks.scoped)
      expect(entry.options).toMatchObject({
        scope: { resource: expect.stringContaining('CustomerInvitation') },
      });
  });

  for (const initialStatus of ['DRAFT', 'PUBLISHED'] as const) {
    it(`keeps confirmed ${initialStatus} publication when detail GET fails and retries only the read`, async () => {
      mocks.getInvitation
        .mockResolvedValueOnce({ ...detail, status: initialStatus })
        .mockRejectedValue(new Error('503'));
      mocks.publishInvitation.mockResolvedValue({
        status: 'SUCCEEDED',
        result: { resourceId: detail.id, editVersion: 3, publicVersion: 2 },
      });
      render(<CustomerInvitationForm id={detail.id} />);
      await screen.findByLabelText('Tên cô dâu');
      fireEvent.click(screen.getByRole('button', { name: 'Xuất bản thiệp' }));
      await screen.findByText('Mẫu: Mẫu mùa xuân · PUBLISHED');
      await screen.findByRole('button', { name: 'Thử tải lại thông tin' });
      expect(
        screen.queryByRole('link', { name: 'Xem thiệp công khai' }),
      ).toBeNull();
      fireEvent.change(screen.getByLabelText('Tên cô dâu'), {
        target: { value: 'Local edit' },
      });
      mocks.getInvitation.mockResolvedValue({
        ...detail,
        status: 'PUBLISHED',
        editVersion: 3,
        publicVersion: 2,
        publicUrl: '/i/known',
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Thử tải lại thông tin' }),
      );
      await screen.findByRole('dialog', { name: 'Thiệp đã sẵn sàng gửi' });
      expect(screen.getByLabelText('Đường dẫn thiệp')).toHaveValue(
        'http://localhost:3000/i/known',
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Đóng thông tin chia sẻ' }),
      );
      expect(screen.getByLabelText('Tên cô dâu')).toHaveValue('Local edit');
      fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
      await waitFor(() =>
        expect(mocks.saveInvitation).toHaveBeenCalledWith(
          detail.id,
          3,
          expect.objectContaining({ bride: { name: 'Local edit' } }),
        ),
      );
      expect(mocks.publishInvitation).toHaveBeenCalledOnce();
    });
  }
  it('keeps dirty data and confirmed unpublish version through a failed GET', async () => {
    mocks.getInvitation
      .mockResolvedValueOnce({
        ...detail,
        status: 'PUBLISHED',
        publicUrl: '/i/known',
      })
      .mockRejectedValue(new Error('503'));
    mocks.unpublishInvitation.mockResolvedValue({
      id: detail.id,
      status: 'UNPUBLISHED',
      editVersion: 4,
      publicUrl: '/i/known',
      publicVersion: 2,
      controlVersion: 3,
      rsvpOpen: false,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
    });
    render(<CustomerInvitationForm id={detail.id} />);
    await screen.findByLabelText('Tên cô dâu');
    fireEvent.change(screen.getByLabelText('Tên cô dâu'), {
      target: { value: 'Unsaved' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ xuất bản' }));
    await screen.findByText('Mẫu: Mẫu mùa xuân · UNPUBLISHED');
    await screen.findByRole('button', { name: 'Thử tải lại thông tin' });
    expect(screen.getByLabelText('Tên cô dâu')).toHaveValue('Unsaved');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    await waitFor(() =>
      expect(mocks.saveInvitation).toHaveBeenCalledWith(
        detail.id,
        4,
        expect.objectContaining({ bride: { name: 'Unsaved' } }),
      ),
    );
  });

  for (const initialStatus of ['DRAFT', 'PUBLISHED'] as const)
    for (const retry of [false, true])
      for (const dirty of [false, true])
        for (const mutation of ['publish', 'unpublish'] as const) {
          if (mutation === 'unpublish' && initialStatus === 'DRAFT') continue;
          it(`keeps CAS baseline for ${initialStatus} ${mutation}, retry=${retry}, dirty=${dirty}`, async () => {
            const initial = {
              ...detail,
              status: initialStatus,
              draftWeddingData: {
                schemaVersion: 1 as const,
                bride: { name: 'Original' },
              },
            };
            const remote = {
              ...initial,
              editVersion: 4,
              draftWeddingData: {
                schemaVersion: 1 as const,
                bride: { name: 'Remote' },
              },
            };
            mocks.getInvitation.mockResolvedValueOnce(initial);
            if (retry)
              mocks.getInvitation.mockRejectedValueOnce(new Error('503'));
            mocks.getInvitation.mockResolvedValue(remote);
            mocks.publishInvitation.mockResolvedValue({
              status: 'SUCCEEDED',
              result: {
                resourceId: detail.id,
                editVersion: 3,
                publicVersion: 1,
              },
            });
            mocks.unpublishInvitation.mockResolvedValue({
              ...initial,
              status: 'UNPUBLISHED',
              editVersion: 3,
            });
            if (dirty && mutation === 'publish')
              mocks.saveInvitation.mockResolvedValueOnce({
                ...initial,
                editVersion: 2,
                draftWeddingData: {
                  schemaVersion: 1,
                  bride: { name: 'Local' },
                },
              });
            mocks.saveInvitation.mockRejectedValue(
              new Error('VERSION_CONFLICT'),
            );
            render(<CustomerInvitationForm id={detail.id} />);
            await screen.findByLabelText('Tên cô dâu');
            if (dirty)
              fireEvent.change(screen.getByLabelText('Tên cô dâu'), {
                target: { value: 'Local' },
              });
            fireEvent.click(
              screen.getByRole('button', {
                name: mutation === 'publish' ? 'Xuất bản thiệp' : 'Gỡ xuất bản',
              }),
            );
            if (retry) {
              await screen.findByRole('button', {
                name: 'Thử tải lại thông tin',
              });
              fireEvent.click(
                screen.getByRole('button', { name: 'Thử tải lại thông tin' }),
              );
            }
            await screen.findByText(/phiên bản mới.*Bản sửa/);
            expect(screen.getByLabelText('Tên cô dâu')).toHaveValue(
              dirty ? 'Local' : 'Original',
            );
            fireEvent.change(screen.getByLabelText('Tên cô dâu'), {
              target: { value: 'Keep local' },
            });
            fireEvent.click(
              screen.getByRole('button', { name: 'Lưu bản nháp' }),
            );
            await waitFor(() =>
              expect(mocks.saveInvitation).toHaveBeenLastCalledWith(
                detail.id,
                3,
                expect.objectContaining({ bride: { name: 'Keep local' } }),
              ),
            );
            expect(screen.getByLabelText('Tên cô dâu')).toHaveValue(
              'Keep local',
            );
            const confirmation = vi
              .spyOn(window, 'confirm')
              .mockReturnValue(true);
            fireEvent.click(
              screen.getByRole('button', { name: 'Tải lại bản đã lưu' }),
            );
            await waitFor(() =>
              expect(screen.getByLabelText('Tên cô dâu')).toHaveValue('Remote'),
            );
            fireEvent.change(screen.getByLabelText('Tên cô dâu'), {
              target: { value: 'After reload' },
            });
            fireEvent.click(
              screen.getByRole('button', { name: 'Lưu bản nháp' }),
            );
            await waitFor(() =>
              expect(mocks.saveInvitation).toHaveBeenLastCalledWith(
                detail.id,
                4,
                expect.objectContaining({ bride: { name: 'After reload' } }),
              ),
            );
            expect(
              mutation === 'publish'
                ? mocks.publishInvitation
                : mocks.unpublishInvitation,
            ).toHaveBeenCalledOnce();
            confirmation.mockRestore();
          });
        }

  it('deduplicates event datetime, saves typed WeddingData and never exposes canvas editing', async () => {
    render(<CustomerInvitationForm id={detail.id} />);
    await screen.findByText('Mẫu: Mẫu mùa xuân · DRAFT');
    expect(screen.getAllByLabelText('Ngày giờ ISO')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Tên cô dâu'), {
      target: { value: 'Mai' },
    });
    fireEvent.change(screen.getByLabelText('Ngày giờ ISO'), {
      target: { value: '2027-01-10T10:00:00+07:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    await waitFor(() =>
      expect(mocks.saveInvitation).toHaveBeenCalledWith(
        detail.id,
        1,
        expect.objectContaining({
          bride: { name: 'Mai' },
          events: {
            ceremony: {
              datetime: '2027-01-10T10:00:00+07:00',
              timeZone: 'Asia/Ho_Chi_Minh',
            },
          },
        }),
      ),
    );
    expect(screen.queryByRole('button', { name: 'Thêm văn bản' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước' }));
    expect(screen.getByTestId('preview-scene')).toBeTruthy();
  });

  it('offers a Customer only data fields: no Admin library, style, layout, binding, section or crop controls', async () => {
    const pinned = structuredClone(detail.document);
    render(<CustomerInvitationForm id={detail.id} />);
    await screen.findByText('Mẫu: Mẫu mùa xuân · DRAFT');
    expect(screen.queryByRole('dialog')).toBeNull();
    for (const name of [
      /Thư viện/,
      /Chọn ảnh bìa/,
      /Thêm hình ảnh/,
      /Thêm trang trí/,
      /Chọn nền/,
      /Thay ảnh/,
      /Liên kết dữ liệu/,
      /Khớp ảnh|Cắt ảnh|Căn chỉnh/,
      /Màu|Phông|Kiểu chữ/,
      /Ẩn phần|Hiện phần|Sắp xếp phần|Thứ tự phần/,
    ]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
      expect(screen.queryByLabelText(name)).toBeNull();
    }
    expect(
      screen.queryByRole('group', { name: 'Liên kết dữ liệu' }),
    ).toBeNull();
    // Saving sends only the Customer's WeddingData: no design, layout or
    // binding payload, and the pinned design is never touched.
    fireEvent.change(screen.getByLabelText('Tên cô dâu'), {
      target: { value: 'Mai' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    await waitFor(() => expect(mocks.saveInvitation).toHaveBeenCalledOnce());
    const [id, version, data, ...rest] = mocks.saveInvitation.mock.calls[0];
    expect([id, version]).toEqual([detail.id, 1]);
    expect(rest).toEqual([]);
    expect(Object.keys(data as object).sort()).toEqual(
      ['bride', 'schemaVersion'].sort(),
    );
    expect(data).not.toHaveProperty('document');
    expect(data).not.toHaveProperty('nodes');
    expect(detail.document).toEqual(pinned);
  });

  it('keeps edited values and surfaces a version error when save fails', async () => {
    mocks.saveInvitation.mockRejectedValue(new Error('VERSION_CONFLICT'));
    render(<CustomerInvitationForm id={detail.id} />);
    await screen.findByText('Mẫu: Mẫu mùa xuân · DRAFT');
    fireEvent.change(screen.getByLabelText('Tên cô dâu'), {
      target: { value: 'Lan' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    await screen.findByRole('alert');
    expect(
      (screen.getByLabelText('Tên cô dâu') as HTMLInputElement).value,
    ).toBe('Lan');
  });

  it('binds a selected customer image into WeddingData without exposing template assets', async () => {
    const assetId = '00000000-0000-4000-8000-000000000005';
    mocks.getInvitation.mockResolvedValue({
      ...detail,
      formFields: [
        {
          id: 'bride.photo',
          label: 'Ảnh cô dâu',
          type: 'asset',
          essential: true,
          required: false,
        },
      ],
    });
    mocks.builderRequest.mockResolvedValue({
      items: [{ id: assetId, name: 'Ảnh của tôi' }],
      nextCursor: null,
    });
    render(<CustomerInvitationForm id={detail.id} />);
    await screen.findByText('Mẫu: Mẫu mùa xuân · DRAFT');
    fireEvent.change(screen.getByLabelText('Ảnh đã tải lên'), {
      target: { value: assetId },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    await waitFor(() =>
      expect(mocks.saveInvitation).toHaveBeenCalledWith(
        detail.id,
        1,
        expect.objectContaining({ bride: { photo: assetId } }),
      ),
    );
  });

  it('preserves the entered form when publication rejects required data', async () => {
    mocks.publishInvitation.mockRejectedValue(
      new Error('REQUIRED_DATA_MISSING'),
    );
    render(<CustomerInvitationForm id={detail.id} />);
    await screen.findByText('Mẫu: Mẫu mùa xuân · DRAFT');
    fireEvent.change(screen.getByLabelText('Tên cô dâu'), {
      target: { value: 'Mai' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xuất bản thiệp' }));
    await screen.findByRole('alert');
    expect(
      (screen.getByLabelText('Tên cô dâu') as HTMLInputElement).value,
    ).toBe('Mai');
    expect(mocks.saveInvitation).toHaveBeenCalledOnce();
    expect(mocks.publishInvitation).toHaveBeenCalledOnce();
  });
  it('collects coordinates and timeline labels required by the selected widgets', async () => {
    mocks.getInvitation.mockResolvedValue({
      ...detail,
      formFields: [
        {
          id: 'venue',
          label: 'Địa điểm',
          type: 'venue',
          essential: true,
          required: true,
          eventKey: 'ceremony',
        },
        {
          id: 'timeline',
          label: 'Timeline',
          type: 'timeline',
          essential: true,
          required: true,
        },
      ],
    });
    render(<CustomerInvitationForm id={detail.id} />);
    await screen.findByText('Mẫu: Mẫu mùa xuân · DRAFT');
    fireEvent.change(screen.getByLabelText('Tên địa điểm'), {
      target: { value: 'Sảnh A' },
    });
    fireEvent.change(screen.getByLabelText('Địa chỉ'), {
      target: { value: '1 Đường Hoa' },
    });
    fireEvent.change(screen.getByLabelText('Vĩ độ'), {
      target: { value: '10.7769' },
    });
    fireEvent.change(screen.getByLabelText('Kinh độ'), {
      target: { value: '106.7009' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm mốc' }));
    fireEvent.change(screen.getByLabelText('Tiêu đề'), {
      target: { value: 'Lễ cưới' },
    });
    fireEvent.change(screen.getByLabelText('Thời gian mốc'), {
      target: { value: 'Sáng' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    await waitFor(() =>
      expect(mocks.saveInvitation).toHaveBeenCalledWith(
        detail.id,
        1,
        expect.objectContaining({
          events: {
            ceremony: {
              venue: {
                name: 'Sảnh A',
                address: '1 Đường Hoa',
                latitude: 10.7769,
                longitude: 106.7009,
              },
            },
          },
          timeline: [
            expect.objectContaining({ title: 'Lễ cưới', dateLabel: 'Sáng' }),
          ],
        }),
      ),
    );
  });
  it('locks inputs during a slow save and restores editing when it completes', async () => {
    let finish!: (value: InvitationDetail) => void;
    mocks.saveInvitation.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<CustomerInvitationForm id={detail.id} />);
    await screen.findByLabelText('Tên cô dâu');
    fireEvent.change(screen.getByLabelText('Tên cô dâu'), {
      target: { value: 'Mai' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    expect(screen.getByLabelText('Tên cô dâu')).toBeDisabled();
    finish({
      ...detail,
      editVersion: 2,
      draftWeddingData: { schemaVersion: 1, bride: { name: 'Mai' } },
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Tên cô dâu')).not.toBeDisabled(),
    );
    expect(screen.getByLabelText('Tên cô dâu')).toHaveValue('Mai');
  });
  it('clears an optional photo by removing its field, then saves successfully', async () => {
    const assetId = '00000000-0000-4000-8000-000000000005';
    mocks.getInvitation.mockResolvedValue({
      ...detail,
      draftWeddingData: { schemaVersion: 1, bride: { photo: assetId } },
      formFields: [
        {
          id: 'bride.photo',
          label: 'Ảnh cô dâu',
          type: 'asset',
          essential: true,
          required: false,
        },
      ],
    });
    mocks.builderRequest.mockResolvedValue({
      items: [{ id: assetId, name: 'Ảnh cũ' }],
      nextCursor: null,
    });
    render(<CustomerInvitationForm id={detail.id} />);
    await screen.findByLabelText('Ảnh đã tải lên');
    fireEvent.change(screen.getByLabelText('Ảnh đã tải lên'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    await waitFor(() =>
      expect(mocks.saveInvitation).toHaveBeenCalledWith(detail.id, 1, {
        schemaVersion: 1,
        bride: {},
      }),
    );
  });
  it('keeps stale edits until the user confirms reloading the current server version', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<CustomerInvitationForm id={detail.id} />);
    await screen.findByLabelText('Tên cô dâu');
    fireEvent.change(screen.getByLabelText('Tên cô dâu'), {
      target: { value: 'Local' },
    });
    mocks.getInvitation.mockResolvedValue({
      ...detail,
      editVersion: 3,
      draftWeddingData: { schemaVersion: 1, bride: { name: 'Server' } },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại bản đã lưu' }));
    expect(screen.getByLabelText('Tên cô dâu')).toHaveValue('Local');
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại bản đã lưu' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Tên cô dâu')).toHaveValue('Server'),
    );
    confirm.mockRestore();
  });
  it('cancels navigation and beforeunload while local changes are unsaved', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<CustomerInvitationForm id={detail.id} />);
    await screen.findByLabelText('Tên cô dâu');
    fireEvent.change(screen.getByLabelText('Tên cô dâu'), {
      target: { value: 'Local' },
    });
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    const link = document.createElement('a');
    link.href = '/invitations';
    document.body.appendChild(link);
    const navigate = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(navigate);
    expect(navigate.defaultPrevented).toBe(true);
    expect(confirm).toHaveBeenCalledWith('Bỏ thay đổi chưa lưu và rời trang?');
    expect(screen.getByLabelText('Tên cô dâu')).toHaveValue('Local');
    link.remove();
    confirm.mockRestore();
  });
});
