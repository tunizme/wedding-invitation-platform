import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  Public,
  type AuthenticatedRequest,
} from '../identity-access/authorization/auth.guard';
import { Roles } from '../identity-access/authorization/roles.guard';
import { closedObject, queryString } from '../invitation-builder/http/input';
import { InteractionsService } from './interactions.service';
@Controller('public/invitations')
@Public()
export class PublicInteractionsController {
  constructor(
    @Inject(InteractionsService) private readonly service: InteractionsService,
  ) {}
  @Get(':slug/wishes') wishes(
    @Param('slug') slug: string,
    @Query() q: Record<string, unknown>,
  ) {
    return this.service.wishes(slug, q);
  }
  @Post(':slug/wishes') async wish(
    @Param('slug') slug: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
    @Req() r: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const v = await this.service.submit(
      slug,
      key ?? '',
      body,
      r.socket.remoteAddress,
    );
    response.status(v.replayed ? 200 : 201);
    return v.receipt;
  }
  @Post(':slug/forms/:nodeId/responses') async form(
    @Param('slug') slug: string,
    @Param('nodeId') nodeId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
    @Req() r: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const v = await this.service.submit(
      slug,
      key ?? '',
      body,
      r.socket.remoteAddress,
      nodeId,
    );
    response.status(v.replayed ? 200 : 201);
    return v.receipt;
  }
  @Get(':slug/likes') likes(
    @Param('slug') slug: string,
    @Query() q: Record<string, unknown>,
  ) {
    closedObject(q, ['browserId']);
    return this.service.likes(slug, queryString(q, 'browserId'));
  }
  @Post(':slug/likes') like(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() r: Request,
  ) {
    const b = closedObject(body, ['browserId']);
    return this.service.likes(
      slug,
      typeof b.browserId === 'string' ? b.browserId : undefined,
      true,
      r.socket.remoteAddress,
    );
  }
  @Delete(':slug/likes') unlike(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() r: Request,
  ) {
    const b = closedObject(body, ['browserId']);
    return this.service.likes(
      slug,
      typeof b.browserId === 'string' ? b.browserId : undefined,
      false,
      r.socket.remoteAddress,
    );
  }
}
@Controller('invitations')
@Roles('CUSTOMER')
export class OwnerInteractionsController {
  constructor(
    @Inject(InteractionsService) private readonly service: InteractionsService,
  ) {}
  @Get(':id/wishes') wishes(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() q: Record<string, unknown>,
  ) {
    return this.service.ownerList(r.principal, id, q);
  }
  @Get(':id/form-responses') forms(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() q: Record<string, unknown>,
  ) {
    return this.service.ownerList(r.principal, id, q, true);
  }
  @Patch(':id/wishes/:wishId') moderate(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('wishId') wishId: string,
    @Body() body: unknown,
  ) {
    return this.service.moderate(r.principal, id, wishId, body);
  }
}
@Controller('admin/invitations')
@Roles('ADMIN')
export class AdminInteractionsController {
  constructor(
    @Inject(InteractionsService) private readonly service: InteractionsService,
  ) {}
  @Get(':id/wishes') wishes(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() q: Record<string, unknown>,
  ) {
    return this.service.ownerList(r.principal, id, q, false, true);
  }
  @Patch(':id/wishes/:wishId') moderate(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('wishId') wishId: string,
    @Body() body: unknown,
  ) {
    return this.service.moderate(r.principal, id, wishId, body, true);
  }
}
