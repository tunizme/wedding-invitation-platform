import { test as base, expect } from '@playwright/test';

/**
 * Shared fixture for the 006 browser suite. Applies the project init script
 * (e.g. removing navigator.locks for `chromium-no-web-locks`) to every context
 * so all pages created by a test share the same capabilities.
 */
export const test = base.extend({
  context: async ({ context }, provide, testInfo) => {
    const provider = process.env.AUTH_TRANSITION_PROVIDER_URL;
    if (provider)
      await fetch(`${provider}/reset-rate-limits`, { method: 'POST' });
    const script: unknown = testInfo.project.metadata?.initScript;
    if (typeof script === 'string') await context.addInitScript(script);
    await provide(context);
  },
});

export { expect };
