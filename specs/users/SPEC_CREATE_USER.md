# SPEC: POST /users

**Versión:** 1.0
**Servicio:** `UsersService.create()`
**Controlador:** `UsersController`

---

## Contrato HTTP

- **Método:** POST
- **Ruta:** `/users`
- **Autenticación:** Bearer JWT requerido (`JwtAuthGuard`)
- **Idempotency-Key:** No requerida
- **Autorización:** Role `ADMIN` requerido

**Request body:**
```json
{
  "username": "jane.ops",
  "password": "Secret123",
  "role": "OPERATOR",
  "fullName": "Jane Ops",
  "email": "jane@ligo.pe"
}
```

| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `username` | string | ✓ | `IsString`, `MinLength(3)`, `MaxLength(100)` |
| `password` | string | ✓ | `MinLength(8)` + regex: al menos 1 mayúscula, 1 minúscula, 1 número |
| `role` | enum | ✗ | `IsIn(['ADMIN', 'OPERATOR', 'VIEWER'])`, default `OPERATOR` |
| `fullName` | string | ✗ | `IsOptional`, `MaxLength(200)` |
| `email` | string | ✗ | `IsOptional`, `IsEmail` |

**Response 201 — éxito:**
```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "username": "jane.ops",
  "role": "OPERATOR",
  "status": "ACTIVE",
  "fullName": "Jane Ops",
  "email": "jane@ligo.pe",
  "createdAt": "2024-01-15T10:00:00.000Z"
}
```

---

## Reglas de negocio

- **RN-01:** Solo usuarios con `role === 'ADMIN'` pueden crear nuevos usuarios. El role se extrae del JWT payload. Si `req.user.role !== 'ADMIN'` → `ForbiddenException` con error `FORBIDDEN` (HTTP 403). Esta validación ocurre en el controller antes de llamar al service.

- **RN-02:** El `username` debe ser único en la tabla `users`. Si ya existe → `ConflictException` con error `USERNAME_TAKEN` (HTTP 409).

- **RN-03:** La `password` se hashea con `crypto.scrypt` (memory-hard, resistente a GPU). El formato almacenado es `{salt}:{hash}` donde `salt` es 32 hex chars y `hash` es 128 hex chars. Nunca se almacena en texto plano.

- **RN-04:** El `passwordHash` **nunca** se incluye en ninguna respuesta HTTP. La respuesta usa `IUserPublic` que omite ese campo.

- **RN-05:** El `status` del usuario nuevo siempre es `ACTIVE` — no es configurable en la creación.

- **RN-06:** Si `role` no se especifica en el request, el default es `OPERATOR`.

- **RN-07:** La validación de password fuerte se aplica vía `@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/)` en el DTO. Si no cumple → `ValidationException` (HTTP 400).

---

## Invariantes del dominio

- **INV-01:** `passwordHash` nunca es texto plano — siempre tiene el formato `{salt}:{scryptHash}`.
- **INV-02:** Ninguna respuesta del sistema contiene el campo `passwordHash`.
- **INV-03:** `username` es único en la tabla (constraint `UNIQUE` en DB).
- **INV-04:** Un usuario nuevo siempre nace con `status = 'ACTIVE'`.

---

## Casos de error

| Condición | HTTP | Error code | Excepción |
|-----------|------|------------|-----------|
| Role no es ADMIN | 403 | `FORBIDDEN` | `ForbiddenException` |
| Username ya en uso | 409 | `USERNAME_TAKEN` | `ConflictException` |
| Password débil | 400 | (class-validator) | `ValidationException` |
| Email inválido | 400 | (class-validator) | `ValidationException` |
| Username < 3 chars | 400 | (class-validator) | `ValidationException` |
| Token ausente/inválido | 401 | `UNAUTHORIZED` | `UnauthorizedException` |

---

## Flujo de ejecución

```
POST /users { username, password, role?, fullName?, email? }
    │
    ▼
[JwtAuthGuard] → extrae req.user del JWT
    │
    ▼
[ValidationPipe] → valida CreateUserDto
    │ password regex, email format, username length
    ├─ Inválido → 400
    │
    ▼
Controller — ¿req.user.role === 'ADMIN'?               [RN-01]
    │
    ├─ No → throw ForbiddenException FORBIDDEN → 403
    │
    ▼
UsersService.create({ username, password, role, fullName, email })
    │
    ▼
userRepo.findOne({ where: { username } })               [RN-02]
    │
    ├─ Existe → throw ConflictException USERNAME_TAKEN → 409
    │
    ▼
hashPassword(password)                                  [RN-03]
    crypto.randomBytes(16) → salt
    crypto.scrypt(password, salt, 64) → derivedKey
    return `${salt}:${derivedKey.hex}`
    │
    ▼
userRepo.create({
    username,
    passwordHash,
    role: role ?? 'OPERATOR',                           [RN-06]
    status: 'ACTIVE',                                   [RN-05]
    fullName: fullName ?? null,
    email: email ?? null
})
    │
    ▼
userRepo.save(user)
    │
    ▼
toPublic(user)  ← omite passwordHash                   [RN-04]
    │
    ▼
Retornar IUserPublic (201)
```

---

## Contrato de auditoría

No aplica en la versión actual — la creación de usuarios no genera registros en `audit_logs`. Considerar agregar en versiones futuras para compliance.

---

## Tests mínimos requeridos

### Unit tests (U)
- `(U)` Usuario creado correctamente → retorna perfil público sin `passwordHash`
- `(U)` Username duplicado → `ConflictException` con `USERNAME_TAKEN`
- `(U)` `hashPassword()` produce formato `salt:hash`
- `(U)` `verifyPassword(plain, hash)` retorna `true` para match
- `(U)` `verifyPassword(wrong, hash)` retorna `false`
- `(U)` `role` default es `OPERATOR` si no se especifica
- `(U)` `status` siempre es `ACTIVE` en creación

### Integration tests (I)
- `(I)` POST /users con ADMIN token → 201, `passwordHash` ausente en response
- `(I)` POST /users con OPERATOR token → 403 `FORBIDDEN`
- `(I)` POST /users username duplicado → 409 `USERNAME_TAKEN`
- `(I)` POST /users password débil (`"123"`) → 400
- `(I)` POST /users email inválido → 400
- `(I)` Usuario creado puede autenticarse via POST /auth/login
