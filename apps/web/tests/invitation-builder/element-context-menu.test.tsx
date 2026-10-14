import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ElementContextMenu } from '../../src/features/invitation-builder/editor/element-context-menu';
afterEach(cleanup);
it('focuses the first action, skips disabled items, wraps navigation and returns focus on close', () => {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const onClose = vi.fn(),
    onAction = vi.fn();
  const { unmount } = render(
    <ElementContextMenu
      x={20}
      y={20}
      locked={true}
      index={0}
      last={1}
      canPaste={false}
      onClose={onClose}
      onAction={onAction}
    />,
  );
  const copy = screen.getByRole('menuitem', { name: /Sao chép/ });
  expect(copy).toHaveFocus();
  expect(screen.getByRole('menuitem', { name: /Cắt/ })).toBeDisabled();
  expect(screen.getByRole('menuitem', { name: /Xóa phần tử/ })).toBeDisabled();
  fireEvent.keyDown(copy, { key: 'ArrowDown' });
  expect(screen.getByRole('menuitem', { name: /Tạo bản sao/ })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: 'End' });
  expect(screen.getByRole('menuitem', { name: /Mở khóa/ })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
  expect(copy).toHaveFocus();
  fireEvent.click(copy);
  expect(onAction).toHaveBeenCalledWith('copy');
  const globalKey = vi.fn();
  window.addEventListener('keydown', globalKey);
  fireEvent.keyDown(copy, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledOnce();
  expect(globalKey).not.toHaveBeenCalled();
  window.removeEventListener('keydown', globalKey);
  unmount();
  expect(trigger).toHaveFocus();
  trigger.remove();
});
it('clamps the menu inside the viewport and closes on outside pointer input', () => {
  const onClose = vi.fn();
  const { container } = render(
    <ElementContextMenu
      x={5000}
      y={5000}
      locked={false}
      index={0}
      last={0}
      canPaste={true}
      onClose={onClose}
      onAction={vi.fn()}
    />,
  );
  const menu = screen.getByRole('menu');
  expect(parseFloat(menu.style.left)).toBeLessThan(window.innerWidth);
  expect(parseFloat(menu.style.top)).toBeLessThan(window.innerHeight);
  fireEvent.pointerDown(container.firstChild!);
  expect(onClose).toHaveBeenCalledOnce();
});
