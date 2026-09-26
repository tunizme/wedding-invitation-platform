import { describe, expect, it } from 'vitest';
import { HealthService } from '../../src/health/health.service';

describe('backend liveness', () => {
  it('does not query the database and does not expose secrets', () => {
    let queries = 0;
    const dataSource = { query: () => (queries += 1) };
    const config = { get: () => 1000 };
    const body = new HealthService(
      dataSource as never,
      config as never,
    ).liveness();
    expect(body.status).toBe('ok');
    expect(body.component).toBe('backend');
    expect(typeof body.timestamp).toBe('string');
    expect(queries).toBe(0);
    expect(JSON.stringify(body)).not.toMatch(
      /password|secret|database_url|postgres/i,
    );
  });
});
