# SEC-025 — Inventario RLS y diseño de convergencia (F1 + F2) · F3 SOLO BORRADOR

Tarea: T5 de la misión SEC-025/026/003/005/006/UI-001 · PR: `docs/cp-sec-025-inventario-politicas-rls`
Fase F1 + F2 del plan `docs/audits/MISION_E_DISENO_DT06_CP-SEC-025_026_2026-10-22.md`
Fecha de medición: 2026-11-04 · Producción SOLO lectura · **CERO escrituras, CERO migraciones aplicables**

> **DISPARADOR DE EJECUCIÓN (ratificado, DT-03):** la convergencia de políticas (F3) SOLO se
> ejecuta cuando entre un SEGUNDO negocio cliente, o cuando el propietario lo autorice
> expresamente. Hoy la operación es single-tenant: las conclusiones de riesgo de este
> documento son ESTRUCTURALES (qué pasará al multi-tenant), no incidentes actuales.
> Mientras tanto: membresía = estado documentado vigente; tenant-gated = meta canónica.

## 1. F1 — Inventario medido (2026-11-04, catálogo `pg_policies` de producción)

| Métrica | Valor [MEDIDO] |
|---|---|
| Políticas RLS totales en `public` | **421** (100 % PERMISSIVE; 0 RESTRICTIVE) |
| Tablas con políticas | 151 — de las 162 tablas con RLS habilitado, **11 tienen RLS y CERO políticas** (deny-all para roles no-propietario: bloqueo por diseño, verificado en el JSON del inventario) |
| Por comando | SELECT 157 · INSERT 92 · UPDATE 71 · DELETE 49 · ALL 52 |
| Tabla+comando con >1 política PERMISSIVE (solape OR potencial) | 46 grupos |
| — de ellos con políticas de CLIENTE (roles anon/authenticated) mezclando capas | **30 grupos** (tabla en §2) |
| Políticas de rol dedicado (`costpro_transaction_adjuster`, service-family) | excluidas del análisis de exposición de clientes: su `qual = true` está acotado por el ROLE, no por filas |

Nota metodológica: el informe previo de SEC-025 decía "56 políticas en 10 tablas" — contaba
el subconjunto multi-tenant crítico. La medición completa de hoy: 421 políticas / 151 tablas.
Ambos números son ciertos con su método; el inventario íntegro queda exportado en
`audit-evidence/CP-SEC-025/politicas-rls-prod-20261104.json`.

Capa por política (clasificación del texto USING/WITH CHECK):
- **tenant** — incluye `current_user_tenant_id()` (aislamiento por organización).
- **membresía** — basada en `user_store_memberships` / `has_store_role*` / tienda propia.
- **usuario** — solo `auth.uid()` (propias del usuario).
- **otra** — reglas específicas (deny, admin-only, autenticado-genérico, `true` con rol).

## 2. Los 30 grupos donde una política débil anula a una estricta (OR)

PostgreSQL OR-ea las políticas PERMISSIVE del mismo comando para el mismo rol: **la más
laxa gana**. En los 30 grupos, un gemelo por MEMBRESÍA (sin término de tenant) convive con
el gemelo TENANT-GATED. Resueltos por SEC-003: **solo `products|UPDATE`** (migración
preparada 20261022000001, pendiente de compuerta — ver PR T2).

