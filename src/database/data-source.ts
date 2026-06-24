import { DataSource } from 'typeorm';
import { WalletEntity } from '../wallets/entities/wallet.entity';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { IdempotencyRecordEntity } from '../common/entities/idempotency-record.entity';
import { AuditLogEntity } from '../common/entities/audit-log.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'ligo_user',
  password: process.env.DB_PASSWORD ?? 'ligo_password',
  database: process.env.DB_DATABASE ?? 'ligo_wallet',
  entities: [WalletEntity, TransactionEntity, IdempotencyRecordEntity, AuditLogEntity],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
