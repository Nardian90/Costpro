# R-06 — MATRIZ DE AUTORIZACIÓN (contrato obligatorio)

**Misión:** CP-BRA-R06-FINAL-CERTIFICATION-001 · **Barrera autoritativa:** migración `20261128120000_cpbra_r06_reception_authorization.sql` (RPC + RLS + trigger). Espejo en rutas (`src/lib/reception-authorization.ts`) y UI (`src/lib/roles.ts`).

## CREACIÓN (§3.1)

| Actor | Crear recepción | Demostración E2E |
|---|---|---|
| Encargado con membresía activa | **PERMITIDO** | caso 1 (RPC + ruta 201) |
| Encargado sin membresía activa | DENEGADO | caso 2 (ERR_FORBIDDEN_ROLE) |
| Almacenero (warehouse) con acceso | DENEGADO | caso 3 |
| Facturadora/clerk con acceso | DENEGADO | caso 4 (rol real: clerk) |
| Clerk con acceso | DENEGADO | caso 5 (RPC + ruta 403 ERR_FORBIDDEN_ROLE) |
| Usuario ordinario con acceso | DENEGADO | (mismo gate: membresía sin rol encargado) |
| Manager sin rol encargado | DENEGADO | caso 6 |
| Admin de tienda sin rol encargado | DENEGADO | caso 7 |
| Admin de plataforma (rol global) | DENEGADO | caso 7b (no confundir con superadmin) |
| Usuario de otra tienda (encargado de B) | DENEGADO | caso 8 |
| Usuario anónimo | DENEGADO | caso 9 (401/403/404) |
| Superadministrador de plataforma | **PERMITIDO GLOBALMENTE** | caso 10 (sin membresía) |

Manipulación: `store_id` ajeno → ERR_FORBIDDEN_ROLE (caso 11); `p_user_id` ajeno ignorado para clientes autenticados + trigger fija identidad (caso 12); cambio de creador tras crear → `ERR_CREATOR_IMMUTABLE` (caso 13).

## CONFIRMACIÓN Y ANULACIÓN (§3.2)

| Actor | Recepción propia + membresía activa | Recepción ajena | Otra tienda |
|---|---|---|---|
| Creador original | **PERMITIDO** (según estado y guards) | — | — |
| Encargado ≠ creador | — | DENEGADO (caso 16) | DENEGADO |
| Admin de tienda ≠ creador | — | DENEGADO (caso 17) | DENEGADO |
| Manager ≠ creador | — | DENEGADO (caso 18) | DENEGADO |
| Almacenero ≠ creador | — | DENEGADO (caso 19) | DENEGADO |
| Facturadora/clerk ≠ creador | — | DENEGADO (caso 20) | DENEGADO |
| Creador con membresía revocada | DENEGADO (caso 21) | DENEGADO | DENEGADO |
| Usuario anónimo | DENEGADO (caso 25) | DENEGADO | DENEGADO |
| Superadministrador de plataforma | **PERMITIDO GLOBAL** (casos 22/23) | **PERMITIDO GLOBAL** (22-24) | **PERMITIDO GLOBAL** (24) |

«PERMITIDO» significa siempre sujeto a máquina de estados y guards financieros (§0.4). Anulación = `void_pending_reception` (pending) o `reverse_receipt_v2` (active); ambos son «anular» bajo la matriz. Históricos sin creador verificable (user_id NULL / centinela) → **solo superadmin** (caso 27).

## Edición/eliminación de borradores (intervenir la recepción)

Misma propiedad del creador: `save_pending_reception_changes`, `update_reception_items`, `add_reception_items`, `update_receipt_item_tasa`, `delete_pending_reception` + rutas PATCH correspondientes. RLS de tabla: UPDATE/DELETE directo solo creador|superadmin.

## Independencia de barreras

Una llamada directa al RPC produce el mismo resultado que una llamada desde la interfaz (misma política en BD, ruta y UI). Un permiso de lectura (SELECT) NO se convirtió en permiso de creación/confirmación/anulación (RLS de mutación endurecida).
