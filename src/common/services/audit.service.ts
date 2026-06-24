import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { AuditLogEntity } from '../entities/audit-log.entity';
import { IAuditService, AuditOptions } from '../interfaces/audit.interface';

@Injectable()
export class AuditService implements IAuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo: Repository<AuditLogEntity>,
  ) {}

  async log(options: AuditOptions, manager?: EntityManager): Promise<void> {
    try {
      const repo = manager ? manager.getRepository(AuditLogEntity) : this.auditRepo;
      const entry = repo.create(options);
      await repo.save(entry);
    } catch (err) {
      this.logger.error('Failed to write audit log', err instanceof Error ? err.message : err);
    }
  }
}
