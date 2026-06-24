import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { WalletsModule } from './wallets/wallets.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CommonModule } from './common/common.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { WalletEntity } from './wallets/entities/wallet.entity';
import { TransactionEntity } from './transactions/entities/transaction.entity';
import { IdempotencyRecordEntity } from './common/entities/idempotency-record.entity';
import { AuditLogEntity } from './common/entities/audit-log.entity';
import { UserEntity } from './users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USERNAME ?? 'ligo_user',
      password: process.env.DB_PASSWORD ?? 'ligo_password',
      database: process.env.DB_DATABASE ?? 'ligo_wallet',
      entities: [WalletEntity, TransactionEntity, IdempotencyRecordEntity, AuditLogEntity, UserEntity],
      synchronize: false,
      logging: process.env.NODE_ENV === 'development',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    }),
    CommonModule,
    UsersModule,
    AuthModule,
    WalletsModule,
    TransactionsModule,
    HealthModule,
  ],
  // SeedService moved to UsersModule where UsersService is available via DI
})
export class AppModule {}
