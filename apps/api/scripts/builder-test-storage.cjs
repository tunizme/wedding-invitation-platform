// API-owned test infrastructure adapter. No production/domain imports.
const {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');

function clientFor(env) {
  if (
    !env.BUILDER_S3_ACCESS_KEY_ID ||
    !env.BUILDER_S3_SECRET_ACCESS_KEY ||
    env.BUILDER_S3_SESSION_TOKEN !== undefined ||
    env.BUILDER_S3_BUCKET !== env.BUILDER_TEST_S3_BUCKET
  ) {
    throw new Error('Invalid builder test storage identity.');
  }
  return new S3Client({
    endpoint: env.BUILDER_S3_ENDPOINT,
    region: env.BUILDER_S3_REGION,
    forcePathStyle: env.BUILDER_S3_FORCE_PATH_STYLE === 'true',
    maxAttempts: 2,
    credentials: {
      accessKeyId: env.BUILDER_S3_ACCESS_KEY_ID,
      secretAccessKey: env.BUILDER_S3_SECRET_ACCESS_KEY,
    },
  });
}

async function request(client, command, deadline, signal) {
  const remaining = Math.min(10_000, deadline - Date.now());
  if (remaining <= 0 || signal?.aborted)
    throw new Error('Builder storage deadline exceeded.');
  const timerController = new AbortController();
  const timer = setTimeout(() => timerController.abort(), remaining);
  const timeout = timerController.signal;
  const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  // Race also bounds misbehaving transports used by runner failure tests.
  let onAbort;
  try {
    return await Promise.race([
      client.send(command, { abortSignal }),
      new Promise((_, reject) => {
        onAbort = () => reject(new Error('Builder storage deadline exceeded.'));
        abortSignal.addEventListener('abort', onAbort, { once: true });
        if (abortSignal.aborted) onAbort();
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (onAbort) abortSignal.removeEventListener('abort', onAbort);
  }
}

async function cleanupPrefix({ client, bucket, prefix, runId, deadline }) {
  if (
    !/^[a-f0-9]{32}$/.test(runId) ||
    prefix !== `tests/${runId}/` ||
    !bucket
  ) {
    throw new Error('Builder cleanup refused unowned prefix.');
  }
  let token;
  const seen = new Set();
  do {
    const page = await request(
      client,
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 1000,
        ...(token ? { ContinuationToken: token } : {}),
      }),
      deadline,
    );
    for (const object of page.Contents ?? []) {
      if (typeof object.Key !== 'string' || !object.Key.startsWith(prefix)) {
        throw new Error('Builder cleanup refused object outside owned prefix.');
      }
      await request(
        client,
        new DeleteObjectCommand({ Bucket: bucket, Key: object.Key }),
        deadline,
      );
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && (!token || seen.has(token))) {
      throw new Error('Builder cleanup pagination failed.');
    }
    if (token) seen.add(token);
  } while (token);
  const remaining = await request(
    client,
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 1 }),
    deadline,
  );
  if ((remaining.Contents?.length ?? 0) > 0 || remaining.IsTruncated) {
    throw new Error('Builder cleanup found remaining owned objects.');
  }
}

module.exports = { clientFor, request, cleanupPrefix };
