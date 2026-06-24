# SPEC: POST /transactions/:transactionId/reversal

**Versión:** 1.0
**Servicio:** `TransactionsService.reverseTransaction()`
**Estrategia:** `ReversalStrategy`
**Controlador:** `TransactionsController`

---

## Contrato HTTP

- **Método:** POST
- **Ruta:** `/transactions/:transactionId/reversal`
- **Autenticación:** Bearer JWT requerido (`JwtAuthGuard`)
- **Idempotency-Key:** Header obligatorio

**Path params:**
- `transactionId` — string, ID de la transacción a revertir

**Request body:**
```json
{
  "reason": "Merchant refund / reversal",
  "externalReference": "rev_123456"
}
```

| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `reason` | string | ✓ | `IsString`, `IsNotEmpty` |
| `externalReference` | string | ✗ | `IsOptional` |

**Response 201 — éxito:**
```json
{
  "transactionId": "txn_reversal_abc",
  "walletId": "wal_001",
  "type": "REVERSAL",
  "amount": "25.50",
  "currency": "PEN",
  "status": "COMPLETED",
  "description": "Merchant refund / reversal",
  "externalReference": "rev_123456",
  "createdAt": "2024-01-15T11:00:00.000Z"
}
```

---

## Reglas de negocio

- **RN-01:** Header `Idempotency-Key` obligatorio → `MISSING_IDEMPOTENCY_KEY` (HTTP 400).

- **RN-02:** Verificar idempotencia antes de abrir transacción DB.

- **RN-03:** La transacción original (`transactionId`) debe existir. Si no → `TransactionNotFoundException` (HTTP 404).

- **RN-04:** La transacción original **no puede** tener `status === 'REVERSED'`. Si ya fue reversada → `TransactionAlreadyReversedException` (HTTP 422). Esta es la **regla de reversa única** — ninguna transacción puede reversarse dos veces.

- **RN-05:** La wallet asociada a la transacción original debe estar `ACTIVE`. Si no → `WalletBlockedException` (HTTP 422).

- **RN-06 (revertir DEBIT o TRANSFER_DEBIT):** Se acredita el `amount` original de vuelta al balance. `BalanceCalculator.credit(balance, amount)`.

- **RN-07 (revertir CREDIT o TRANSFER_CREDIT):** Se debita el `amount` original del balance. `BalanceCalculator.debit(balance, amount, walletId)`. Requiere que haya saldo suficiente → `InsufficientBalanceException` si no alcanza.

- **RN-08 (revertir REVERSAL):** No está definido en el dominio — una `REVERSAL` no puede reversarse. Si se intenta, el check de `status === 'REVERSED'` no aplicaría, pero el tipo `REVERSAL` no tiene lógica de reversa en `ReversalStrategy`. Esto es un gap a documentar.

- **RN-09:** La transacción original cambia su `status` a `REVERSED` dentro de la misma DB transaction.

- **RN-10:** Se crea una nueva transacción de tipo `REVERSAL` con `relatedTransactionId = transactionId` original.

- **RN-11:** El `amount` de la transacción `REVERSAL` es igual al `amount` de la transacción original — no al revés, ni configurable por el cliente.

- **RN-12:** Toda la operación (lectura con lock, actualización original, creación reversal, update wallet, audit_log) es atómica en una sola `DataSource.transaction()`.

---

## Invariantes del dominio

- **INV-01:** Una transacción con `status === 'REVERSED'` no puede tener más de una `REVERSAL` asociada.
- **INV-02:** El balance de la wallet después de la reversa debe volver exactamente al valor que tenía antes de la transacción original (en condiciones normales donde no hubo otras operaciones intermedias).
- **INV-03:** La transacción `REVERSAL` siempre tiene `relatedTransactionId` apuntando a la transacción que revierte.
- **INV-04:** El campo `reason` de la reversa es obligatorio y queda registrado como `description` en la transacción `REVERSAL`.

---

## Casos de error

| Condición | HTTP | Error code | Excepción |
|-----------|------|------------|-----------|
| Sin `Idempotency-Key` | 400 | `MISSING_IDEMPOTENCY_KEY` | `BadRequestException` |
| Key con body diferente | 409 | `IDEMPOTENCY_CONFLICT` | `IdempotencyConflictException` |
| Transacción no existe | 404 | `TRANSACTION_NOT_FOUND` | `TransactionNotFoundException` |
| Transacción ya reversada | 422 | `TRANSACTION_ALREADY_REVERSED` | `TransactionAlreadyReversedException` |
| Wallet no activa | 422 | `WALLET_BLOCKED` | `WalletBlockedException` |
| Saldo insuficiente (revertir CREDIT) | 422 | `INSUFFICIENT_BALANCE` | `InsufficientBalanceException` |
| Token inválido | 401 | `UNAUTHORIZED` | `UnauthorizedException` |

