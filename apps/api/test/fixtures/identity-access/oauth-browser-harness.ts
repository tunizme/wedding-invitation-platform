/**
 * Test-only OAuth browser harness (feature 006, research R08).
 *
 * Boots the real API (real OAuth controllers, transaction state, browser
 * binding, claim, identity resolution, onboarding and redirects) with the
 * Google adapter replaced by a deterministic provider double. A loopback
 * "provider" server plays the authorization page and exposes a control API so
 * browser tests can register identities per authorization code. No production
 * module registers this file and no provider secret is required.
 *
 * Run (from repo root, disposable test environment only):
 *   node apps/api/scripts/with-test-iam.cjs pnpm --filter @wedding/api exec \
 *     ts-node test/fixtures/identity-access/oauth-browser-harness.ts
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../../src/app.module';
import { configureApplication } from '../../../src/main';
import type { VerifiedProviderIdentity } from '../../../src/modules/identity-access/domain/provider-identity.port';
import { GoogleAdapter } from '../../../src/modules/identity-access/oauth/google.adapter';
import { CredentialCrypto } from '../../../src/modules/identity-access/infrastructure/credential-crypto';
import { DataSource } from 'typeorm';

export class HarnessGoogleAdapter {
  readonly identities = new Map<string, VerifiedProviderIdentity>();

  constructor(private readonly providerOrigin: string) {}

  authorizationUrl(input: { state: string }): string {
    const url = new URL('/authorize', this.providerOrigin);
    url.searchParams.set('state', input.state);
    return url.toString();
  }

  verifyCallback(input: { code: string }): Promise<VerifiedProviderIdentity> {
    const identity = this.identities.get(input.code);
    // Codes are single use, like a real provider authorization code.
    this.identities.delete(input.code);
    return identity
      ? Promise.resolve(identity)
      : Promise.reject(new Error('PROVIDER_CALLBACK_REJECTED'));
  }
}

export interface OAuthBrowserHarness {
  apiUrl: string;
  providerUrl: string;
  adapter: HarnessGoogleAdapter;
  close(options?: { closeApplication?: boolean }): Promise<void>;
}

type SeedUser = (email: string, password: string) => Promise<void>;
type SocialProof = (
  email: string,
  purpose?: string,
) => Promise<string | undefined>;

function startProvider(
  port: number,
  adapter: () => HarnessGoogleAdapter,
  seedUser: SeedUser,
  resetRateLimits: () => Promise<void>,
  socialProof: SocialProof,
): Promise<Server> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/authorize') {
      // The browser test reads `state` from this page URL and then performs
      // the callback navigation itself with a registered code.
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end('<!doctype html><title>Harness provider</title><p>provider');
      return;
    }
    if (request.method === 'POST' && url.pathname === '/identities') {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString()) as {
            code: string;
            identity: VerifiedProviderIdentity;
          };
          adapter().identities.set(body.code, body.identity);
          response.writeHead(204).end();
        } catch {
          response.writeHead(400).end();
        }
      });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/reset-rate-limits') {
      // Test isolation only: every browser case starts with empty rate buckets.
      resetRateLimits().then(
        () => response.writeHead(204).end(),
        () => response.writeHead(500).end(),
      );
      return;
    }
    if (request.method === 'POST' && url.pathname === '/users') {
      // Test-only fixture: a verified ACTIVE LOCAL Customer (never a production path).
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString()) as {
            email: string;
            password: string;
          };
          seedUser(body.email, body.password).then(
            () => response.writeHead(204).end(),
            () => response.writeHead(409).end(),
          );
        } catch {
          response.writeHead(400).end();
        }
      });
      return;
    }
    if (
      request.method === 'POST' &&
      ['/social-proof', '/email-proof'].includes(url.pathname)
    ) {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString()) as {
            email: string;
            purpose?: string;
          };
          const purpose =
            url.pathname === '/social-proof'
              ? 'SOCIAL_EMAIL_VERIFICATION'
              : body.purpose;
          if (
            !purpose ||
            ![
              'SOCIAL_EMAIL_VERIFICATION',
              'LOCAL_EMAIL_VERIFICATION',
              'PASSWORD_RESET',
            ].includes(purpose)
          ) {
            response.writeHead(400).end();
            return;
          }
          socialProof(body.email, purpose).then(
            (proof) =>
              proof
                ? response
                    .writeHead(200, {
                      'content-type': 'application/json',
                      'cache-control': 'no-store',
                    })
                    .end(JSON.stringify({ proof }))
                : response.writeHead(404).end(),
            () => response.writeHead(500).end(),
          );
        } catch {
          response.writeHead(400).end();
        }
      });
      return;
    }
    response.writeHead(404).end();
  });
  return new Promise((done) =>
    server.listen(port, '127.0.0.1', () => done(server)),
  );
}

export async function startOAuthBrowserHarness(
  options: { apiPort?: number; providerPort?: number } = {},
): Promise<OAuthBrowserHarness> {
  if (process.env.NODE_ENV === 'production')
    throw new Error('OAuth browser harness is test-only');
  const holder: { adapter?: HarnessGoogleAdapter; app?: INestApplication } = {};
  const seedUser: SeedUser = async (email, password) => {
    if (!holder.app) throw new Error('Harness app not ready');
    const crypto = holder.app.get(CredentialCrypto);
    await holder.app.get(DataSource).query(
      `INSERT INTO users (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
         VALUES (gen_random_uuid(),$1,$2,'LOCAL','CUSTOMER','ACTIVE',now(),now(),now())`,
      [email.trim().toLowerCase(), await crypto.hashPassword(password)],
    );
  };
  const provider = await startProvider(
    options.providerPort ?? 0,
    () => {
      if (!holder.adapter) throw new Error('Harness adapter not ready');
      return holder.adapter;
    },
    seedUser,
    async () => {
      if (!holder.app) throw new Error('Harness app not ready');
      await holder.app
        .get(DataSource)
        .query('DELETE FROM auth_rate_limit_buckets');
    },
    async (email, purpose = 'SOCIAL_EMAIL_VERIFICATION') => {
      if (!holder.app) throw new Error('Harness app not ready');
      const source = holder.app.get(DataSource);
      const crypto = holder.app.get(CredentialCrypto);
      const [row] = await source.query<
        {
          id: string;
          challenge_id: string;
          payload_ciphertext: Buffer;
          encryption_key_version: number;
        }[]
      >(
        `SELECT o.id,o.challenge_id,o.payload_ciphertext,o.encryption_key_version
         FROM email_outbox o JOIN auth_challenges c ON c.id=o.challenge_id
         WHERE o.recipient_email=$1 AND c.purpose=$2
         ORDER BY o.created_at DESC LIMIT 1`,
        [email, purpose],
      );
      if (!row) return undefined;
      await source.query(
        "UPDATE auth_challenges SET status='ACTIVE',activated_at=COALESCE(activated_at,now()) WHERE id=$1 AND status='PENDING_DELIVERY'",
        [row.challenge_id],
      );
      return crypto.decrypt(
        {
          ciphertext: row.payload_ciphertext,
          keyVersion: row.encryption_key_version,
        },
        `outbox:${row.id}`,
      );
    },
  );
  const providerUrl = `http://127.0.0.1:${(provider.address() as AddressInfo).port}`;
  const adapter = new HarnessGoogleAdapter(providerUrl);
  holder.adapter = adapter;

  process.env.IAM_GOOGLE_ENABLED = 'true';
  process.env.IAM_GOOGLE_CLIENT_ID ??= 'harness-client';
  process.env.IAM_GOOGLE_CLIENT_SECRET ??= 'harness-secret-not-real';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GoogleAdapter)
    .useValue(adapter)
    .compile();
  const app: INestApplication = configureApplication(
    moduleRef.createNestApplication({ bodyParser: false }),
  );
  holder.app = app;
  await app.listen(options.apiPort ?? 0, '127.0.0.1');
  const apiUrl = await app.getUrl();

  return {
    apiUrl: apiUrl.replace('[::1]', '127.0.0.1'),
    providerUrl,
    adapter,
    async close({ closeApplication = true } = {}) {
      if (closeApplication) await app.close();
      await new Promise<void>((done) => provider.close(() => done()));
    },
  };
}

if (require.main === module) {
  void startOAuthBrowserHarness({
    apiPort: Number(process.env.API_PORT ?? 3001),
    providerPort: Number(process.env.HARNESS_PROVIDER_PORT ?? 3090),
  }).then((harness) => {
    console.log(
      `OAuth browser harness ready api=${harness.apiUrl} provider=${harness.providerUrl}`,
    );
    // Nest's shutdown hook closes the app on signals. Only close the provider
    // here, once, even if the process group and wrapper both deliver SIGTERM.
    let closing = false;
    for (const signal of ['SIGINT', 'SIGTERM'] as const)
      process.once(signal, () => {
        if (closing) return;
        closing = true;
        void harness.close({ closeApplication: false });
      });
  });
}
