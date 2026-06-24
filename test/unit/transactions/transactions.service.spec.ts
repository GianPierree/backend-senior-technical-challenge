import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TransactionsService } from '../../../src/transactions/transactions.service';
import { TransactionEntity } from '../../../src/transactions/entities/transaction.entity';
import { WalletEntity } from '../../../src/wallets/entities/wallet.entity';
import { WalletRepository } from '../../../src/transactions/repositories/wallet.repository';
import { DebitStrategy } from '../../../src/transactions/strategies/debit.strategy';
import { CreditStrategy } from '../../../src/transactions/strategies/credit.strategy';
import { TransferStrategy } from '../../../src/transactions/strategies/transfer.strategy';
import { ReversalStrategy } from '../../../src/transactions/strategies/reversal.strategy';
import { IdempotencyService } from '../../../src/common/services/idempotency.service';
import { AuditService } from '../../../src/common/services/audit.service';
import {
  CurrencyMismatchException,
  WalletNotFoundException,
  WalletBlockedException,
} from '../../../src/common/exceptions/business.exceptions';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const makeWallet = (overrides: Partial<WalletEntity> = {}): WalletEntity =>
  ({ id: 'wal_001', currency: 'PEN', balance: '1500.00', status: 'ACTIVE', ...overrides } as WalletEntity);

const makeTxn = (overrides: Partial<TransactionEntity> = {}): TransactionEntity =>
  ({ id: 'txn_001', walletId: 'wal_001', type: 'DEBIT', amount: '100.00', currency: 'PEN',
     status: 'COMPLETED', description: null, externalReference: null, relatedTransactionId: null,
     idempotencyKey: null, metadata: null, createdAt: new Date(), updatedAt: new Date(), wallet: makeWallet(),
     ...overrides } as TransactionEntity);

// ─── Suite 1: Domain — BalanceCalculator (pure logic, no NestJS) ──────────────
describe('BalanceCalculator (pure domain)', () => {
  const { BalanceCalculator } = require('../../../src/transactions/domain/balance.calculator');

  it('debit() should subtract amount from balance', () => {
    expect(BalanceCalculator.debit('1000.00', '250.00', 'wal_001')).toBe('750.00');
  });

  it('debit() should throw InsufficientBalanceException when balance is too low', () => {
    const { InsufficientBalanceException } = require('../../../src/common/exceptions/business.exceptions');
    expect(() => BalanceCalculator.debit('100.00', '200.00', 'wal_001')).toThrow(InsufficientBalanceException);
  });

  it('credit() should add amount to balance', () => {
    expect(BalanceCalculator.credit('500.00', '150.00')).toBe('650.00');
  });

  it('format() should always return 2 decimal places', () => {
    expect(BalanceCalculator.format('1500')).toBe('1500.00');
    expect(BalanceCalculator.format(99.9)).toBe('99.90');
  });
});

// ─── Suite 2: Strategies (unit test each strategy in isolation) ───────────────
describe('DebitStrategy', () => {
  let strategy: DebitStrategy;

  beforeEach(() => { strategy = new DebitStrategy(); });

  const mockManager = {
    create: jest.fn((_, data) => ({ ...data, createdAt: new Date(), updatedAt: new Date() })),
    save: jest.fn(),
  };

  it('should deduct wallet balance and return DEBIT transaction', async () => {
    const wallet = makeWallet({ balance: '500.00' });
    const result = await strategy.execute(
      { wallet, amount: '100.00', currency: 'PEN', idempotencyKey: 'key-1' },
      mockManager as any,
    );
    expect(wallet.balance).toBe('400.00');
    expect(result.primary.type).toBe('DEBIT');
    expect(result.transactions).toHaveLength(1);
    expect(result.wallets).toContain(wallet);
  });

  it('should throw InsufficientBalanceException when balance is too low', async () => {
    const { InsufficientBalanceException } = require('../../../src/common/exceptions/business.exceptions');
    const wallet = makeWallet({ balance: '50.00' });
    await expect(
      strategy.execute({ wallet, amount: '200.00', currency: 'PEN', idempotencyKey: 'key-2' }, mockManager as any),
    ).rejects.toThrow(InsufficientBalanceException);
  });
});

