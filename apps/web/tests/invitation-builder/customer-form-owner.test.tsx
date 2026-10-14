import { scalePrimitiveDocument } from '../../src/features/invitation-builder/document/editor-document';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateDesign } from '../../src/features/invitation-builder/document/types';
import type { InvitationDetail } from '../../src/features/invitations/api';
import type { OperationScope } from '../../src/features/identity-access/session/operation-scope';

const mocks = vi.hoisted(() => ({
  getInvitation: vi.fn(),
  saveInvitation: vi.fn(),
  publishInvitation: vi.fn(),
  unpublishInvitation: vi.fn(),
  builderRequest: vi.fn(),
  getPublicationOperation: vi.fn(),
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
import { confirmDiscardChanges } from '../../src/features/identity-access/session/navigation-guard';
import { sessionStore } from '../../src/features/identity-access/session/store';
import { privateSession } from '../identity-access/private-session-fixture';

const fixturePath = resolve(
  __dirname,
  '../../../../specs/004-invitation-builder/contracts/fixtures/binding-optional-fallback.json',
);
const design = (
  JSON.parse(readFileSync(fixturePath, 'utf8')) as { document: TemplateDesign }
).document;
const invitation = (owner: string, name: string): InvitationDetail => ({
  id: '00000000-0000-4000-8000-000000000001',
  status: 'DRAFT',
  publicUrl: null,
  publicVersion: 0,
  editVersion: 1,
  controlVersion: 1,
  rsvpOpen: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ownerId: owner,
  createdBy: owner,
  templateId: '00000000-0000-4000-8000-000000000003',
  designRevisionId: '00000000-0000-4000-8000-000000000004',
  draftWeddingData: { schemaVersion: 1, bride: { name } },
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
  ],
});
const a = privateSession();
const switchToB = () =>
  act(() =>
    sessionStore.set({
      ...a,
      user: { ...a.user, id: '22222222-2222-4222-8222-222222222222' },
    }),
  );

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.builderRequest.mockResolvedValue({ items: [], nextCursor: null });
  sessionStore.clear();
  sessionStore.set(a);
});
afterEach(() => {
  cleanup();
  sessionStore.clear();
});

describe('customer invitation form owner lifetime (005 US1)', () => {
  it('cancels a private load of A when B is admitted and never renders A data', async () => {
    let scope: OperationScope | undefined;
    let resolveA!: (value: InvitationDetail) => void;
    mocks.getInvitation.mockImplementationOnce(
      (_id: string, options?: { scope?: OperationScope }) => {
        scope = options?.scope;
        return new Promise<InvitationDetail>((done) => (resolveA = done));
      },
    );
    mocks.getInvitation.mockResolvedValue(invitation('owner-B', 'Dữ liệu B'));
    render(
      <CustomerInvitationForm id="00000000-0000-4000-8000-000000000001" />,
    );
    await waitFor(() => expect(scope).toBeDefined());
    switchToB();
    expect(scope?.signal.aborted).toBe(true);
    await act(async () => resolveA(invitation('owner-A', 'Dữ liệu A')));
    await waitFor(() =>
      expect(screen.getByLabelText('Tên cô dâu')).toHaveValue('Dữ liệu B'),
    );
    expect(screen.queryByDisplayValue('Dữ liệu A')).toBeNull();
  });

  it('stops the save → publish → poll chain of A after B is admitted', async () => {
    mocks.getInvitation.mockResolvedValue(invitation('owner-A', 'Tên A'));
    mocks.saveInvitation.mockResolvedValue({
      ...invitation('owner-A', 'Sửa A'),
      editVersion: 2,
    });
    mocks.publishInvitation.mockResolvedValue({
      id: 'operation-A',
      status: 'PENDING',
      result: null,
      error: null,
    });
    render(
      <CustomerInvitationForm id="00000000-0000-4000-8000-000000000001" />,
    );
    fireEvent.change(await screen.findByLabelText('Tên cô dâu'), {
      target: { value: 'Sửa A' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xuất bản thiệp' }));
    await waitFor(() => expect(mocks.publishInvitation).toHaveBeenCalled());
    mocks.getInvitation.mockResolvedValue(invitation('owner-B', 'Dữ liệu B'));
    switchToB();
    await waitFor(() =>
      expect(screen.getByLabelText('Tên cô dâu')).toHaveValue('Dữ liệu B'),
    );
    await new Promise((done) => setTimeout(done, 1200));
    expect(mocks.getPublicationOperation).not.toHaveBeenCalled();
    expect(screen.queryByText(/Đã xuất bản thiệp/)).toBeNull();
    expect(screen.queryByText(/Đang kiểm tra thiệp/)).toBeNull();
  });

  it('drops the dirty registration of A so B is never asked to discard it', async () => {
    mocks.getInvitation.mockResolvedValue(invitation('owner-A', 'Tên A'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <CustomerInvitationForm id="00000000-0000-4000-8000-000000000001" />,
    );
    fireEvent.change(await screen.findByLabelText('Tên cô dâu'), {
      target: { value: 'Chưa lưu của A' },
    });
    expect(confirmDiscardChanges()).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
    mocks.getInvitation.mockResolvedValue(invitation('owner-B', 'Dữ liệu B'));
    switchToB();
    await waitFor(() =>
      expect(screen.getByLabelText('Tên cô dâu')).toHaveValue('Dữ liệu B'),
    );
    expect(confirmDiscardChanges()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });
});
