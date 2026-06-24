import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionEntity } from './entities/transaction.entity';
import { WalletEntity } from '../wallets/entities/wallet.entity';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { WalletRepository } from './repositories/wallet.repository';
import { DebitStrategy } from './strategies/debit.strategy';
import { CreditStrategy } from './strategies/credit.strategy';
import { TransferStrategy } from './strategies/transfer.strategy';
import { ReversalStrategy } from './strategies/reversal.strategy';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionEntity, WalletEntity]),
    CommonModule,
  ],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    WalletRepository,
    DebitStrategy,
    CreditStrategy,
    TransferStrategy,
    ReversalStrategy,
  ],
})
export class TransactionsModule {}
