# Specs — Ligo Wallet Service

Directorio de specs del proyecto. Cada archivo es la fuente de verdad
para su módulo. El código debe cumplir el spec, no al revés.

## Estructura

```
specs/
├── README.md                          ← este archivo
├── common/
│   └── SPEC_IDEMPOTENCY.md            ← contrato de idempotencia global
├── auth/
│   └── SPEC_LOGIN.md                  ← POST /auth/login
├── wallets/
│   ├── SPEC_BALANCE.md                ← GET /wallets/:id/balance
│   └── SPEC_MOVEMENTS.md              ← GET /wallets/:id/movements
├── transactions/
│   ├── SPEC_DEBIT_CREDIT.md           ← POST /transactions
│   ├── SPEC_TRANSFER.md               ← POST /transactions/transfer
│   ├── SPEC_REVERSAL.md               ← POST /transactions/:id/reversal
│   └── SPEC_STATUS.md                 ← GET /transactions/:id
└── users/
    ├── SPEC_CREATE_USER.md            ← POST /users
    └── SPEC_MANAGE_USERS.md           ← GET/PATCH /users
```

## Convenciones

- **RN-XX** — Regla de negocio numerada y testeable
- **INV-XX** — Invariante del dominio (nunca debe violarse)
- **(U)** — Test unitario requerido
- **(I)** — Test de integración requerido
- `✓ CUMPLE` / `✗ VIOLA` / `⚠ GAP` — resultado de validación

## Workflow SDD

```
Requerimiento
    ↓
Actualizar/crear SPEC.md  ← fuente de verdad
    ↓
Implementar código
    ↓
Validar con SpecValidatorAgent
    ↓
PR solo si no hay ✗ críticos
```

## Módulos cubiertos

| Módulo | Endpoints | Specs | Última revisión |
|--------|-----------|-------|-----------------|
| auth | 1 | 1 | v1.0 |
| wallets | 2 | 2 | v1.0 |
| transactions | 4 | 4 | v1.0 |
| users | 5 | 2 | v1.0 |
| common | — | 1 | v1.0 |
