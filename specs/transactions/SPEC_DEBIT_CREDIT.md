# SPEC: POST /transactions (DEBIT / CREDIT)

**Versión:** 1.0
**Servicio:** `TransactionsService.createTransaction()`
**Estrategias:** `DebitStrategy`, `CreditStrategy`
**Controlador:** `TransactionsController`

---

## Contrato HTTP

- **Método:** POST
- **Ruta:** `/transactions`
- **Autenticación:** Bearer JWT requerido (`JwtAuthGuard`)
- **Idempotency-Key:** Header obligatorio (ver `SPEC_IDEMPOTENCY.md`)

**Request body:**
```json
{
  "walletId": "wal_001",
  "type": "DEBIT",
  "amount": "25.50",
  "currency": "PEN",
  "description": "Pago QR comercio",
  "externalReference": "qr_789456"
}
```

| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `walletId` | string | ✓ | `IsString`, `IsNotEmpty` |
| `type` | enum | ✓ | `IsIn(['DEBIT', 'CREDIT'])` |
| `amount` | string | ✓ | regex `/^\d+(\.\d{1,2})?$/` — decimal positivo, máx 2 decimales |
| `currency` | string | ✓ | `IsString`, `IsNotEmpty` |
| `description` | string | ✗ | `IsOptional` |
| `externalReference` | string | ✗ | `IsOptional` |

**Response 201 — éxito:**
```json
{
  "transactionId": "txn_abc123def456789",
  "walletId": "wal_001",
  "type": "DEBIT",
  "amount": "25.50",
  "currency": "PEN",
  "status": "COMPLETED",
  "description": "Pago QR comercio",
  "externalReference": "qr_789456",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

---

## Reglas de negocio

- **RN-01:** El header `Idempotency-Key` es obligatorio. Si no está presente → `BadRequestException` con `MISSING_IDEMPOTENCY_KEY` (HTTP 400). Esta validación ocurre en el controller, antes de llamar al service.

- **RN-02:** Verificar idempotencia con `IdempotencyService.check()` antes de abrir la transacción de DB. Si hay caché → retornar inmediatamente sin ejecutar ninguna operación.

- **RN-03:** La wallet debe existir. Si no → `WalletNotFoundException` (HTTP 404). La búsqueda usa `pessimistic_write` lock.

- **RN-04:** La wallet debe estar en status `ACTIVE`. Si `status !== 'ACTIVE'` → `WalletBlockedException` (HTTP 422).

- **RN-05:** La `currency` del request debe coincidir con `wallet.currency`. Si difieren → `CurrencyMismatchException` (HTTP 422).

- **RN-06 (DEBIT):** El balance resultante no puede ser negativo. Si `wallet.balance < amount` → `InsufficientBalanceException` (HTTP 422). La verificación la realiza `BalanceCalculator.debit()` antes de modificar el balance.

- **RN-07 (CREDIT):** No tiene restricción de monto máximo. `BalanceCalculator.credit()` siempre suma sin validaciones adicionales.

- **RN-08:** Toda la operación (actualización de balance + creación de transacción + escritura de audit_log) se ejecuta en una única `DataSource.transaction()`. Si cualquier parte falla → rollback completo.

- **RN-09:** El ID de la transacción se genera con `TransactionIdFactory.generate()` (formato: `txn_` + 16 caracteres hexadecimales).

- **RN-10:** El `amount` se almacena y retorna como string con exactamente 2 decimales. La aritmética usa `BalanceCalculator` (decimal.js) — nunca operaciones float nativas.

- **RN-11:** La `idempotencyKey` se almacena en el campo `idempotency_key` de la transacción creada.

---

## Invariantes del dominio

- **INV-01:** `wallet.balance` nunca puede quedar negativo tras la operación.
- **INV-02:** Toda transacción `COMPLETED` tiene exactamente un registro en `audit_logs` creado dentro de la misma DB transaction.
- **INV-03:** El `status` de la transacción creada siempre es `COMPLETED` — no existe estado `PENDING` para estas operaciones (son síncronas y atómicas).

---

## Casos de error

| Condición | HTTP | Error code | Excepción |
|-----------|------|------------|-----------|
| Sin `Idempotency-Key` header | 400 | `MISSING_IDEMPOTENCY_KEY` | `BadRequestException` |
| Key con body diferente | 409 | `IDEMPOTENCY_CONFLICT` | `IdempotencyConflictException` |
| Body inválido (validación) | 400 | (class-validator) | `ValidationException` |
| Wallet no existe | 404 | `WALLET_NOT_FOUND` | `WalletNotFoundException` |
| Wallet no activa | 422 | `WALLET_BLOCKED` | `WalletBlockedException` |
| Moneda distinta | 422 | `CURRENCY_MISMATCH` | `CurrencyMismatchException` |
| Saldo insuficiente (DEBIT) | 422 | `INSUFFICIENT_BALANCE` | `InsufficientBalanceException` |
| Token ausente o inválido | 401 | `UNAUTHORIZED` | `UnauthorizedException` |

---

## Flujo de ejecución

```
POST /transactions + Idempotency-Key header
    │
    ▼
