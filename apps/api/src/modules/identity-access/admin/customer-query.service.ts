import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { IdentityEnvironment } from '../../../config/identity-access.environment';
import type { User } from '../domain/entities';

export type CustomerStatus = 'ACTIVE' | 'LOCKED';
export interface CustomerListInput {
  limit: number;
  q?: string;
  status?: CustomerStatus;
  cursor?: string;
}
export interface AdminCustomer {
  id: string;
  email: string;
  emailVerified: boolean;
  loginMethod: string;
  role: 'CUSTOMER';
  status: CustomerStatus;
  displayName: string | null;
  phoneNumber: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

type CustomerRow = Pick<
  User,
  | 'id'
  | 'email'
  | 'email_verified_at'
  | 'login_method'
  | 'role'
  | 'status'
  | 'display_name'
  | 'phone_number'
  | 'avatar_url'
  | 'created_at'
  | 'updated_at'
>;
type CursorPayload = { createdAt: string; id: string; fingerprint: string };

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const iso = (value: Date | string) => new Date(value).toISOString();
const project = (row: CustomerRow): AdminCustomer => ({
  id: row.id,
  email: row.email,
  emailVerified: Boolean(row.email_verified_at),
  loginMethod: row.login_method,
  role: 'CUSTOMER',
  status: row.status as CustomerStatus,
  displayName: row.display_name,
  phoneNumber: row.phone_number,
  avatarUrl: row.avatar_url,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

export class CustomerQueryService {
  constructor(
    private readonly db: DataSource,
    private readonly config: IdentityEnvironment,
  ) {}

  private fingerprint(q?: string, status?: CustomerStatus): string {
    return createHash('sha256')
      .update(JSON.stringify({ q: q ?? null, status: status ?? null }))
      .digest('base64url');
  }

  private encodeCursor(payload: CursorPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac(
      'sha256',
      this.config.rateKeys[this.config.keyVersion],
    )
      .update(`admin-customer-cursor:${body}`)
      .digest('base64url');
    return `${body}.${signature}`;
  }

  private decodeCursor(value: string, fingerprint: string): CursorPayload {
    try {
      const parts = value.split('.');
      if (parts.length !== 2) throw new Error();
      const [body, signature] = parts;
      const actual = Buffer.from(signature, 'base64url');
      const expected = createHmac(
        'sha256',
        this.config.rateKeys[this.config.keyVersion],
      )
        .update(`admin-customer-cursor:${body}`)
        .digest();
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        throw new Error();
      const parsed = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as Partial<CursorPayload>;
      if (
        typeof parsed.createdAt !== 'string' ||
        !Number.isFinite(Date.parse(parsed.createdAt)) ||
        typeof parsed.id !== 'string' ||
        !uuid.test(parsed.id) ||
        parsed.fingerprint !== fingerprint
      )
        throw new Error();
      return parsed as CursorPayload;
    } catch {
      throw new UnprocessableEntityException();
    }
  }

  async list(input: CustomerListInput): Promise<{
    items: AdminCustomer[];
    page: { hasMore: boolean; nextCursor: string | null };
  }> {
    const q = input.q?.trim();
    const fingerprint = this.fingerprint(q || undefined, input.status);
    const cursor = input.cursor
      ? this.decodeCursor(input.cursor, fingerprint)
      : undefined;
    const values: unknown[] = [];
    const bind = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    const where = [`role='CUSTOMER'`];
    if (input.status) where.push(`status=${bind(input.status)}`);
    if (q) {
      const escaped = q
        .replaceAll('\\', '\\\\')
        .replaceAll('%', '\\%')
        .replaceAll('_', '\\_');
      where.push(
        `(email ILIKE ${bind(`%${escaped}%`)} ESCAPE '\\' OR display_name ILIKE $${values.length} ESCAPE '\\')`,
      );
    }
    if (cursor)
      where.push(
        `(created_at,id) < (${bind(cursor.createdAt)}::timestamptz,${bind(cursor.id)}::uuid)`,
      );
    const rows = await this.db.query<CustomerRow[]>(
      `SELECT id,email,email_verified_at,login_method,role,status,display_name,phone_number,avatar_url,created_at,updated_at
       FROM users WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC,id DESC LIMIT ${bind(input.limit + 1)}`,
      values,
    );
    const hasMore = rows.length > input.limit;
    const visible = rows.slice(0, input.limit);
    const last = visible.at(-1);
    return {
      items: visible.map(project),
      page: {
        hasMore,
        nextCursor:
          hasMore && last
            ? this.encodeCursor({
                createdAt: iso(last.created_at),
                id: last.id,
                fingerprint,
              })
            : null,
      },
    };
  }

  async detail(customerId: string): Promise<AdminCustomer> {
    const [row] = await this.db.query<CustomerRow[]>(
      `SELECT id,email,email_verified_at,login_method,role,status,display_name,phone_number,avatar_url,created_at,updated_at
       FROM users WHERE id=$1 AND role='CUSTOMER'`,
      [customerId],
    );
    if (!row) throw new NotFoundException();
    return project(row);
  }
}
