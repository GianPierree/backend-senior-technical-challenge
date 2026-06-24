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
import { CurrencyMismatchException } from '../../common/exceptions/business.exceptions';

@Injectable()
export class TransferStrategy implements ITransactionStrategy {
  readonly type = 'TRANSFER' as const;

  async execute(
    ctx: TransactionContext,
    manager: EntityManager,
  ): Promise<TransactionStrategyResult> {
    if (!ctx.targetWallet) {
      throw new Error('TransferStrategy requires a targetWallet in the context');
    }

    if (ctx.targetWallet.currency !== ctx.currency) {
      throw new CurrencyMismatchException(ctx.targetWallet.currency, ctx.currency);
    }

    ctx.wallet.balance = BalanceCalculator.debit(ctx.wallet.balance, ctx.amount, ctx.wallet.id);
    ctx.targetWallet.balance = BalanceCalculator.credit(ctx.targetWallet.balance, ctx.amount);

    const debitId = TransactionIdFactory.generate();
    const creditId = TransactionIdFactory.generate();

    const debitTxn = manager.create(TransactionEntity, {
      id: debitId,
      walletId: ctx.wallet.id,
      type: 'TRANSFER_DEBIT',
      amount: BalanceCalculator.format(ctx.amount),
      currency: ctx.currency,
      status: 'COMPLETED',
      description: ctx.description ?? 'Transferencia entre wallets',
      relatedTransactionId: creditId,
      idempotencyKey: ctx.idempotencyKey,
      metadata: { targetWalletId: ctx.targetWallet.id },
    });

    const creditTxn = manager.create(TransactionEntity, {
      id: creditId,
      walletId: ctx.targetWallet.id,
      type: 'TRANSFER_CREDIT',
      amount: BalanceCalculator.format(ctx.amount),
      currency: ctx.currency,
      status: 'COMPLETED',
      description: ctx.description ?? 'Transferencia entre wallets',
      relatedTransactionId: debitId,
    });

    return {
      transactions: [debitTxn, creditTxn],
      wallets: [ctx.wallet, ctx.targetWallet],
      primary: debitTxn,
    };
  }
}
