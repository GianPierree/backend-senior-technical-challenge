# Ligo Wallet Transaction Service

Backend microservice for managing regulated digital wallet operations.

**Stack:** Node.js 20 · TypeScript · NestJS · PostgreSQL · TypeORM · Docker Compose

---

## 🚀 Quick Start (single command)

```bash
docker compose up --build
```

The service will be available at:
- **API:** http://localhost:3000
- **Swagger docs:** http://localhost:3000/api/docs
- **Health:** http://localhost:3000/health
- **Readiness:** http://localhost:3000/readiness

> PostgreSQL starts first. The app waits for it to be healthy before booting.

---

## 🔐 Authentication

All endpoints (except `/auth/login`, `/health`, `/readiness`) require a Bearer JWT.

### Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "senior.backend", "password": "Password123"}'
```

Response:
```json
{ "token": "eyJhbGci...", "expiresIn": 3600 }
```

---

## 📡 API Reference

### Wallets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/wallets/:walletId/balance` | Get wallet balance |
| GET | `/wallets/:walletId/movements` | Paginated movement list |

**Query params for movements:** `type`, `status`, `page`, `pageSize`

### Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/transactions` | Create DEBIT or CREDIT |
| POST | `/transactions/transfer` | Transfer between wallets |
| GET | `/transactions/:id` | Get transaction status |
| POST | `/transactions/:id/reversal` | Reverse a transaction |

> ⚠️ All mutation endpoints require the `Idempotency-Key` header (UUID).

---

## 💡 Seed Data

| Wallet | Owner | Currency | Balance | Status |
|--------|-------|----------|---------|--------|
| wal_001 | user_001 | PEN | 1,500.00 | ACTIVE |
| wal_002 | user_002 | PEN | 800.00 | ACTIVE |
| wal_003 | user_003 | PEN | 250.00 | ACTIVE |
| wal_004 | user_004 | USD | 500.00 | ACTIVE |
| wal_005 | user_005 | PEN | 0.00 | BLOCKED |

---

## 🧪 Running Tests

### Prerequisites

```bash
npm install
```

### Unit tests

```bash
npm run test:unit
```

### Integration tests (requires running PostgreSQL)

```bash
docker compose up -d postgres
npm run test:integration
```

### All tests with coverage

```bash
npm run test:cov
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     HTTP Client                         │
└────────────────────────┬────────────────────────────────┘
                         │ REST / JSON
┌────────────────────────▼────────────────────────────────┐
│              NestJS Application (Port 3000)             │
│                                                         │
│  ┌──────────┐  ┌───────────┐  ┌────────────────────┐   │
│  │   Auth   │  │  Wallets  │  │   Transactions     │   │
│  │ Controller│  │Controller │  │    Controller      │   │
│  └────┬─────┘  └─────┬─────┘  └────────┬───────────┘   │
│       │              │                  │               │
│  ┌────▼─────┐  ┌─────▼─────┐  ┌────────▼───────────┐   │
│  │   Auth   │  │  Wallets  │  │   Transactions     │   │
│  │ Service  │  │  Service  │  │     Service        │   │
│  └──────────┘  └───────────┘  └────────┬───────────┘   │
│                                         │               │
│  ┌──────────────────────────────────────▼────────────┐  │
│  │              Common Services                      │  │
│  │   IdempotencyService │ AuditService               │  │
│  └──────────────────────────────────────┬────────────┘  │
│                                         │               │
│  ┌──────────────────────────────────────▼────────────┐  │
│  │                  TypeORM                          │  │
│  └──────────────────────────────────────┬────────────┘  │
└─────────────────────────────────────────┼───────────────┘
                                          │
┌─────────────────────────────────────────▼───────────────┐
│                   PostgreSQL 16                         │
│                                                         │
│  wallets │ transactions │ idempotency_records │         │
│  audit_logs                                             │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**Atomicity:** All balance mutations use `DataSource.transaction()` with `pessimistic_write` locks on wallet rows, preventing race conditions.

**Idempotency:** Every critical endpoint requires an `Idempotency-Key` header. Keys are persisted in PostgreSQL with a SHA-256 hash of the request body. Same key + same body returns cached response. Same key + different body returns 409.

**No floats:** Balances are stored as `DECIMAL(18,2)` in PostgreSQL and manipulated with `decimal.js` — never JavaScript native floats.

**Audit trail:** Every state mutation writes to `audit_logs` within the same transaction.

**Reversal guard:** A transaction with `status = REVERSED` cannot be reversed again (single-reversal invariant).

---

## 🔒 Security

- JWT validation via Passport `passport-jwt` strategy on all protected routes
- `class-validator` DTOs with `whitelist: true` — unknown fields are stripped
- Global exception filter — no stack traces or internal details in responses
- Logs never contain tokens, passwords, or Idempotency-Key values
- All secrets via environment variables (no hardcoded values)
- Correct HTTP status codes: 400, 401, 403, 404, 409, 422, 500

---

## 🤖 AI Usage Declaration

| Item | Detail |
|------|--------|
| **Tool used** | Claude (Anthropic) |
| **Used for** | Architecture planning, boilerplate scaffolding, test generation, README drafting |
| **Code accepted** | Entity definitions, DTO structures, Swagger decorators, test skeletons |
| **Code discarded** | Initial reversal logic that didn't handle TRANSFER_DEBIT/CREDIT types correctly; early idempotency design using in-memory Map (replaced with DB-backed solution for persistence) |
| **Manually validated** | All business rules (balance checks, currency validation, reversal guard), TypeORM transaction semantics with `pessimistic_write`, Decimal.js arithmetic, integration test assertions |
| **Risks identified** | AI-suggested `float` arithmetic for money — rejected and replaced with `decimal.js`. AI-suggested `synchronize: true` for TypeORM in production — removed. |

---

## 📁 Project Structure

```
src/
├── auth/                  # JWT mock login + Passport strategy
│   ├── dto/
│   ├── guards/
│   ├── strategies/
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   └── auth.module.ts
├── wallets/               # Balance + paginated movements
│   ├── dto/
│   ├── entities/
│   ├── wallets.controller.ts
│   ├── wallets.service.ts
│   └── wallets.module.ts
├── transactions/          # Debit, credit, transfer, reversal
│   ├── dto/
│   ├── entities/
│   ├── transactions.controller.ts
│   ├── transactions.service.ts
│   └── transactions.module.ts
├── common/                # Shared: idempotency, audit, exceptions, filters
│   ├── entities/
│   ├── exceptions/
│   ├── filters/
│   ├── services/
│   └── common.module.ts
├── health/                # /health + /readiness
├── app.module.ts
└── main.ts
test/
├── unit/                  # Unit tests (no DB)
│   ├── auth/
│   ├── wallets/
│   ├── transactions/
│   └── common/
└── integration/           # Full E2E against PostgreSQL
```
