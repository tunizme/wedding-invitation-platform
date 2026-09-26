import { describe, expect, it } from 'vitest';
import { GET } from '../src/app/api/health/route';

describe('frontend health contract', () => {
  it('returns uncached, frontend-only, sanitized health', async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json();
    expect(body).toEqual({
      status: 'ok',
      component: 'frontend',
      timestamp: expect.any(String),
    });
    expect(JSON.stringify(body)).not.toMatch(
      /password|secret|database|api_base_url/i,
    );
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });
});
