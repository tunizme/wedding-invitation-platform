export const INVITATION_BUILDER_CONFIG = Symbol('INVITATION_BUILDER_CONFIG');

export interface InvitationBuilderEnvironment {
  endpoint?: string;
  region: string;
  bucket: string;
  prefix: string;
  forcePathStyle: boolean;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
  renderOrigin: string;
  rateHmacKey: Buffer;
}

function invalid(key: string): never {
  // Configuration values and SDK errors may contain credentials.
  throw new Error(`Invalid builder environment: ${key}`);
}

function text(values: Record<string, unknown>, key: string): string {
  const value = values[key];
  if (typeof value !== 'string' || !value || value !== value.trim()) {
    invalid(key);
  }
  return value;
}

function origin(
  values: Record<string, unknown>,
  key: string,
  allowHttp: boolean,
): string {
  const raw = text(values, key);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    invalid(key);
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    (!allowHttp && url.protocol === 'http:') ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    invalid(key);
  }
  return url.origin;
}

/** Pure validation. Importing/building the API never contacts storage. */
export function validateInvitationBuilderEnvironment(
  values: Record<string, unknown>,
): InvitationBuilderEnvironment {
  const region = text(values, 'BUILDER_S3_REGION');
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(region)) {
    invalid('BUILDER_S3_REGION');
  }
  const bucket = text(values, 'BUILDER_S3_BUCKET');
  if (
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) ||
    bucket.includes('..') ||
    bucket.includes('.-') ||
    bucket.includes('-.') ||
    /^\d+\.\d+\.\d+\.\d+$/.test(bucket)
  ) {
    invalid('BUILDER_S3_BUCKET');
  }
  const prefix = text(values, 'BUILDER_S3_PREFIX');
  if (prefix.length > 512 || !/^(?:[a-zA-Z0-9_-]+\/)+$/.test(prefix)) {
    invalid('BUILDER_S3_PREFIX');
  }
  const pathStyle = values.BUILDER_S3_FORCE_PATH_STYLE;
  if (pathStyle !== 'true' && pathStyle !== 'false') {
    invalid('BUILDER_S3_FORCE_PATH_STYLE');
  }
  const hasAccess = values.BUILDER_S3_ACCESS_KEY_ID !== undefined;
  const hasSecret = values.BUILDER_S3_SECRET_ACCESS_KEY !== undefined;
  const hasToken = values.BUILDER_S3_SESSION_TOKEN !== undefined;
  if (hasAccess !== hasSecret || (hasToken && !hasAccess)) {
    invalid(
      'BUILDER_S3_ACCESS_KEY_ID/BUILDER_S3_SECRET_ACCESS_KEY/BUILDER_S3_SESSION_TOKEN',
    );
  }
  const encoded = text(values, 'BUILDER_RATE_HMAC_KEY');
  const rateHmacKey = Buffer.from(encoded, 'base64');
  if (rateHmacKey.length < 32 || rateHmacKey.toString('base64') !== encoded) {
    invalid('BUILDER_RATE_HMAC_KEY');
  }
  return {
    ...(values.BUILDER_S3_ENDPOINT !== undefined
      ? {
          endpoint: origin(
            values,
            'BUILDER_S3_ENDPOINT',
            values.NODE_ENV === 'development' || values.NODE_ENV === 'test',
          ),
        }
      : {}),
    region,
    bucket,
    prefix,
    forcePathStyle: pathStyle === 'true',
    ...(hasAccess
      ? {
          credentials: {
            accessKeyId: text(values, 'BUILDER_S3_ACCESS_KEY_ID'),
            secretAccessKey: text(values, 'BUILDER_S3_SECRET_ACCESS_KEY'),
            ...(hasToken
              ? { sessionToken: text(values, 'BUILDER_S3_SESSION_TOKEN') }
              : {}),
          },
        }
      : {}),
    renderOrigin: origin(values, 'BUILDER_RENDER_ORIGIN', true),
    rateHmacKey,
  };
}
