import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../identity-access/authorization/auth.guard';
import { Roles } from '../../identity-access/authorization/roles.guard';
import { EditorPresetService } from '../application/editor-preset.service';
@Controller('admin/editor-presets')
@Roles('ADMIN')
export class EditorPresetController {
  constructor(
    @Inject(EditorPresetService) private readonly presets: EditorPresetService,
  ) {}
  @Get() list(
    @Req() r: AuthenticatedRequest,
    @Query() q: Record<string, unknown>,
  ) {
    return this.presets.list(r.principal, q);
  }
  @Post() create(@Req() r: AuthenticatedRequest, @Body() b: unknown) {
    return this.presets.save(r.principal, b);
  }
  @Patch(':id') update(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.presets.save(r.principal, b, id);
  }
  @Delete(':id') @HttpCode(204) remove(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.presets.remove(r.principal, id, b);
  }
}
