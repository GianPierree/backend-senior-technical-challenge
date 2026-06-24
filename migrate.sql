-- ============================================================
-- Ligo Wallet Service — migrate.sql
-- Runs on EVERY docker compose up via the migrate service.
-- All statements use IF NOT EXISTS — fully idempotent.
-- Safe on both fresh and existing databases.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Tables (idempotent) ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      VARCHAR(100)   NOT NULL UNIQUE,
  password_hash VARCHAR(255)   NOT NULL,
  role          VARCHAR(20)    NOT NULL DEFAULT 'OPERATOR',
  status        VARCHAR(20)    NOT NULL DEFAULT 'ACTIVE',
  full_name     VARCHAR(200),
  email         VARCHAR(200),
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_user_role   CHECK (role   IN ('ADMIN', 'OPERATOR', 'VIEWER')),
  CONSTRAINT chk_user_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED'))
);

CREATE TABLE IF NOT EXISTS wallets (
  id            VARCHAR(50)    PRIMARY KEY,
  owner_id      VARCHAR(100)   NOT NULL,
  currency      VARCHAR(3)     NOT NULL DEFAULT 'PEN',
  balance       DECIMAL(18,2)  NOT NULL DEFAULT 0.00,
  status        VARCHAR(20)    NOT NULL DEFAULT 'ACTIVE',
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_balance_non_negative CHECK (balance >= 0),
  CONSTRAINT chk_wallet_status CHECK (status IN ('ACTIVE', 'BLOCKED', 'CLOSED'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id                     VARCHAR(50)    PRIMARY KEY,
  wallet_id              VARCHAR(50)    NOT NULL REFERENCES wallets(id),
  type                   VARCHAR(20)    NOT NULL,
  amount                 DECIMAL(18,2)  NOT NULL,
  currency               VARCHAR(3)     NOT NULL,
  status                 VARCHAR(20)    NOT NULL DEFAULT 'PENDING',
  description            TEXT,
  external_reference     VARCHAR(200),
  related_transaction_id VARCHAR(50),
  idempotency_key        VARCHAR(200)   UNIQUE,
  metadata               JSONB,
  created_at             TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_transaction_type   CHECK (type   IN ('DEBIT','CREDIT','TRANSFER_DEBIT','TRANSFER_CREDIT','REVERSAL')),
  CONSTRAINT chk_transaction_status CHECK (status IN ('PENDING','COMPLETED','FAILED','REVERSED')),
  CONSTRAINT chk_amount_positive    CHECK (amount > 0)
);

CREATE TABLE IF NOT EXISTS idempotency_records (
  id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  idempotency_key VARCHAR(200)   NOT NULL UNIQUE,
  endpoint        VARCHAR(200)   NOT NULL,
  request_hash    VARCHAR(64)    NOT NULL,
  response_body   JSONB          NOT NULL,
  http_status     INTEGER        NOT NULL,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type   VARCHAR(50)    NOT NULL,
  entity_id     VARCHAR(100)   NOT NULL,
  action        VARCHAR(50)    NOT NULL,
  actor         VARCHAR(100),
  before_state  JSONB,
  after_state   JSONB,
  metadata      JSONB,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ─── Indexes (idempotent) ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_users_username      ON users(username);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_type   ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_date   ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_idempotency_key     ON idempotency_records(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_audit_entity        ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_date          ON audit_logs(created_at DESC);

-- ─── Seed: wallets (idempotent) ───────────────────────────────────────────────

INSERT INTO wallets (id, owner_id, currency, balance, status) VALUES
  ('wal_001', 'user_001', 'PEN', 1500.00, 'ACTIVE'),
  ('wal_002', 'user_002', 'PEN',  800.00, 'ACTIVE'),
  ('wal_003', 'user_003', 'PEN',  250.00, 'ACTIVE'),
  ('wal_004', 'user_004', 'USD',  500.00, 'ACTIVE'),
  ('wal_005', 'user_005', 'PEN',    0.00, 'BLOCKED')
ON CONFLICT (id) DO NOTHING;

INSERT INTO transactions (id, wallet_id, type, amount, currency, status, description, external_reference)
VALUES
  ('txn_seed_001', 'wal_001', 'CREDIT', 1500.00, 'PEN', 'COMPLETED', 'Saldo inicial', 'seed_001'),
  ('txn_seed_002', 'wal_002', 'CREDIT',  800.00, 'PEN', 'COMPLETED', 'Saldo inicial', 'seed_002'),
  ('txn_seed_003', 'wal_003', 'CREDIT',  250.00, 'PEN', 'COMPLETED', 'Saldo inicial', 'seed_003'),
  ('txn_seed_004', 'wal_004', 'CREDIT',  500.00, 'USD', 'COMPLETED', 'Saldo inicial', 'seed_004')
ON CONFLICT (id) DO NOTHING;

-- NOTE: the admin user is NOT seeded here because password hashing
-- requires Node.js crypto.scrypt. SeedService handles it on app boot.