[JwtAuthGuard] → [ValidationPipe] → Controller
    │
    ├─ [RN-01] ¿Falta Idempotency-Key? → 400
    │
    ▼
TransactionsService.createTransaction(dto, key, actor)
    │
    ▼
IdempotencyService.check(key, '/transactions', dto)     [RN-02]
    │
    ├─ cached → retornar responseBody inmediatamente
    │
    ▼
DataSource.transaction(async manager => {
    │
    ▼
    WalletRepository.findActiveOrFail(walletId, manager) [RN-03, RN-04]
    pesimistic_write lock
    │
    ├─ No existe → WalletNotFoundException
    ├─ No ACTIVE → WalletBlockedException
    │
    ▼
    ¿wallet.currency === dto.currency?                   [RN-05]
    │
    ├─ No → CurrencyMismatchException
    │
    ▼
    strategy = type === 'DEBIT' ? DebitStrategy : CreditStrategy
    strategy.execute({ wallet, amount, currency, ... })
    │
    DebitStrategy:
        BalanceCalculator.debit(balance, amount, walletId) [RN-06]
        ├─ balance < amount → InsufficientBalanceException
        └─ wallet.balance = balance - amount
    CreditStrategy:
        BalanceCalculator.credit(balance, amount)          [RN-07]
        └─ wallet.balance = balance + amount
    │
    ▼
    manager.save(WalletEntity, wallet)                   [RN-08]
    manager.save(TransactionEntity, transaction)
    │
    ▼
    AuditService.log({ entityType: 'TRANSACTION',        [INV-02]
        action: dto.type, beforeState, afterState }, manager)
    │
    ▼
    return transaction
})
    │
    ▼
response = TransactionMapper.toResponse(transaction)
    │
    ▼
IdempotencyService.store(key, endpoint, dto, response, 201) [RN-04]
    │
    ▼
Retornar response (201)
```

---

## Contrato de auditoría

Registro en `audit_logs` por cada operación exitosa:

| Campo | Valor |
|-------|-------|
| `entityType` | `'TRANSACTION'` |
| `entityId` | `transactionId` |
| `action` | `'DEBIT'` o `'CREDIT'` |
| `actor` | `username` del JWT |
| `beforeState` | `{ balance: "1500.00" }` |
| `afterState` | `{ balance: "1474.50" }` |
| `metadata` | `{ walletId, amount }` |

---

## Tests mínimos requeridos

### Unit tests (U) — estrategias (sin NestJS)
- `(U)` `DebitStrategy.execute()` deduce el balance correctamente
- `(U)` `DebitStrategy.execute()` lanza `InsufficientBalanceException` cuando balance < amount
- `(U)` `CreditStrategy.execute()` incrementa el balance correctamente
- `(U)` `BalanceCalculator.debit('100.00', '200.00', id)` lanza excepción
- `(U)` `BalanceCalculator.credit('500.00', '150.00')` retorna `'650.00'`
- `(U)` `BalanceCalculator.format('1500')` retorna `'1500.00'`

### Unit tests (U) — service (con mocks)
- `(U)` Idempotency hit → retorna cached sin llamar a DataSource.transaction
- `(U)` Currency mismatch → lanza `CurrencyMismatchException`
- `(U)` Wallet inexistente → lanza `WalletNotFoundException`
- `(U)` Wallet bloqueada → lanza `WalletBlockedException`
- `(U)` DEBIT exitoso → llama a `DebitStrategy.execute()` y guarda idempotencia

### Integration tests (I)
- `(I)` DEBIT exitoso → 201 + balance reducido verificado vía GET /balance
- `(I)` CREDIT exitoso → 201 + balance aumentado verificado vía GET /balance
- `(I)` Retry con misma Idempotency-Key → mismo `transactionId`
- `(I)` Misma key, body diferente → 409
- `(I)` Sin Idempotency-Key → 400 `MISSING_IDEMPOTENCY_KEY`
- `(I)` Saldo insuficiente → 422 `INSUFFICIENT_BALANCE`
- `(I)` Wallet bloqueada → 422 `WALLET_BLOCKED`
- `(I)` Wallet inexistente → 404 `WALLET_NOT_FOUND`
- `(I)` Moneda distinta → 422 `CURRENCY_MISMATCH`
