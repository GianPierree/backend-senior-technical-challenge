import { EntityManager } from 'typeorm';
import { TransactionEntity } from '../entities/transaction.entity';
import { WalletEntity } from '../../wallets/entities/wallet.entity';
import { TransactionType } from '../../common/types/transaction.types';

export interface TransactionContext {
  wallet: WalletEntity;
  amount: string;
  currency: string;
  description?: string;
  externalReference?: string;
  idempotencyKey: string;
  targetWallet?: WalletEntity;
}

export interface TransactionStrategyResult {
  transactions: TransactionEntity[];
  wallets: WalletEntity[];
  primary: TransactionEntity;
}

export interface ITransactionStrategy {
  readonly type: TransactionType | 'TRANSFER';
  execute(ctx: TransactionContext, manager: EntityManager): Promise<TransactionStrategyResult>;
}
