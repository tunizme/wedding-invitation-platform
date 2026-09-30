import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { safeRequestLog } from '../../../src/common/logging/redaction';

const repositoryRoot = resolve(process.cwd(), '../..');

async function filesBelow(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await filesBelow(path)));
    else if (entry.isFile()) found.push(path);
  }
  return found;
}

describe('IAM secret hygiene', () => {
  it('projects only bounded metadata and strips callback queries and log controls', () => {
    const logged = safeRequestLog(
      {
        method: 'GET\nInjected',
        url: '/api/v1/auth/oauth/google/callback?code=provider-secret&state=oauth-state\nInjected',
      },
      'request-id\r\nInjected',
      400,
    );
    expect(logged).toEqual({
      requestId: 'request-id',
      method: 'GET',
      status: 400,
      route: '/api/v1/auth/oauth/google/callback',
    });
    expect(JSON.stringify(logged)).not.toMatch(
      /provider-secret|oauth-state|authorization|cookie|password|proof/i,
    );
  });

  it('keeps request bodies, headers, callback values, and exception details out of application logs', async () => {
    const sourceFiles = (
      await filesBelow(resolve(repositoryRoot, 'apps/api/src'))
    ).filter((path) => /\.(ts|js)$/.test(path));
    for (const path of sourceFiles) {
      const source = await readFile(path, 'utf8');
      expect(source, path).not.toMatch(
        /(?:console|logger)\.(?:log|info|warn|error|debug)\s*\(\s*(?:request|req|error|query|body|headers)\b/,
      );
    }
    const main = await readFile(
      resolve(repositoryRoot, 'apps/api/src/main.ts'),
      'utf8',
    );
    const problem = await readFile(
      resolve(repositoryRoot, 'apps/api/src/common/errors/problem.filter.ts'),
      'utf8',
    );
    expect(main).toContain("setHeader('Cache-Control', 'no-store')");
    expect(problem).not.toMatch(/error\.message|JSON\.stringify\(error\)/);
    expect(problem).toContain("'Cache-Control', 'no-store'");
  });

  it('allows only NEXT_PUBLIC variables in browser source and no server-secret markers in an existing bundle', async () => {
    const webSource = (
      await filesBelow(resolve(repositoryRoot, 'apps/web/src'))
    ).filter((path) => /\.(ts|tsx|js|jsx)$/.test(path));
    for (const path of webSource) {
      const source = await readFile(path, 'utf8');
      const environmentReads = source.matchAll(/process\.env\.([A-Z0-9_]+)/g);
      for (const match of environmentReads)
        expect(match[1], path).toMatch(/^(NEXT_PUBLIC_|NODE_ENV$|WEB_PORT$)/);
      expect(source, path).not.toMatch(
        /IAM_(?:JWT|REFRESH|CSRF|ENCRYPTION|RATE|GOOGLE|FACEBOOK|RESEND)|BEGIN (?:RSA )?PRIVATE KEY/,
      );
    }

    const staticDirectory = resolve(repositoryRoot, 'apps/web/.next/static');
    if (await stat(staticDirectory).catch(() => undefined)) {
      const bundleFiles = (await filesBelow(staticDirectory)).filter((path) =>
        /\.(?:js|json|css)$/.test(path),
      );
      for (const path of bundleFiles) {
        const bundle = await readFile(path, 'utf8');
        expect(bundle, path).not.toMatch(
          /IAM_(?:JWT|REFRESH|CSRF|ENCRYPTION|RATE|GOOGLE|FACEBOOK|RESEND)|BEGIN (?:RSA )?PRIVATE KEY|DATABASE_URL/,
        );
      }
    }
  });
});
