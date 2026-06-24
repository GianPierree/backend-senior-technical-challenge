# SPEC: GET /wallets/:walletId/movements

**Versión:** 1.0
**Servicio:** `WalletsService.getMovements()`
**Controlador:** `WalletsController`

---

## Contrato HTTP

- **Método:** GET
- **Ruta:** `/wallets/:walletId/movements`
- **Autenticación:** Bearer JWT requerido (`JwtAuthGuard`)
- **Idempotency-Key:** No requerida

**Path params:**
- `walletId` — string, ID de la wallet

**Query params (todos opcionales):**
| Param | Tipo | Default | Valores válidos |
|-------|------|---------|-----------------|
| `type` | string | `ALL` | `ALL`, `DEBIT`, `CREDIT`, `TRANSFER_DEBIT`, `TRANSFER_CREDIT`, `REVERSAL` |
| `status` | string | `ALL` | `ALL`, `PENDING`, `COMPLETED`, `FAILED`, `REVERSED` |
| `page` | integer | `1` | ≥ 1 |
| `pageSize` | integer | `20` | 1–100 |

**Response 200 — éxito:**
```json
{
  "walletId": "wal_001",
  "total": 42,
  "page": 1,
  "pageSize": 20,
  "movements": [
    {
      "transactionId": "txn_abc123",
      "amount": "25.50",
      "type": "DEBIT",
      "status": "COMPLETED",
      "currency": "PEN",
      "description": "Pago QR comercio",
      "externalReference": "qr_789456",
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

## Reglas de negocio

- **RN-01:** Verificar que la wallet existe. Si no → `WalletNotFoundException` (HTTP 404). El endpoint no requiere que la wallet esté `ACTIVE` — wallets `BLOCKED` o `CLOSED` también pueden consultar su historial.

- **RN-02:** Los resultados se ordenan por `created_at DESC` (más recientes primero) de forma fija — no es configurable por el cliente.

- **RN-03:** Cuando `type=ALL` (o no se envía), no se aplica filtro de tipo. Cuando `type` tiene un valor específico, se filtra con `WHERE type = :type`.

- **RN-04:** Ídem para `status`: `ALL` equivale a sin filtro, cualquier otro valor filtra.

- **RN-05:** La paginación usa `OFFSET/LIMIT`: `skip = (page - 1) * pageSize`, `take = pageSize`. El campo `total` refleja el **total de registros que coinciden con los filtros**, no solo los de la página actual.

- **RN-06:** `amount` en cada movimiento se retorna como string con 2 decimales, igual que el balance.

- **RN-07:** `pageSize` máximo es 100. Valores superiores deben ser rechazados por `class-validator` (HTTP 400).

---

## Invariantes del dominio

- **INV-01:** `total` siempre es ≥ 0.
- **INV-02:** `movements` es siempre un array (vacío si no hay resultados, nunca `null`).
- **INV-03:** Los movimientos retornados corresponden exclusivamente a la `walletId` solicitada — nunca se mezclan con movimientos de otras wallets.

---

## Casos de error

| Condición | HTTP | Error code | Excepción |
|-----------|------|------------|-----------|
| Wallet no existe | 404 | `WALLET_NOT_FOUND` | `WalletNotFoundException` |
| Token ausente o inválido | 401 | `UNAUTHORIZED` | `UnauthorizedException` |
| `pageSize > 100` | 400 | (class-validator) | `ValidationException` |
| `page < 1` | 400 | (class-validator) | `ValidationException` |
| `type` con valor inválido | 400 | (class-validator) | `ValidationException` |

---

## Flujo de ejecución

```
GET /wallets/:walletId/movements?type=DEBIT&page=1&pageSize=20
    │
    ▼
[JwtAuthGuard] — verifica Bearer token
    │
    ▼
[ValidationPipe] — valida y transforma GetMovementsQueryDto
    │ type: IsIn([ALL, DEBIT, CREDIT, ...])
    │ page: IsInt, Min(1)
    │ pageSize: IsInt, Min(1), Max(100)
    ▼
WalletsService.getMovements(walletId, query)
    │
    ▼
walletRepo.findOne({ where: { id: walletId } })
    │
    ├─ null → throw WalletNotFoundException → 404
    │
    ▼
transactionRepo.createQueryBuilder('txn')
    .where('txn.wallet_id = :walletId')
    .andWhere('txn.type = :type')       [si type !== ALL]
    .andWhere('txn.status = :status')   [si status !== ALL]
    .orderBy('txn.created_at', 'DESC')
    .skip((page-1) * pageSize)
    .take(pageSize)
    .getManyAndCount()
    │
    ▼
Mapear cada transacción a MovementItemDto
    │ amount = parseFloat(txn.amount).toFixed(2)
    ▼
Retornar MovementsResponseDto { walletId, total, page, pageSize, movements }
```

---

## Contrato de auditoría

No aplica — las consultas de movimientos no generan registros en `audit_logs`.

---

## Tests mínimos requeridos

### Unit tests (U)
- `(U)` Wallet existente sin filtros → retorna array de movements con paginación
- `(U)` Wallet inexistente → lanza `WalletNotFoundException`
- `(U)` `total` refleja count completo, no solo página actual
- `(U)` Filtro `type=DEBIT` aplica WHERE correcto en QueryBuilder
- `(U)` `movements` es array vacío cuando no hay resultados (no `null`)

### Integration tests (I)
- `(I)` GET /wallets/wal_001/movements → 200 con array y `total`
- `(I)` GET /wallets/wal_999/movements → 404
- `(I)` `?type=DEBIT` solo retorna movimientos de tipo DEBIT
- `(I)` `?pageSize=2&page=1` retorna máximo 2 items con `total` correcto
- `(I)` `?pageSize=101` → 400 (validación)
- `(I)` Movimiento recién creado aparece en el listado
