import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { Public } from '../modules/identity-access/authorization/auth.guard';

@ApiTags('health')
@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: 'Process-only liveness probe' })
  @ApiResponse({ status: 200 })
  liveness() {
    return this.health.liveness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'PostgreSQL-aware readiness probe' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 503 })
  async readiness(@Res({ passthrough: true }) response: Response) {
    const result = await this.health.readiness();
    if (result.status === 'not_ready') {
      response.status(503);
    }
    return result;
  }
}
