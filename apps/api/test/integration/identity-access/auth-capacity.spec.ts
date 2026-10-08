import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BrowserSecurityService } from '../../../src/modules/identity-access/auth/browser-security.service';
import { AuthContextService } from '../../../src/modules/identity-access/context/auth-context.service';
import { AuthIntentService } from '../../../src/modules/identity-access/context/auth-intent.service';
import { CookieLedgerService } from '../../../src/modules/identity-access/context/cookie-ledger.service';
import { registrationFixture } from '../../registration-fixture';

describe.sequential('auth cookie capacity', () => {
  let fixture: Awaited<ReturnType<typeof registrationFixture>>;
  let browser: BrowserSecurityService;
  let ledger: CookieLedgerService;
  let contexts: AuthContextService;
  let intents: AuthIntentService;

  beforeAll(async () => {
    fixture = await registrationFixture();
    browser = new BrowserSecurityService(fixture.config);
    ledger = new CookieLedgerService(fixture.config, fixture.crypto);
    contexts = new AuthContextService(
      fixture.db,
      fixture.config,
      fixture.crypto,
      browser,
      ledger,
    );
    intents = new AuthIntentService(fixture.db, fixture.config, contexts);
  });
  beforeEach(async () => {
    await fixture.clear();
    await fixture.db.query(
      'TRUNCATE auth_cookie_names, auth_intents, auth_contexts CASCADE',
    );
  });
  afterAll(async () => fixture?.close());

  it('rejects a new context and establish intent before cookie emission at full capacity', async () => {
    const headers: Record<string, string> = {};
    const created = await contexts.provision({ headers, ip: '127.0.0.1' });
    const name = browser.bindingCookieName(created.contextId);
    const jar = `${name}=${created.secret}`;
    const request = {
      headers: { cookie: jar, 'x-auth-context': created.contextId },
      ip: '127.0.0.1',
    };
    await contexts.confirm(request, created.contextId);
    const [{ group_id: group }] = await fixture.db.query<
      { group_id: string }[]
    >('SELECT group_id FROM auth_contexts WHERE id=$1', [created.contextId]);
    await fixture.db.transaction(async (manager) => {
      for (
        let index = 0;
        index < fixture.config.authContext.capNames - 1;
        index++
      )
        await ledger.recordSet(manager, group, {
          name: browser.slotCookieName(String(index).padStart(22, 'A')),
          kind: 'SLOT',
          value: String(index).padStart(43, 'B'),
        });
    });
    await expect(contexts.provision(request)).rejects.toMatchObject({
      problemCode: 'CAPACITY_EXHAUSTED',
    });
    await expect(
      intents.reserve(request, created.contextId, {
        kind: 'LOCAL_LOGIN',
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ problemCode: 'CAPACITY_EXHAUSTED' });
    const [{ count }] = await fixture.db.query<{ count: string }[]>(
      'SELECT count(*)::text AS count FROM auth_intents',
    );
    expect(count).toBe('0');
  });
});
