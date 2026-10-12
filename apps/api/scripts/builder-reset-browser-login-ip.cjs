const { Client } = require('pg');

const runId = process.env.BUILDER_TEST_RUN_ID;
if (
  !/^[a-f0-9]{32}$/.test(runId || '') ||
  process.env.BUILDER_TEST_SCHEMA !== `builder_test_${runId}` ||
  !process.env.BUILDER_TEST_DATABASE_URL ||
  !process.env.DATABASE_URL
) {
  console.error('Browser rate reset requires the runner-owned builder schema.');
  process.exit(1);
}

const db = new Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  query_timeout: 8000,
  statement_timeout: 6000,
  application_name: 'builder-browser-test-rate-reset',
});
db.connect()
  .then(() =>
    db.query(
      "DELETE FROM auth_rate_limit_buckets WHERE action IN ('LOGIN_IP', 'LOGIN_EMAIL', 'AUTH_CONTEXT_PROVISION')",
    ),
  )
  .then(() => db.end())
  .catch(async () => {
    try {
      await db.end();
    } catch {
      /* preserve sanitized failure */
    }
    console.error('Could not reset runner-owned browser login buckets.');
    process.exitCode = 1;
  });
