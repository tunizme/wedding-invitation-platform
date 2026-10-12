import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import pilot from '../../../../specs/007-responsive-invitation-layout/contracts/fixtures/valid-v2.json';
import type { InvitationDetail } from '../../src/features/invitations/api';
import type { TemplateDesignV2 } from '../../src/features/invitation-builder/document/types';
const mocks = vi.hoisted(() => ({
  getInvitation: vi.fn(),
  saveInvitation: vi.fn(),
  publishInvitation: vi.fn(),
  unpublishInvitation: vi.fn(),
  builderRequest: vi.fn(),
  getPublicationOperation: vi.fn(),
}));
vi.mock('../../src/features/invitations/api', () => mocks);
vi.mock(
  '../../src/features/invitation-builder/api/client',
  async (original) => ({
    ...(await original<
      typeof import('../../src/features/invitation-builder/api/client')
    >()),
    builderRequest: mocks.builderRequest,
  }),
);
vi.mock(
  '../../src/features/invitation-builder/api/operations',
  async (original) => ({
    ...(await original<
      typeof import('../../src/features/invitation-builder/api/operations')
    >()),
    getPublicationOperation: mocks.getPublicationOperation,
  }),
);
vi.mock('../../src/features/invitations/public-invitation-view', () => ({
  PublicInvitationView: ({ hostPolicy }: { hostPolicy: string }) => (
    <div data-testid="responsive-preview" data-policy={hostPolicy} />
  ),
}));
vi.mock('../../src/features/invitation-builder/renderer/scene-preview', () => ({
  ScenePreview: ({ children }: { children: React.ReactNode }) => children,
}));
import { CustomerInvitationForm } from '../../src/features/invitations/customer-invitation-form';
import { sessionStore } from '../../src/features/identity-access/session/store';
import { privateSession } from '../identity-access/private-session-fixture';
const session = privateSession();
const detail: InvitationDetail = {
  id: '10000000-0000-4000-8000-000000000001',
  status: 'DRAFT',
  publicUrl: null,
  publicVersion: 0,
  editVersion: 1,
  controlVersion: 1,
  rsvpOpen: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ownerId: session.user.id,
  createdBy: session.user.id,
  templateId: '10000000-0000-4000-8000-000000000002',
  designRevisionId: '10000000-0000-4000-8000-000000000003',
  templateName: 'Responsive',
  draftWeddingData: { schemaVersion: 1, bride: { name: 'Mai' } },
  document: pilot as TemplateDesignV2,
  formFields: [
    {
      id: 'bride.name',
      label: 'Tên cô dâu',
      type: 'text',
      essential: true,
      required: false,
    },
  ],
};
beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  sessionStore.clear();
  sessionStore.set(session);
  mocks.getInvitation.mockResolvedValue(detail);
  mocks.builderRequest.mockResolvedValue({ items: [], nextCursor: null });
});
afterEach(() => {
  cleanup();
  sessionStore.clear();
});
it('uses mobile host max390 with no Customer device/design controls and sends only data1', async () => {
  mocks.saveInvitation.mockImplementation(async (_id, _version, data) => ({
    ...detail,
    draftWeddingData: data,
    editVersion: 2,
  }));
  render(<CustomerInvitationForm id={detail.id} />);
  await screen.findByLabelText('Tên cô dâu');
  expect(screen.queryByLabelText('Thiết bị')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Xem trước' }));
  expect(screen.getByTestId('customer-preview-host')).toHaveStyle({
    width: '390px',
    maxWidth: '100%',
  });
  expect(screen.getByTestId('responsive-preview')).toHaveAttribute(
    'data-policy',
    'mobile',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
  fireEvent.change(screen.getByLabelText('Tên cô dâu'), {
    target: { value: 'Mai mới' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
  await waitFor(() => expect(mocks.saveInvitation).toHaveBeenCalled());
  const [id, version, data] = mocks.saveInvitation.mock.calls[0];
  expect(id).toBe(detail.id);
  expect(version).toBe(1);
  expect(data).toEqual({ schemaVersion: 1, bride: { name: 'Mai mới' } });
  expect(detail.document).toEqual(pilot);
  expect(detail.designRevisionId).toBe('10000000-0000-4000-8000-000000000003');
});
it('retains local input and pinned revision on conflict', async () => {
  const { BuilderApiError } =
    await import('../../src/features/invitation-builder/api/client');
  mocks.saveInvitation.mockRejectedValue(
    new BuilderApiError(409, 'VERSION_CONFLICT'),
  );
  render(<CustomerInvitationForm id={detail.id} />);
  fireEvent.change(await screen.findByLabelText('Tên cô dâu'), {
    target: { value: 'Local Mai' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(/phiên bản|giữ/),
  );
  expect(screen.getByLabelText('Tên cô dâu')).toHaveValue('Local Mai');
  expect(mocks.publishInvitation).not.toHaveBeenCalled();
});
it('cancels stale owner load before rendering responsive private content', async () => {
  let accept!: (value: InvitationDetail) => void;
  let signal: AbortSignal | undefined;
  mocks.getInvitation.mockImplementationOnce((_id, options) => {
    signal = options.scope.signal;
    return new Promise((resolve) => {
      accept = resolve;
    });
  });
  render(<CustomerInvitationForm id={detail.id} />);
  await waitFor(() => expect(signal).toBeDefined());
  act(() =>
    sessionStore.set({
      ...session,
      user: { ...session.user, id: '20000000-0000-4000-8000-000000000001' },
    }),
  );
  expect(signal?.aborted).toBe(true);
  await act(async () =>
    accept({
      ...detail,
      draftWeddingData: { schemaVersion: 1, bride: { name: 'Stale secret' } },
    }),
  );
  expect(screen.queryByDisplayValue('Stale secret')).toBeNull();
});
