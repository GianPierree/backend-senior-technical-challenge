import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { UserRole, UserStatus } from '../../common/types/user.types';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100, unique: true })
  username: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 20, default: 'OPERATOR' })
  role: UserRole;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: UserStatus;

  @Column({ name: 'full_name', type: 'varchar', length: 200, nullable: true })
  fullName: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  email: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
