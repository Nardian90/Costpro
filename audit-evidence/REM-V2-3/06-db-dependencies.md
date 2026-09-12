# 06 — DB DEPENDENCIES (PHASE 10 + censo DB)

## Censo en producción (solo SELECT)

- **Scan de cuerpos de funciones** (`pg_get_functiondef` de TODA función public, word-boundary
  regex): llamadores internos de `reverse_receipt` = **∅**; de `reverse_adjustment` = **∅**;
  de `void_transaction` = **∅**.
- **Triggers** que las invoquen: **∅** (pg_trigger × pg_proc, excluyendo internos).
- Dependencias por migración: `reverse_receipt`/`reverse_adjustment` se crean/reemplazan en
  20260727000006 (anti-spoofing p_user_id) y 20260727000009 (REVOKE anon / GRANT authenticated
  + service_role). Ninguna migración posterior las llama entre sí.
- El guard H5-B1 (20260903030000) demuestra el patrón de DROP con verificación de firma/owner/
  secdef/ACL/hash y snapshot de rollback pre-apply.

## Grafo de dependencia por candidato (PRE-retiro)

```
UI (useReverseDocument/useDocumentActions) → /api/reverse (withAuth+CSRF+rate-limit+B-10)
  → rpcMap = FEATURES.USE_V2_REVERSE ? RPC_MAP_V2 : RPC_MAP_V1
  → RPC (receipt: reverse_receipt[_v2] · adjustment: reverse_[inventory_]adjustment…)
  → tablas receipts/inventory_adjustments/stock_movements/kardex_entries/audit_logs
```

## Decisión de retiro a nivel DB

- A nivel **aplicación**: retiro ejecutado (map neutralizado + scripts migrados) → **0 callers
  de aplicación** post-retiro, verificado por interceptación + contract pins.
- A nivel **DB** (`DROP FUNCTION` + REVOKE): **DIFERIDO**. Razón: aplicar la migración requiere
  canal DDL sobre la DB productiva (Management API/CLI no habilitado en este entorno), lo que
  cruza la línea de PRODUCTION ZERO-TOUCH (§3) de este gate. Las funciones quedan: sin callers
  de app, sin callers internos, sin triggers, **sin EXECUTE para authenticated** (superficie
  residual mínima: solo service_role/postgres).
- Documentado como límite del gate: el DROP con guard (patrón H5-B1 + snapshot de rollback)
  queda preparado como paso de higiene para un gate/mantenimiento futuro con canal DDL.
- `void_transaction`: NO se toca (REQUIRED). Ninguna DB function se elimina en este gate.
