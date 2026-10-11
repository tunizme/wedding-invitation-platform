import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const budgets = Object.freeze({
  prototype: 600000,
  contracts: 600000,
  persistence: 900000,
  rendering: 900000,
  publication: 900000,
  authoring: 900000,
  all: 2700000,
});

export function selectCases(manifest, phase, story) {
  if (!Object.hasOwn(budgets, phase))
    throw new Error('Unknown phase. Use --help.');
  if (story && (phase !== 'rendering' || !['US1', 'US2'].includes(story)))
    throw new Error(
      '--story US1|US2 is supported only with --phase rendering.',
    );
  if (!Array.isArray(manifest) || !manifest.length)
    throw new Error('No validation cases registered.');
  const ids = new Set();
  for (const entry of manifest) {
    if (
      !entry.id ||
      ids.has(entry.id) ||
      !Object.hasOwn(budgets, entry.phase) ||
      entry.phase === 'all' ||
      !Array.isArray(entry.command) ||
      !entry.command.length ||
      !entry.command.every((value) => typeof value === 'string') ||
      !Array.isArray(entry.files) ||
      !entry.files.length ||
      !entry.cwd
    )
      throw new Error('Invalid or duplicate validation case.');
    ids.add(entry.id);
  }
  const selected = manifest.filter(
    (entry) =>
      (phase === 'all' || entry.phase === phase) &&
      (!story || entry.story === story),
  );
  if (!selected.length)
    throw new Error('No required cases selected; refusing an empty PASS.');
  if (phase === 'all') {
    for (const name of Object.keys(budgets).filter((name) => name !== 'all'))
      if (!selected.some((entry) => entry.phase === name))
        throw new Error(`Missing phase ${name}.`);
  }
  if (phase === 'all' || (phase === 'rendering' && !story)) {
    for (const name of ['US1', 'US2'])
      if (
        !selected.some(
          (entry) => entry.phase === 'rendering' && entry.story === name,
        )
      )
        throw new Error(`Missing rendering ${name} cases.`);
  }
  return selected;
}

export function redact(text, env = process.env) {
  let output = String(text);
  for (const [key, value] of Object.entries(env)) {
    if (
      value &&
      /secret|password|token|credential|database_url|cookie|authorization/i.test(
        key,
      )
    )
      output = output.split(value).join('[REDACTED]');
  }
  return output
    .replace(/(postgres(?:ql)?:\/\/)[^\s]+/gi, '$1[REDACTED]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]');
}

export function containedPath(base, path) {
  const result = resolve(base, path),
    rel = relative(base, result);
  if (rel.startsWith('..') || isAbsolute(rel))
    throw new Error('Case path outside repository.');
  return result;
}

/** Only handles process groups started by this runner; never discovers/kills shared services. */
export async function runCase(entry, options = {}) {
  const base = options.root ?? root;
  for (const file of entry.files) {
    if (!existsSync(containedPath(base, file)))
      throw new Error(
        `Missing prerequisite ${file}; implement the owning task first.`,
      );
  }
  const env = { ...process.env, ...options.env };
  for (const key of entry.env ?? [])
    if (!env[key])
      throw new Error(
        `Missing ${key}; configure the documented runner-owned test environment.`,
      );
  const timeoutMs = Math.min(
    entry.timeoutMs ?? 600000,
    options.remainingMs ?? 600000,
  );
  if (!(timeoutMs > 0)) throw new Error('Validation deadline exhausted.');
  const started = Date.now();
  const child = spawn(entry.command[0], entry.command.slice(1), {
    cwd: containedPath(base, entry.cwd),
    env,
    shell: false,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '',
    timedOut = false,
    settled = false;
  const collect = (bytes) => {
    output = (output + bytes.toString()).slice(-12000);
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  let killTimer;
  const stop = (signal = 'SIGTERM') => {
    if (!child.pid || settled) return;
    try {
      if (process.platform === 'win32') child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    if (signal === 'SIGTERM' && !killTimer)
      killTimer = setTimeout(() => stop('SIGKILL'), 35000);
  };
  const timer = setTimeout(() => {
    timedOut = true;
    stop();
  }, timeoutMs);
  const abort = () => {
    timedOut = true;
    stop();
  };
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    const code = await new Promise((accept, reject) => {
      child.once('error', reject);
      child.once('close', (exitCode) => {
        settled = true;
        accept(exitCode);
      });
      if (options.signal?.aborted) abort();
    });
    return {
      id: entry.id,
      status: !timedOut && code === 0 ? 'PASS' : 'FAIL',
      code,
      timedOut,
      durationMs: Date.now() - started,
      diagnostics: code === 0 && !timedOut ? '' : redact(output, env),
    };
  } finally {
    clearTimeout(timer);
    clearTimeout(killTimer);
    options.signal?.removeEventListener('abort', abort);
    stop();
  }
}

export async function validate({
  phase,
  story,
  manifest,
  base = root,
  env,
  signal,
  evidence = true,
}) {
  const runId = randomUUID(),
    started = Date.now();
  const selected = selectCases(manifest, phase, story);
  const report = {
    runId,
    phase,
    story: story ?? null,
    status: 'FAIL',
    cases: [],
    cleanup: 'NOT_STARTED',
  };
  const directory = containedPath(base, `.artifacts/responsive/${runId}`);
  if (evidence) mkdirSync(directory, { recursive: true });
  try {
    // Preflight every selected case before running any side effects.
    for (const entry of selected) {
      for (const file of entry.files)
        if (!existsSync(containedPath(base, file)))
          throw new Error(`Missing prerequisite ${file}.`);
      for (const key of entry.env ?? [])
        if (!(env ?? process.env)[key])
          throw new Error(`Missing environment ${key}.`);
    }
    for (const entry of selected) {
      const result = await runCase(entry, {
        root: base,
        env,
        signal,
        remainingMs: budgets[phase] - (Date.now() - started),
      });
      report.cases.push(result);
      report.cleanup = result.timedOut || result.status !== 'PASS' ? 'UNVERIFIED' : 'PASS';
      if (result.status !== 'PASS')
        throw new Error(`Validation case ${entry.id} failed.`);
    }
    report.status = 'PASS';
    return report;
  } catch (error) {
    report.error = redact(error.message, env);
    throw Object.assign(error, { report });
  } finally {
    report.durationMs = Date.now() - started;
    // Each child orchestrator owns/cleans its fixtures; this runner owns process groups only.
    // A fixture cleanup failure must cause the child to exit nonzero.
    if (evidence)
      writeFileSync(
        resolve(directory, 'report.json'),
        JSON.stringify(report, null, 2) + '\n',
      );
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(
      'Usage: node scripts/responsive-validate.mjs --phase prototype|contracts|persistence|rendering|publication|authoring|all [--story US1|US2]',
    );
    return;
  }
  const flags = {};
  for (let index = 0; index < args.length; index += 2) {
    if (
      !['--phase', '--story'].includes(args[index]) ||
      !args[index + 1] ||
      flags[args[index]]
    )
      throw new Error('Invalid or duplicate argument. Use --help.');
    flags[args[index]] = args[index + 1];
  }
  const manifest = JSON.parse(
    readFileSync(resolve(root, 'scripts/responsive-cases.json'), 'utf8'),
  );
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  try {
    const report = await validate({
      phase: flags['--phase'],
      story: flags['--story'],
      manifest,
      signal: controller.signal,
    });
    console.log(
      `Responsive ${report.phase}: ${report.status} (${report.cases.length} cases); run ${report.runId}`,
    );
  } finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(redact(error.message));
    process.exitCode = 1;
  });
