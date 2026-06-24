# SPEC: POST /transactions/transfer

**Versión:** 1.0
**Servicio:** `TransactionsService.createTransfer()`
**Estrategia:** `TransferStrategy`
**Controlador:** `TransactionsController`

---

## Contrato HTTP

- **Método:** POST
- **Ruta:** `/transactions/transfer`
- **Autenticación:** Bearer JWT requerido (`JwtAuthGuard`)
- **Idempotency-Key:** Header obligatorio (ver `SPEC_IDEMPOTENCY.md`)

**Request body:**
```json
{
  "sourceWalletId": "wal_001",
  "targetWalletId": "wal_002",
  "amount": "100.00",
  "currency": "PEN",
  "description": "Transferencia entre usuarios"
}
```

| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `sourceWalletId` | string | ✓ | `IsString`, `IsNotEmpty` |
| `targetWalletId` | string | ✓ | `IsString`, `IsNotEmpty` |
| `amount` | string | ✓ | regex `/^\d+(\.\d{1,2})?$/` |
| `currency` | string | ✓ | `IsString`, `IsNotEmpty` |
| `description` | string | ✗ | `IsOptional` |

**Response 201 — éxito:**
```json
{
  "debitTransactionId": "txn_abc123",
  "creditTransactionId": "txn_def456",
  "sourceWalletId": "wal_001",
  "targetWalletId": "wal_002",
  "amount": "100.00",
  "currency": "PEN",
  "status": "COMPLETED"
}
```

---

## Reglas de negocio

- **RN-01:** Header `Idempotency-Key` obligatorio → `MISSING_IDEMPOTENCY_KEY` (HTTP 400).

- **RN-02:** Verificar idempotencia antes de abrir transacción DB.

- **RN-03:** La `sourceWallet` debe existir y estar `ACTIVE`. Bloqueo `pessimistic_write`. Si no existe → `WalletNotFoundException`. Si no activa → `WalletBlockedException`.

- **RN-04:** La `targetWallet` debe existir y estar `ACTIVE`. Mismas reglas que RN-03.

- **RN-05:** La `currency` del request debe coincidir con `sourceWallet.currency`. Si difiere → `CurrencyMismatchException`.

- **RN-06:** `TransferStrategy` también valida que `targetWallet.currency === currency`. Si difiere → `CurrencyMismatchException`. Esto protege ante wallets de distinta moneda aunque el request sea consistente.

- **RN-07:** `sourceWallet.balance` debe ser ≥ `amount`. Si no → `InsufficientBalanceException` (lanzada por `BalanceCalculator.debit()`).

- **RN-08:** La transferencia es un **doble asiento atómico** — se crean dos transacciones en la misma DB transaction:
  - `TRANSFER_DEBIT` en `sourceWallet` (con `idempotencyKey` y `relatedTransactionId = creditId`)
  - `TRANSFER_CREDIT` en `targetWallet` (con `relatedTransactionId = debitId`)

- **RN-09:** Los balances de ambas wallets se actualizan dentro de la misma `DataSource.transaction()`. Si falla → rollback de ambos.

- **RN-10:** La `idempotencyKey` se almacena únicamente en la transacción `TRANSFER_DEBIT` — no en la `TRANSFER_CREDIT`.

- **RN-11:** El `metadata` de `TRANSFER_DEBIT` incluye `{ targetWalletId }` para trazabilidad.

---

## Invariantes del dominio

- **INV-01:** La suma de balances de `sourceWallet + targetWallet` antes y después de la transferencia debe ser idéntica (conservación de dinero).
- **INV-02:** Nunca puede existir `TRANSFER_DEBIT` sin su correspondiente `TRANSFER_CREDIT`, ni viceversa — ambas se crean o ninguna (atomicidad).
- **INV-03:** `sourceWallet.balance` nunca queda negativo.
- **INV-04:** Las IDs de ambas transacciones son mutuamente referenciadas via `relatedTransactionId`.

---

## Casos de error

| Condición | HTTP | Error code | Excepción |
|-----------|------|------------|-----------|
| Sin `Idempotency-Key` | 400 | `MISSING_IDEMPOTENCY_KEY` | `BadRequestException` |
| Key con body diferente | 409 | `IDEMPOTENCY_CONFLICT` | `IdempotencyConflictException` |
| `sourceWallet` no existe | 404 | `WALLET_NOT_FOUND` | `WalletNotFoundException` |
| `targetWallet` no existe | 404 | `WALLET_NOT_FOUND` | `WalletNotFoundException` |
| `sourceWallet` no activa | 422 | `WALLET_BLOCKED` | `WalletBlockedException` |
| `targetWallet` no activa | 422 | `WALLET_BLOCKED` | `WalletBlockedException` |
| Moneda distinta (source) | 422 | `CURRENCY_MISMATCH` | `CurrencyMismatchException` |
| Moneda distinta (target) | 422 | `CURRENCY_MISMATCH` | `CurrencyMismatchException` |
| Saldo insuficiente | 422 | `INSUFFICIENT_BALANCE` | `InsufficientBalanceException` |
| Token inválido | 401 | `UNAUTHORIZED` | `UnauthorizedException` |

