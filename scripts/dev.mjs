import { assertPortsAvailable, localEnvironment, run, spawnProcess, terminate } from './lib.mjs';

export async function startDevelopment(mode = 'all') {
  if (!['all', 'api'].includes(mode)) throw new Error(`Unknown development mode: ${mode}`);
  const env = localEnvironment();
  const ports = { api: env.API_PORT, postgres: env.POSTGRES_PORT };
  if (mode === 'all') ports.frontend = env.WEB_PORT;
  await assertPortsAvailable(ports);

  const children = [];
  let stopping = false;
  const cleanup = async () => {
    if (stopping) return;
    stopping = true;
    await Promise.all(children.map((child) => terminate(child)));
    await run('docker', ['compose', 'down', '--remove-orphans']).catch(() => undefined);
  };
  process.once('SIGINT', () => void cleanup().then(() => process.exit(130)));
  process.once('SIGTERM', () => void cleanup().then(() => process.exit(143)));

  try {
    await run('docker', ['compose', 'up', '-d', '--wait', 'postgres']);
    await run('pnpm', ['--filter', '@wedding/api', 'migration:run']);
    children.push(spawnProcess('pnpm', ['--filter', '@wedding/api', 'dev']));
    if (mode === 'all') children.push(spawnProcess('pnpm', ['--filter', '@wedding/web', 'dev']));
    const exits = children.map(
      (child) => new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal }))),
    );
    const result = await Promise.race(exits);
    if (!stopping) throw new Error(`Development process exited unexpectedly: ${JSON.stringify(result)}`);
  } finally {
    await cleanup();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startDevelopment(process.argv[2] ?? 'all').catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
