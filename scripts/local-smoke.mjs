import { localEnvironment, spawnProcess, terminate, waitForHttp } from './lib.mjs';
import { checkHealth } from './health-check.mjs';

export async function localSmoke() {
  const env = localEnvironment();
  const development = spawnProcess('node', ['scripts/dev.mjs', 'all']);
  try {
    await Promise.all([
      waitForHttp(`http://127.0.0.1:${env.WEB_PORT}/api/health`, { timeoutMs: 90_000 }),
      waitForHttp(`http://127.0.0.1:${env.API_PORT}/api/v1/health/ready`, { timeoutMs: 90_000 }),
    ]);
    const health = await checkHealth();
    if (!health.ok) throw new Error('Full-stack health check failed');
  } finally {
    await terminate(development);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  localSmoke().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
