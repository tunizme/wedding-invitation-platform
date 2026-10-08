// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startDeliveryProxy, type DeliveryProxy } from './delivery-proxy';

describe('delivery proxy', () => {
  let upstream: Server;
  let proxy: DeliveryProxy;
  const commits: string[] = [];

  beforeEach(async () => {
    commits.length = 0;
    upstream = createServer((request, response) => {
      commits.push(request.url ?? '');
      response.setHeader('set-cookie', [
        'a=1; Path=/; HttpOnly',
        'b=2; Path=/api; HttpOnly',
      ]);
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: request.url }));
    });
    await new Promise<void>((done) => upstream.listen(0, '127.0.0.1', done));
    const { port } = upstream.address() as AddressInfo;
    proxy = await startDeliveryProxy({ upstream: `http://127.0.0.1:${port}` });
  });

  afterEach(async () => {
    await proxy.close();
    await new Promise<void>((done) => upstream.close(() => done()));
  });

  it('passes unheld responses through with separate Set-Cookie headers', async () => {
    const response = await fetch(`${proxy.url}/free`);
    expect(response.status).toBe(201);
    expect(response.headers.getSetCookie()).toEqual([
      'a=1; Path=/; HttpOnly',
      'b=2; Path=/api; HttpOnly',
    ]);
    expect(await response.json()).toEqual({ ok: '/free' });
  });

  it('commits upstream immediately but delivers only on release', async () => {
    proxy.hold({ method: 'POST', path: '/held' });
    let delivered = false;
    const pending = fetch(`${proxy.url}/held`, { method: 'POST' }).then(
      (response) => {
        delivered = true;
        return response;
      },
    );
    const held = await proxy.nextHeld({ path: '/held' });
    await held.committed;
    expect(commits).toEqual(['/held']);
    expect(held.status).toBe(201);
    await new Promise((done) => setTimeout(done, 100));
    expect(delivered).toBe(false);
    await held.release();
    const response = await pending;
    expect(response.headers.getSetCookie()).toHaveLength(2);
  });

  it('can drop a held response after commit', async () => {
    proxy.hold({ path: /^\/drop/ });
    const pending = fetch(`${proxy.url}/drop`).then(
      () => 'delivered',
      () => 'failed',
    );
    const held = await proxy.nextHeld({ path: '/drop' });
    await held.committed;
    held.drop();
    expect(await pending).toBe('failed');
    expect(commits).toEqual(['/drop']);
  });

  it('does not return a released response when the same path is held again', async () => {
    proxy.hold({ method: 'POST', path: '/repeat', times: 1 });
    const firstRequest = fetch(`${proxy.url}/repeat`, { method: 'POST' });
    const first = await proxy.nextHeld({ path: '/repeat' });
    await first.committed;
    await first.release();
    await firstRequest;

    proxy.hold({ method: 'POST', path: '/repeat', times: 1 });
    const secondRequest = fetch(`${proxy.url}/repeat`, { method: 'POST' });
    const second = await proxy.nextHeld({ path: '/repeat' });
    await second.committed;
    expect(second.id).not.toBe(first.id);
    expect(proxy.observations().map((item) => item.method)).toEqual([
      'POST',
      'POST',
    ]);
    await second.release();
    await secondRequest;
  });
});
