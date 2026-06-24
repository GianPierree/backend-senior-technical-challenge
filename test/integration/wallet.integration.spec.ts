/**
 * Integration Tests — Ligo Wallet Service
 *
 * These tests spin up the full NestJS app against the PostgreSQL database
 * defined in docker-compose.yml. Run with:
 *   docker compose up -d postgres
 *   npm run test:integration
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

describe('Ligo Wallet Service — Integration Tests', () => {
  let app: INestApplication;
  let token: string;
  let dataSource: DataSource;

  beforeAll(async () => {
    process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
    process.env.DB_PORT = process.env.DB_PORT ?? '5432';
    process.env.DB_USERNAME = process.env.DB_USERNAME ?? 'ligo_user';
    process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'ligo_password';
    process.env.DB_DATABASE = process.env.DB_DATABASE ?? 'ligo_wallet';
    process.env.JWT_SECRET = 'ligo-super-secret-jwt-key-change-in-production';
    process.env.MOCK_USERNAME = 'senior.backend';
    process.env.MOCK_PASSWORD = 'Password123';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Reset wallet balances to seed values between test groups ──────────────
  async function resetWallets() {
    await dataSource.query(`UPDATE wallets SET balance = 1500.00 WHERE id = 'wal_001'`);
    await dataSource.query(`UPDATE wallets SET balance = 800.00  WHERE id = 'wal_002'`);
    await dataSource.query(`UPDATE wallets SET balance = 250.00  WHERE id = 'wal_003'`);
    await dataSource.query(
      `DELETE FROM idempotency_records WHERE idempotency_key LIKE 'test-%'`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH
  // ═══════════════════════════════════════════════════════════════════════════
  describe('POST /auth/login', () => {
    it('should return JWT on valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'senior.backend', password: 'Password123' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.expiresIn).toBe(3600);
      token = res.body.token;
    });

    it('should return 401 on invalid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'wrong', password: 'wrong' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('INVALID_CREDENTIALS');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH
  // ═══════════════════════════════════════════════════════════════════════════
  describe('GET /health & /readiness', () => {
    it('should return 200 on /health', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('should return 200 and connected on /readiness', async () => {
      const res = await request(app.getHttpServer()).get('/readiness');
      expect(res.status).toBe(200);
      expect(res.body.database).toBe('connected');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // WALLETS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('GET /wallets/:id/balance', () => {
    beforeEach(resetWallets);

    it('should return balance for wal_001', async () => {
      const res = await request(app.getHttpServer())
        .get('/wallets/wal_001/balance')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.walletId).toBe('wal_001');
      expect(res.body.availableBalance).toBe('1500.00');
      expect(res.body.currency).toBe('PEN');
    });

    it('should return 404 for unknown wallet', async () => {
      const res = await request(app.getHttpServer())
        .get('/wallets/wal_999/balance')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('WALLET_NOT_FOUND');
    });

    it('should return 401 without token', async () => {
      const res = await request(app.getHttpServer()).get('/wallets/wal_001/balance');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /wallets/:id/movements', () => {
    it('should return paginated movements', async () => {
      const res = await request(app.getHttpServer())
        .get('/wallets/wal_001/movements?page=1&pageSize=5')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('movements');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.movements)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSACTIONS - HAPPY PATH
  // ═══════════════════════════════════════════════════════════════════════════
  describe('POST /transactions — DEBIT happy path', () => {
    beforeEach(resetWallets);

    it('should debit wallet and return COMPLETED transaction', async () => {
      const key = `test-${uuidv4()}`;
      const res = await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send({
          walletId: 'wal_001',
          type: 'DEBIT',
          amount: '100.00',
          currency: 'PEN',
          description: 'Test debit',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.type).toBe('DEBIT');
      expect(res.body.amount).toBe('100.00');

      // Verify balance decreased
      const balRes = await request(app.getHttpServer())
        .get('/wallets/wal_001/balance')
        .set('Authorization', `Bearer ${token}`);
      expect(balRes.body.availableBalance).toBe('1400.00');
    });

    it('should return same response on idempotent retry', async () => {
      const key = `test-${uuidv4()}`;
      const payload = { walletId: 'wal_001', type: 'DEBIT', amount: '50.00', currency: 'PEN' };

      const res1 = await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send(payload);

      const res2 = await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send(payload);

      expect(res1.body.transactionId).toBe(res2.body.transactionId);
    });

    it('should return 409 when same key used with different body', async () => {
      const key = `test-${uuidv4()}`;

      await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send({ walletId: 'wal_001', type: 'DEBIT', amount: '50.00', currency: 'PEN' });

      const res = await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send({ walletId: 'wal_001', type: 'DEBIT', amount: '999.00', currency: 'PEN' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('IDEMPOTENCY_CONFLICT');
    });
  });

  describe('POST /transactions — CREDIT happy path', () => {
    beforeEach(resetWallets);

    it('should credit wallet and update balance', async () => {
      const key = `test-${uuidv4()}`;
      const res = await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send({ walletId: 'wal_002', type: 'CREDIT', amount: '200.00', currency: 'PEN' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('COMPLETED');

      const balRes = await request(app.getHttpServer())
        .get('/wallets/wal_002/balance')
        .set('Authorization', `Bearer ${token}`);
      expect(balRes.body.availableBalance).toBe('1000.00');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Edge cases', () => {
    beforeEach(resetWallets);

    it('should return 422 on debit with insufficient balance', async () => {
      const res = await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `test-${uuidv4()}`)
        .send({ walletId: 'wal_001', type: 'DEBIT', amount: '99999.00', currency: 'PEN' });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('INSUFFICIENT_BALANCE');
    });

    it('should return 422 for blocked wallet', async () => {
      const res = await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `test-${uuidv4()}`)
        .send({ walletId: 'wal_005', type: 'DEBIT', amount: '10.00', currency: 'PEN' });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('WALLET_BLOCKED');
    });

    it('should return 404 for non-existent wallet', async () => {
      const res = await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `test-${uuidv4()}`)
        .send({ walletId: 'wal_999', type: 'DEBIT', amount: '10.00', currency: 'PEN' });

      expect(res.status).toBe(404);
    });

    it('should return 422 for currency mismatch', async () => {
      const res = await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `test-${uuidv4()}`)
        .send({ walletId: 'wal_001', type: 'DEBIT', amount: '10.00', currency: 'USD' });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('CURRENCY_MISMATCH');
    });

    it('should return 400 when Idempotency-Key header is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', `Bearer ${token}`)
        .send({ walletId: 'wal_001', type: 'DEBIT', amount: '10.00', currency: 'PEN' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('MISSING_IDEMPOTENCY_KEY');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSFER
  // ═══════════════════════════════════════════════════════════════════════════
  describe('POST /transactions/transfer', () => {
    beforeEach(resetWallets);

    it('should transfer between wallets atomically', async () => {
      const key = `test-${uuidv4()}`;
      const res = await request(app.getHttpServer())
        .post('/transactions/transfer')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send({
          sourceWalletId: 'wal_001',
          targetWalletId: 'wal_002',
          amount: '200.00',
          currency: 'PEN',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.debitTransactionId).toBeDefined();
      expect(res.body.creditTransactionId).toBeDefined();

      const src = await request(app.getHttpServer())
        .get('/wallets/wal_001/balance')
        .set('Authorization', `Bearer ${token}`);
      const tgt = await request(app.getHttpServer())
        .get('/wallets/wal_002/balance')
        .set('Authorization', `Bearer ${token}`);

      expect(src.body.availableBalance).toBe('1300.00');
      expect(tgt.body.availableBalance).toBe('1000.00');
    });

    it('should return 422 on currency mismatch between wallets', async () => {
      // wal_004 is USD
      const res = await request(app.getHttpServer())
        .post('/transactions/transfer')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `test-${uuidv4()}`)
        .send({
          sourceWalletId: 'wal_001',
          targetWalletId: 'wal_004',
          amount: '50.00',
          currency: 'PEN',
        });

      expect(res.status).toBe(422);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REVERSAL
  // ═══════════════════════════════════════════════════════════════════════════
  describe('POST /transactions/:id/reversal', () => {
    beforeEach(resetWallets);

    it('should reverse a DEBIT and restore balance', async () => {
      // Create a debit first
      const debitKey = `test-${uuidv4()}`;
      const debitRes = await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', debitKey)
        .send({ walletId: 'wal_001', type: 'DEBIT', amount: '300.00', currency: 'PEN' });

      const txnId = debitRes.body.transactionId;

      // Reverse it
      const reversalKey = `test-${uuidv4()}`;
      const revRes = await request(app.getHttpServer())
        .post(`/transactions/${txnId}/reversal`)
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', reversalKey)
        .send({ reason: 'Test refund', externalReference: 'rev_test_001' });

      expect(revRes.status).toBe(201);
      expect(revRes.body.type).toBe('REVERSAL');

      // Balance should be back to 1500
      const balRes = await request(app.getHttpServer())
        .get('/wallets/wal_001/balance')
        .set('Authorization', `Bearer ${token}`);
      expect(balRes.body.availableBalance).toBe('1500.00');
    });

    it('should return 422 when reversing an already reversed transaction', async () => {
      // Create and reverse
      const debitKey = `test-${uuidv4()}`;
      const debitRes = await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', debitKey)
        .send({ walletId: 'wal_003', type: 'DEBIT', amount: '50.00', currency: 'PEN' });

      const txnId = debitRes.body.transactionId;

      await request(app.getHttpServer())
        .post(`/transactions/${txnId}/reversal`)
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `test-${uuidv4()}`)
        .send({ reason: 'First reversal' });

      // Try to reverse again
      const res = await request(app.getHttpServer())
        .post(`/transactions/${txnId}/reversal`)
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `test-${uuidv4()}`)
        .send({ reason: 'Second reversal attempt' });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('TRANSACTION_ALREADY_REVERSED');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSACTION STATUS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('GET /transactions/:id', () => {
    it('should return transaction status', async () => {
      const key = `test-${uuidv4()}`;
      const txnRes = await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send({ walletId: 'wal_001', type: 'CREDIT', amount: '10.00', currency: 'PEN' });

      const txnId = txnRes.body.transactionId;
      const res = await request(app.getHttpServer())
        .get(`/transactions/${txnId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.transactionId).toBe(txnId);
      expect(res.body.status).toBe('COMPLETED');
    });

    it('should return 404 for unknown transaction', async () => {
      const res = await request(app.getHttpServer())
        .get('/transactions/txn_nonexistent')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});
