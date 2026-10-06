import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { builderDatabase } from '../../fixtures/invitation-builder/database';

type Fixture = Awaited<ReturnType<typeof builderDatabase>>;
type Account = Awaited<ReturnType<Fixture['user']>>;
type Operation = { id: string; status: string; result: unknown; error: unknown };
type Problem = { code: string };
const operation = (response: request.Response) => response.body as Operation;
const problem = (response: request.Response) => response.body as Problem;

describe.sequential('template publication operation contract', () => {
  let f: Fixture;
  let admin: Account;
  let secondAdmin: Account;
  let customer: Account;
  beforeAll(async () => {
    f = await builderDatabase();
    admin = await f.user('ADMIN');
    secondAdmin = await f.user('ADMIN');
    customer = await f.user();
  });
  afterAll(async () => { await f?.close(); });

  const publish = (templateId: string, actor: Account, key?: string, expectedVersion = 1) => {
    let call = request(f.app.getHttpServer()).post(`/api/v1/admin/templates/${templateId}/publish`).set(actor.headers);
    if (key) call = call.set('Idempotency-Key', key);
    return call.send({ expectedVersion });
  };

  it('requires admin authorization, a UUID idempotency key and the current edit version', async () => {
    const template = await f.template(admin.principal);
    await request(f.app.getHttpServer()).post(`/api/v1/admin/templates/${template.id}/publish`).send({ expectedVersion: 1 }).expect(401);
    await publish(template.id, customer, randomUUID()).expect(403);
    await publish(template.id, admin).expect(422);
    await publish(template.id, admin, 'not-a-uuid').expect(422);
    const stale = await publish(template.id, admin, randomUUID(), 2).expect(409);
    expect(problem(stale).code).toBe('VERSION_CONFLICT');
  });

  it('replays the requester receipt before CAS and rejects a changed request using the same key', async () => {
    const template = await f.template(admin.principal), key = randomUUID();
    const acceptedResponse = await publish(template.id, admin, key).expect(202), accepted = operation(acceptedResponse);
    expect(accepted).toMatchObject({ status: 'PENDING', result: null, error: null });
    expect(accepted.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(acceptedResponse.headers.location).toContain(`/api/v1/publication-operations/${accepted.id}`);
    await f.db.query('UPDATE invitation_templates SET edit_version=edit_version+1 WHERE id=$1', [template.id]);
    const replay = operation(await publish(template.id, admin, key).expect(202));
    expect(replay).toEqual(accepted);
    expect(await f.db.query('SELECT id FROM publication_jobs WHERE requested_by=$1 AND request_key=$2', [admin.id, key])).toHaveLength(1);
    const changed = await publish(template.id, admin, key, 2).expect(409);
    expect(problem(changed).code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('admits only one active operation per template and scopes polling to its requester', async () => {
    const template = await f.template(admin.principal);
    const first = operation(await publish(template.id, admin, randomUUID()).expect(202));
    const conflict = await publish(template.id, admin, randomUUID()).expect(409);
    expect(problem(conflict).code).toBe('PUBLICATION_IN_PROGRESS');
    await request(f.app.getHttpServer()).get(`/api/v1/publication-operations/${first.id}`).set(admin.headers).expect(200);
    await request(f.app.getHttpServer()).get(`/api/v1/publication-operations/${first.id}`).set(secondAdmin.headers).expect(404);
    await request(f.app.getHttpServer()).get(`/api/v1/publication-operations/${first.id}`).set(customer.headers).expect(404);
  });
});
