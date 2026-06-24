import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness probe' })
  health(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('readiness')
  @ApiOperation({ summary: 'Readiness probe — checks DB connection' })
  async readiness(): Promise<{ status: string; database: string; timestamp: string }> {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', database: 'connected', timestamp: new Date().toISOString() };
    } catch {
      return { status: 'error', database: 'disconnected', timestamp: new Date().toISOString() };
    }
  }
}
