import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { WalletEntity } from '../../wallets/entities/wallet.entity';
import {
  WalletNotFoundException,
  WalletBlockedException,
} from '../../common/exceptions/business.exceptions';

@Injectable()
export class WalletRepository {
  constructor(
    @InjectRepository(WalletEntity)
    private readonly repo: Repository<WalletEntity>,
  ) {}

  async findActiveOrFail(walletId: string, manager: EntityManager): Promise<WalletEntity> {
    const wallet = await manager.findOne(WalletEntity, {
      where: { id: walletId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!wallet) throw new WalletNotFoundException(walletId);
    if (wallet.status !== 'ACTIVE') throw new WalletBlockedException(walletId);

    return wallet;
  }

  async findById(walletId: string): Promise<WalletEntity | null> {
    return this.repo.findOne({ where: { id: walletId } });
  }
}
