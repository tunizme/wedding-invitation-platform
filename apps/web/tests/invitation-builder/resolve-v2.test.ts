import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { it, expect } from 'vitest';
import { resolveDesignV2 } from '../../src/features/invitation-builder/document/resolve-design-v2';
const cases = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      '../../../../specs/007-responsive-invitation-layout/contracts/fixtures/resolution-v2.json',
    ),
    'utf8',
  ),
);
for (const c of cases)
  it(c.id, () =>
    expect(
      resolveDesignV2(c.document, c.data, {
        mode: 'preview',
        asOf: '2026-10-11T00:00:00.000Z',
      }),
    ).toEqual(c.expected),
  );

if (process.env.RESPONSIVE_PARITY_OUTPUT) {
  const path = resolve(process.env.RESPONSIVE_PARITY_OUTPUT);
  if (!path.includes('/.artifacts/responsive/parity-'))
    throw new Error('Expected owned parity output');
  writeFileSync(
    path,
    JSON.stringify(
      cases.map(
        (
          c: Parameters<typeof resolveDesignV2> extends [
            infer D,
            infer W,
            ...unknown[],
          ]
            ? { document: D; data: W }
            : never,
        ) =>
          resolveDesignV2(c.document, c.data, {
            mode: 'preview',
            asOf: '2026-10-11T00:00:00.000Z',
          }),
      ),
    ),
  );
}
