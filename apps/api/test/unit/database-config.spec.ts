import { describe, expect, it } from 'vitest';
import { databaseOptions } from '../../src/infrastructure/database/data-source';

describe('database safety configuration', () => {
  it('never synchronizes or automatically runs migrations', () => {
    const options = databaseOptions(
      'postgresql://user:password@localhost:5432/database',
    );
    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
  });
});
