import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TransactionEntity } from '../entities/transaction.entity';
import {
  ITransactionStrategy,
  TransactionContext,
  TransactionStrategyResult,
} from './transaction-strategy.interface';
import { BalanceCalculator } from '../domain/balance.calculator';
import { TransactionIdFactory } from '../domain/transaction-id.factory';

@Injectable()
export class DebitStrategy implements ITransactionStrategy {
  readonly type = 'DEBIT' as const;

  async execute(
    ctx: TransactionContext,
    manager: EntityManager,
  ): Promise<TransactionStrategyResult> {
    ctx.wallet.balance = BalanceCalculator.debit(
      ctx.wallet.balance,
      ctx.amount,
      ctx.wallet.id,
    );

    const txn = manager.create(TransactionEntity, {
      id: TransactionIdFactory.generate(),
      walletId: ctx.wallet.id,
      type: 'DEBIT',
      amount: BalanceCalculator.format(ctx.amount),
      currency: ctx.currency,
      status: 'COMPLETED',
      description: ctx.description ?? null,
      externalReference: ctx.externalReference ?? null,
      idempotencyKey: ctx.idempotencyKey,
    });

    return {
      transactions: [txn],
      wallets: [ctx.wallet],
      primary: txn,
    };
  }
}
