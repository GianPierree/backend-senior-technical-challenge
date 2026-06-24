import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('idempotency_records')
export class IdempotencyRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'idempotency_key', type: 'varchar', length: 200, unique: true })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 200 })
  endpoint: string;

  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash: string;

  @Column({ name: 'response_body', type: 'jsonb' })
  responseBody: Record<string, unknown>;

  @Column({ name: 'http_status', type: 'integer' })
  httpStatus: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
