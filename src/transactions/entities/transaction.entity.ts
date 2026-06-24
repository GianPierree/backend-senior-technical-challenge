import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { WalletEntity } from '../../wallets/entities/wallet.entity';
import { TransactionType, TransactionStatus } from '../../common/types/transaction.types';

@Entity('transactions')
export class TransactionEntity {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  id: string;

  @Column({ name: 'wallet_id', type: 'varchar', length: 50 })
  walletId: string;

  @ManyToOne(() => WalletEntity, (wallet) => wallet.transactions)
  @JoinColumn({ name: 'wallet_id' })
  wallet: WalletEntity;

  @Column({ type: 'varchar', length: 20 })
  type: TransactionType;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: TransactionStatus;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'external_reference', type: 'varchar', length: 200, nullable: true })
  externalReference: string | null;

  @Column({ name: 'related_transaction_id', type: 'varchar', length: 50, nullable: true })
  relatedTransactionId: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 200, nullable: true, unique: true })
  idempotencyKey: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
