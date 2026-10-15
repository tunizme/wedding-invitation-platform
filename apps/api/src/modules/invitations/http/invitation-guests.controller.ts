import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Header,
} from '@nestjs/common';
import {
  Public,
  type AuthenticatedRequest,
} from '../../identity-access/authorization/auth.guard';
import { Roles } from '../../identity-access/authorization/roles.guard';
import { InvitationGuestsService } from '../application/invitation-guests.service';
@Controller('invitations')
@Roles('CUSTOMER')
export class InvitationGuestsController {
  constructor(
    @Inject(InvitationGuestsService)
    private readonly guests: InvitationGuestsService,
  ) {}
  @Get(':id/guests')
  list(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.guests.list(req.principal, id, query);
  }
  @Post(':id/guests/import')
  import(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body() body: unknown,
  ) {
    return this.guests.import(req.principal, id, key ?? '', body);
  }
  @Post(':id/guests/:guestId/rotate')
  rotate(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('guestId') guestId: string,
  ) {
    return this.guests.change(req.principal, id, guestId, 'rotate');
  }
  @Post(':id/guests/:guestId/revoke')
  revoke(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('guestId') guestId: string,
  ) {
    return this.guests.change(req.principal, id, guestId, 'revoke');
  }
}
@Controller('admin/invitations')
@Roles('ADMIN')
export class AdminInvitationGuestsController {
  constructor(
    @Inject(InvitationGuestsService)
    private readonly guests: InvitationGuestsService,
  ) {}
  @Get(':id/guests')
  list(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.guests.list(req.principal, id, query);
  }
  @Post(':id/guests/import')
  import(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body() body: unknown,
  ) {
    return this.guests.import(req.principal, id, key ?? '', body);
  }
  @Post(':id/guests/:guestId/rotate')
  rotate(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('guestId') guestId: string,
  ) {
    return this.guests.change(req.principal, id, guestId, 'rotate');
  }
  @Post(':id/guests/:guestId/revoke')
  revoke(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('guestId') guestId: string,
  ) {
    return this.guests.change(req.principal, id, guestId, 'revoke');
  }
}
@Controller('public/invitations')
@Public()
export class PublicInvitationGuestsController {
  constructor(
    @Inject(InvitationGuestsService)
    private readonly guests: InvitationGuestsService,
  ) {}
  @Get(':slug/guests/:token')
  @Header('Cache-Control', 'no-store')
  guest(@Param('slug') slug: string, @Param('token') token: string) {
    return this.guests.publicGuest(slug, token);
  }
  @Post(':slug/guests/:token/open')
  @Header('Cache-Control', 'no-store')
  open(
    @Param('slug') slug: string,
    @Param('token') token: string,
    @Body() body: unknown,
  ) {
    return this.guests.opened(slug, token, body);
  }
}
