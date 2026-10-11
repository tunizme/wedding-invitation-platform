import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, runCase } from './responsive-validate.mjs';
import { createServer as createNetServer } from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
const execute = promisify(execFile);
async function freePort() {
  const server = createNetServer();
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  const port = server.address().port;
  await new Promise((accept, reject) =>
    server.close((error) => (error ? reject(error) : accept())),
  );
  return port;
}

const suites = {
  capture: 'responsive-capture.spec.ts',
  smoke: 'responsive-host.spec.ts',
  prototype: 'responsive-prototype.spec.ts',
  renderer: 'responsive-renderer.spec.ts',
};
export async function browserSuite(suite, env = process.env) {
  if (!suites[suite])
    throw new Error('Unsupported independent renderer suite.');
  const web = resolve(root, 'apps/web');
  const req = createRequire(resolve(web, 'package.json'));
  const { chromium, firefox, webkit } = req('@playwright/test');
  const docker = env.RESPONSIVE_TEST_BROWSER_MODE === 'docker';
  for (const [name, browser] of Object.entries(
    docker ? {} : { chromium, firefox, webkit },
  ))
    if (!existsSync(browser.executablePath()))
      throw new Error(
        `Missing ${name} browser; run pnpm --filter @wedding/web exec playwright install ${name}.`,
      );
  const { createServer } = await import(
    pathToFileURL(req.resolve('vite')).href
  );
  const port = await freePort(),
    controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  const browserArtifacts =
    env.RESPONSIVE_ARTIFACTS ??
    resolve(root, '.artifacts/responsive', `browser-${randomUUID()}`);
  mkdirSync(browserArtifacts, { recursive: true });
  let server, browserProcess, browserName, browserWs;
  try {
    if (docker) {
      const browserPort = await freePort();
      browserName = `responsive-browser-${randomUUID()}`;
      const path = `/${randomUUID()}`;
      browserProcess = spawn(
        'docker',
        [
          'run',
          '--rm',
          '--name',
          browserName,
          '--network',
          'host',
          '--init',
          '--shm-size=1g',
          'wedding-builder-playwright:1.63.0',
          'run-server',
          '--host',
          '127.0.0.1',
          '--port',
          String(browserPort),
          '--path',
          path,
        ],
        { stdio: 'ignore' },
      );
      let launchError;
      browserProcess.once('error', (error) => {
        launchError = error;
      });
      const deadline = Date.now() + 30000;
      while (true) {
        if (launchError) throw launchError;
        if (browserProcess.exitCode !== null || controller.signal.aborted)
          throw new Error('Owned browser server stopped before readiness.');
        try {
          const response = await fetch(`http://127.0.0.1:${browserPort}`, {
            signal: AbortSignal.timeout(500),
          });
          if (response.ok) break;
        } catch {}
        if (Date.now() >= deadline)
          throw new Error('Owned browser server readiness deadline exceeded.');
        await new Promise((accept) => setTimeout(accept, 100));
      }
      browserWs = `ws://127.0.0.1:${browserPort}${path}`;
    }
    server = await createServer({
      configFile: resolve(web, 'e2e/responsive-host/vite.config.ts'),
      configLoader: 'runner',
      server: { port, host: '127.0.0.1', strictPort: true },
    });
    await server.listen();
    const result = await runCase(
      {
        id: `browser-${suite}`,
        cwd: 'apps/web',
        files: [`apps/web/e2e/invitation-builder/${suites[suite]}`],
        command: [
          'pnpm',
          'exec',
          'playwright',
          'test',
          '--config=playwright.responsive.config.ts',
        ],
        timeoutMs: suite === 'prototype' ? 540000 : 840000,
      },
      {
        env: {
          ...env,
          RESPONSIVE_SUITE: suite,
          RESPONSIVE_ARTIFACTS: browserArtifacts,
          RESPONSIVE_BROWSER_WS: browserWs,
          RESPONSIVE_HOST_URL: `http://127.0.0.1:${port}`,
        },
        signal: controller.signal,
      },
    );
    if (result.diagnostics) process.stderr.write(result.diagnostics + '\n');
    if (result.status !== 'PASS')
      throw new Error(`Responsive ${suite} browser suite failed.`);
    process.stdout.write(
      `Responsive ${suite}: PASS on Chromium/Firefox/WebKit\n`,
    );
  } finally {
    try {
      await server?.close();
    } finally {
      if (browserName)
        await execute('docker', ['rm', '--force', browserName], {
          timeout: 10000,
        });
      browserProcess?.kill('SIGTERM');
      process.removeListener('SIGINT', abort);
      process.removeListener('SIGTERM', abort);
    }
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  browserSuite(process.argv[3]).catch((error) => {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  });
