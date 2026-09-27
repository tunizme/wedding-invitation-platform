import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RegisterForm } from '../../src/features/identity-access/forms/register-form';
import {
  iamRequest,
  ApiError,
} from '../../src/features/identity-access/api/client';
vi.mock('../../src/features/identity-access/api/client', async (original) => ({
  ...(await original<
    typeof import('../../src/features/identity-access/api/client')
  >()),
  iamRequest: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const fill = () => {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'a@example.test' },
  });
  fireEvent.change(screen.getByLabelText('Mật khẩu'), {
    target: { value: '  Password 🔒  ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));
};
describe('registration form', () => {
  it('preserves password and shows generic verification instructions', async () => {
    vi.mocked(iamRequest).mockResolvedValue({ message: 'accepted' });
    render(<RegisterForm />);
    fill();
    await screen.findByText(/Nếu yêu cầu hợp lệ/);
    expect(iamRequest).toHaveBeenCalledWith(
      '/auth/registrations',
      expect.objectContaining({
        body: { email: 'a@example.test', password: '  Password 🔒  ' },
      }),
    );
    expect(screen.queryByLabelText('Mật khẩu')).not.toBeInTheDocument();
  });
  it('prevents duplicate submission while pending and shows safe errors', async () => {
    let reject!: (e: Error) => void;
    vi.mocked(iamRequest).mockImplementation(
      () =>
        new Promise((_, r) => {
          reject = r;
        }),
    );
    render(<RegisterForm />);
    fill();
    expect(screen.getByRole('button')).toBeDisabled();
    reject(new ApiError(429));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Bạn thao tác quá nhanh',
      ),
    );
    expect(screen.getByRole('button')).toBeEnabled();
  });
});
