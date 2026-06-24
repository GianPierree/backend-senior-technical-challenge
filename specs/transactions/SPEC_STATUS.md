# SPEC: GET /transactions/:transactionId

**Versión:** 1.0
**Servicio:** `TransactionsService.getTransactionStatus()`
**Controlador:** `TransactionsController`

---

## Contrato HTTP

- **Método:** GET
- **Ruta:** `/transactions/:transactionId`
- **Autenticación:** Bearer JWT requerido (`JwtAuthGuard`)
- **Idempotency-Key:** No requerida

**Path params:**
- `transactionId` — string, ID de la transacción

**Response 200 — éxito:**
```json
{
  "transactionId": "txn_abc123def456789",
  "status": "COMPLETED",
  "type": "DEBIT",
  "amount": "25.50",
  "currency": "PEN",
  "externalReference": "qr_789456",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

---

## Reglas de negocio

- **RN-01:** Buscar la transacción por `transactionId` en la tabla `transactions`. Si no existe → `TransactionNotFoundException` (HTTP 404).

- **RN-02:** El endpoint retorna la transacción **independientemente de su status** — `COMPLETED`, `REVERSED`, `FAILED`, `PENDING` son todos válidos.

- **RN-03:** `amount` se retorna como string con 2 decimales via `TransactionMapper.toStatusResponse()` → `BalanceCalculator.format()`.

- **RN-04:** El campo `externalReference` puede ser `null` — no todos los tipos de transacción tienen referencia externa.

---

## Invariantes del dominio

- **INV-01:** `transactionId` en la respuesta coincide con el `transactionId` del path param.
- **INV-02:** `amount` siempre es string con exactamente 2 decimales.
- **INV-03:** `status` es siempre uno de: `PENDING`, `COMPLETED`, `FAILED`, `REVERSED`.

---

## Casos de error

| Condición | HTTP | Error code | Excepción |
|-----------|------|------------|-----------|
| Transacción no existe | 404 | `TRANSACTION_NOT_FOUND` | `TransactionNotFoundException` |
| Token ausente o inválido | 401 | `UNAUTHORIZED` | `UnauthorizedException` |

---

## Flujo de ejecución

```
GET /transactions/:transactionId
    │
    ▼
[JwtAuthGuard]
    │
    ▼
TransactionsService.getTransactionStatus(transactionId)
    │
    ▼
transactionRepo.findOne({ where: { id: transactionId } })
    │
    ├─ null → throw TransactionNotFoundException → 404
    │
    ▼
TransactionMapper.toStatusResponse(txn)
    │ amount = BalanceCalculator.format(txn.amount)
    ▼
Retornar TransactionStatusResponseDto (200)
```

---

## Contrato de auditoría

No aplica — las consultas no generan registros en `audit_logs`.

---

## Tests mínimos requeridos

### Unit tests (U)
- `(U)` Transacción existente → retorna DTO con todos los campos
- `(U)` Transacción inexistente → `TransactionNotFoundException`
- `(U)` `amount` formateado con 2 decimales via `BalanceCalculator.format()`
- `(U)` `externalReference` puede ser `null` sin romper el mapper

### Integration tests (I)
- `(I)` GET /transactions/:id de transacción creada → 200 con datos correctos
- `(I)` GET /transactions/txn_nonexistent → 404 `TRANSACTION_NOT_FOUND`
- `(I)` Status de transacción reversada es `REVERSED` correctamente
- `(I)` Sin token → 401
