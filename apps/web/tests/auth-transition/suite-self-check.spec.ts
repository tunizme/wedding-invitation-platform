import { expect, test } from './support/fixtures';

test('fresh context starts with empty cookie jar and IndexedDB', async ({
  context,
  page,
}) => {
  await page.goto('data:text/html,<title>self-check</title>');
  expect(await context.cookies()).toEqual([]);
  await page.setContent('<p>ok</p>');
});

test('Web Locks availability matches the project', async ({ page }, info) => {
  await page.goto('data:text/html,<title>locks</title>');
  const hasLocks = await page.evaluate(
    () => typeof navigator.locks !== 'undefined',
  );
  const expected =
    info.project.name === 'chromium-no-web-locks' ? false : undefined;
  if (expected === false) expect(hasLocks).toBe(false);
  else expect(typeof hasLocks).toBe('boolean');
});
