# SPEC: Gestión de usuarios (GET / PATCH /users)

**Versión:** 1.0
**Servicio:** `UsersService`
**Controlador:** `UsersController`

Cubre los endpoints: `GET /users`, `GET /users/me`, `GET /users/:id`, `PATCH /users/:id`

---

## Contrato HTTP

### GET /users — Listar todos
- **Autenticación:** Bearer JWT
- **Autorización:** Solo `ADMIN`
- **Response 200:** Array de `IUserPublic[]` (nunca `null`, puede ser `[]`)

### GET /users/me — Mi perfil
- **Autenticación:** Bearer JWT
- **Autorización:** Cualquier role autenticado
- **Response 200:** `IUserPublic` del usuario que hace la petición

### GET /users/:id — Por ID
- **Autenticación:** Bearer JWT
- **Autorización:** Solo `ADMIN`
- **Path param:** `id` — UUID del usuario
- **Response 200:** `IUserPublic`

### PATCH /users/:id — Actualizar
- **Autenticación:** Bearer JWT
- **Autorización:** Solo `ADMIN`
- **Path param:** `id` — UUID del usuario
- **Request body (todos opcionales):**

```json
{
  "fullName": "Jane Updated",
  "email": "jane@ligo.pe",
  "role": "VIEWER",
  "status": "SUSPENDED"
}
```

| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `fullName` | string | ✗ | `IsOptional`, `MaxLength(200)` |
| `email` | string | ✗ | `IsOptional`, `IsEmail` |
| `role` | enum | ✗ | `IsIn(['ADMIN', 'OPERATOR', 'VIEWER'])` |
| `status` | enum | ✗ | `IsIn(['ACTIVE', 'INACTIVE', 'SUSPENDED'])` |

- **Response 200:** `IUserPublic` actualizado

---

## Reglas de negocio

**GET /users**
- **RN-01:** Solo role `ADMIN` puede listar todos los usuarios. Si `req.user.role !== 'ADMIN'` → `ForbiddenException` (HTTP 403).
- **RN-02:** Los resultados se ordenan por `createdAt DESC`.
- **RN-03:** Ningún usuario en el array expone `passwordHash`.

**GET /users/me**
- **RN-04:** El usuario se busca por `req.user.username` (extraído del JWT). Si no existe en DB → `NotFoundException` (HTTP 404). Este caso no debería ocurrir en operación normal, pero debe manejarse.
- **RN-05:** Accesible por cualquier role autenticado — no requiere `ADMIN`.

**GET /users/:id**
- **RN-06:** Solo role `ADMIN` puede consultar usuarios por ID.
- **RN-07:** Si el `id` no existe → `NotFoundException` con error `USER_NOT_FOUND` (HTTP 404).

**PATCH /users/:id**
- **RN-08:** Solo role `ADMIN` puede actualizar usuarios.
- **RN-09:** Si el `id` no existe → `NotFoundException` con error `USER_NOT_FOUND` (HTTP 404).
- **RN-10:** Solo se actualizan los campos presentes en el body — los ausentes mantienen su valor actual (PATCH semántico). La validación DTO usa `@IsOptional()` en todos los campos.
- **RN-11:** No es posible cambiar `username` ni `passwordHash` via este endpoint — esos campos no están en `UpdateUserDto`.
- **RN-12:** Un `ADMIN` puede suspender (`status: 'SUSPENDED'`) o desactivar (`status: 'INACTIVE'`) a cualquier usuario, incluido a sí mismo — no hay protección especial.

---

## Invariantes del dominio

- **INV-01:** `passwordHash` nunca aparece en ninguna respuesta de estos endpoints.
- **INV-02:** `username` es inmutable una vez creado — no se puede cambiar via PATCH.
- **INV-03:** Los roles válidos son exactamente: `ADMIN`, `OPERATOR`, `VIEWER`.
- **INV-04:** Los statuses válidos son exactamente: `ACTIVE`, `INACTIVE`, `SUSPENDED`.

---

## Casos de error

