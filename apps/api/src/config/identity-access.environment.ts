import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';

export const IDENTITY_CONFIG = Symbol('IDENTITY_CONFIG');

export const rateDefaults = {
  REGISTER_IP: { limit: 5, seconds: 3600 },
  REGISTER_EMAIL: { limit: 3, seconds: 86400 },
  LOGIN_IP: { limit: 10, seconds: 900 },
  LOGIN_EMAIL: { limit: 5, seconds: 900 },
  VERIFY_REQUEST_IP: { limit: 5, seconds: 3600 },
  VERIFY_REQUEST_EMAIL: { limit: 3, seconds: 3600 },
  RESET_REQUEST_IP: { limit: 5, seconds: 3600 },
  RESET_REQUEST_EMAIL: { limit: 3, seconds: 3600 },
  PROOF_UNKNOWN_IP: { limit: 5, seconds: 3600 },
  OAUTH_START: { limit: 20, seconds: 600 },
  REFRESH: { limit: 60, seconds: 60 },
  PASSWORD_CHANGE: { limit: 5, seconds: 900 },
} as const;
export type RateAction = keyof typeof rateDefaults;

export interface IdentityEnvironment {
  production: boolean;
  issuer: string;
  audience: string;
  kid: string;
  privateKey: KeyObject;
  publicKeys: Readonly<Record<string, KeyObject>>;
  keyVersion: number;
  refreshKeys: Readonly<Record<number, Buffer>>;
  csrfKeys: Readonly<Record<number, Buffer>>;
  encryptionKeys: Readonly<Record<number, Buffer>>;
  rateKeys: Readonly<Record<number, Buffer>>;
  frontendOrigin: string;
  apiOrigin: string;
  googleEnabled: boolean;
  googleClientId?: string;
  googleClientSecret?: string;
  facebookEnabled: boolean;
  facebookClientId?: string;
  facebookClientSecret?: string;
  rates: Readonly<Record<RateAction, { limit: number; seconds: number }>>;
  ttl: Readonly<{
    access: 900;
    session: 1209600;
    oauth: 600;
    onboarding: 1800;
    verification: 86400;
    reset: 1800;
  }>;
  retention: Readonly<{
    batchSize: number;
    oauthHours: number;
    onboardingExpiredDays: number;
    onboardingCompletedDays: number;
    challengeDays: number;
    sessionDays: number;
    rateBucketHours: number;
    outboxDays: number;
    auditDays: number;
  }>;
}

const invalid = (key: string): never => {
  throw new Error(`Invalid IAM configuration: ${key}`);
};

