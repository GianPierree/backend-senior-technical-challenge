import { HttpException, HttpStatus } from '@nestjs/common';

export class WalletNotFoundException extends HttpException {
  constructor(walletId: string) {
    super(
      { error: 'WALLET_NOT_FOUND', message: `Wallet '${walletId}' not found` },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class WalletBlockedException extends HttpException {
  constructor(walletId: string) {
    super(
      { error: 'WALLET_BLOCKED', message: `Wallet '${walletId}' is not active` },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class InsufficientBalanceException extends HttpException {
  constructor(walletId: string) {
    super(
      { error: 'INSUFFICIENT_BALANCE', message: `Wallet '${walletId}' has insufficient balance` },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class CurrencyMismatchException extends HttpException {
  constructor(walletCurrency: string, requestCurrency: string) {
    super(
      {
        error: 'CURRENCY_MISMATCH',
        message: `Wallet currency '${walletCurrency}' does not match request currency '${requestCurrency}'`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class TransactionNotFoundException extends HttpException {
  constructor(transactionId: string) {
    super(
      { error: 'TRANSACTION_NOT_FOUND', message: `Transaction '${transactionId}' not found` },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class TransactionAlreadyReversedException extends HttpException {
  constructor(transactionId: string) {
    super(
      {
        error: 'TRANSACTION_ALREADY_REVERSED',
        message: `Transaction '${transactionId}' has already been reversed`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class IdempotencyConflictException extends HttpException {
  constructor(key: string) {
    super(
      {
        error: 'IDEMPOTENCY_CONFLICT',
        message: `Idempotency-Key '${key}' was already used with a different request body`,
      },
      HttpStatus.CONFLICT,
    );
  }
}
