import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Owned loopback reverse proxy for 006 delivery tests (research R08).
 *
 * Requests are always forwarded upstream immediately, so the server commits
 * for real. When a request matches a hold rule, the upstream response
 * (status, headers including every separate Set-Cookie, body) is buffered and
 * only written to the browser when the test releases it. Header values are
 * never logged.
 */

export interface HoldRule {
  method?: string;
  path: string | RegExp;
  /** Hold only the first N matching requests (default: every match). */
  times?: number;
}

export interface HeldResponse {
  id: number;
  method: string;
  path: string;
  status: number;
  /** Resolves when the upstream response is fully buffered (server committed). */
  committed: Promise<void>;
  release(): Promise<void>;
  /** Close the browser connection without delivering anything. */
  drop(): void;
}

/** Size-only observation of a forwarded request's Cookie header (never values). */
export interface CookieObservation {
  method: string;
  path: string;
  cookieCount: number;
  cookieHeaderBytes: number;
}

export interface DeliveryProxy {
  url: string;
  /** Cookie header sizes seen on forwarded requests, oldest first. */
  observations(): readonly CookieObservation[];
  hold(rule: HoldRule): void;
  clearHolds(): void;
  /** Wait until a held response matching the rule exists. */
  nextHeld(rule: HoldRule, timeoutMs?: number): Promise<HeldResponse>;
  held(): readonly HeldResponse[];
  close(): Promise<void>;
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
]);

function matches(rule: HoldRule, method: string, path: string): boolean {
  if (rule.method && rule.method.toUpperCase() !== method.toUpperCase())
    return false;
  return typeof rule.path === 'string'
    ? path === rule.path || path.startsWith(`${rule.path}?`)
    : rule.path.test(path);
}

function forwardHeaders(headers: IncomingHttpHeaders, upstreamHost: string) {
  const result: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || HOP_BY_HOP.has(name)) continue;
    result[name] = value;
  }
  result.host = upstreamHost;
  return result;
}

export async function startDeliveryProxy(options: {
  upstream: string;
  port?: number;
}): Promise<DeliveryProxy> {
  const upstream = new URL(options.upstream);
  const rules: HoldRule[] = [];
  const heldResponses: HeldResponse[] = [];
  const waiters: {
    rule: HoldRule;
    resolve: (held: HeldResponse) => void;
  }[] = [];
  const sockets = new Set<import('node:net').Socket>();
  const cookieObservations: CookieObservation[] = [];
  let nextId = 1;

  function notify(held: HeldResponse) {
    for (const waiter of [...waiters]) {
      if (matches(waiter.rule, held.method, held.path)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(held);
      }
    }
  }

  function writeResponse(
    response: ServerResponse,
    upstreamResponse: IncomingMessage,
    body: Buffer,
  ) {
    const headers: Record<string, string | string[]> = {};
    for (const [name, value] of Object.entries(upstreamResponse.headers)) {
      if (value === undefined || HOP_BY_HOP.has(name)) continue;
      headers[name] = value;
    }
    headers['content-length'] = String(body.length);
    response.writeHead(upstreamResponse.statusCode ?? 502, headers);
    response.end(body);
  }

  const server: Server = createServer((request, response) => {
    const method = request.method ?? 'GET';
    const path = request.url ?? '/';
    const rule = rules.find((candidate) => matches(candidate, method, path));
    if (rule?.times !== undefined) {
      rule.times -= 1;
      if (rule.times <= 0) rules.splice(rules.indexOf(rule), 1);
    }
    const cookieHeader = request.headers.cookie ?? '';
    cookieObservations.push({
      method,
      path,
      cookieCount: cookieHeader ? cookieHeader.split(';').length : 0,
      cookieHeaderBytes: Buffer.byteLength(cookieHeader),
    });
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const upstreamRequest = httpRequest(
        {
          protocol: upstream.protocol,
          hostname: upstream.hostname,
          port: upstream.port,
          method,
          path,
          headers: forwardHeaders(request.headers, upstream.host),
        },
        (upstreamResponse) => {
          const bodyChunks: Buffer[] = [];
          upstreamResponse.on('data', (chunk: Buffer) =>
            bodyChunks.push(chunk),
          );
          upstreamResponse.on('end', () => {
            const body = Buffer.concat(bodyChunks);
            if (!rule) {
              writeResponse(response, upstreamResponse, body);
              return;
            }
            const held = heldEntry;
            held.status = upstreamResponse.statusCode ?? 502;
            held.release = () =>
              new Promise<void>((done) => {
                if (response.destroyed) {
                  removeHeld();
                  return done();
                }
                const finish = () => {
                  removeHeld();
                  done();
                };
                response.once('finish', finish);
                response.once('close', finish);
                writeResponse(response, upstreamResponse, body);
              });
            markCommitted();
          });
        },
      );
      upstreamRequest.on('error', () => {
        if (!response.headersSent) response.writeHead(502);
        response.end();
      });
      upstreamRequest.end(Buffer.concat(chunks));
    });

    let markCommitted = () => {};
    const heldEntry: HeldResponse = {
      id: nextId++,
      method,
      path,
      status: 0,
      committed: new Promise<void>((done) => {
        markCommitted = done;
      }),
      release: () => Promise.reject(new Error('Response not committed yet')),
      drop: () => response.destroy(),
    };
    let active = true;
    const removeHeld = () => {
      if (!active) return;
      active = false;
      const index = heldResponses.indexOf(heldEntry);
      if (index >= 0) heldResponses.splice(index, 1);
    };
    response.once('close', removeHeld);
    heldEntry.drop = () => {
      removeHeld();
      response.destroy();
    };
    if (rule) {
      heldResponses.push(heldEntry);
      notify(heldEntry);
    }
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  await new Promise<void>((done) =>
    server.listen(options.port ?? 0, '127.0.0.1', done),
  );
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    observations: () => cookieObservations,
    hold(rule) {
      rules.push(rule);
    },
    clearHolds() {
      rules.length = 0;
    },
    nextHeld(rule, timeoutMs = 15_000) {
      const existing = heldResponses.find((held) =>
        matches(rule, held.method, held.path),
      );
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const waiter = { rule, resolve };
        waiters.push(waiter);
        setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) {
            waiters.splice(index, 1);
            reject(new Error('No held response matched in time'));
          }
        }, timeoutMs).unref();
      });
    },
    held: () => heldResponses,
    close: () =>
      new Promise<void>((done) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => done());
      }),
  };
}