export function validateIdentityEnvironment(
  values: Record<string, unknown>,
): IdentityEnvironment {
  const production = values.NODE_ENV === 'production';
  const required = (key: string): string => {
    const value = values[key];
    if (typeof value !== 'string' || !value.trim()) return invalid(key);
    return value;
  };
  const origin = (key: string) => {
    const value = required(key);
    try {
      const parsed = new URL(value);
      if (
        parsed.origin !== value ||
        !['http:', 'https:'].includes(parsed.protocol) ||
        (production && parsed.protocol !== 'https:')
      )
        return invalid(key);
      return value;
    } catch {
      return invalid(key);
    }
  };
  const keyVersion = Number(values.IAM_KEY_VERSION ?? 1);
  if (!Number.isInteger(keyVersion) || keyVersion < 1 || keyVersion > 32767)
    invalid('IAM_KEY_VERSION');
  const keys = (key: string): Readonly<Record<number, Buffer>> => {
    try {
      const parsed: unknown = JSON.parse(required(key));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return invalid(key);
      const result: Record<number, Buffer> = {};
      for (const [version, value] of Object.entries(parsed)) {
        if (
          !/^[1-9]\d{0,4}$/.test(version) ||
          Number(version) > 32767 ||
          typeof value !== 'string'
        )
          return invalid(key);
        const bytes = Buffer.from(value, 'base64');
        if (bytes.length !== 32 || bytes.toString('base64') !== value)
          return invalid(key);
        result[Number(version)] = bytes;
      }
      if (!result[keyVersion]) return invalid(key);
      return Object.freeze(result);
    } catch {
      return invalid(key);
    }
  };
  const rsa = (key: KeyObject, field: string) => {
    if (
      key.asymmetricKeyType !== 'rsa' ||
      (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
    )
      invalid(field);
    return key;
  };
  let privateKey: KeyObject;
  try {
    privateKey = rsa(
      createPrivateKey(required('IAM_JWT_PRIVATE_KEY')),
      'IAM_JWT_PRIVATE_KEY',
    );
  } catch {
    return invalid('IAM_JWT_PRIVATE_KEY');
  }
  const publicKeys: Record<string, KeyObject> = {};
  try {
    const parsed: unknown = JSON.parse(required('IAM_JWT_PUBLIC_KEYS'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return invalid('IAM_JWT_PUBLIC_KEYS');
    for (const [kid, value] of Object.entries(parsed)) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(kid) || typeof value !== 'string')
        return invalid('IAM_JWT_PUBLIC_KEYS');
      publicKeys[kid] = rsa(createPublicKey(value), 'IAM_JWT_PUBLIC_KEYS');
    }
  } catch {
    return invalid('IAM_JWT_PUBLIC_KEYS');
  }
  const kid = required('IAM_JWT_KID');
  if (
    !Object.hasOwn(publicKeys, kid) ||
    !createPublicKey(privateKey).equals(publicKeys[kid])
  )
    invalid('IAM_JWT_KID');
  const provider = (provider: string) => {
    const key = `IAM_${provider}_ENABLED`;
    if (
      values[key] !== undefined &&
      values[key] !== 'true' &&
      values[key] !== 'false'
    )
      return invalid(key);
    const active = values[key] === 'true';
    let clientId: string | undefined;
    let clientSecret: string | undefined;
    if (active) {
      clientId = required(`IAM_${provider}_CLIENT_ID`);
      clientSecret = required(`IAM_${provider}_CLIENT_SECRET`);
      if (
        production &&
        (/placeholder|change.?me|example|your.?secret/i.test(clientSecret) ||
          clientSecret.length < 16)
      )
        invalid(`IAM_${provider}_CLIENT_SECRET`);
    }
    return Object.freeze({ active, clientId, clientSecret });
  };
  const google = provider('GOOGLE');
  const facebook = provider('FACEBOOK');
  const rates = {} as Record<RateAction, { limit: number; seconds: number }>;
  for (const action of Object.keys(rateDefaults) as RateAction[]) {
    const key = `IAM_RATE_${action}`;
    const limit = Number(values[key] ?? rateDefaults[action].limit);
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > rateDefaults[action].limit
    )
      invalid(key);
    rates[action] = Object.freeze({ ...rateDefaults[action], limit });
  }
  const ttl = {
    access: 900,
    session: 1209600,
    oauth: 600,
    onboarding: 1800,
    verification: 86400,
    reset: 1800,
  } as const;
  for (const [name, seconds] of Object.entries(ttl)) {
    const key = `IAM_TTL_${name.toUpperCase()}`;
    if (values[key] !== undefined && Number(values[key]) !== seconds)
      invalid(key);
  }
  const boundedInteger = (
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ) => {
    const value = Number(values[key] ?? fallback);
    if (!Number.isInteger(value) || value < minimum || value > maximum)
      return invalid(key);
    return value;
  };
  const retention = Object.freeze({
    batchSize: boundedInteger('IAM_RETENTION_BATCH_SIZE', 1000, 1, 1000),
    oauthHours: boundedInteger('IAM_RETENTION_OAUTH_HOURS', 24, 24, 168),
    onboardingExpiredDays: boundedInteger(
      'IAM_RETENTION_ONBOARDING_EXPIRED_DAYS',
      7,
      7,
      30,
    ),
    onboardingCompletedDays: boundedInteger(
      'IAM_RETENTION_ONBOARDING_COMPLETED_DAYS',
      30,
      30,
      90,
    ),
    challengeDays: boundedInteger('IAM_RETENTION_CHALLENGE_DAYS', 30, 30, 90),
    sessionDays: boundedInteger('IAM_RETENTION_SESSION_DAYS', 30, 30, 90),
    rateBucketHours: boundedInteger(
      'IAM_RETENTION_RATE_BUCKET_HOURS',
      24,
      24,
      168,
    ),
    outboxDays: boundedInteger('IAM_RETENTION_OUTBOX_DAYS', 30, 30, 90),
    auditDays: boundedInteger('IAM_RETENTION_AUDIT_DAYS', 730, 365, 730),
  });
  return Object.freeze({
    production,
    issuer: required('IAM_JWT_ISSUER'),
    audience: required('IAM_JWT_AUDIENCE'),
    kid,
    privateKey,
    publicKeys: Object.freeze(publicKeys),
    keyVersion,
    refreshKeys: keys('IAM_REFRESH_KEYS'),
    csrfKeys: keys('IAM_CSRF_KEYS'),
    encryptionKeys: keys('IAM_ENCRYPTION_KEYS'),
    rateKeys: keys('IAM_RATE_KEYS'),
    frontendOrigin: origin('FRONTEND_ORIGIN'),
    apiOrigin: origin('API_PUBLIC_ORIGIN'),
    googleEnabled: google.active,
    googleClientId: google.clientId,
    googleClientSecret: google.clientSecret,
    facebookEnabled: facebook.active,
    facebookClientId: facebook.clientId,
    facebookClientSecret: facebook.clientSecret,
    rates: Object.freeze(rates),
    ttl: Object.freeze(ttl),
    retention,
  });
}