describe('CreditStrategy', () => {
  let strategy: CreditStrategy;
  const mockManager = {
    create: jest.fn((_, data) => ({ ...data, createdAt: new Date(), updatedAt: new Date() })),
  };

  beforeEach(() => { strategy = new CreditStrategy(); });

  it('should add to wallet balance and return CREDIT transaction', async () => {
    const wallet = makeWallet({ balance: '300.00' });
    const result = await strategy.execute(
      { wallet, amount: '200.00', currency: 'PEN', idempotencyKey: 'key-3' },
      mockManager as any,
    );
    expect(wallet.balance).toBe('500.00');
    expect(result.primary.type).toBe('CREDIT');
  });
});

describe('TransferStrategy', () => {
  let strategy: TransferStrategy;
  const mockManager = {
    create: jest.fn((_, data) => ({ ...data, createdAt: new Date(), updatedAt: new Date() })),
  };

  beforeEach(() => { strategy = new TransferStrategy(); });

  it('should perform double-entry: debit source and credit target', async () => {
    const source = makeWallet({ id: 'wal_001', balance: '500.00' });
    const target = makeWallet({ id: 'wal_002', balance: '200.00' });
    const result = await strategy.execute(
      { wallet: source, targetWallet: target, amount: '150.00', currency: 'PEN', idempotencyKey: 'key-4' },
      mockManager as any,
    );
    expect(source.balance).toBe('350.00');
    expect(target.balance).toBe('350.00');
    expect(result.transactions[0].type).toBe('TRANSFER_DEBIT');
    expect(result.transactions[1].type).toBe('TRANSFER_CREDIT');
    expect(result.wallets).toHaveLength(2);
  });

  it('should throw CurrencyMismatchException when target wallet currency differs', async () => {
    const source = makeWallet({ currency: 'PEN', balance: '500.00' });
    const target = makeWallet({ id: 'wal_004', currency: 'USD' });
    await expect(
      strategy.execute({ wallet: source, targetWallet: target, amount: '100.00', currency: 'PEN', idempotencyKey: 'key-5' }, mockManager as any),
    ).rejects.toThrow(CurrencyMismatchException);
  });

  it('should throw InsufficientBalanceException when source has no funds', async () => {
    const { InsufficientBalanceException } = require('../../../src/common/exceptions/business.exceptions');
    const source = makeWallet({ balance: '50.00' });
    const target = makeWallet({ id: 'wal_002' });
    await expect(
      strategy.execute({ wallet: source, targetWallet: target, amount: '200.00', currency: 'PEN', idempotencyKey: 'key-6' }, mockManager as any),
    ).rejects.toThrow(InsufficientBalanceException);
  });
});

describe('ReversalStrategy', () => {
  let strategy: ReversalStrategy;

  const buildManager = (txnOverrides: Partial<TransactionEntity> = {}) => ({
    findOne: jest.fn().mockResolvedValue(makeTxn(txnOverrides)),
    create: jest.fn((_, data) => ({ ...data, createdAt: new Date(), updatedAt: new Date() })),
  });

  beforeEach(() => { strategy = new ReversalStrategy(); });

  it('should restore balance when reversing a DEBIT', async () => {
    const wallet = makeWallet({ balance: '900.00' });
    const manager = buildManager({ type: 'DEBIT', amount: '100.00', status: 'COMPLETED' });
    const result = await strategy.execute(
      { wallet, amount: '100.00', currency: 'PEN', idempotencyKey: 'key-7', originalTransactionId: 'txn_001', reason: 'refund' } as any,
      manager as any,
    );
    expect(wallet.balance).toBe('1000.00');
    expect(result.primary.type).toBe('REVERSAL');
  });

  it('should deduct balance when reversing a CREDIT', async () => {
    const wallet = makeWallet({ balance: '700.00' });
    const manager = buildManager({ type: 'CREDIT', amount: '200.00', status: 'COMPLETED' });
    await strategy.execute(
      { wallet, amount: '200.00', currency: 'PEN', idempotencyKey: 'key-8', originalTransactionId: 'txn_001', reason: 'refund' } as any,
      manager as any,
    );
    expect(wallet.balance).toBe('500.00');
  });

  it('should throw TransactionAlreadyReversedException on double reversal', async () => {
    const { TransactionAlreadyReversedException } = require('../../../src/common/exceptions/business.exceptions');
    const wallet = makeWallet();
    const manager = buildManager({ status: 'REVERSED' });
    await expect(
      strategy.execute({ wallet, amount: '100.00', currency: 'PEN', idempotencyKey: 'key-9', originalTransactionId: 'txn_001', reason: 'refund' } as any, manager as any),
    ).rejects.toThrow(TransactionAlreadyReversedException);
  });

  it('should throw TransactionNotFoundException when original does not exist', async () => {
    const { TransactionNotFoundException } = require('../../../src/common/exceptions/business.exceptions');
    const wallet = makeWallet();
    const manager = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn() };
    await expect(
      strategy.execute({ wallet, amount: '100.00', currency: 'PEN', idempotencyKey: 'key-10', originalTransactionId: 'txn_999', reason: 'refund' } as any, manager as any),
    ).rejects.toThrow(TransactionNotFoundException);
  });
});

