import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { Page } from '@playwright/test';
import { env } from './stack';

/** Execute unmodified production session modules in a separate browser realm
 * store, with real IndexedDB and HTTP cookies. Peer hints are deliberately absent
 * so their timing cannot hide an authority/admission race. No credentials leave
 * page memory or enter the evidence reporter. */
export async function loadProductionSession(page: Page) {
  const sources = Object.fromEntries(
    [
      'auth-selector',
      'store',
      'auth-context-flow',
      'refresh-coordinator',
      'client',
    ].map((name) => [
      name,
      ts.transpileModule(
        readFileSync(
          `src/features/identity-access/${name === 'client' ? 'api' : 'session'}/${name}.ts`,
          'utf8',
        ),
        {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.CommonJS,
          },
        },
      ).outputText,
    ]),
  );
  await page.evaluate(
    ({ sources, base }) => {
      const cache: Record<string, { exports: Record<string, unknown> }> = {};
      const require = (path: string): Record<string, unknown> => {
        const name = path.split('/').at(-1)!;
        if (!cache[name]) {
          const loaded = { exports: {} };
          cache[name] = loaded;
          new Function(
            'require',
            'exports',
            'process',
            'BroadcastChannel',
            sources[name],
          )(
            require,
            loaded.exports,
            { env: { NEXT_PUBLIC_API_BASE_URL: base } },
            undefined,
          );
        }
        return cache[name].exports;
      };
      Object.assign(window, {
        productionSession: {
          selector: require('auth-selector'),
          store: require('store'),
          coordinator: require('refresh-coordinator'),
        },
      });
    },
    { sources, base: `http://127.0.0.1:${env.proxyPort}/api/v1` },
  );
}

export type ProductionSessionRealm = typeof window & {
  productionSession: {
    selector: typeof import('../../../src/features/identity-access/session/auth-selector');
    store: typeof import('../../../src/features/identity-access/session/store');
    coordinator: typeof import('../../../src/features/identity-access/session/refresh-coordinator');
  };
};
