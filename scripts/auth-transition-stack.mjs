import { spawn } from 'node:child_process';
import { constants, copyFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withTestSchema } from './iam-validate.mjs';
import { setTimeout as delay } from 'node:timers/promises';

/**
 * Owned test stack for the 006 browser suite: disposable schema → migrations
 * → real API with the test-only OAuth harness. Runs until SIGINT/SIGTERM or
 * until `run` resolves, then stops the API and drops only its own schema.
 * Never use against production or a database holding user data.
 */
const root = fileURLToPath(new URL('../', import.meta.url));

/**
 * Give each owned Next process a disposable copy of the app tsconfig. Next.js
 * writes generated route-type includes into the selected config; keeping this
 * copy beside the app preserves relative paths while never mutating source.
 */
export function createOwnedNextTsconfig(webRoot, id = randomUUID()) {
  if (!/^[A-Za-z0-9-]+$/.test(id))
    throw new Error('auth-transition stack: invalid owned tsconfig id');
  const filename = `.tsconfig-auth-transition-${id}.json`;
  const path = join(webRoot, filename);
  copyFileSync(join(webRoot, 'tsconfig.json'), path, constants.COPYFILE_EXCL);
  let cleaned = false;
  return {
    filename,
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      if (existsSync(path)) unlinkSync(path);
    },
  };
}

export function pnpmCommand(args, execPath = process.env.npm_execpath) {
  if (!execPath) return ['pnpm', args];
  // pnpm can be a JS entry or a native executable (including extensionless
  // Linux binaries). Only JavaScript entries should be passed to Node.
  return /\.[cm]?js$/i.test(execPath)
    ? [process.execPath, [execPath, ...args]]
    : [execPath, args];
}

function remaining(deadline, signal) {
  if (signal?.aborted) throw new Error('auth-transition stack: aborted');
  const ms = deadline - Date.now();
  if (!Number.isFinite(ms) || ms <= 0)
    throw new Error('auth-transition stack: phase deadline exceeded');
  return ms;
}

export async function waitForLive(url, deadline, signal) {
  while (true) {
    const ms = remaining(deadline, signal);
    try {
      const timeout = AbortSignal.timeout(Math.max(1, Math.min(2000, ms)));
      const response = await fetch(url, {
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (response.ok) {
        remaining(deadline, signal);
        return;
      }
    } catch {
      remaining(deadline, signal);
    }
    try {
      await delay(Math.min(250, remaining(deadline, signal)), undefined, {
        signal,
      });
    } catch {
      throw new Error('auth-transition stack: aborted');
    }
  }
}

const exited = (child) => child.exitCode !== null || child.signalCode !== null;

/** Checks the owned process group, including children left by an exited parent. */
function groupAlive(child) {
  if (!child?.pid) return false;
  if (process.platform === 'win32') return !exited(child);
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

async function signalTree(child, signal, deadline) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    // taskkill /T terminates descendants too; await its result rather than fire-and-forget.
    await new Promise((resolveTask, reject) => {
      const killer = spawn(
        'taskkill',
        ['/pid', String(child.pid), '/T', '/F'],
        { stdio: 'ignore' },
      );
      const timer = setTimeout(
        () => {
          killer.kill();
          reject(new Error('auth-transition stack: cleanup deadline exceeded'));
        },
        Math.max(1, deadline - Date.now()),
      );
      killer.once('error', () => {
        clearTimeout(timer);
        reject(new Error('auth-transition stack: cleanup taskkill failed'));
      });
      killer.once('close', (code) => {
        clearTimeout(timer);
        if (code === 0 || exited(child)) resolveTask();
        else
          reject(new Error('auth-transition stack: cleanup taskkill failed'));
      });
    });
  } else {
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH')
        throw new Error('auth-transition stack: cleanup signal failed');
    }
  }
}

