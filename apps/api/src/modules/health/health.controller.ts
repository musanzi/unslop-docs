import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheckService, HealthCheck, TypeOrmHealthIndicator, DiskHealthIndicator } from '@nestjs/terminus';
import { healthCheckSchema } from './health.schema';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private readonly disk: DiskHealthIndicator
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Check service health', description: 'Pings the database and checks disk storage.' })
  @ApiOkResponse({ description: 'Service is healthy', schema: healthCheckSchema })
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.disk.checkStorage('storage', { path: '/', thresholdPercent: 0.5 })
    ]);
  }
}
