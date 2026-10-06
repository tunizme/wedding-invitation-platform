import { test as base, expect } from '@playwright/test';

export const test = base.extend<{ builderOrigin: string }>({
  builderOrigin: async ({ baseURL }, provide) => {
    if (!baseURL) {
      throw new Error(
        'BUILDER_TEST_WEB_URL is required; use validate:builder.',
      );
    }
    const url = new URL(baseURL);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    ) {
      throw new Error('BUILDER_TEST_WEB_URL must be an origin.');
    }
    await provide(url.origin);
  },
});

export { expect };
