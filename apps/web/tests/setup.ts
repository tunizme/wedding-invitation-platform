import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// JSDOM does not implement the native <dialog> modal methods. This explicit
// test double only toggles `open` and emits `close`; it does NOT emulate focus
// containment, an inert background or the top layer, so unit tests must not
// claim those. Real behavior is verified by the native-browser suite.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

// Next transforms local fonts at build time; JSDOM tests verify UI semantics.
vi.mock('next/font/local', () => ({
  default: () => ({ className: 'test-font', variable: 'test-font-variable' }),
}));
