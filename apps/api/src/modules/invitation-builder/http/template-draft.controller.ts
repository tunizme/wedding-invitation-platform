import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../identity-access/authorization/auth.guard';
import { Roles } from '../../identity-access/authorization/roles.guard';
import { TemplateDraftService } from '../application/template-draft.service';
import { AssetReferenceService } from '../../invitation-assets/application/asset-reference.service';

@ApiTags('Invitation templates')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/templates')
export class TemplateDraftController {
  constructor(
    @Inject(TemplateDraftService) private readonly drafts: TemplateDraftService,
  ) {}
  @Get() list(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.drafts.list(request.principal, query);
  }
  @Post() create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.drafts.create(request.principal, body);
  }
  @Get(':id') get(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.drafts.get(request.principal, id);
  }
  @Delete(':id')
  @HttpCode(204)
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.drafts.remove(request.principal, id, body);
  }
  @Patch(':id') update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.drafts.update(request.principal, id, body);
  }
  @Patch(':id/draft') save(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.drafts.save(request.principal, id, body);
  }
  @Post(':id/duplicate') duplicate(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.drafts.duplicate(request.principal, id, body);
  }
}

@ApiTags('Invitation templates')
@ApiBearerAuth()
@Controller('templates')
export class TemplateCoverController {
  constructor(
    @Inject(TemplateDraftService) private readonly drafts: TemplateDraftService,
    @Inject(AssetReferenceService)
    private readonly assets: AssetReferenceService,
  ) {}
  @Get(':id/cover')
  async cover(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const asset = await this.drafts.cover(request.principal, id),
      abort = new AbortController();
    const cancel = () => abort.abort();
    response.once('close', cancel);
    try {
      const bytes = await this.assets.bytes(asset, {
        deadline: Date.now() + 10000,
        signal: abort.signal,
      });
      response
        .set({
          'Content-Type': asset.mime_type,
          'Content-Length': String(bytes.length),
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        })
        .send(bytes);
    } finally {
      response.off('close', cancel);
    }
  }
}
