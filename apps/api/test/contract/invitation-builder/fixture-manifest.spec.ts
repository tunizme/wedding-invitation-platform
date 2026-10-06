import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../../..');
const directory = resolve(
  root,
  'specs/004-invitation-builder/contracts/fixtures',
);
interface FixtureCase {
  id: string;
  file: string;
  kind: string;
  sha256: string;
  expected: Record<string, unknown>;
}
const manifest = JSON.parse(
  readFileSync(resolve(directory, 'manifest.json'), 'utf8'),
) as { cases: FixtureCase[] };
describe('shared fixture corpus integrity (not semantic validation)', () => {
  it('names every fixture and preserves expected outcomes/checksums', () => {
    expect(manifest.cases.length).toBeGreaterThanOrEqual(26);
    expect(new Set(manifest.cases.map((entry) => entry.id)).size).toBe(
      manifest.cases.length,
    );
    for (const entry of manifest.cases) {
      expect(entry.file).toMatch(/^[a-z0-9-]+\.json$/);
      const bytes = readFileSync(resolve(directory, entry.file));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        entry.sha256,
      );
      expect(JSON.parse(bytes.toString())).toBeDefined();
      expect(Object.keys(entry.expected).length).toBeGreaterThan(0);
    }
  });
  it('ships the same reviewed bank snapshot to both independent apps', () => {
    const bytes = readFileSync(resolve(directory, 'banks.json'));
    expect(
      readFileSync(
        resolve(
          root,
          'apps/api/src/modules/invitation-builder/domain/bank-catalog.json',
        ),
      ),
    ).toEqual(bytes);
    expect(
      readFileSync(
        resolve(
          root,
          'apps/web/src/features/invitation-builder/document/bank-catalog.json',
        ),
      ),
    ).toEqual(bytes);
  });
});