| Tabla.Comando | Política estricta (tenant) | Gemelo débil (membresía/usuario) | Capa del débil |
|---|---|---|---|
| audit_logs.SELECT | — (solo usuario/membresía; sin gemelo tenant) | Audit logs select / audit_logs_select_own_and_managed | usuario+membresía |
| cash_closures.INSERT | cash_closures_tenant_insert_with_check | cash_closures_insert_rls | membresía |
| categories.ALL | Categories unified | categories_store_access | membresía |
| commission_payments.SELECT | commission_payments_tenant_select | commission_payments_select | membresía |
| commission_rules.SELECT | commission_rules_tenant_select | commission_rules_select | membresía |
| devolutions.INSERT | devolutions_tenant_insert_with_check | devolutions_insert_own_store | membresía |
| inventory.INSERT | inventory_deny_insert | inventory_insert_auth | usuario |
| inventory_adjustments.INSERT | *_tenant_insert_with_check | inventory_adjustments_insert_rls | membresía |
| kardex_entries.INSERT | kardex_entries_tenant_insert_with_check | kardex_insert_own_store | membresía |
| payment_transactions.INSERT | *_tenant_insert_with_check | payment_transactions_insert_own_store | membresía |
| product_cost_sheets.INSERT | (roles) | pcs_insert_auth / product_cost_sheets_insert_roles | usuario+membresía |
| product_cost_sheets.SELECT | (authenticated genérico) | product_cost_sheets_select_rls | membresía |
| product_variants.SELECT | Variants store isolation | Variantes públicas - lectura autenticada | otra (pública autenticada) |
| products.DELETE | products_tenant_delete | products_delete_rls | membresía |
| products.SELECT | products_tenant_select | products_select_rls | membresía |
| **products.UPDATE** | **products_tenant_update** | **products_update_rls** | **membresía → RESUELTO POR SEC-003 (pendiente de compuerta)** |
| profiles.SELECT | profiles_tenant_select | (cta_family excluida por rol) | — |
| receipts.SELECT | receipts_tenant_select | receipts_select_rls | membresía |
| receipts.UPDATE | receipts_tenant_update | receipts_update_rls | membresía |
| sales_transactions.SELECT | sales_transactions_tenant_select | sales_transactions_select | membresía |
| stock_movements.DELETE | stock_movements_tenant_delete | stock_movements_delete_rls | otra |
| store_cost_templates.SELECT | (authenticated) | store_cost_templates_select_rls | membresía |
| stores.DELETE | stores_tenant_delete | stores_delete_admin_only | membresía |
| stores.SELECT | stores_tenant_select | stores_select_authenticated | otra |
| stores.UPDATE | stores_tenant_update | stores_update_member_roles | membresía |
| tenants.SELECT | tenants_select_own_or_admin | tenants_select_own_or_store_member | membresía |
| transactions.DELETE | transactions_tenant_delete | transactions_delete_rls | membresía |
| transactions.SELECT | transactions_tenant_select | transactions_select_rls (+cta por rol) | membresía |
| transactions.UPDATE | transactions_tenant_update | transactions_update_rls (+cta por rol) | membresía |
| transfers.SELECT | transfers_tenant_select | transfers_select_rls | membresía |
| workers.SELECT | workers_tenant_select | workers_select_authenticated | membresía |

Detalle completo de las 421 políticas (tabla, nombre, comando, roles, USING, WITH CHECK):
`audit-evidence/CP-SEC-025/politicas-rls-prod-20261104.json`.
Clasificación por grupo: `clasificacion-solapes-20261104.json` (46 grupos) y
`solapes-cliente-mixtos-20261104.json` (30 grupos cliente).

## 3. F2 — Diseño por tabla (acción propuesta y riesgo)

**Capa canónica objetivo: tenant-gated** (`tenant_id = current_user_tenant_id()` +
término de tienda/membresía para operaciones). La membresía queda como ESTADO DOCUMENTADO
vigente (DT-03: single-tenant); el diseño siguiente solo se EJECUTA con el disparador de
la cabecera.

| Familia | Acción propuesta por política | Riesgo de la acción |
|---|---|---|
| Gemelos SELECT `*_select_rls` (membresía) + `*_tenant_select` | **RETIRAR el gemelo membresía** tras verificar que el tenant cubre la misma población (tenant_id NOT NULL en 100 % de filas: guard). Riesgo BAJO si el guard pasa; MEDIO si hay filas legacy NULL-tenant (quedarían invisibles → visibles solo por backfill previo F0) |
| Gemelos INSERT/UPDATE/DELETE con el mismo patrón | **RETIRAR el gemelo membresía** (el tenant exige tienda del usuario además de tenant). Riesgo BAJO-MEDIO: validar cada flujo de escritura contra la política estricta (la batería de T2 es el modelo: isolation_test + casos por flujo) |
| `categories unified` (ALL) | **ALINEAR**: añadir término de tenant a la política unificada y retirar `categories_store_access`. Riesgo MEDIO (ALL = 4 comandos) |
| `product_variants` "Variantes públicas" | **MANTENER** (lectura autenticada de catálogo, decisión de producto) — documentar como excepción consciente |
| `stores_select_authenticated` / `store_cost_templates` / `product_cost_sheets` autenticado-genérico | **ALINEAR** con tenant si el módulo es multi-tenant; si son catálogos compartidos intencionales, MANTENER con comentario. Decisión por módulo en F3 |
| `inventory_deny_insert` + `inventory_insert_auth` | Revisar semántica deny-vs-allow (el "deny" permissive no deniega): **rediseñar** en F3. Riesgo MEDIO |
| `tenants_select_own_or_*` | **MANTENER** ambos (acceso a la propia organización por dos vías legítimas: admin y miembro) |
| `audit_logs` SELECT (usuario + membresía) | **MANTENER** (redundancia intencional de visibilidad de auditoría; sin gemelo tenant que anular) |
| `cta_family_*` (rol dedicado) | **MANTENER** — no son exposición de clientes (rol de servicio acotado) |

