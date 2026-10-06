import {
  Body,
  Controller,
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
} from '../../identity-access/authorization/auth.guard';
import { Roles } from '../../identity-access/authorization/roles.guard';
import { RsvpService } from '../application/rsvp.service';
import { RsvpControlService } from '../application/rsvp-control.service';
@Controller('public/invitations')
@Public()
export class PublicRsvpController {
  constructor(@Inject(RsvpService) private readonly rsvps: RsvpService) {}
  @Get(':slug/rsvp-state')
  state(
    @Param('slug') slug: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.rsvps.state(slug);
  }
  @Post(':slug/rsvps')
  async submit(
    @Param('slug') slug: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.rsvps.submit(
      slug,
      key ?? '',
      body,
      request.socket.remoteAddress,
    );
    response.status(result.replayed ? 200 : 201);
    response.setHeader('Cache-Control', 'no-store');
    return result.receipt;
  }
}
@Controller('invitations')
@Roles('CUSTOMER')
export class OwnerRsvpController {
  constructor(
    @Inject(RsvpService) private readonly rsvps: RsvpService,
    @Inject(RsvpControlService) private readonly control: RsvpControlService,
  ) {}
  @Get(':id/rsvps')
  list(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.rsvps.list(request.principal, id, query);
  }
  @Patch(':id/rsvp-state')
  set(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.control.set(request.principal, id, body);
  }
}
