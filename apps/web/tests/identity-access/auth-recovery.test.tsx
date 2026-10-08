import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MemorySelectorStore,
  setSelectorStoreForTests,
  type RecoveryReason,
} from '../../src/features/identity-access/session/auth-selector';
import { AuthRecoveryNotice } from '../../src/features/identity-access/session/auth-recovery-notice';
import { sessionStore } from '../../src/features/identity-access/session/store';

const reasons: RecoveryReason[] = [
  'STORAGE_UNAVAILABLE',
  'STORAGE_RESET',
  'CREDENTIAL_MISSING',
  'CAPACITY_EXHAUSTED',
  'CONTEXT_UNAVAILABLE',
];

afterEach(() => {
  cleanup();
  setSelectorStoreForTests(null);
  sessionStore.clear();
});

describe('auth recovery notice', () => {
  it.each(reasons)(
    'explains %s with an accessible next action',
    async (reason) => {
      const store = new MemorySelectorStore();
      setSelectorStoreForTests(store);
      await store.transact(() => ({
        next: {
          state: 'RECOVERY_REQUIRED',
          attemptId: null,
          attemptSeq: 1,
          attemptAt: null,
          contextId: null,
          revision: 0,
          sessionTag: null,
          pendingIntent: null,
          refreshLease: null,
          recoveryReason: reason,
        },
        result: undefined,
      }));
      render(
        <>
          <main>Public invitation remains available</main>
          <AuthRecoveryNotice />
        </>,
      );
      expect(await screen.findByRole('alert')).toBeTruthy();
      expect(screen.getByRole('alert').textContent).toBeTruthy();
      expect(
        screen.getByText('Public invitation remains available'),
      ).toBeTruthy();
      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByRole('alert'));
      });
      if (reason === 'STORAGE_UNAVAILABLE')
        expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
      else if (reason === 'CAPACITY_EXHAUSTED') {
        expect(screen.getByRole('alert').textContent).toContain(
          'dùng trình duyệt khác',
        );
        expect(screen.queryByText(/Mở cài đặt quyền riêng tư/)).toBeNull();
        const showInstructions = screen.getByRole('button', {
          name: 'Cách xóa dữ liệu trang',
        });
        expect(showInstructions.getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(showInstructions);
        expect(screen.getByText(/Mở cài đặt quyền riêng tư/)).toBeTruthy();
        expect(showInstructions.getAttribute('aria-expanded')).toBe('true');
        expect(
          screen.getByText(/Website sẽ không tự xóa dữ liệu/),
        ).toBeTruthy();
      } else
        expect(
          screen.getByRole('link', { name: 'Đăng nhập lại' }),
        ).toBeTruthy();
    },
  );
});