export async function stopOwnedProcess(
  child,
  { deadline = Date.now() + 10000, graceMs = 3000 } = {},
) {
  if (!child) return;
  if (deadline <= Date.now())
    throw new Error('auth-transition stack: cleanup deadline exceeded');
  if (!groupAlive(child)) return;
  await signalTree(child, 'SIGTERM', deadline);
  const grace = Math.min(deadline, Date.now() + graceMs);
  while (groupAlive(child) && Date.now() < grace) await delay(20);
  if (groupAlive(child)) await signalTree(child, 'SIGKILL', deadline);
  while ((groupAlive(child) || !exited(child)) && Date.now() < deadline)
    await delay(20);
  if (groupAlive(child) || !exited(child))
    throw new Error(
      'auth-transition stack: cleanup could not verify process exit',
    );
}

/** Every command owns a process tree; no successful result precedes verified cleanup. */
export async function runOwnedCommand(
  command,
  args,
  {
    cwd = root,
    env = process.env,
    timeoutMs,
    signal,
    stdio = 'inherit',
    cleanupDeadline,
  } = {},
) {
  remaining(Date.now() + timeoutMs, signal);
  const child = spawn(command, args, {
    cwd,
    env,
    stdio,
    shell: false,
    detached: process.platform !== 'win32',
  });
  try {
    await new Promise((resolveCommand, reject) => {
      const fail = (message) => reject(new Error(message));
      const abort = () => fail('auth-transition stack: aborted');
      const timer = setTimeout(
        () => fail('auth-transition stack: command deadline exceeded'),
        timeoutMs,
      );
      const detach = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      };
      signal?.addEventListener('abort', abort, { once: true });
      child.once('error', () => {
        detach();
        fail('auth-transition stack: command could not start');
      });
      child.once('exit', (code) => {
        detach();
        if (code === 0) resolveCommand();
        else fail('auth-transition stack: command failed');
      });
      // Rejecting via timeout/abort must also remove timers/listeners.
      child.once('close', detach);
      if (signal?.aborted) abort();
    });
  } finally {
    await stopOwnedProcess(child, {
      deadline: Math.min(cleanupDeadline ?? Infinity, Date.now() + 10000),
      graceMs: 1000,
    });
  }
}

/**
 * Browser layout (all on 127.0.0.1 so host-only cookies are shared):
 *   web  :3100  (Next dev, NEXT_PUBLIC_API_BASE_URL → proxy)
 *   proxy:3102  (started by the Playwright test; upstream → api)
 *   api  :3101  (real API + test-only OAuth harness)
 */
export const STACK = {
  webPort: Number(process.env.AUTH_TRANSITION_WEB_PORT ?? 3100),
  apiPort: Number(process.env.AUTH_TRANSITION_API_PORT ?? 3101),
  proxyPort: Number(process.env.AUTH_TRANSITION_PROXY_PORT ?? 3102),
  providerPort: Number(process.env.AUTH_TRANSITION_PROVIDER_PORT ?? 3190),
};

