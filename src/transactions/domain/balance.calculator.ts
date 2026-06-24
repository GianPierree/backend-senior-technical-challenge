import Decimal from 'decimal.js';
import { InsufficientBalanceException } from '../../common/exceptions/business.exceptions';

export class BalanceCalculator {
  
  static debit(currentBalance: string, amount: string, walletId: string): string {
    const balance = new Decimal(currentBalance);
    const debitAmount = new Decimal(amount);

    if (balance.lessThan(debitAmount)) {
      throw new InsufficientBalanceException(walletId);
    }

    return balance.minus(debitAmount).toFixed(2);
  }

  static credit(currentBalance: string, amount: string): string {
    return new Decimal(currentBalance).plus(new Decimal(amount)).toFixed(2);
  }

  static format(value: string | number): string {
    return new Decimal(value).toFixed(2);
  }
}
