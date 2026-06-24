import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { WalletStatus } from '../../common/types/wallet.types';

@Entity('wallets')
export class WalletEntity {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  id: string;

  @Column({ name: 'owner_id', type: 'varchar', length: 100 })
  ownerId: string;

  @Column({ type: 'varchar', length: 3, default: 'PEN' })
  currency: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: '0.00' })
  balance: string;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: WalletStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => TransactionEntity, (txn) => txn.wallet)
  transactions: TransactionEntity[];
}
