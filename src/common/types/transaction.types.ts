export type TransactionType =
  | 'DEBIT'
  | 'CREDIT'
  | 'TRANSFER_DEBIT'
  | 'TRANSFER_CREDIT'
  | 'REVERSAL';

export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REVERSED';

export interface TransferResult {
  debitTxnId: string;
  creditTxnId: string;
}

export interface BalanceOperation {
  walletId: string;
  before: string;
  after: string;
  amount: string;
  type: TransactionType;
}
