import type { Locator, Page } from '@playwright/test';
import { expect, expectSession, type Account } from './helpers';

export async function prepareKeyboard(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.addEventListener(
      'DOMContentLoaded',
      () => {
        const style = document.createElement('style');
        style.textContent = 'html { font-size: 200% !important; }';
        document.head.append(style);
      },
      { once: true },
    );
  });
}

export async function focusByTab(page: Page, control: Locator) {
  await page.bringToFront();
  await page.evaluate(() => window.focus());
  await expect(control).toBeVisible();
  await expect(control).toBeEnabled();
  let backwards = false;
  for (let step = 0; step < 80; step++) {
    const state = await control.evaluate((node) => ({
      hasFocus: document.hasFocus(),
      hasActiveControl: document.activeElement !== document.body,
      focused: node === document.activeElement && document.hasFocus(),
      // Return to an earlier control with Shift+Tab rather than traversing
      // browser chrome after the document's last tab stop (notably Firefox).
      backwards:
        !!document.activeElement &&
        !!(
          node.compareDocumentPosition(document.activeElement) &
          Node.DOCUMENT_POSITION_FOLLOWING
        ),
    }));
    if (state.focused) break;
    if (!state.hasFocus) {
      // A removed/disabled tab stop can send WebKit into browser chrome.
      // Activate the window and reverse out of that boundary; controls still
      // receive focus only through real Tab/Shift+Tab key events.
      await page.bringToFront();
      await page.evaluate(() => window.focus());
      backwards = !backwards;
    } else if (state.hasActiveControl) backwards = state.backwards;
    await page.keyboard.press(backwards ? 'Shift+Tab' : 'Tab');
  }
  // Firefox may focus a tall, enlarged control with its last pixels below
  // the viewport. Scroll the focused control into view without changing focus.
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeFocused();
  await expect(control).toHaveCSS('outline-style', 'solid');
  await expect
    .poll(() =>
      control.evaluate((node) => {
        const box =
          [...node.getClientRects()].find(
            (rect) => rect.width > 0 && rect.height > 0,
          ) ?? node.getBoundingClientRect();
        const style = getComputedStyle(node);
        const hit = document.elementFromPoint(
          Math.min(innerWidth - 1, box.x + box.width / 2),
          Math.min(innerHeight - 1, box.y + box.height / 2),
        );
        return (
          // Scroll offsets are whole pixels but enlarged-text layout is not.
          box.x >= -1 &&
          box.y >= -1 &&
          box.right <= innerWidth + 1 &&
          box.bottom <= innerHeight + 1 &&
          Number.parseFloat(style.outlineWidth) >= 2 &&
          !!hit &&
          (node === hit || node.contains(hit)) &&
          Number.parseFloat(style.transitionDuration) <= 0.01
        );
      }),
    )
    .toBe(true);
}
export async function typeByKeyboard(
  page: Page,
  control: Locator,
  value: string,
) {
  await focusByTab(page, control);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(value);
}
export async function activateByKeyboard(page: Page, control: Locator) {
  await focusByTab(page, control);
  const href = await control.getAttribute('href');
  if (href) {
    const target = new URL(href, page.url());
    await Promise.all([
      page.waitForURL((url) => url.pathname === target.pathname),
      page.keyboard.press('Enter'),
    ]);
  } else await page.keyboard.press('Enter');
}
export async function assertReadable(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await expect(page.getByRole('main')).toHaveCSS('font-size', '32px');
}
export async function loginByKeyboard(page: Page, account: Account) {
  if (new URL(page.url()).pathname !== '/login') await page.goto('/login');
  await expect(
    page.getByRole('button', { name: 'Đăng nhập', exact: true }),
  ).toBeEnabled();
  await typeByKeyboard(
    page,
    page.getByLabel('Email', { exact: true }),
    account.email,
  );
  await typeByKeyboard(
    page,
    page.getByLabel('Mật khẩu', { exact: true }),
    account.password,
  );
  await activateByKeyboard(
    page,
    page.getByRole('button', { name: 'Đăng nhập', exact: true }),
  );
  await expectSession(page, account.email, true);
  await expect(
    page.getByRole('heading', { name: 'Đăng nhập thành công', exact: true }),
  ).toBeVisible();
  await assertReadable(page);
}
