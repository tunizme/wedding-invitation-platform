import { StrictMode, createRef, useRef, useState } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModalSurface } from '../../src/ui/platform/modal-surface';

/*
 * JSDOM has no native <dialog> modal behavior: tests/setup.ts installs an
 * explicit test double for showModal()/close() that only toggles `open` and
 * emits `close`. These tests therefore verify the React lifecycle wiring
 * (idempotent close, focus targets, cleanup) and deliberately make NO claim
 * about native focus containment, inert background or top-layer rendering —
 * that is covered by the native-browser suite (e2e/frontend-foundation/
 * media-library.spec.ts), which is NOT RUN without a browser harness.
 */
const dialog = () => screen.getByRole('dialog');

afterEach(cleanup);

describe('ModalSurface lifecycle (JSDOM test double)', () => {
  it('opens once through showModal and takes its accessible name from the heading', () => {
    const show = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    render(
      <ModalSurface label="Thư viện ảnh" onClose={vi.fn()}>
        <p>Nội dung</p>
      </ModalSurface>,
    );
    expect(show).toHaveBeenCalledTimes(1);
    expect(dialog()).toHaveAttribute('open');
    expect(screen.getByRole('dialog', { name: 'Thư viện ảnh' })).toBe(dialog());
    expect(
      screen.getByRole('heading', { level: 2, name: 'Thư viện ảnh' }),
    ).toBeInTheDocument();
    show.mockRestore();
  });

  it('focuses the heading by default and the requested control when one is given', () => {
    const { unmount } = render(
      <ModalSurface label="Mặc định" onClose={vi.fn()}>
        <input aria-label="Tìm" />
      </ModalSurface>,
    );
    expect(screen.getByRole('heading', { name: 'Mặc định' })).toHaveFocus();
    unmount();
    function WithInitial() {
      const search = createRef<HTMLInputElement>();
      return (
        <ModalSurface
          label="Có ô tìm"
          onClose={vi.fn()}
          initialFocusRef={search}
        >
          <input ref={search} aria-label="Tìm" />
        </ModalSurface>
      );
    }
    render(<WithInitial />);
    expect(screen.getByLabelText('Tìm')).toHaveFocus();
  });

  it('closes idempotently across Close, Escape and the native close event', () => {
    const onClose = vi.fn();
    render(
      <ModalSurface
        label="Thư viện"
        onClose={onClose}
        closeLabel="Đóng thư viện"
      >
        <p>Nội dung</p>
      </ModalSurface>,
    );
    const element = dialog();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng thư viện' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    // Later Escape / native close notifications cannot close a second time.
    fireEvent(element, new Event('cancel', { cancelable: true }));
    fireEvent(element, new Event('close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('routes Escape (cancel) through the same close and prevents the native default', () => {
    const onClose = vi.fn();
    render(
      <ModalSurface label="Thư viện" onClose={onClose}>
        <p>Nội dung</p>
      </ModalSurface>,
    );
    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(dialog(), cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('returns focus to a surviving trigger when it unmounts', () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Mở thư viện
          </button>
          {open && (
            <ModalSurface label="Thư viện" onClose={() => setOpen(false)}>
              <p>Nội dung</p>
            </ModalSurface>
          )}
        </>
      );
    }
    render(<Host />);
    const trigger = screen.getByRole('button', { name: 'Mở thư viện' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('heading', { name: 'Thư viện' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('falls back to the logical workspace when the trigger no longer exists', () => {
    function Host() {
      const [open, setOpen] = useState(false);
      const [hasTrigger, setHasTrigger] = useState(true);
      const workspace = useRef<HTMLDivElement>(null);
      return (
        <>
          <div ref={workspace} tabIndex={-1} aria-label="Vùng làm việc" />
          {hasTrigger && (
            <button type="button" onClick={() => setOpen(true)}>
              Mở thư viện
            </button>
          )}
          <button type="button" onClick={() => setHasTrigger(false)}>
            Gỡ nút mở
          </button>
          {open && (
            <ModalSurface
              label="Thư viện"
              onClose={() => setOpen(false)}
              fallbackFocusRef={workspace}
            >
              <button type="button" onClick={() => setHasTrigger(false)}>
                Gỡ nút mở trong thư viện
              </button>
            </ModalSurface>
          )}
        </>
      );
    }
    render(<Host />);
    const trigger = screen.getByRole('button', { name: 'Mở thư viện' });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(
      screen.getByRole('button', { name: 'Gỡ nút mở trong thư viện' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('Vùng làm việc')).toHaveFocus();
  });

  it('falls back to the workspace when the trigger is still mounted but cannot take focus', () => {
    function Host() {
      const [open, setOpen] = useState(false);
      const [disabled, setDisabled] = useState(false);
      const workspace = useRef<HTMLDivElement>(null);
      return (
        <>
          <div ref={workspace} tabIndex={-1} aria-label="Vùng làm việc" />
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen(true)}
          >
            Mở thư viện
          </button>
          {open && (
            <ModalSurface
              label="Thư viện"
              onClose={() => setOpen(false)}
              fallbackFocusRef={workspace}
            >
              <button type="button" onClick={() => setDisabled(true)}>
                Vô hiệu hóa nút mở
              </button>
            </ModalSurface>
          )}
        </>
      );
    }
    render(<Host />);
    const trigger = screen.getByRole('button', { name: 'Mở thư viện' });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Vô hiệu hóa nút mở' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.getByLabelText('Vùng làm việc')).toHaveFocus();
  });
  it('cleans up on unmount: closes the dialog and stops notifying the parent', () => {
    const onClose = vi.fn();
    const close = vi.spyOn(HTMLDialogElement.prototype, 'close');
    const { unmount } = render(
      <ModalSurface label="Thư viện" onClose={onClose}>
        <p>Nội dung</p>
      </ModalSurface>,
    );
    const element = dialog();
    unmount();
    expect(close).toHaveBeenCalled();
    act(() => {
      element.dispatchEvent(new Event('cancel', { cancelable: true }));
      element.dispatchEvent(new Event('close'));
    });
    expect(onClose).not.toHaveBeenCalled();
    close.mockRestore();
  });

  it('survives StrictMode double mounting without a spurious close', () => {
    const onClose = vi.fn();
    render(
      <StrictMode>
        <ModalSurface label="Thư viện" onClose={onClose}>
          <p>Nội dung</p>
        </ModalSurface>
      </StrictMode>,
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog()).toHaveAttribute('open');
  });
});

it('ignores the queued native close from a StrictMode cleanup after reopening', async () => {
  const onClose = vi.fn();
  const close = vi
    .spyOn(HTMLDialogElement.prototype, 'close')
    .mockImplementation(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      queueMicrotask(() => this.dispatchEvent(new Event('close')));
    });
  try {
    render(
      <StrictMode>
        <ModalSurface label="Thư viện ảnh" onClose={onClose}>
          <input aria-label="Tìm" />
        </ModalSurface>
      </StrictMode>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(dialog()).toHaveAttribute('open');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent(dialog(), new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  } finally {
    close.mockRestore();
  }
});
