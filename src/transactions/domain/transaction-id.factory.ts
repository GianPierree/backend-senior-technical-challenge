import { v4 as uuidv4 } from 'uuid';

export class TransactionIdFactory {
  static generate(): string {
    return `txn_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  }
}
