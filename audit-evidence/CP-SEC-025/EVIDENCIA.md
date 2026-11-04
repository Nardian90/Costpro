# CP-SEC-025 — Evidencia del inventario RLS (T5, F1+F2)

Fecha: 2026-11-04 · Producción SOLO lectura (SELECT de catálogo) · Cero escrituras.

## 1. Medición

```
SELECT tablename, policyname, permissive, cmd, roles, qual, with_check
FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname;
→ 421 políticas · 151 tablas con políticas · 100% PERMISSIVE · 0 RESTRICTIVE
  SELECT 157 · INSERT 92 · UPDATE 71 · DELETE 49 · ALL 52
```

- Tabla+comando con >1 política PERMISSIVE: **46 grupos**; filtrando solo políticas de
  CLIENTE (roles anon/authenticated): **41 grupos**; con capas MEZCLADAS (débil anula a
  estricta): **30 grupos** (lista completa en `solapes-clientes-mixtos-20261104.json`).
- Tablas con RLS habilitado y CERO políticas (deny-all por diseño): **11**
  (exchange_rate_audit, idempotency_keys, migration_history_snapshots,
  payment_transactions_purga_20261026_archive, store_credit_ledger,
  supervisor_token_usages, units_of_measure, w62_df04_design_params,
  w62_df04_synthetic_rows, w62_zero_cost_flags, wac_change_log) — verificado con
  `relrowsecurity AND NOT EXISTS (pg_policies)`.
- El informe previo ("56 políticas en 10 tablas") contaba el subconjunto multi-tenant
  crítico; la medición íntegra de hoy es 421/151. Ambos métodos documentados.

## 2. Resueltos por SEC-003

`products|UPDATE` (products_tenant_update + products_update_rls): única pareja con
retiro ya preparado y probado (migración 20261022000001, PR T2, pendiente de compuerta).
Los otros 29 grupos quedan en diseño F2 (docs/audits/SEC-025_INVENTARIO_RLS_Y_DISENO.md §3).

## 3. Artefactos

- `politicas-rls-prod-20261104.json` — dump íntegro (421 políticas).
- `clasificacion-solapes-20261104.json` — 46 grupos solapados con capa por política.
- `solapes-cliente-mixtos-20261104.json` — los 30 grupos cliente con capas mezcladas.

## 4. Nada aplicable

F3 queda como TEXTO en el documento (§4), marcado NO APLICAR: no se creó ningún archivo
en supabase/migrations/. Cero escrituras en producción y en CostproE2E.
