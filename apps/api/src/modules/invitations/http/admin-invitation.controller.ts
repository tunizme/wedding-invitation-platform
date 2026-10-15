import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../identity-access/authorization/auth.guard';
import { Roles } from '../../identity-access/authorization/roles.guard';
import { BuilderProblemException } from '../../../common/errors/public-problem.exception';
import { PublicationService } from '../../invitation-builder/publication/publication.service';
import {
  closedObject,
  positiveVersion,
} from '../../invitation-builder/http/input';
import { InvitationService } from '../application/invitation.service';

@Controller('admin/invitations')
@Roles('ADMIN')
export class AdminInvitationController {
  constructor(
    @Inject(InvitationService) private readonly invitations: InvitationService,
    @Inject(PublicationService)
    private readonly publications: PublicationService,
  ) {}
  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.invitations.listManaged(request.principal, query);
  }
  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.invitations.createManaged(request.principal, body);
  }
  @Get(':id')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.invitations.get(request.principal, id);
  }
  @Patch(':id/draft')
  save(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.invitations.save(request.principal, id, body);
  }
  @Post(':id/payment')
  confirmPayment(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.invitations.confirmPayment(request.principal, id, body);
  }
  @Post(':id/publish')
  @HttpCode(202)
  async publish(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = closedObject(body, ['expectedVersion']);
    if (!key) throw new BuilderProblemException(422, 'DOCUMENT_INVALID');
    const operation = await this.publications.enqueueInvitation(
      request.principal,
      id,
      positiveVersion(input.expectedVersion),
      key,
    );
    response.setHeader(
      'Location',
      `/api/v1/publication-operations/${operation.id}`,
    );
    return operation;
  }
  @Post(':id/unpublish')
  @HttpCode(200)
  unpublish(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = closedObject(body, ['expectedVersion']);
    return this.publications.unpublishInvitation(
      request.principal,
      id,
      positiveVersion(input.expectedVersion),
    );
  }
}
