import { writeFile } from 'node:fs/promises';
import { it } from 'vitest';
import { builderDatabase } from './database';
import { createBlankDocument } from '../../../src/modules/invitation-builder/domain/editor-document';
it('seeds owned editor browser actors and assets', async () => {
  if (!process.env.BUILDER_TEST_BROWSER_SEED)
    throw new Error('Missing owned seed output');
  const f = await builderDatabase();
  try {
    const admin = await f.user('ADMIN');
    const customer = await f.user('CUSTOMER');
    const photos = [
      await f.asset(admin.principal),
      await f.asset(admin.principal),
    ];
    const document = createBlankDocument();
    const template = await f.template(admin.principal);
    await f.db.query(
      'UPDATE invitation_templates SET draft_document=$2 WHERE id=$1',
      [template.id, document],
    );
    const [adminUser] = await f.db.query<{ email: string }[]>(
      'SELECT email FROM users WHERE id=$1',
      [admin.id],
    );
    const [customerUser] = await f.db.query<{ email: string }[]>(
      'SELECT email FROM users WHERE id=$1',
      [customer.id],
    );
    await writeFile(
      process.env.BUILDER_TEST_BROWSER_SEED,
      JSON.stringify({
        admin: {
          email: adminUser.email,
          password: 'Builder test passphrase 123!',
        },
        customer: {
          email: customerUser.email,
          password: 'Builder test passphrase 123!',
        },
        templateId: template.id,
        document,
        assets: photos.map((a) => a.id),
      }),
      { mode: 0o600 },
    );
  } finally {
    await f.app.close();
    await f.db.destroy();
  }
});
