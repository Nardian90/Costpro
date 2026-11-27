# R-06 — DECISIÓN EXPRESA DEL PROPIETARIO (vinculante)

**Misión:** CP-BRA-R06-FINAL-CERTIFICATION-001 · **Fecha de decisión:** 2026-11-28 (prompt de misión)

El propietario aprobó esta política y prohibió solicitar aclaración adicional sobre ella. Es la única fuente de la matriz implementada.

## §0.1 CREAR RECEPCIONES — requisito de ENCARGADO

Para crear una recepción el usuario debe cumplir **simultáneamente**:
1. Membresía **activa** en la tienda correspondiente.
2. Rol **exacto** `encargado` en esa tienda.

Tener acceso a la tienda NO concede permiso de creación. El permiso NO se concede por ser admin, manager, almacenero, facturadora, clerk u otro usuario operativo. El **superadministrador de plataforma** es la excepción global (crea en cualquier tienda conservando su identidad real).

## §0.2 CONFIRMAR Y ANULAR — PROPIEDAD DEL CREADOR

La autorización de confirmar/anular es **independiente** de la de creación: es del **creador original**, siempre que conserve membresía activa en la tienda propietaria. No se añade exigencia de rol encargado sobre una recepción propia. Nadie más (encargado/admin/manager/almacenero/facturadora/clerk distintos del creador) puede intervenir por tener acceso a la tienda.

## §0.3 SUPERADMINISTRADOR — ACCESO GLOBAL

Puede crear, consultar, confirmar y anular recepciones de cualquier tienda. Comprobación canónica (`is_superadmin()`/`profiles.role='superadmin'`). Un admin de tienda NO es superadministrador.

## §0.4 LÍMITES DEL ACCESO GLOBAL

El superadmin no elimina invariantes: máquina de estados, guard de pagos vivos, reversión previa, integridad de inventario/financiera, idempotencia, auditoría, prevención de duplicados.

## §0.5 HISTÓRICOS SIN CREADOR VERIFICABLE

Busca el actor en campos originales/auditoría con evidencia inequívoca; sin ella, la confirmación/anulación queda **reservada al superadministrador**. No se reasignan creadores artificialmente.

## VERIFICACIÓN DE ROLES (exigencia del prompt)

Valores VIVOS del enum `user_role` (BD aislada, espejo de producción):
`admin, superadmin, manager, clerk, warehouse, encargado, usuario, costo, tenant_admin`.

**No existe un rol `facturadora` en el sistema.** La facturadora operativa es una membresía `clerk` — así se probó (caso 4/20 de la batería). No se inventaron ni normalizaron roles: `warehouse` y `clerk` NO quedaron tratados como `encargado` (casos 3/5: rechazados).
