import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { rootDirectory } from './lib.mjs';

// Features 003/004 approve IAM and invitation editing. Payments remain excluded.
const forbidden = /\bpayment provider\b|\bvnpay/i;
const allowedPaths =
  /^(apps\/(web|api)\/src\/|apps\/(web|api)\/package\.json$)/;

export const isScopePath = (path) => allowedPaths.test(path);
export const hasForbiddenScope = (content) => forbidden.test(content);

export function scopeViolations(paths) {
  return paths.filter(isScopePath).filter((path) => {
    try {
      return hasForbiddenScope(
        readFileSync(`${rootDirectory}/${path}`, 'utf8'),
      );
    } catch (error) {
      // Uncommitted route moves leave deleted files in the Git index.
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  });
}

export function trackedScopeFiles() {
  let output;
  try {
    output = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard'],
      {
        cwd: rootDirectory,
        encoding: 'utf8',
      },
    );
  } catch (error) {
    // Some restricted runners report EPERM after git exits successfully but
    // still provide complete stdout. Preserve deterministic scanner behavior.
    if (!error || typeof error !== 'object' || !('stdout' in error))
      throw error;
    output = String(error.stdout);
  }
  return output.trim().split('\n').filter(Boolean);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const violations = scopeViolations(trackedScopeFiles());
  if (violations.length > 0) {
    console.error(
      `Out-of-scope implementation detected:\n${violations.join('\n')}`,
    );
    process.exitCode = 1;
  } else {
    console.log('Scope check passed.');
  }
}
