import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletEntity } from './entities/wallet.entity';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import {
  WalletNotFoundException,
  WalletBlockedException,
} from '../common/exceptions/business.exceptions';
import {
  WalletBalanceResponseDto,
  MovementsResponseDto,
  MovementItemDto,
  GetMovementsQueryDto,
} from './dto/wallet.dto';

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
  ) {}

  async getBalance(walletId: string): Promise<WalletBalanceResponseDto> {
    const wallet = await this.walletRepo.findOne({ where: { id: walletId } });

    if (!wallet) throw new WalletNotFoundException(walletId);

    return {
      walletId: wallet.id,
      currency: wallet.currency,
      availableBalance: parseFloat(wallet.balance).toFixed(2),
      status: wallet.status,
    };
  }

  async getMovements(
    walletId: string,
    query: GetMovementsQueryDto,
  ): Promise<MovementsResponseDto> {
    const wallet = await this.walletRepo.findOne({ where: { id: walletId } });
    if (!wallet) throw new WalletNotFoundException(walletId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const qb = this.transactionRepo
      .createQueryBuilder('txn')
      .where('txn.wallet_id = :walletId', { walletId })
      .orderBy('txn.created_at', 'DESC')
      .skip(skip)
      .take(pageSize);

    if (query.type && query.type !== 'ALL') {
      qb.andWhere('txn.type = :type', { type: query.type });
    }

    if (query.status && query.status !== 'ALL') {
      qb.andWhere('txn.status = :status', { status: query.status });
    }

    const [transactions, total] = await qb.getManyAndCount();

    const movements: MovementItemDto[] = transactions.map((txn) => ({
      transactionId: txn.id,
      amount: parseFloat(txn.amount).toFixed(2),
      type: txn.type,
      status: txn.status,
      currency: txn.currency,
      description: txn.description,
      externalReference: txn.externalReference,
      createdAt: txn.createdAt,
    }));

    return { walletId, total, page, pageSize, movements };
  }

  async findActiveWalletOrFail(walletId: string): Promise<WalletEntity> {
    const wallet = await this.walletRepo.findOne({ where: { id: walletId } });
    if (!wallet) throw new WalletNotFoundException(walletId);
    if (wallet.status !== 'ACTIVE') throw new WalletBlockedException(walletId);
    return wallet;
  }
}
