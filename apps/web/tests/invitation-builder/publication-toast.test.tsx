import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Toast } from '../../src/ui/platform/toast';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('gives a publication result its full timeout after replacing progress and clears timers on unmount', () => {
  vi.useFakeTimers();
  const dismiss = vi.fn();
  const { rerender, unmount } = render(
    <Toast message="Đang chuẩn bị bản xuất bản…" onDismiss={dismiss} />,
  );
  expect(document.body).toContainElement(screen.getByRole('status'));
  act(() => vi.advanceTimersByTime(4000));
  rerender(<Toast message="Đã xuất bản phiên bản mới." onDismiss={dismiss} />);
  act(() => vi.advanceTimersByTime(4999));
  expect(dismiss).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(dismiss).toHaveBeenCalledTimes(1);
  rerender(<Toast message="Đã gỡ xuất bản thiệp." onDismiss={dismiss} />);
  unmount();
  act(() => vi.advanceTimersByTime(5000));
  expect(dismiss).toHaveBeenCalledTimes(1);
});

it('lets the user dismiss a publication notification', () => {
  const dismiss = vi.fn();
  render(<Toast message="Đã xuất bản phiên bản mới." onDismiss={dismiss} />);
  fireEvent.click(screen.getByRole('button', { name: 'Đóng thông báo' }));
  expect(dismiss).toHaveBeenCalledOnce();
});
