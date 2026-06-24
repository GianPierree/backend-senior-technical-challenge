import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IdempotencyService } from '../../../src/common/services/idempotency.service';
import { IdempotencyRecordEntity } from '../../../src/common/entities/idempotency-record.entity';
import { IdempotencyConflictException } from '../../../src/common/exceptions/business.exceptions';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let repo: jest.Mocked<Repository<IdempotencyRecordEntity>>;

  beforeEach(async () => {
    const mockRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        { provide: getRepositoryToken(IdempotencyRecordEntity), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
    repo = module.get(getRepositoryToken(IdempotencyRecordEntity));
  });

  describe('hashBody', () => {
    it('should produce consistent hash for same body', () => {
      const body = { walletId: 'wal_001', amount: '25.50' };
      expect(service.hashBody(body)).toBe(service.hashBody(body));
    });

    it('should produce different hashes for different bodies', () => {
      const body1 = { walletId: 'wal_001', amount: '25.50' };
      const body2 = { walletId: 'wal_001', amount: '100.00' };
      expect(service.hashBody(body1)).not.toBe(service.hashBody(body2));
    });

    it('should handle null/undefined body', () => {
      expect(() => service.hashBody(null)).not.toThrow();
    });
  });

  describe('check', () => {
    it('should return null when key does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      const result = await service.check('new-key', '/transactions', { amount: '10.00' });
      expect(result).toBeNull();
    });

    it('should return cached response when key and body match', async () => {
      const body = { walletId: 'wal_001', amount: '25.50' };
      const hash = service.hashBody(body);
      repo.findOne.mockResolvedValue({
        id: 'uuid-1',
        idempotencyKey: 'key-1',
        endpoint: '/transactions',
        requestHash: hash,
        responseBody: { transactionId: 'txn_abc' },
        httpStatus: 201,
        createdAt: new Date(),
      } as IdempotencyRecordEntity);

      const result = await service.check('key-1', '/transactions', body);
      expect(result).not.toBeNull();
      expect(result!.cached).toBe(true);
      expect(result!.httpStatus).toBe(201);
    });

    it('should throw 409 when key exists but body differs', async () => {
      const originalBody = { walletId: 'wal_001', amount: '25.50' };
      const differentBody = { walletId: 'wal_001', amount: '999.00' };
      repo.findOne.mockResolvedValue({
        id: 'uuid-1',
        idempotencyKey: 'key-1',
        endpoint: '/transactions',
        requestHash: service.hashBody(originalBody),
        responseBody: {},
        httpStatus: 201,
        createdAt: new Date(),
      } as IdempotencyRecordEntity);

      await expect(service.check('key-1', '/transactions', differentBody)).rejects.toThrow(
        IdempotencyConflictException,
      );
    });
  });

  describe('store', () => {
    it('should persist idempotency record', async () => {
      const mockEntity = {} as IdempotencyRecordEntity;
      repo.create.mockReturnValue(mockEntity);
      repo.save.mockResolvedValue(mockEntity);

      await service.store('key-1', '/transactions', { amount: '10' }, { transactionId: 'abc' }, 201);
      expect(repo.create).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalledWith(mockEntity);
    });
  });
});
