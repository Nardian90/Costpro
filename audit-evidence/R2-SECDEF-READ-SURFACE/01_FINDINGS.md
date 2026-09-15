# R2 — FINDINGS (FASE 6/7)

Clasificación de capacidad service_role (FASE 4): el único caller del RPC de KPIs es el
navegador con rol `authenticated` (guard aplica) — el flujo `authenticated→API→service_role→KPI`
NO existe en el repo (0 API routes referencian el RPC; verificado por grep completo).
service_role en la app: pick3/storage.ts (server interno) y API routes con withRole —
capacidad legítima (A). Para las funciones de este informe NO se identificó exposición
directa (C) de service_role a clientes.

---

## F1 — `get_cash_closures(uuid, date, date, int)` · **HIGH**

- **Asset**: cierres de caja (cash_closures) — registros financieros por tienda.
- **Threat**: usuario authenticated de una tienda lee cierres de caja de OTRAS tiendas.
- **Attack precondition**: cualquier cuenta con rol authenticated (JWT válido).
- **Attack path**: PostgREST `POST /rest/v1/rpc/get_cash_closures` con
  `p_store_id=<uuid ajeno>` o `p_store_id=null` → sin guard en body, SECDEF bypasea RLS →
  filas con declared_cash, declared_vouchers, system_total, difference, operator user_id
  y full_name. `NULL→todas las tiendas` (dump global, verificado en body LIVE).
- **Security boundary crossed**: aislamiento multi-tenant (RLS de cash_closures bypaseado
  por SECURITY DEFINER sin compensación).
- **Potential impact**: exposición financiera fila-a-fila + identidad de operadores.
- **Existing mitigation**: ninguna en la función; ACL amplio (authenticated).
- **Evidence**: catálogo LIVE (pg_get_functiondef, proacl) — `WHERE (p_store_id IS NULL OR
  cc.store_id = p_store_id)`, 0 apariciones de auth.uid()/has_store_access; patrón
  estructural idéntico al hallazgo A6 de REM-INV-6R (reproducido dinámicamente en staging 14/14).
- **Severity rationale**: fila-a-fila financiera + NULL=global + callable authenticated +
  en uso activo por la app (reports/data-fetcher.ts).

## F2 — `get_transfers(uuid, ts, ts, text, int)` · **HIGH**

- **Asset**: transferencias entre tiendas con items, productos y creador.
- **Threat**: lectura de flujo operativo inter-tienda completo.
- **Attack precondition / path**: idéntico a F1; `p_store_id=null` → TODAS las tiendas
  (origin O destination), incluye items (producto, sku, cantidad, unit_cost) y
  full_name del creador. **Además filtra store UUIDs de toda la organización**
  (cadena de ataque: F2 → habilita F3 dirigido).
- **Security boundary crossed**: aislamiento multi-tenant (RLS bypaseado por SECDEF).
- **Potential impact**: inteligencia competitiva interna entre tiendas del mismo negocio
  (flujos, costos, personal) + discriminador de UUIDs para F3.
- **Existing mitigation**: ninguna en la función.
- **Evidence**: catálogo LIVE — sin auth.uid()/has_store_access en body.
- **Severity rationale**: fila-a-fila + NULL=global + cadena de ataque + uso activo.

## F3 — Lecturas por-tienda sin guard (requieren UUID de tienda) · **MEDIUM**

`get_store_analytics_advanced` (analytics completa: ventas, márgenes, top productos),
`get_sales_since_last_closure` (totales por método de pago), `get_paginated_products`
(catálogo con cost_price/cost_average/stock), `get_products_for_reception` (costos+stock),
`get_product_stock_ledger_paginated` (kardex con unit_cost).

- **Asset**: datos de negocio por tienda.
- **Attack path**: idéntico (RPC directo con `p_store_id` ajeno — requerido, no NULL).
- **Boundary crossed**: multi-tenant (RLS bypaseado por SECDEF sin compensación).
- **Impact**: cifras de ventas/márgenes/costos/stock de tiendas ajenas.
- **Evidence**: catálogo LIVE — `WHERE t.store_id = p_store_id` sin validación de identidad.
- **Severity rationale**: agregados/filas sensibles pero requieren UUID previo (obtenible
  vía F2 o uso legítimo filtrado); misma clase que A6 (clasificado MEDIUM en REM-INV-6R).

## F4 — Agregados globales sin guard · **LOW**

`get_daily_expenses_aggregated` (NULL→todas: totales diarios de gastos),
`get_low_stock_count` (NULL→todas: contadores).

- **Impact**: agregados sin fila-a-fila; señal de actividad/escala global.
- **Evidence**: catálogo LIVE — patrón `IS NULL OR`, sin identidad.
- **Severity rationale**: datos agregados de baja granularidad.

---

## Funciones analizadas SIN finding (controles presentes, verificados en catálogo)

- `get_transferable_stores`: binding RC-3 estricto (`p_user_id ≠ auth.uid()` salvo
  service_role → RAISE) + `has_store_access_as` — el único READ que acepta p_user_id y lo
  rechaza si no coincide con el JWT. Modelo de referencia.
- `get_batch_store_daily_kpis`: guard 000004 (byte-igual a migración).
- `get_transactions`, `get_audit_logs`, `get_paginated_products_v2`, `get_products_for_pos`:
  auth.uid() + has_store_access en body.
- `is_managed_user`: boolean scoped por store compartido (rol manager).
- Helpers (`has_store_access`, `has_store_role`×2, `is_store_member`, `is_admin_with_access`,
  `current_user_store_ids`): mecanismos de control, no exposición.

## Regla aplicada (anti-falso-positivo)

Ninguna función fue marcada por ser SECDEF: solo se clasificó finding cuando concurren
(1) SECDEF (RLS bypass estructural), (2) EXECUTE a authenticated, (3) datos store-scoped,
(4) ausencia TOTAL de validación de identidad en body (verificada línea a línea). Las
funciones con auth.uid() o guard se clasificaron NO FINDING aunque fueran SECDEF.
