# SPEC: GET /wallets/:walletId/balance

**Versión:** 1.0
**Servicio:** `WalletsService.getBalance()`
**Controlador:** `WalletsController`

---

## Contrato HTTP

- **Método:** GET
- **Ruta:** `/wallets/:walletId/balance`
- **Autenticación:** Bearer JWT requerido (`JwtAuthGuard`)
- **Idempotency-Key:** No requerida

**Path params:**
- `walletId` — string, ID de la wallet (ej: `"wal_001"`)

**Response 200 — éxito:**
```json
{
  "walletId": "wal_001",
  "currency": "PEN",
  "availableBalance": "1500.00",
  "status": "ACTIVE"
}
```

---

## Reglas de negocio

- **RN-01:** Buscar la wallet por `walletId` en la tabla `wallets`. Si no existe → `WalletNotFoundException` (HTTP 404).

- **RN-02:** El campo `availableBalance` se retorna **siempre como string** con exactamente 2 decimales (ej: `"1500.00"`, nunca `1500`, `1500.0` ni número JavaScript). Se obtiene con `parseFloat(wallet.balance).toFixed(2)`.

- **RN-03:** El endpoint retorna el balance **independientemente del status** de la wallet — una wallet `BLOCKED` o `CLOSED` también tiene su balance visible. No lanzar `WalletBlockedException` aquí.

- **RN-04:** El campo `status` se incluye en la respuesta para que el cliente pueda saber el estado sin hacer una llamada adicional.

- **RN-05:** Nunca usar aritmética `float` nativa de JavaScript para representar el balance — el valor viene directamente del string almacenado en `DECIMAL(18,2)` de PostgreSQL.

---

## Invariantes del dominio

- **INV-01:** `availableBalance` nunca puede ser un número negativo (el constraint `CHECK (balance >= 0)` en PostgreSQL lo garantiza a nivel de DB).
- **INV-02:** `availableBalance` siempre tiene exactamente 2 decimales en la representación string.
- **INV-03:** `currency` siempre es un código ISO 4217 de 3 letras (`PEN`, `USD`, `EUR`).

---

## Casos de error

| Condición | HTTP | Error code | Excepción |
|-----------|------|------------|-----------|
| Wallet no existe | 404 | `WALLET_NOT_FOUND` | `WalletNotFoundException` |
| Token ausente o inválido | 401 | `UNAUTHORIZED` | `UnauthorizedException` |

---

## Flujo de ejecución

```
GET /wallets/:walletId/balance
    │
    ▼
[JwtAuthGuard] — verifica Bearer token
    │
    ├─ Token inválido/ausente → 401
    │
    ▼
WalletsService.getBalance(walletId)
    │
    ▼
walletRepo.findOne({ where: { id: walletId } })
    │
    ├─ null → throw WalletNotFoundException → 404
    │
    ▼
Formatear respuesta:
    availableBalance = parseFloat(wallet.balance).toFixed(2)
    │
    ▼
Retornar WalletBalanceResponseDto
```

---

## Contrato de auditoría

No aplica — las consultas de saldo no generan registros en `audit_logs`.

---

## Tests mínimos requeridos

### Unit tests (U)
- `(U)` Wallet existente → retorna balance formateado con 2 decimales
- `(U)` Wallet inexistente → lanza `WalletNotFoundException`
- `(U)` Balance `"1500"` (sin decimales en DB) → `availableBalance` es `"1500.00"`
- `(U)` Wallet `BLOCKED` → retorna balance normalmente (no lanza excepción)

### Integration tests (I)
- `(I)` GET /wallets/wal_001/balance → 200 con balance correcto
- `(I)` GET /wallets/wal_999/balance → 404 `WALLET_NOT_FOUND`
- `(I)` GET /wallets/wal_001/balance sin token → 401
- `(I)` Balance después de un débito refleja el nuevo valor