---

## Flujo de ejecución

```
POST /transactions/:transactionId/reversal + Idempotency-Key
    │
    ▼
[JwtAuthGuard] → [ValidationPipe] → Controller
    │
    ├─ [RN-01] ¿Falta Idempotency-Key? → 400
    │
    ▼
TransactionsService.reverseTransaction(transactionId, dto, key, actor)
    │
    ▼
IdempotencyService.check(key, endpoint, dto)              [RN-02]
    │
    ├─ cached → retornar inmediatamente
    │
    ▼
DataSource.transaction(async manager => {
    │
    ▼
    manager.findOne(TransactionEntity, { id: transactionId }) [RN-03]
    (sin pessimistic_write aún — solo para obtener walletId)
    │
    ├─ null → throw TransactionNotFoundException → 404
    │
    ▼
    WalletRepository.findActiveOrFail(original.walletId, manager) [RN-05]
    pessimistic_write lock
    │
    ├─ No existe → WalletNotFoundException
    ├─ No ACTIVE → WalletBlockedException
    │
    ▼
    ReversalStrategy.execute(reversalCtx, manager)
    │
    │   manager.findOne(TransactionEntity, { id, lock: pessimistic_write }) [RN-03+04]
    │   ├─ null → TransactionNotFoundException
    │   ├─ status === 'REVERSED' → TransactionAlreadyReversedException   [RN-04]
    │   │
    │   Según original.type:
    │   DEBIT / TRANSFER_DEBIT:
    │       wallet.balance = credit(balance, original.amount)            [RN-06]
    │   CREDIT / TRANSFER_CREDIT:
    │       wallet.balance = debit(balance, original.amount, walletId)   [RN-07]
    │       ├─ insuficiente → InsufficientBalanceException
    │   │
    │   original.status = 'REVERSED'                                     [RN-09]
    │   │
    │   Crear reversalTxn (type: REVERSAL)                               [RN-10]
    │       description = dto.reason
    │       relatedTransactionId = transactionId
    │       amount = original.amount                                     [RN-11]
    │
    ▼
    manager.save(WalletEntity, wallet)
    manager.save(TransactionEntity, [original, reversalTxn])             [RN-12]
    │
    ▼
    AuditService.log({ entityType: 'REVERSAL', ... }, manager)
    │
    ▼
    return reversalTxn
})
    │
    ▼
IdempotencyService.store(key, endpoint, dto, response, 201)
    │
    ▼
Retornar TransactionResponseDto (201)
```

---

## Contrato de auditoría

| Campo | Valor |
|-------|-------|
| `entityType` | `'REVERSAL'` |
| `entityId` | `reversalTransactionId` |
| `action` | `'REVERSAL'` |
| `actor` | `username` del JWT |
| `beforeState` | `{ originalStatus: 'COMPLETED', balance: balanceAntes }` |
| `afterState` | `{ originalStatus: 'REVERSED', balance: balanceDespués }` |
| `metadata` | `{ originalTransactionId, reason }` |

---

## Tests mínimos requeridos

### Unit tests (U) — estrategia
- `(U)` Revertir DEBIT → acredita el balance correctamente
- `(U)` Revertir CREDIT → debita el balance correctamente
- `(U)` Transacción ya reversada → `TransactionAlreadyReversedException`
- `(U)` Transacción inexistente → `TransactionNotFoundException`
- `(U)` Revertir CREDIT con saldo insuficiente → `InsufficientBalanceException`
- `(U)` `reversalTxn.amount` es igual a `original.amount`
- `(U)` `reversalTxn.relatedTransactionId` apunta al ID original

### Integration tests (I)
- `(I)` Reversa de DEBIT exitosa → 201 + balance restaurado (GET /balance)
- `(I)` Reversa de CREDIT exitosa → 201 + balance reducido
- `(I)` Doble reversa → 422 `TRANSACTION_ALREADY_REVERSED`
- `(I)` Transacción inexistente → 404 `TRANSACTION_NOT_FOUND`
- `(I)` Retry con misma Idempotency-Key → mismo `transactionId` de reversa
- `(I)` Reversa de TRANSFER_DEBIT → restaura balance en wallet origen
