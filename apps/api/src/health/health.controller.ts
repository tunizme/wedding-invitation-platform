import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
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
  async readiness() {
    const result = await this.health.readiness();
    if (result.status === 'not_ready') {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
