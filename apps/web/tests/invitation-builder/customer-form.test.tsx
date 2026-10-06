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
  session: { user: { role: 'CUSTOMER' } },
}));
vi.mock('../../src/features/identity-access/session/store', () => ({
  sessionStore: { subscribe: () => () => undefined, get: () => mocks.session },
}));
vi.mock('../../src/features/invitations/api', () => ({
  getInvitation: mocks.getInvitation,
  saveInvitation: mocks.saveInvitation,
  publishInvitation: mocks.publishInvitation,
  unpublishInvitation: mocks.unpublishInvitation,
}));
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
  document: design,
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
  afterEach(cleanup);
  beforeEach(() => {
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
      await screen.findByRole('link', { name: 'Xem thiệp công khai' });
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
    expect(screen.getByTestId('preview-scene')).toBeTruthy();
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