## 4. F3 — BORRADOR (TEXTO SOLAMENTE — **NO APLICAR**)

> ⛔ **NO APLICAR.** Este borrador NO es ejecutable tal cual: requiere el disparador de la
> cabecera, el backfill F0 (0 filas NULL-tenant en TODAS las tablas afectadas) y la
> batería de aislamiento por módulo. Se incluye como texto de diseño, sin archivo de
> migración en `supabase/migrations/` a propósito.

```sql
-- ═══ BORRADOR F3 (NO APLICAR) — convergencia RLS por tabla (una migración por ola) ═══
-- Plantilla por tabla X con gemelo membresía (débil) y tenant (estricto):
DO $f3_guard_X$
DECLARE v_legacy bigint;
BEGIN
    IF to_regclass('public.X') IS NULL THEN
        RAISE EXCEPTION 'F3-GUARD: no existe public.X';
    END IF;
    SELECT count(*) INTO v_legacy FROM public.X WHERE tenant_id IS NULL;
    IF v_legacy > 0 THEN
        RAISE EXCEPTION 'F3-GUARD: % fila(s) con tenant_id NULL en X — backfill F0 obligatorio antes de retirar el gemelo membresía', v_legacy;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='X'
                   AND policyname='X_tenant_select') THEN
        RAISE EXCEPTION 'F3-GUARD: falta la política tenant estricta X_tenant_select';
    END IF;
END $f3_guard_X$;

DROP POLICY IF EXISTS X_select_rls ON public.X;   -- retirar SOLO el gemelo débil
-- Verificación posterior: SELECT count(*) FROM pg_policies
--   WHERE tablename='X' AND cmd='SELECT';  → 1 (la tenant)

-- ROLLBACK por tabla (texto original medido en pg_policies antes del DROP):
-- CREATE POLICY X_select_rls ON public.X FOR SELECT TO authenticated
--   USING (<texto EXACTO medido de la política débil>);
```

Pruebas de aislamiento que acompañarían cada ola (esqueleto, patrón de
`supabase/tests/sec003_products_update_isolation_test.sql` ya probado en T2):
1. Guard previo: la política débil no existe y la estricta sí.
2. Usuario de tenant A NO ve/escubre filas del tenant B (0 filas mutadas/visibles).
3. Usuario con membresía + tenant correcto SÍ opera.
4. Admin SÍ según regla vigente; admin de otro tenant NO.
5. Flujos de la app del módulo (POS, recepciones, caja…) ejecutados en CostproE2E.

Olas propuestas (por dependencia y riesgo): 1) productos (hecho en SEC-003), 2)
transacciones/ventas/derivadas (transactions, sales_transactions, payment_transactions,
kardex_entries, stock_movements), 3) compras/recepciones (receipts, purchase_orders*,
inventory*), 4) comisiones (commission_*), 5) catálogo/otros (categories, stores,
store_cost_templates, product_cost_sheets, devolutions, transfers, workers).

## 5. Orden de transición DT-03

1. **F0** — backfill de tenant_id en filas legacy (ya hecho para products: 0 NULL
   [MEDIDO]; extender el censo al resto de tablas antes de cada ola).
2. **F1** — este inventario (hecho).
3. **F2** — este diseño por tabla (hecho).
4. **F3** — migraciones por ola SOLO con el disparador (segundo negocio cliente o
   autorización expresa del propietario), cada una con guard fail-closed + batería en
   CostproE2E + compuerta de producción como T2.
5. **F4** — recertificación: contract-surface + huellas (script del PR T3) + gate.

## 6. Estado y pendientes

- F1 y F2: COMPLETADAS (documento + evidencia JSON). Sin escrituras.
- F3: BORRADOR en §4, marcado NO APLICAR. Ninguna migración creada.
- Inventario maestro: CP-SEC-025 actualizado con estado "EN ESPERA DE DISPARADOR".
