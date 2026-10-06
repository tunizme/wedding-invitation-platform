import { run } from './lib.mjs';

export async function infrastructure(action, args = process.argv.slice(3)) {
  if (action === 'up') {
    await run('docker', [
      'compose',
      'up',
      '-d',
      '--wait',
      'postgres',
      'mailpit',
      'minio',
    ]);
    return;
  }
  if (action === 'down') {
    await run('docker', ['compose', 'down', '--remove-orphans']);
    return;
  }
  if (action === 'reset') {
    if (!args.includes('--confirm')) {
      throw new Error(
        'Database reset deletes the local PostgreSQL volume. Re-run with: pnpm infra:reset -- --confirm',
      );
    }
    await run('docker', ['compose', 'down', '--volumes', '--remove-orphans']);
    return;
  }
  throw new Error(`Unknown infrastructure action: ${action ?? '(missing)'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  infrastructure(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
