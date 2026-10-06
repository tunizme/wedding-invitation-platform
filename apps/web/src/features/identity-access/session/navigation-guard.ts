'use client';
import { useEffect, useLayoutEffect, useRef } from 'react';

const dirtySources = new Set<() => boolean>();
const historyKey = '__weddingNavigationIndex';
let approved = false;
let installations = 0;
let teardown: (() => void) | undefined;
export function confirmDiscardChanges(): boolean {
  if (approved || ![...dirtySources].some((source) => source())) return true;
  return window.confirm('Bỏ thay đổi chưa lưu và rời trang?');
}

// Installed by the persistent session shell before protected routes are opened.
// It never participates in forced token expiry/revocation.
export function installNavigationGuard(): () => void {
  installations++;
  if (installations > 1) return release;
  let index = Number(history.state?.[historyKey] ?? 0);
  let restoring = false;
  const originalPush = history.pushState;
  const originalReplace = history.replaceState;
  originalReplace.call(history, { ...history.state, [historyKey]: index }, '');
  const push: History['pushState'] = function (state, title, url) {
    originalPush.call(history, { ...state, [historyKey]: ++index }, title, url);
  };
  const replace: History['replaceState'] = function (state, title, url) {
    originalReplace.call(
      history,
      { ...state, [historyKey]: index },
      title,
      url,
    );
  };
  history.pushState = push;
  history.replaceState = replace;
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!approved && [...dirtySources].some((source) => source())) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  const click = (event: MouseEvent) => {
    const anchor =
      event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>('a[href]')
        : null;
    if (
      !anchor ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      anchor.hasAttribute('download') ||
      (anchor.target && anchor.target !== '_self')
    )
      return;
    if (!confirmDiscardChanges()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    approved = true;
    // Cover this click's router/history mutation, then reset for the next action.
    setTimeout(() => {
      approved = false;
    }, 0);
  };
  const pop = (event: PopStateEvent) => {
    const destination = event.state?.[historyKey];
    if (restoring) {
      restoring = false;
      event.stopImmediatePropagation();
      return;
    }
    // Restore indexed history before Next consumes a cancelled traversal.
    // Native Navigation API cancellation leaves pending traversals on WebKit.
    if (
      typeof destination === 'number' &&
      destination !== index &&
      !confirmDiscardChanges()
    ) {
      event.stopImmediatePropagation();
      restoring = true;
      history.go(index - destination);
      return;
    }
    if (typeof destination === 'number') index = destination;
  };
  window.addEventListener('beforeunload', beforeUnload);
  document.addEventListener('click', click, true);
  window.addEventListener('popstate', pop, true);
  teardown = () => {
    window.removeEventListener('beforeunload', beforeUnload);
    document.removeEventListener('click', click, true);
    window.removeEventListener('popstate', pop, true);
    if (history.pushState === push) history.pushState = originalPush;
    if (history.replaceState === replace)
      history.replaceState = originalReplace;
    approved = false;
  };
  return release;
}
function release() {
  if (--installations === 0) {
    teardown?.();
    teardown = undefined;
  }
}

export function useDirtyNavigationGuard(dirty: boolean): void {
  const currentDirty = useRef(dirty);
  useLayoutEffect(() => {
    currentDirty.current = dirty;
  }, [dirty]);
  useEffect(() => {
    const dispose = installNavigationGuard();
    const source = () => currentDirty.current;
    dirtySources.add(source);
    return () => {
      dirtySources.delete(source);
      dispose();
    };
  }, []);
}
