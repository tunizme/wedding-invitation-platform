import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/main.ts'), 'utf8');

describe('API bootstrap policy', () => {
  it('uses the versioned REST prefix', () => {
    expect(source).toContain("setGlobalPrefix('api/v1')");
  });

  it('enables validation, CORS, and shutdown hooks', () => {
    expect(source).toContain('ValidationPipe');
    expect(source).toContain('configureRequestBoundaries');
    expect(source).toContain('enableShutdownHooks');
  });
});
