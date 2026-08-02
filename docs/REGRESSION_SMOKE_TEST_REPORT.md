# Regression Smoke Test Report

**Fecha:** 2026-08-02
**Versión:** v2.12.50
**Estado:** ✅ APROBADO

---

## Resultados

### 1. Usuarios

| Operación | Resultado | Detalle |
|-----------|:---------:|---------|
| Login admin | ✅ | JWT obtenido |
| Login encargado | ✅ | JWT obtenido |
| `get_my_role()` | ✅ | Retorna 'admin' para admin |
| `manage_user_memberships` (anon) | ✅ | Bloqueado: "permission denied" |

### 2. Tiendas

| Operación | Resultado | Detalle |
|-----------|:---------:|---------|
| Listar tiendas activas | ✅ | 10 tiendas |
| `validate_store_can_be_modified` | ✅ | Retorna blockers correctamente (4 blockers en TIENDA CENTRAL) |

### 3. Inventario

| Operación | Resultado | Detalle |
|-----------|:---------:|---------|
| `get_available_stock` | ✅ | Retorna stock_current, stock_reserved, stock_available |
| `register_stock_movement` | ✅ | status: 'ok' — movement registrado correctamente |

### 4. Backup Restore

| Operación | Resultado | Detalle |
|-----------|:---------:|---------|
| `validate_post_restore` | ✅ | overall_status: PASS |

### 5. Kardex

| Operación | Resultado | Detalle |
|-----------|:---------:|---------|
| Query kardex_entries | ✅ | HTTP 206 (Partial Content — query exitosa) |

### 6. Security (regression check)

| Operación | Resultado | Detalle |
|-----------|:---------:|---------|
| Anon → `bulk_soft_delete_stores` | ✅ | "permission denied for function" |
| Anon → `manage_user_memberships` | ✅ | "permission denied" |

---

## Veredicto

```
SMOKE TEST RESULTADO: ✅ APROBADO

Todas las operaciones normales funcionan correctamente.
El hardening no rompió funcionalidad existente.
Anon sigue bloqueado en RPCs sensibles.
```

## CI Gate — Hallazgos en endpoints existentes

El CI Gate TypeScript detectó **48 endpoints sin Zod** y **18 sin auth middleware**. Estos son issues pre-existentes (no introducidos por las Iteraciones 7-9) que quedan registrados como backlog:

- La mayoría son endpoints de módulos secundarios (pick3, wallet, telegram, cost-sheets)
- Los endpoints críticos (users, stores, bulk operations, backup) sí tienen Zod + auth
- Estos issues deben resolverse gradualmente en futuras iteraciones

**El CI Gate cumple su propósito:** detecta automáticamente endpoints que no siguen las reglas de regresión, previniendo que nuevos endpoints se agreguen sin validación.
