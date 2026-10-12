import { InvitationRsvpModule } from '../../../src/modules/invitation-rsvp/invitation-rsvp.module';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { DataSource, QueryRunner } from 'typeorm';
import sharp from 'sharp';
import { databaseOptions } from '../../../src/infrastructure/database/data-source';
import { ProblemFilter } from '../../../src/common/errors/problem.filter';
import { configureRequestBoundaries } from '../../../src/common/http/request-boundaries';
import {
  INVITATION_BUILDER_CONFIG,
  validateInvitationBuilderEnvironment,
} from '../../../src/config/invitation-builder.environment';
import {
  IdentityAccessModule,
  IDENTITY_CONFIG,
} from '../../../src/modules/identity-access/identity-access.module';
import { EmailOutboxWorker } from '../../../src/modules/identity-access/infrastructure/email-outbox.worker';
import { RetentionWorker } from '../../../src/modules/identity-access/infrastructure/retention.worker';
import { SessionService } from '../../../src/modules/identity-access/auth/session.service';
import { AccessTokenService } from '../../../src/modules/identity-access/auth/access-token.service';
import { InvitationAssetsModule } from '../../../src/modules/invitation-assets/invitation-assets.module';
import { InvitationBuilderModule } from '../../../src/modules/invitation-builder/invitation-builder.module';
import { InvitationsModule } from '../../../src/modules/invitations/invitations.module';
import { AssetWriteService } from '../../../src/modules/invitation-assets/application/asset-write.service';
import { AssetReferenceService } from '../../../src/modules/invitation-assets/application/asset-reference.service';
import {
  ASSET_STORE,
  type AssetStore,
} from '../../../src/modules/invitation-assets/domain/asset-store.port';
import type { AssetScope } from '../../../src/modules/invitation-assets/domain/entities';
import type {
  AuthenticatedPrincipal,
  UserRole,
} from '../../../src/modules/identity-access/authorization/principal';
import type {
  InvitationTemplate,
  TemplateDesignRevision,
} from '../../../src/modules/invitation-builder/domain/entities';
import type { Invitation } from '../../../src/modules/invitations/domain/entities';
import { canonicalHash } from '../../../src/modules/invitation-builder/domain/validation-helpers';
import { registrationFixture } from '../../registration-fixture';
import { builderRuntimeFixture } from './runtime';
import { blankDesign, emptyWedding, fixtureBytes } from './candidates';

