import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WalletsService } from '../../../src/wallets/wallets.service';
import { WalletEntity } from '../../../src/wallets/entities/wallet.entity';
import { TransactionEntity } from '../../../src/transactions/entities/transaction.entity';
import {
  WalletNotFoundException,
  WalletBlockedException,
} from '../../../src/common/exceptions/business.exceptions';

const mockWallet = (overrides = {}): WalletEntity =>
  ({
    id: 'wal_001',
    ownerId: 'user_001',
    currency: 'PEN',
    balance: '1500.00',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    transactions: [],
    ...overrides,
  } as WalletEntity);

describe('WalletsService', () => {
  let service: WalletsService;
  let walletRepo: { findOne: jest.Mock };
  let transactionRepo: { createQueryBuilder: jest.Mock };

  const mockQb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };

  beforeEach(async () => {
    walletRepo = { findOne: jest.fn() };
    transactionRepo = { createQueryBuilder: jest.fn().mockReturnValue(mockQb) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletsService,
        { provide: getRepositoryToken(WalletEntity), useValue: walletRepo },
        { provide: getRepositoryToken(TransactionEntity), useValue: transactionRepo },
      ],
    }).compile();

    service = module.get<WalletsService>(WalletsService);
  });

  describe('getBalance', () => {
    it('should return wallet balance formatted to 2 decimals', async () => {
      walletRepo.findOne.mockResolvedValue(mockWallet());
      const result = await service.getBalance('wal_001');
      expect(result.availableBalance).toBe('1500.00');
      expect(result.currency).toBe('PEN');
      expect(result.walletId).toBe('wal_001');
    });

    it('should throw WalletNotFoundException for unknown wallet', async () => {
      walletRepo.findOne.mockResolvedValue(null);
      await expect(service.getBalance('wal_999')).rejects.toThrow(WalletNotFoundException);
    });
  });

  describe('getMovements', () => {
    it('should return empty movements for new wallet', async () => {
      walletRepo.findOne.mockResolvedValue(mockWallet());
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.getMovements('wal_001', { page: 1, pageSize: 20 });
      expect(result.total).toBe(0);
      expect(result.movements).toHaveLength(0);
    });

    it('should throw WalletNotFoundException if wallet not found', async () => {
      walletRepo.findOne.mockResolvedValue(null);
      await expect(service.getMovements('wal_999', {})).rejects.toThrow(WalletNotFoundException);
    });
  });

  describe('findActiveWalletOrFail', () => {
    it('should return active wallet', async () => {
      const wallet = mockWallet();
      walletRepo.findOne.mockResolvedValue(wallet);
      const result = await service.findActiveWalletOrFail('wal_001');
      expect(result.status).toBe('ACTIVE');
    });

    it('should throw WalletBlockedException for blocked wallet', async () => {
      walletRepo.findOne.mockResolvedValue(mockWallet({ status: 'BLOCKED' }));
      await expect(service.findActiveWalletOrFail('wal_001')).rejects.toThrow(WalletBlockedException);
    });
  });
});
