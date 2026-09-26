import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';

export const rootDirectory = new URL('../', import.meta.url).pathname;

export function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
}

export function localEnvironment(overrides = {}) {
  const root = parseEnvFile(`${rootDirectory}/.env`);
  const api = parseEnvFile(`${rootDirectory}/apps/api/.env`);
  const web = parseEnvFile(`${rootDirectory}/apps/web/.env.local`);
  const merged = {
    COMPOSE_PROJECT_NAME: 'wedding-foundation',
    POSTGRES_DB: 'wedding_local',
    POSTGRES_USER: 'wedding_local',
    POSTGRES_PASSWORD: 'local-development-only',
    POSTGRES_PORT: '5432',
    WEB_PORT: '3000',
    API_PORT: '3001',
    FRONTEND_ORIGIN: 'http://localhost:3000',
    NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001/api/v1',
    DATABASE_HEALTH_TIMEOUT_MS: '1000',
    ...root,
    ...api,
    ...web,
    ...process.env,
    ...overrides,
  };
  merged.DATABASE_URL ??=
    `postgresql://${merged.POSTGRES_USER}:${merged.POSTGRES_PASSWORD}` +
    `@127.0.0.1:${merged.POSTGRES_PORT}/${merged.POSTGRES_DB}`;
  return merged;
}

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDirectory,
      env: localEnvironment(options.env),
      stdio: options.stdio ?? 'inherit',
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve({ code, signal });
      else reject(new Error(`${command} ${args.join(' ')} failed (${code ?? signal})`));
    });
  });
}

export function spawnProcess(command, args, options = {}) {
  return spawn(command, args, {
    cwd: rootDirectory,
    env: localEnvironment(options.env),
    stdio: options.stdio ?? 'inherit',
    shell: false,
    detached: process.platform !== 'win32',
  });
}

export async function isPortAvailable(port, host = '127.0.0.1') {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ port: Number(port), host }, () => server.close(() => resolve(true)));
  });
}

export async function assertPortsAvailable(components, check = isPortAvailable) {
  const occupied = [];
  for (const [component, port] of Object.entries(components)) {
    if (!(await check(port))) occupied.push(`${component} (${port})`);
  }
  if (occupied.length > 0) {
    throw new Error(`Required local port is occupied: ${occupied.join(', ')}. Stop the conflicting process or change the documented port.`);
  }
}

export async function waitForHttp(url, { timeoutMs = 30_000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000), cache: 'no-store' });
      if (response.ok) return response;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : 'unknown error'}`);
}

export async function terminate(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') child.kill(signal);
  else process.kill(-child.pid, signal);
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}