export async function builderDatabase() {
  if (
    !process.env.BUILDER_TEST_RUN_ID ||
    !process.env.BUILDER_TEST_SCHEMA ||
    !process.env.BUILDER_TEST_SCRATCH
  )
    throw new Error(
      'Builder fixtures require runner-owned schema, storage and scratch.',
    );
  const identity = await registrationFixture();
  const config = validateInvitationBuilderEnvironment({
    ...builderRuntimeFixture(),
    NODE_ENV: 'test',
  });
  try {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(databaseOptions()),
        IdentityAccessModule,
        InvitationAssetsModule,
        InvitationBuilderModule,
        InvitationsModule,
        InvitationRsvpModule,
      ],
    })
      .overrideProvider(IDENTITY_CONFIG)
      .useValue(identity.config)
      .overrideProvider(INVITATION_BUILDER_CONFIG)
      .useValue(config)
      .overrideProvider(EmailOutboxWorker)
      .useValue({})
      .overrideProvider(RetentionWorker)
      .useValue({})
      .compile();
    const app = module.createNestApplication<
      import('@nestjs/common').INestApplication<Server>
    >({ bodyParser: false });
    app.setGlobalPrefix('api/v1');
    configureRequestBoundaries(app, 'http://localhost:3000');
    app.useGlobalFilters(new ProblemFilter());
    await app.init();
    const db = identity.db,
      writer = app.get(AssetWriteService),
      refs = app.get(AssetReferenceService),
      store = app.get<AssetStore>(ASSET_STORE);
    const user = async (role: UserRole = 'CUSTOMER') => {
      const email = `builder-${randomUUID()}@example.test`;
      await identity.register.register(email, 'Builder test passphrase 123!');
      const [row] = await db.query<{ id: string }[]>(
        'SELECT id FROM users WHERE email=$1',
        [email],
      );
      // Test-only account activation mirrors the existing IAM fixtures. Requests
      // still use real SessionService-issued tokens and production auth guards.
      await db.query(
        'UPDATE users SET email_verified_at=clock_timestamp(),role=$2 WHERE id=$1',
        [row.id, role],
      );
      const session = await db.transaction((manager) =>
        app.get(SessionService).issue(manager, row.id),
      );
      const principal = app.get(AccessTokenService).verify(session.accessToken);
      return {
        id: row.id,
        principal,
        token: session.accessToken,
        headers: { Authorization: `Bearer ${session.accessToken}` },
      };
    };
    const asset = async (
      actor: AuthenticatedPrincipal,
      scope: AssetScope = actor.role === 'ADMIN' ? 'TEMPLATE' : 'CUSTOMER',
      assistanceId: string | null = null,
      uploadedBy: string = actor.userId,
    ) => {
      const thumb = scope === 'SYSTEM_THUMBNAIL',
        bytes = thumb
          ? fixtureBytes()
          : await sharp(fixtureBytes()).webp().toBuffer();
      return writer.upload(
        bytes,
        thumb ? 'image/png' : 'image/webp',
        {
          scope,
          owner_user_id: thumb ? null : actor.userId,
          uploaded_by: uploadedBy,
          assistance_invitation_id: assistanceId,
          name: 'Ảnh kiểm thử',
          kind: thumb ? 'THUMBNAIL' : 'IMAGE',
          width: 80,
          height: 60,
        },
        { deadline: Date.now() + 10000 },
      );
    };
    const template = async (actor: AuthenticatedPrincipal) => {
      const rows: InvitationTemplate[] = await db.query(
        `INSERT INTO invitation_templates(id,name,category,draft_document,draft_sample_data,created_by)
        VALUES($1,'Mẫu kiểm thử','Wedding',$2,$3,$4) RETURNING *`,
        [randomUUID(), blankDesign(), emptyWedding(), actor.userId],
      );
      return rows[0];
    };
    const revision = async (
      actor: AuthenticatedPrincipal,
      templateId: string,
      candidate: {
        document: TemplateDesignRevision['document'];
        sampleData: TemplateDesignRevision['sample_data'];
      } = { document: blankDesign(), sampleData: emptyWedding() },
    ) => {
      const thumbnail = await asset(actor, 'SYSTEM_THUMBNAIL');
      const rows: TemplateDesignRevision[] = await db.query(
        `INSERT INTO template_design_revisions(id,template_id,revision_number,schema_version,document,sample_data,document_hash,renderer_contract_version,thumbnail_asset_id,created_by)
        VALUES($1,$2,(SELECT COALESCE(max(revision_number),0)+1 FROM template_design_revisions WHERE template_id=$2),1,$3,$4,$5,1,$6,$7) RETURNING *`,
        [
          randomUUID(),
          templateId,
          candidate.document,
          candidate.sampleData,
          canonicalHash(candidate.document),
          thumbnail.id,
          actor.userId,
        ],
      );
      return rows[0];
    };
    const invitation = async (
      actor: AuthenticatedPrincipal,
      revisionId: string,
    ) => {
      const rows: Invitation[] = await db.query(
        `INSERT INTO invitations(id,owner_user_id,design_revision_id,draft_wedding_data,created_by,updated_by)
        VALUES($1,$2,$3,$4,$2,$2) RETURNING *`,
        [randomUUID(), actor.userId, revisionId, emptyWedding()],
      );
      return rows[0];
    };
    return {
      db,
      app,
      config,
      writer,
      refs,
      store,
      user,
      asset,
      template,
      revision,
      invitation,
      clear: identity.clear,
      async close() {
        try {
          await app.close();
        } finally {
          await identity.close();
        }
      },
    };
  } catch (error) {
    await identity.close();
    throw error;
  }
}

/** Wait for PostgreSQL evidence of contention, not a guessed race sleep. */
export async function waitForBlocked(
  db: DataSource,
  runner: QueryRunner,
): Promise<void> {
  const { processID: pid } = (await runner.connect()) as { processID: number };
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const rows: { blocked: boolean }[] = await db.query(
      'SELECT cardinality(pg_blocking_pids($1))>0 AS blocked',
      [pid],
    );
    if (rows[0].blocked) return;
    await new Promise((done) => setTimeout(done, 10));
  }
  throw new Error(
    'Expected competing transaction to block on an owned row lock.',
  );
}
