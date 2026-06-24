import { EntityManager } from 'typeorm';

export interface AuditOptions {
  entityType: string;
  entityId: string;
  action: string;
  actor?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface IAuditService {
  log(options: AuditOptions, manager?: EntityManager): Promise<void>;
}
