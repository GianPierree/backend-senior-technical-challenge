# SPEC: POST /auth/login

**Versión:** 1.0
**Servicio:** `AuthService`
**Controlador:** `AuthController`

---

## Contrato HTTP

- **Método:** POST
- **Ruta:** `/auth/login`
- **Autenticación:** No requerida
- **Idempotency-Key:** No requerida

**Request body:**
```json
{
  "username": "string (requerido, no vacío)",
  "password": "string (requerido, no vacío)"
}
```

**Response 200 — éxito:**
```json
{
  "token": "string (JWT firmado)",
  "expiresIn": 3600
}
```

---

## Reglas de negocio

- **RN-01:** Buscar el usuario por `username` en la tabla `users` via `UsersService.findByUsernameWithPassword()`. Si no existe → `UnauthorizedException` con error `INVALID_CREDENTIALS` (HTTP 401). El mensaje no debe revelar si el fallo fue por username o password (prevención de enumeración).

- **RN-02:** Si el usuario existe pero `status !== 'ACTIVE'` → `UnauthorizedException` con error `USER_INACTIVE` (HTTP 401).

- **RN-03:** Verificar la password con `UsersService.verifyPassword(plaintext, storedHash)` usando `crypto.timingSafeEqual` para prevenir timing attacks. Si no coincide → `UnauthorizedException` con error `INVALID_CREDENTIALS` (HTTP 401).

- **RN-04:** El JWT firmado debe incluir en el payload: `{ sub: userId, username, role }`. La firma usa `JWT_SECRET` del entorno.

- **RN-05:** `expiresIn` se lee de `process.env.JWT_EXPIRES_IN` (default: 3600 segundos).

- **RN-06:** El error retornado ante credenciales inválidas debe ser idéntico independientemente de si el username no existe o si la password es incorrecta — misma estructura, mismo HTTP status, mismo mensaje.

---

## Invariantes del dominio

- **INV-01:** Las passwords nunca se almacenan ni loguean en texto plano.
- **INV-02:** El hash `passwordHash` nunca se incluye en ninguna respuesta HTTP.
- **INV-03:** La comparación de passwords usa siempre `timingSafeEqual` — comparaciones directas de strings están prohibidas.

---

## Casos de error

| Condición | HTTP | Error code | Excepción |
|-----------|------|------------|-----------|
| Username no existe | 401 | `INVALID_CREDENTIALS` | `UnauthorizedException` |
| Password incorrecta | 401 | `INVALID_CREDENTIALS` | `UnauthorizedException` |
| Usuario suspendido/inactivo | 401 | `USER_INACTIVE` | `UnauthorizedException` |
| Body malformado / campos faltantes | 400 | (class-validator) | `ValidationException` |

---

## Flujo de ejecución

```
POST /auth/login { username, password }
    │
    ▼
[Validación DTO — class-validator]
    │ username: IsString, IsNotEmpty
    │ password: IsString, IsNotEmpty
    ▼
UsersService.findByUsernameWithPassword(username)
    │
    ├─ null → throw UnauthorizedException INVALID_CREDENTIALS
    │
    ▼
¿user.status === 'ACTIVE'?
    │
    ├─ No → throw UnauthorizedException USER_INACTIVE
    │
    ▼
UsersService.verifyPassword(password, passwordHash)
    │
    ├─ false → throw UnauthorizedException INVALID_CREDENTIALS
    │
    ▼
JwtService.sign({ sub, username, role }, { expiresIn })
    │
    ▼
Retornar { token, expiresIn }
```

---

## Contrato de auditoría

No aplica — el login no genera registros en `audit_logs`.
Los intentos fallidos de login deberían loguearse a nivel de aplicación (Logger), no en la tabla de auditoría.

---

## Tests mínimos requeridos

### Unit tests (U)
- `(U)` Credenciales válidas → retorna `{ token, expiresIn }`
- `(U)` Username inexistente → lanza `UnauthorizedException` con `INVALID_CREDENTIALS`
- `(U)` Password incorrecta → lanza `UnauthorizedException` con `INVALID_CREDENTIALS`
- `(U)` Usuario con status `SUSPENDED` → lanza `UnauthorizedException` con `USER_INACTIVE`
- `(U)` Usuario con status `INACTIVE` → lanza `UnauthorizedException` con `USER_INACTIVE`
- `(U)` JWT generado incluye `username` y `role` en el payload

### Integration tests (I)
- `(I)` POST /auth/login con credenciales válidas → 200 con token JWT válido
- `(I)` POST /auth/login con password incorrecta → 401
- `(I)` POST /auth/login sin body → 400
- `(I)` Token retornado es válido para endpoints protegidos
