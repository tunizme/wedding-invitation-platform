import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const load = createRequire(__filename);
type DesignChecks = { checks: Array<{ name: string; run: () => unknown }> };

describe('IAM Setup design and dependency contracts (not runtime API evidence)', () => {
  for (const script of [
    'validate-iam-contract.cjs',
    'validate-iam-dependencies.cjs',
  ]) {
    const { checks } = load(
      resolve(__dirname, '../../../scripts', script),
    ) as DesignChecks;
    it(`${script} has registered checks`, () => {
      expect(checks.length).toBeGreaterThan(0);
    });
    for (const check of checks) it(check.name, check.run);
  }
});
