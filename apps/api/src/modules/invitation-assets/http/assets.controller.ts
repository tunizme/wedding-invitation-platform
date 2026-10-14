import {
  Body,
  Controller,
  Delete,
  Inject,
  HttpCode,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../../identity-access/authorization/auth.guard';
import { Roles } from '../../identity-access/authorization/roles.guard';
import {
  builderMultipartLimits,
  audioMultipartLimits,
} from '../../../common/http/request-boundaries';
import { resourceId } from '../../invitation-builder/http/input';
import { AssetReferenceService } from '../application/asset-reference.service';
import { UploadService } from '../application/upload.service';
import { assetSummary } from './assets-read.controller';

type MultipartFile = { buffer: Buffer; mimetype: string; size: number };

@Controller()
export class AssetsController {
  constructor(
    @Inject(UploadService) private readonly uploads: UploadService,
    @Inject(AssetReferenceService)
    private readonly assets: AssetReferenceService,
  ) {}

  @Post('admin/template-audio')
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: audioMultipartLimits }))
  async audioTemplate(
    @UploadedFile() file: MultipartFile | undefined,
    @Body() fields: Record<string, unknown>,
    @Req() request: AuthenticatedRequest & Request,
  ) {
    return this.audio(file, fields, request);
  }

  @Post('assets/audio')
  @Roles('CUSTOMER')
  @UseInterceptors(FileInterceptor('file', { limits: audioMultipartLimits }))
  async audioCustomer(
    @UploadedFile() file: MultipartFile | undefined,
    @Body() fields: Record<string, unknown>,
    @Req() request: AuthenticatedRequest & Request,
  ) {
    return this.audio(file, fields, request);
  }

  private async audio(
    file: MultipartFile | undefined,
    fields: Record<string, unknown>,
    request: AuthenticatedRequest & Request,
  ) {
    const abort = new AbortController(),
      cancel = () => abort.abort();
    request.once('aborted', cancel);
    try {
      return assetSummary(
        await this.uploads.uploadAudio(file, fields, request.principal, {
          deadline: Date.now() + 10000,
          signal: abort.signal,
        }),
      );
    } finally {
      request.off('aborted', cancel);
    }
  }

  @Post('admin/template-assets')
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: builderMultipartLimits }))
  async uploadTemplate(
    @UploadedFile() file: MultipartFile | undefined,
    @Body() fields: Record<string, unknown>,
    @Req() request: AuthenticatedRequest & Request,
  ) {
    const abort = new AbortController();
    const onAborted = () => abort.abort();
    request.once('aborted', onAborted);
    try {
      const asset = await this.uploads.upload(file, fields, request.principal, {
        deadline: Date.now() + 10_000,
        signal: abort.signal,
      });
      return assetSummary(asset);
    } finally {
      request.off('aborted', onAborted);
    }
  }

  @Post('assets')
  @Roles('CUSTOMER')
  @UseInterceptors(FileInterceptor('file', { limits: builderMultipartLimits }))
  async uploadCustomer(
    @UploadedFile() file: MultipartFile | undefined,
    @Body() fields: Record<string, unknown>,
    @Req() request: AuthenticatedRequest & Request,
  ) {
    const abort = new AbortController();
    const onAborted = () => abort.abort();
    request.once('aborted', onAborted);
    try {
      const asset = await this.uploads.upload(file, fields, request.principal, {
        deadline: Date.now() + 10_000,
        signal: abort.signal,
      });
      return assetSummary(asset);
    } finally {
      request.off('aborted', onAborted);
    }
  }

  @Delete('assets/:id')
  @HttpCode(204)
  async delete(
    @Param('id') rawId: string,
    @Req() request: AuthenticatedRequest & Request,
  ) {
    const id = resourceId(rawId),
      abort = new AbortController();
    const onAborted = () => abort.abort();
    request.once('aborted', onAborted);
    try {
      await this.assets.delete(id, request.principal, {
        deadline: Date.now() + 10_000,
        signal: abort.signal,
      });
    } finally {
      request.off('aborted', onAborted);
    }
  }
}
