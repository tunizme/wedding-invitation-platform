import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, runCase } from '../responsive-validate.mjs';

test(
  'independent native 500px FE/API serialized resolution stays equal',
  { timeout: 120000 },
  async () => {
    const base = resolve(root, '.artifacts/responsive');
    mkdirSync(base, { recursive: true });
    const owned = mkdtempSync(resolve(base, 'parity-'));
    try {
      for (const app of ['web', 'api']) {
        const file =
          app === 'web'
            ? 'tests/invitation-builder/editor-parity.test.ts'
            : 'test/unit/invitation-builder/editor-parity.spec.ts';
        const command = [
          'pnpm',
          'exec',
          'vitest',
          'run',
          '--configLoader',
          'runner',
          ...(app === 'api' ? ['--project', 'unit'] : []),
          file,
        ];
        const result = await runCase(
          {
            id: app,
            cwd: `apps/${app}`,
            files: [`apps/${app}/${file}`],
            command,
            timeoutMs: 50000,
          },
          { env: { RESPONSIVE_PARITY_OUTPUT: resolve(owned, `${app}.json`) } },
        );
        assert.equal(result.status, 'PASS', result.diagnostics);
      }
      const web = JSON.parse(readFileSync(resolve(owned, 'web.json'), 'utf8'));
      const api = JSON.parse(readFileSync(resolve(owned, 'api.json'), 'utf8'));
      assert.deepEqual(web, api);
      assert.equal(web.length, 3);
      for (const result of web) {
        assert.equal(result.scene.canvas.width, 500);
        assert.equal(result.scene.schemaVersion, 3);
        assert.equal(result.scene.settings.pageAnimation, 'fade-mix');
      }
    } finally {
      rmSync(owned, { recursive: true, force: true });
    }
  },
);
