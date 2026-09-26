import { localEnvironment, run } from './lib.mjs';

async function httpProbe(name, url) {
  const started = performance.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000), cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    return { name, ok: response.ok, status: response.status, durationMs: Math.round(performance.now() - started), body };
  } catch (error) {
    return { name, ok: false, durationMs: Math.round(performance.now() - started), error: error instanceof Error ? error.message : String(error) };
  }
}

async function databaseProbe(environment) {
  const started = performance.now();
  try {
    await run(
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
    return { name: 'postgresql', ok: true, durationMs: Math.round(performance.now() - started) };
  } catch (error) {
    return { name: 'postgresql', ok: false, durationMs: Math.round(performance.now() - started), error: error instanceof Error ? error.message : String(error) };
  }
}

export async function checkHealth({ print = true, overrides = {} } = {}) {
  const env = localEnvironment(overrides);
  const results = await Promise.all([
    httpProbe('frontend', `http://127.0.0.1:${env.WEB_PORT}/api/health`),
    httpProbe('backend-live', `http://127.0.0.1:${env.API_PORT}/api/v1/health/live`),
    httpProbe('backend-ready', `http://127.0.0.1:${env.API_PORT}/api/v1/health/ready`),
    databaseProbe(env),
  ]);
  if (print) {
    for (const result of results) {
      console.log(`${result.ok ? 'OK' : 'FAIL'} ${result.name} (${result.durationMs}ms)`);
    }
  }
  return { ok: results.every((result) => result.ok), results };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  checkHealth().then(({ ok }) => {
    process.exitCode = ok ? 0 : 1;
  });
}
