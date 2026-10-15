import { randomUUID } from 'node:crypto';
import {
  Controller,
  Body,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../authorization/auth.guard';
import { Roles } from '../authorization/roles.guard';
import {
  CustomerQueryService,
  type CustomerListInput,
} from './customer-query.service';
import { CustomerInvitationService } from './customer-invitation.service';
import { CustomerStatusService } from './customer-status.service';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function customerId(value: string): string {
  if (!uuid.test(value)) throw new UnprocessableEntityException();
  return value;
}

function listInput(query: Record<string, unknown>): CustomerListInput {
  if (
    Object.keys(query).some(
      (key) => !['limit', 'cursor', 'q', 'status'].includes(key),
    )
  )
    throw new UnprocessableEntityException();
  const scalar = (name: string): string | undefined => {
    const value = query[name];
    if (value === undefined) return undefined;
    if (typeof value !== 'string') throw new UnprocessableEntityException();
    return value;
  };
  const rawLimit = scalar('limit');
  const limit = rawLimit === undefined ? 20 : Number(rawLimit);
  const q = scalar('q')?.trim();
  const cursor = scalar('cursor');
  const status = scalar('status');
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (q !== undefined && (!q || [...q].length > 100)) ||
    (cursor !== undefined && (!cursor || cursor.length > 1024)) ||
    (status !== undefined && status !== 'ACTIVE' && status !== 'LOCKED')
  )
    throw new UnprocessableEntityException();
  return {
    limit,
    ...(q ? { q } : {}),
    ...(cursor ? { cursor } : {}),
    ...(status ? { status } : {}),
  };
}

@Controller('admin/customers')
@Roles('ADMIN')
export class CustomerController {
  constructor(
    @Inject(CustomerQueryService)
    private readonly customers: CustomerQueryService,
    @Inject(CustomerStatusService)
    private readonly statuses: CustomerStatusService,
    @Inject(CustomerInvitationService)
    private readonly invitations: CustomerInvitationService,
  ) {}

  @Post('invite')
  invite(
    @Req() request: AuthenticatedRequest,
    @Body() body: { email?: unknown },
  ) {
    if (!body || Object.keys(body).some((key) => key !== 'email'))
      throw new UnprocessableEntityException();
    return this.invitations.invite(request.principal.userId, body.email);
  }
  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.customers.list(listInput(query));
  }

  @Get(':customerId')
  detail(@Param('customerId') id: string) {
    return this.customers.detail(customerId(id));
  }

  @Post(':customerId/lock')
  @HttpCode(204)
  async lock(
    @Req() request: AuthenticatedRequest,
    @Param('customerId') id: string,
  ) {
    await this.statuses.change(
      request.principal.userId,
      customerId(id),
      'LOCK',
      randomUUID(),
    );
  }

  @Post(':customerId/unlock')
  @HttpCode(204)
  async unlock(
    @Req() request: AuthenticatedRequest,
    @Param('customerId') id: string,
  ) {
    await this.statuses.change(
      request.principal.userId,
      customerId(id),
      'UNLOCK',
      randomUUID(),
    );
  }
}
