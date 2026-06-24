import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TransactionEntity } from '../entities/transaction.entity';
import { TransactionType } from '../../common/types/transaction.types';
import {
  ITransactionStrategy,
  TransactionContext,
  TransactionStrategyResult,
} from './transaction-strategy.interface';
import { BalanceCalculator } from '../domain/balance.calculator';
import { TransactionIdFactory } from '../domain/transaction-id.factory';
import {
  TransactionNotFoundException,
  TransactionAlreadyReversedException,
} from '../../common/exceptions/business.exceptions';

export const REVERSAL_STRATEGY_TOKEN = 'REVERSAL_STRATEGY';

export interface ReversalContext extends TransactionContext {
  originalTransactionId: string;
  reason: string;
}

const DEBIT_TYPES: TransactionType[] = ['DEBIT', 'TRANSFER_DEBIT'];

@Injectable()
export class ReversalStrategy implements ITransactionStrategy {
  readonly type = 'REVERSAL' as const;

  async execute(
    ctx: TransactionContext,
    manager: EntityManager,
  ): Promise<TransactionStrategyResult> {
    const reversalCtx = ctx as ReversalContext;

    const original = await manager.findOne(TransactionEntity, {
      where: { id: reversalCtx.originalTransactionId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!original) {
      throw new TransactionNotFoundException(reversalCtx.originalTransactionId);
    }
    if (original.status === 'REVERSED') {
      throw new TransactionAlreadyReversedException(reversalCtx.originalTransactionId);
    }

    if (DEBIT_TYPES.includes(original.type)) {
      ctx.wallet.balance = BalanceCalculator.credit(ctx.wallet.balance, original.amount);
    } else {
      ctx.wallet.balance = BalanceCalculator.debit(
        ctx.wallet.balance,
        original.amount,
        ctx.wallet.id,
      );
    }

    original.status = 'REVERSED';

    const reversalTxn = manager.create(TransactionEntity, {
      id: TransactionIdFactory.generate(),
      walletId: original.walletId,
      type: 'REVERSAL',
      amount: BalanceCalculator.format(original.amount),
      currency: original.currency,
      status: 'COMPLETED',
      description: reversalCtx.reason,
      externalReference: ctx.externalReference ?? null,
      relatedTransactionId: reversalCtx.originalTransactionId,
      idempotencyKey: ctx.idempotencyKey,
      metadata: { originalTransactionId: reversalCtx.originalTransactionId },
    });

    return {
      transactions: [original, reversalTxn],
      wallets: [ctx.wallet],
      primary: reversalTxn,
    };
  }
}
