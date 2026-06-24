import { TransactionEntity } from '../entities/transaction.entity';
import {
  TransactionResponseDto,
  TransactionStatusResponseDto,
} from '../dto/transaction.dto';
import { BalanceCalculator } from '../domain/balance.calculator';

export class TransactionMapper {
  static toResponse(txn: TransactionEntity): TransactionResponseDto {
    return {
      transactionId: txn.id,
      walletId: txn.walletId,
      type: txn.type,
      amount: BalanceCalculator.format(txn.amount),
      currency: txn.currency,
      status: txn.status,
      description: txn.description,
      externalReference: txn.externalReference,
      createdAt: txn.createdAt,
    };
  }

  static toStatusResponse(txn: TransactionEntity): TransactionStatusResponseDto {
    return {
      transactionId: txn.id,
      status: txn.status,
      type: txn.type,
      amount: BalanceCalculator.format(txn.amount),
      currency: txn.currency,
      externalReference: txn.externalReference,
      createdAt: txn.createdAt,
      updatedAt: txn.updatedAt,
    };
  }
}
