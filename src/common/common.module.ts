import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyRecordEntity } from './entities/idempotency-record.entity';
import { AuditLogEntity } from './entities/audit-log.entity';
import { IdempotencyService } from './services/idempotency.service';
import { AuditService } from './services/audit.service';

@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyRecordEntity, AuditLogEntity])],
  providers: [IdempotencyService, AuditService],
  exports: [IdempotencyService, AuditService],
})
export class CommonModule {}
