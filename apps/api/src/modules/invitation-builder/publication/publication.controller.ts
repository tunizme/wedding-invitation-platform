import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { BuilderProblemException } from '../../../common/errors/public-problem.exception';
import type { AuthenticatedRequest } from '../../identity-access/authorization/auth.guard';
import { Roles } from '../../identity-access/authorization/roles.guard';
import {
  closedObject,
  listLimit,
  positiveVersion,
  queryString,
} from '../http/input';
import { PublicationService } from './publication.service';

@Controller('admin/templates')
export class TemplatePublicationController {
  constructor(
    @Inject(PublicationService)
    private readonly publications: PublicationService,
  ) {}

  @Post(':id/publish')
  @Roles('ADMIN')
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
    const operation = await this.publications.enqueueTemplate(
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
  @Roles('ADMIN')
  @HttpCode(200)
  async unpublish(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Res() response: Response,
  ) {
    const input = closedObject(body, ['expectedVersion']);
    const result = await this.publications.unpublishTemplate(
      request.principal,
      id,
      positiveVersion(input.expectedVersion),
    );
    return response.status(200).json(result);
  }
}

@Controller('publication-operations')
export class PublicationOperationsController {
  constructor(
    @Inject(PublicationService)
    private readonly publications: PublicationService,
  ) {}

  @Get(':id')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.publications.getOperation(request.principal, id);
  }

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    closedObject(query, ['resourceKind', 'resourceId', 'limit']);
    const resourceKind = queryString(query, 'resourceKind'),
      id = queryString(query, 'resourceId');
    if (!resourceKind || !id)
      throw new BuilderProblemException(422, 'DOCUMENT_INVALID');
    return this.publications.listOperations(request.principal, {
      resourceKind,
      resourceId: id,
      limit: listLimit(query),
    });
  }
}
