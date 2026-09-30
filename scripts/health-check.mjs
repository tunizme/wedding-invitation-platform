import { createRequire } from 'node:module';
import { localEnvironment, run } from './lib.mjs';

const requireApi = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);

async function httpProbe(name, url) {
  const started = performance.now();
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    const body = await response.json().catch(() => ({}));
    return {
      name,
      ok: response.ok,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      body,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      durationMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function databaseTimeout(environment) {
  const value = Number(environment.DATABASE_HEALTH_TIMEOUT_MS ?? 1000);
  return Number.isFinite(value) && value >= 100 && value <= 10_000
    ? value
    : 1000;
}

export async function databaseProbe(environment, dependencies = {}) {
  const started = performance.now();
  const mode = environment.DATABASE_HEALTH_MODE ?? 'compose';
  let client;
  try {
    if (mode === 'direct') {
      if (!environment.DATABASE_URL) throw new Error('missing database target');
      const clientFactory =
        dependencies.clientFactory ??
        ((options) => new (requireApi('pg').Client)(options));
      client = clientFactory({
        connectionString: environment.DATABASE_URL,
        connectionTimeoutMillis: databaseTimeout(environment),
        query_timeout: databaseTimeout(environment),
        statement_timeout: databaseTimeout(environment),
        application_name: 'health-readiness-probe',
      });
      await client.connect();
      await client.query('SELECT 1');
    } else if (mode === 'compose') {
      await (dependencies.runCommand ?? run)(
        'docker',
        [
          'compose',
          'exec',
          '-T',
          'postgres',
          'pg_isready',
          '-U',
          environment.POSTGRES_USER,
          '-d',
          environment.POSTGRES_DB,
        ],
        { stdio: 'pipe', env: environment },
      );
    } else {
      throw new Error('unsupported database health mode');
    }
    return {
      name: 'postgresql',
      ok: true,
      durationMs: Math.round(performance.now() - started),
    };
  } catch {
    return {
      name: 'postgresql',
      ok: false,
      durationMs: Math.round(performance.now() - started),
      error:
        mode === 'direct'
          ? 'Direct PostgreSQL readiness probe failed'
          : 'Docker Compose PostgreSQL readiness probe failed',
    };
  } finally {
    if (client) await client.end().catch(() => undefined);
  }
}

export async function checkHealth({ print = true, overrides = {} } = {}) {
  const env = localEnvironment(overrides);
  const results = await Promise.all([
    httpProbe('frontend', `http://127.0.0.1:${env.WEB_PORT}/api/health`),
    httpProbe(
      'backend-live',
      `http://127.0.0.1:${env.API_PORT}/api/v1/health/live`,
    ),
    httpProbe(
      'backend-ready',
      `http://127.0.0.1:${env.API_PORT}/api/v1/health/ready`,
    ),
    databaseProbe(env),
  ]);
  if (print) {
    for (const result of results) {
      console.log(
        `${result.ok ? 'OK' : 'FAIL'} ${result.name} (${result.durationMs}ms)`,
      );
    }
  }
  return { ok: results.every((result) => result.ok), results };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  checkHealth().then(({ ok }) => {
    process.exitCode = ok ? 0 : 1;
  });
}
