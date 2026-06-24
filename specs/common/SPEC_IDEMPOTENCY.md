# SPEC: Idempotencia global

**Versión:** 1.0
**Aplica a:** POST /transactions, POST /transactions/transfer, POST /transactions/:id/reversal

---

## Contrato

Todo endpoint de mutación crítica requiere el header `Idempotency-Key`.
Este mecanismo garantiza que reintentos de red no produzcan efectos duplicados.

**Header requerido:**
```
Idempotency-Key: <uuid-v4>
```

**Almacenamiento:** `idempotency_records` (PostgreSQL)
**Servicio:** `IdempotencyService` → implementa `IIdempotencyService`

---

## Reglas de negocio

- **RN-01:** Si `Idempotency-Key` no está presente en el header → lanzar `BadRequestException` con error `MISSING_IDEMPOTENCY_KEY` (HTTP 400) antes de ejecutar cualquier lógica de negocio.

- **RN-02:** Si la key existe en `idempotency_records` y el hash SHA-256 del body coincide → retornar la respuesta almacenada con el mismo HTTP status original, sin ejecutar la operación nuevamente.

- **RN-03:** Si la key existe en `idempotency_records` y el hash SHA-256 del body **no coincide** → lanzar `IdempotencyConflictException` (HTTP 409) con error `IDEMPOTENCY_CONFLICT`.

- **RN-04:** Si la key no existe → ejecutar la operación normalmente y persistir `{idempotencyKey, endpoint, requestHash, responseBody, httpStatus}` en `idempotency_records` al finalizar con éxito.

- **RN-05:** El hash se calcula sobre `JSON.stringify(body)` con `crypto.createHash('sha256')`. Orden de campos en el JSON afecta el hash — el cliente debe enviar siempre el mismo body.

- **RN-06:** El almacenamiento de idempotencia ocurre **fuera** de la transacción de base de datos principal, solo después de que la operación haya sido exitosa.

- **RN-07:** Logs del sistema nunca deben incluir el valor de `Idempotency-Key` (dato sensible de correlación).

---

## Invariantes del dominio

- **INV-01:** Una `Idempotency-Key` que ya existe en la tabla **nunca** puede reusarse con un body diferente — esto siempre retorna 409, sin importar el tiempo transcurrido ni el endpoint.

- **INV-02:** El campo `idempotency_key` en la tabla `idempotency_records` tiene constraint `UNIQUE` — la base de datos es el último guardián ante condiciones de carrera.

- **INV-03:** Las operaciones idempotentes no crean efectos secundarios adicionales en el reintento (no se crean nuevas transacciones, no se modifican balances, no se escriben nuevos audit_logs).

---

## Casos de error

| Condición | HTTP | Error code | Excepción |
|-----------|------|------------|-----------|
| Header ausente | 400 | `MISSING_IDEMPOTENCY_KEY` | `BadRequestException` |
| Key reusada con body diferente | 409 | `IDEMPOTENCY_CONFLICT` | `IdempotencyConflictException` |

---

## Flujo de ejecución

```
Controller recibe request
    │
    ├─ [RN-01] ¿Falta Idempotency-Key? → 400
    │
    ▼
IdempotencyService.check(key, endpoint, body)
    │
    ├─ Key no existe → null → continuar al flujo principal
    ├─ Key existe, hash igual → { cached: true, responseBody } → retornar
    └─ Key existe, hash distinto → throw IdempotencyConflictException → 409
    │
    ▼
[Ejecutar operación principal en DB transaction]
    │
    ▼
IdempotencyService.store(key, endpoint, body, response, httpStatus)
    │
    ▼
Retornar response al cliente
```

---

## Tests mínimos requeridos

### Unit tests (U)
- `(U)` `hashBody()` produce hash idéntico para el mismo objeto
- `(U)` `hashBody()` produce hashes distintos para objetos diferentes
- `(U)` `hashBody(null)` no lanza excepción
- `(U)` `check()` retorna `null` cuando la key no existe
- `(U)` `check()` retorna `{ cached: true }` cuando key y hash coinciden
- `(U)` `check()` lanza `IdempotencyConflictException` cuando key existe pero hash difiere
- `(U)` `store()` persiste el registro en el repositorio

### Integration tests (I)
- `(I)` Reintento con misma key y body retorna idéntico `transactionId`
- `(I)` Reintento con misma key y body diferente retorna 409
- `(I)` Request sin header `Idempotency-Key` retorna 400
- `(I)` Dos requests simultáneas con la misma key nueva solo crean una transacción (concurrencia)