// ─── Suite 3: TransactionsService orchestration ───────────────────────────────
describe('TransactionsService — orchestration', () => {
  let service: TransactionsService;
  let walletRepository: jest.Mocked<WalletRepository>;
  let idempotencyService: jest.Mocked<IdempotencyService>;
  let debitStrategy: jest.Mocked<DebitStrategy>;

  const mockManager = { save: jest.fn(), findOne: jest.fn(), create: jest.fn() };
  const mockDataSource = {
    transaction: jest.fn((cb: any) => cb(mockManager)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: getRepositoryToken(TransactionEntity), useValue: { findOne: jest.fn() } },
        { provide: WalletRepository, useValue: { findActiveOrFail: jest.fn(), findById: jest.fn() } },
        { provide: DataSource, useValue: mockDataSource },
        { provide: DebitStrategy, useValue: { type: 'DEBIT', execute: jest.fn() } },
        { provide: CreditStrategy, useValue: { type: 'CREDIT', execute: jest.fn() } },
        { provide: TransferStrategy, useValue: { type: 'TRANSFER', execute: jest.fn() } },
        { provide: ReversalStrategy, useValue: { type: 'REVERSAL', execute: jest.fn() } },
        { provide: IdempotencyService, useValue: { check: jest.fn().mockResolvedValue(null), store: jest.fn(), hashBody: jest.fn() } },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    walletRepository = module.get(WalletRepository);
    idempotencyService = module.get(IdempotencyService);
    debitStrategy = module.get(DebitStrategy);
  });

  it('should return cached response on idempotency hit without calling DB', async () => {
    const cached = { transactionId: 'txn_cached', status: 'COMPLETED' };
    idempotencyService.check.mockResolvedValue({ cached: true, responseBody: cached as any, httpStatus: 201 });

    const result = await service.createTransaction(
      { walletId: 'wal_001', type: 'DEBIT', amount: '100.00', currency: 'PEN' },
      'key-cached', 'actor',
    );

    expect(result).toEqual(cached);
    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });

  it('should throw CurrencyMismatchException when wallet currency differs from request', async () => {
    walletRepository.findActiveOrFail.mockResolvedValue(makeWallet({ currency: 'PEN' }));

    await expect(
      service.createTransaction(
        { walletId: 'wal_001', type: 'DEBIT', amount: '100.00', currency: 'USD' },
        'key-mismatch', 'actor',
      ),
    ).rejects.toThrow(CurrencyMismatchException);
  });

  it('should delegate to DebitStrategy and store idempotency after success', async () => {
    const wallet = makeWallet({ balance: '1000.00' });
    const txn = makeTxn({ type: 'DEBIT', createdAt: new Date() });
    walletRepository.findActiveOrFail.mockResolvedValue(wallet);
    debitStrategy.execute.mockResolvedValue({ transactions: [txn], wallets: [wallet], primary: txn });
    mockManager.save.mockResolvedValue(undefined);

    await service.createTransaction(
      { walletId: 'wal_001', type: 'DEBIT', amount: '100.00', currency: 'PEN' },
      'key-new', 'actor',
    );

    expect(debitStrategy.execute).toHaveBeenCalled();
    expect(idempotencyService.store).toHaveBeenCalledWith('key-new', '/transactions', expect.any(Object), expect.any(Object), 201);
  });
});