---

## Flujo de ejecución

```
POST /transactions/transfer + Idempotency-Key
    │
    ▼
[JwtAuthGuard] → [ValidationPipe] → Controller
    │
    ├─ [RN-01] ¿Falta Idempotency-Key? → 400
    │
    ▼
TransactionsService.createTransfer(dto, key, actor)
    │
    ▼
IdempotencyService.check(key, '/transactions/transfer', dto)  [RN-02]
    │
    ├─ cached → retornar inmediatamente
    │
    ▼
DataSource.transaction(async manager => {
    │
    ▼
    WalletRepository.findActiveOrFail(sourceWalletId, manager) [RN-03]
    WalletRepository.findActiveOrFail(targetWalletId, manager) [RN-04]
    pessimistic_write en ambas (previene deadlocks si orden es consistente)
    │
    ├─ Alguna no existe → WalletNotFoundException
    ├─ Alguna no ACTIVE → WalletBlockedException
    │
    ▼
    ¿sourceWallet.currency === dto.currency?               [RN-05]
    ├─ No → CurrencyMismatchException
    │
    ▼
    TransferStrategy.execute({ wallet: source, targetWallet: target, ... })
    │
    │   ¿targetWallet.currency === currency?               [RN-06]
    │   ├─ No → CurrencyMismatchException
    │   │
    │   BalanceCalculator.debit(source.balance, amount, sourceId) [RN-07]
    │   ├─ insuficiente → InsufficientBalanceException
    │   │
    │   source.balance = source.balance - amount
    │   target.balance = target.balance + amount
    │   │
    │   Crear debitTxn (TRANSFER_DEBIT)                    [RN-08]
    │   Crear creditTxn (TRANSFER_CREDIT)
    │   debitTxn.relatedTransactionId = creditTxn.id
    │   creditTxn.relatedTransactionId = debitTxn.id
    │
    ▼
    manager.save([sourceWallet, targetWallet])             [RN-09]
    manager.save(TransactionEntity, [debitTxn, creditTxn])
    │
    ▼
    AuditService.log({ entityType: 'TRANSFER', ... }, manager)
    │
    ▼
    return { debitTxn, creditTxn }
})
    │
    ▼
IdempotencyService.store(key, endpoint, dto, response, 201)
    │
    ▼
Retornar TransferResponseDto (201)
```

---

## Contrato de auditoría

| Campo | Valor |
|-------|-------|
| `entityType` | `'TRANSFER'` |
| `entityId` | `debitTransactionId` |
| `action` | `'TRANSFER'` |
| `actor` | `username` del JWT |
| `beforeState` | `{ balance: sourceBalance antes }` |
| `afterState` | `{ balance: sourceBalance después }` |
| `metadata` | `{ targetBalance: { before, after }, amount }` |

---

## Tests mínimos requeridos

### Unit tests (U) — estrategia
- `(U)` `TransferStrategy.execute()` debita source y acredita target correctamente
- `(U)` `TransferStrategy.execute()` lanza `CurrencyMismatchException` si target tiene moneda diferente
- `(U)` `TransferStrategy.execute()` lanza `InsufficientBalanceException` si source sin fondos
- `(U)` Ambas transacciones tienen `relatedTransactionId` mutuamente referenciadas
- `(U)` Solo `debitTxn` tiene `idempotencyKey`

### Unit tests (U) — service
- `(U)` Idempotency hit → retorna cached sin transacción DB
- `(U)` Currency mismatch en source → `CurrencyMismatchException`

### Integration tests (I)
- `(I)` Transferencia exitosa → 201 + balances actualizados en ambas wallets
- `(I)` Source balance = destino balance (conservación de dinero)
- `(I)` Retry con misma key → mismos IDs de transacción
- `(I)` Source sin fondos → 422 `INSUFFICIENT_BALANCE`
- `(I)` Target wallet bloqueada → 422 `WALLET_BLOCKED`
- `(I)` Wallets con distinta moneda → 422 `CURRENCY_MISMATCH`
- `(I)` Target wallet inexistente → 404 `WALLET_NOT_FOUND`