| Endpoint | Condición | HTTP | Error code | Excepción |
|----------|-----------|------|------------|-----------|
| GET /users | Role no ADMIN | 403 | `FORBIDDEN` | `ForbiddenException` |
| GET /users/me | Usuario no existe en DB | 404 | `USER_NOT_FOUND` | `NotFoundException` |
| GET /users/:id | Role no ADMIN | 403 | `FORBIDDEN` | `ForbiddenException` |
| GET /users/:id | ID no existe | 404 | `USER_NOT_FOUND` | `NotFoundException` |
| PATCH /users/:id | Role no ADMIN | 403 | `FORBIDDEN` | `ForbiddenException` |
| PATCH /users/:id | ID no existe | 404 | `USER_NOT_FOUND` | `NotFoundException` |
| PATCH /users/:id | Email inválido | 400 | (class-validator) | `ValidationException` |
| PATCH /users/:id | Role inválido | 400 | (class-validator) | `ValidationException` |
| Todos | Token ausente/inválido | 401 | `UNAUTHORIZED` | `UnauthorizedException` |

---

## Flujo de ejecución

### GET /users
```
[JwtAuthGuard] → req.user.role === 'ADMIN'? → [RN-01] 403 si no
    ↓
UsersService.findAll()
    ↓
userRepo.find({ order: { createdAt: 'DESC' } })
    ↓
users.map(toPublic)  ← omite passwordHash  [RN-03]
    ↓
Retornar IUserPublic[] (200)
```

### GET /users/me
```
[JwtAuthGuard] → req.user.username
    ↓
UsersService.findByUsername(username)        [RN-04]
    ├─ null → NotFoundException USER_NOT_FOUND → 404
    ↓
Retornar IUserPublic (200)
```

### GET /users/:id
```
[JwtAuthGuard] → req.user.role === 'ADMIN'? → [RN-06] 403 si no
    ↓
UsersService.findById(id)                    [RN-07]
    ├─ null → NotFoundException USER_NOT_FOUND → 404
    ↓
Retornar IUserPublic (200)
```

### PATCH /users/:id
```
[JwtAuthGuard] → req.user.role === 'ADMIN'? → [RN-08] 403 si no
    ↓
[ValidationPipe] → valida UpdateUserDto (todos @IsOptional)
    ├─ inválido → 400
    ↓
UsersService.updateStatus(id, { fullName?, email?, role?, status? })
    ↓
userRepo.findOne({ where: { id } })          [RN-09]
    ├─ null → NotFoundException USER_NOT_FOUND → 404
    ↓
Aplicar solo campos presentes:              [RN-10]
    if (data.fullName !== undefined) user.fullName = data.fullName
    if (data.email !== undefined) user.email = data.email
    if (data.role !== undefined) user.role = data.role
    if (data.status !== undefined) user.status = data.status
    ↓
userRepo.save(user)
    ↓
toPublic(user)  ← omite passwordHash
    ↓
Retornar IUserPublic (200)
```

---

## Contrato de auditoría

No aplica en la versión actual. Considerar agregar para `PATCH` (cambios de role y status) en versiones futuras.

---

## Tests mínimos requeridos

### Unit tests (U)
- `(U)` `findAll()` retorna array sin `passwordHash` en ningún elemento
- `(U)` `findById()` retorna `null` cuando no existe
- `(U)` `updateStatus()` lanza `NotFoundException` para ID inexistente
- `(U)` `updateStatus()` aplica PATCH semántico — campos ausentes no cambian
- `(U)` `updateStatus()` no modifica `username` ni `passwordHash`

### Integration tests (I)
- `(I)` GET /users con ADMIN → 200, array sin `passwordHash`
- `(I)` GET /users con OPERATOR → 403 `FORBIDDEN`
- `(I)` GET /users/me → 200, retorna datos del usuario autenticado
- `(I)` GET /users/:id existente con ADMIN → 200
- `(I)` GET /users/:id inexistente → 404 `USER_NOT_FOUND`
- `(I)` PATCH /users/:id role → 200, role actualizado
- `(I)` PATCH /users/:id status SUSPENDED → 200, usuario suspendido
- `(I)` PATCH /users/:id email inválido → 400
- `(I)` PATCH /users/:id con OPERATOR → 403 `FORBIDDEN`
- `(I)` PATCH /users/:id → solo campos enviados cambian (PATCH semántico)
