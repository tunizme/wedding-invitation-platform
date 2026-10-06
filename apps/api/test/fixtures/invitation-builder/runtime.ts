import { createRequire } from 'node:module';

const helper = createRequire(__filename)(
  '../../../scripts/with-test-builder.cjs',
) as {
  offlineEnvironment(): Record<string, string>;
};

export function builderRuntimeFixture(): Record<string, string> {
  if (process.env.BUILDER_TEST_RUN_ID) {
    const runId = process.env.BUILDER_TEST_RUN_ID;
    if (
      !/^[a-f0-9]{32}$/.test(runId) ||
      process.env.BUILDER_S3_PREFIX !== `tests/${runId}/` ||
      process.env.BUILDER_S3_BUCKET !== process.env.BUILDER_TEST_S3_BUCKET ||
      process.env.BUILDER_S3_ACCESS_KEY_ID !==
        process.env.BUILDER_TEST_S3_ACCESS_KEY_ID ||
      process.env.BUILDER_S3_SECRET_ACCESS_KEY !==
        process.env.BUILDER_TEST_S3_SECRET_ACCESS_KEY ||
      process.env.BUILDER_S3_SESSION_TOKEN !== undefined
    ) {
      throw new Error('Invalid inherited builder test ownership.');
    }
    return Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[0].startsWith('BUILDER_') && typeof entry[1] === 'string',
      ),
    );
  }
  return helper.offlineEnvironment();
}