export async function withAuthTransitionStack({
  apiPort = STACK.apiPort,
  providerPort = STACK.providerPort,
  webPort = STACK.webPort,
  proxyPort = STACK.proxyPort,
  withWeb = process.env.AUTH_TRANSITION_WITH_WEB === '1',
  frontendOrigin = `http://127.0.0.1:${STACK.webPort}`,
  startupMs = 180_000,
  deadline = Date.now() + 3_570_000,
  cleanupDeadline = deadline + 30_000,
  signal,
  run,
}) {
  remaining(deadline, signal);
  const startupDeadline = Math.min(deadline, Date.now() + startupMs);
  return withTestSchema({
    databaseUrl: process.env.IAM_TEST_DATABASE_URL,
    run: async (schemaEnv) => {
      const env = {
        ...process.env,
        ...schemaEnv,
        NEXT_DIST_DIR: `.next-auth-transition-${webPort}`,
        API_PORT: String(apiPort),
        HARNESS_PROVIDER_PORT: String(providerPort),
        API_PUBLIC_ORIGIN: `http://127.0.0.1:${apiPort}`,
        FRONTEND_ORIGIN: frontendOrigin,
      };
      const [migrate, migrateArgs] = pnpmCommand([
        '--filter',
        '@wedding/api',
        'migration:run',
      ]);
      await runOwnedCommand(
        process.execPath,
        ['apps/api/scripts/with-test-iam.cjs', migrate, ...migrateArgs],
        {
          cwd: root,
          env,
          timeoutMs: remaining(startupDeadline, signal),
          signal,
          cleanupDeadline,
          stdio: 'ignore',
        },
      );
      const [command, args] = pnpmCommand([
        '--filter',
        '@wedding/api',
        'exec',
        'ts-node',
        '--transpile-only',
        'test/fixtures/identity-access/oauth-browser-harness.ts',
      ]);
      const api = spawn(
        process.execPath,
        ['apps/api/scripts/with-test-iam.cjs', command, ...args],
        {
          cwd: root,
          env,
          stdio: 'inherit',
          shell: false,
          detached: process.platform !== 'win32',
        },
      );
      let web;
      let ownedTsconfig;
      try {
        await waitForLive(
          `http://127.0.0.1:${apiPort}/api/v1/health/live`,
          startupDeadline,
          signal,
        );
        if (withWeb) {
          ownedTsconfig = createOwnedNextTsconfig(
            join(root, 'apps/web'),
            `${webPort}-${randomUUID()}`,
          );
          const [webCommand, webArgs] = pnpmCommand([
            '--filter',
            '@wedding/web',
            'exec',
            'next',
            'dev',
            '--hostname',
            '127.0.0.1',
            '--port',
            String(webPort),
          ]);
          web = spawn(webCommand, webArgs, {
            cwd: root,
            env: {
              ...process.env,
              NEXT_DIST_DIR: env.NEXT_DIST_DIR,
              NEXT_TSCONFIG_PATH: ownedTsconfig.filename,
              NEXT_PUBLIC_API_BASE_URL: `http://127.0.0.1:${proxyPort}/api/v1`,
            },
            stdio: 'inherit',
            shell: false,
            detached: process.platform !== 'win32',
          });
          await waitForLive(
            `http://127.0.0.1:${webPort}/api/health`,
            startupDeadline,
            signal,
          );
        }
        return await run({
          apiUrl: `http://127.0.0.1:${apiPort}`,
          providerUrl: `http://127.0.0.1:${providerPort}`,
          webUrl: withWeb ? `http://127.0.0.1:${webPort}` : undefined,
          proxyPort,
        });
      } finally {
        const stopped = await Promise.allSettled(
          [web, api].map((child) =>
            stopOwnedProcess(child, {
              deadline: Math.min(cleanupDeadline, Date.now() + 10000),
            }),
          ),
        );
        ownedTsconfig?.cleanup();
        if (stopped.some((result) => result.status === 'rejected'))
          throw new Error('auth-transition stack: cleanup failed');
      }
    },
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  // Usage: node scripts/auth-transition-stack.mjs -- <command> [...args]
  // The command receives AUTH_TRANSITION_API_URL / AUTH_TRANSITION_PROVIDER_URL.
  const separator = process.argv.indexOf('--');
  const command = separator >= 0 ? process.argv.slice(separator + 1) : [];
  try {
    await withAuthTransitionStack({
      // An idle warm server has no phase lifetime. Actual teardown remains
      // bounded by stopOwnedProcess; a later stop must not inherit an expired deadline.
      ...(!command.length ? { cleanupDeadline: Infinity } : {}),
      run: ({ apiUrl, providerUrl, webUrl, proxyPort }) =>
        command.length
          ? runOwnedCommand(command[0], command.slice(1), {
              cwd: root,
              env: {
                ...process.env,
                AUTH_TRANSITION_API_URL: apiUrl,
                AUTH_TRANSITION_PROVIDER_URL: providerUrl,
                AUTH_TRANSITION_PROXY_PORT: String(proxyPort),
                ...(webUrl ? { AUTH_TRANSITION_WEB_URL: webUrl } : {}),
              },
              timeoutMs: 3_600_000,
            })
          : new Promise((done) => {
              console.log(`auth-transition stack ready: ${apiUrl}`);
              process.once('SIGINT', done);
              process.once('SIGTERM', done);
            }),
    });
  } catch (error) {
    console.error(
      /^(auth-transition stack|Set IAM_TEST_DATABASE_URL|IAM_TEST_DATABASE_URL must)/.test(
        error.message,
      )
        ? error.message
        : 'auth-transition stack failed; inspect the bounded output.',
    );
    process.exitCode = 1;
  }
}
