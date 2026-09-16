# R2 SECDEF-READ SURFACE — REMEDIATION PREP (PREPARACIÓN FORENSE, READ-ONLY)

timestamp: 2026-09-16 · alcance: Supabase LIVE `wthkddeleylijmonclxg` · commit base: `276d143f` (R2 inventory) sobre cadena `fa0a3b22 → eeedc5b9 → f81fafca → 276d143f`

NATURALEZA DE ESTA FASE: **PREPARACIÓN, no remediación.** Cero cambios en producción. Cero migraciones. Cero ALTER/CREATE OR REPLACE. Cero cambios de ACL/RLS/frontend. Solo evidencia LIVE DIRECT (SELECT-only vía Management API), análisis estático del repo y diseño de remediación quirúrgica para la fase siguiente.

Fuente cruda: `03_prep-live-capture.json` (captura pg_proc/pg_get_functiondef/aclexplode de 21 nombres / 22 firmas) + `scripts/r2-prep-analysis.json` (derivado) + `02_remediation-matrix.json` (matriz ejecutable).

---

## FASE 1 — INVENTARIO CONGELADO

Evidencia fuente verificada en `audit-evidence/R2-SECDEF-READ-SURFACE/`:

| Archivo | Estado |
|---|---|
| `r2-inventory.json` | presente, summary = {total 246, WRITE 141, WRITE-MIXED 3, READ 60, UTILITY 42, auth-reachable 22} |
| `FINAL-REPORT.md` | presente, veredicto R2: FINDING (F1/F2 HIGH, F3 MEDIUM ×5, F4 LOW ×2) |
| `01_FINDINGS.md` | presente, 9 findings con plantilla de 9 elementos |
| `MANIFEST.sha256` | `sha256sum -c` → 5/5 OK |

Cotejo de cifras (mandato vs inventario):

```text
246 total SECDEF                                  ✓ (246)
141 WRITE                                         ✓ (141)
3 WRITE-MIXED                                     ✓ (3)
60 READ                                           ✓ (60)
42 UTILITY                                        ✓ (42)
22 authenticated-reachable READ/MIXED candidates  ✓ (22, firmas; has_store_role ×2)
13 protected / NO FINDING                         ✓ (22 − 9)
9 findings                                        ✓ (F1 1 + F2 1 + F3 5 + F4 2)
```

**Sin discrepancias → continúo.**

---

## FASE 2 — INVENTARIO DE LAS 9 FINDINGS (estado LIVE, read-only)

Datos comunes verificados en catálogo LIVE (todas):

```text
SECURITY DEFINER = true   owner = postgres   DML = ninguna (READ puras)
ACL (proacl) = {postgres, authenticated, service_role} → EXECUTE
anon: sin EXECUTE (ACL) y sin grant PUBLIC → denegación previa a toda lógica
```

### Tabla resumen (formato del mandato)

| Función | Tipo | SECDEF | EXEC authenticated | store input | NULL behavior | Caller | Tablas | Riesgo |
|---|---|---|---|---|---|---|---|---|
| `get_cash_closures(uuid,date,date,int)` | READ→jsonb | sí | sí | `p_store_id` | **NULL→TODAS las tiendas** | reports/data-fetcher.ts → browser + API | cash_closures ⟕ profiles | **F1 HIGH** |
| `get_transfers(uuid,tstz,tstz,text,int)` | READ→jsonb | sí | sí | `p_store_id` | **NULL→TODAS (origin OR destination)** | reports/data-fetcher.ts → browser + API | transfers, transfer_items, products, profiles, stores | **F2 HIGH** |
| `get_store_analytics_advanced(uuid,date,date,int)` | READ→jsonb | sí | sí | `p_store_id` obligatorio | sin rama NULL (WHERE estricto) | useStoreAnalytics.ts | transactions, transaction_items, products | **F3 MED** |
| `get_sales_since_last_closure(uuid)` | READ→TABLE | sí | sí | `p_store_id` obligatorio | sin rama NULL | cash-service.ts | cash_closures, transactions | **F3 MED** |
| `get_paginated_products(uuid,text,text,int,int)` | READ→TABLE | sí | sí | `p_store_id` obligatorio | NULL→0 filas (igualdad con NULL) | useInventory.ts, data-fetcher, tienda/[slug] SSR | products, inventory, stock_movements | **F3 MED** |
| `get_products_for_reception(uuid,text,int,int)` | READ→TABLE | sí | sí | `p_store_id` obligatorio | sin rama NULL (hook early-return) | useReceptionProductSearch.ts | products | **F3 MED** |
| `get_product_stock_ledger_paginated(uuid,uuid,int,int)` | READ→TABLE | sí | sí | `p_product_id` + `p_store_id` | **p_store_id NULL→todas las tiendas** | useKardex.ts, data-fetcher, API history | stock_movements | **F3 MED** |
| `get_daily_expenses_aggregated(uuid,date,date,int)` | READ→jsonb | sí | sí | `p_store_id` | **NULL→TODAS** | reports/data-fetcher.ts → browser + API | receipts | **F4 LOW** |
| `get_low_stock_count(uuid)` | READ→bigint | sí | sí | `p_store_id` | **NULL→TODAS** | useStoreNotifications.ts, SalesHubView.tsx | products | **F4 LOW** |

### Detalle por función (16 puntos del mandato)

**F1 `get_cash_closures(uuid, date, date, int)` → jsonb**
1. Definición LIVE: capturada byte-nivel en `03_prep-live-capture.json` (SECDEF, VOLATILE, `search_path=public, pg_temp`).
2. Argumentos: `p_store_id uuid, p_date_from date, p_date_to date, p_limit integer`.
3. Return: `jsonb` (array de cierres o `[]`).
4. SECURITY DEFINER: true.
5. Owner: `postgres`.
6. ACL: `{postgres=X, authenticated=X, service_role=X}`.
7. search_path: `{public, pg_temp}` (set).
8. Tablas consultadas: `cash_closures`, `profiles` (LEFT JOIN para `operator_name`).
9. Tablas modificadas: ninguna.
10. store_id: `p_store_id` (filtro directo).
11. Filtros: `(p_store_id IS NULL OR cc.store_id = p_store_id) AND (p_date_from IS NULL OR cc.created_at::date >= p_date_from) AND (p_date_to IS NULL OR cc.created_at::date <= p_date_to) AND cc.status = 'cerrado' ORDER BY cc.created_at DESC LIMIT p_limit`.
12. Joins: `LEFT JOIN profiles p ON p.id = cc.user_id`.
13. NULL semantics: **p_store_id NULL → todas las tiendas**; fechas NULL → sin cota temporal.
14. Callers: wrapper `fetchReportData` case `'cash'` (pasa `p_store_id: storeId`, nunca NULL).
15. Número de callers: 1 wrapper, 2 rutas de cliente (browser `report-service.ts`; server `/api/reports/generate`), UI final `useReportState.ts` + `ReportPreview.tsx`.
16. Archivos: `src/lib/reports/data-fetcher.ts:158`, `src/services/report-service.ts:163`, `src/app/api/reports/generate/route.ts:80` (+UI reports).

**F2 `get_transfers(uuid, tstz, tstz, text, int)` → jsonb**
1. LIVE: SECDEF, VOLATILE, `search_path=public, pg_temp` (captura byte-nivel).
2. Args: `p_store_id uuid, p_date_from tstz, p_date_to tstz, p_status text, p_limit int`.
3. Return: `jsonb` (transferencias con `items[]` embebidos).
4-7. SECDEF true · owner postgres · ACL `{postgres, authenticated, service_role}` · search_path `{public, pg_temp}`.
8. Tablas: `transfers`, `transfer_items`, `products`, `profiles`, `stores`.
9. Modificadas: ninguna.
10. store_id: `p_store_id` — filtro `origin_store_id OR destination_store_id`.
11. Filtros: `(p_store_id IS NULL OR t.origin_store_id = p_store_id OR t.destination_store_id = p_store_id) AND (fechas NULL OR) AND (p_status IS NULL OR t.status = p_status)`.
12. Joins: `LEFT JOIN stores os/ds` (nombres de tiendas), `LEFT JOIN profiles p` (creador), `LEFT JOIN transfer_items ti`, `LEFT JOIN products pr` (nombre/sku).
13. NULL semantics: **NULL → TODAS las tiendas de la organización** (origin o destination); además expone UUIDs de tiendas → cadena de ataque F2→F3.
14. Callers: case `'transfer'` de `fetchReportData` (`p_store_id: storeId`, `p_status: null`).
15. Callers: 1 wrapper, mismas 2 rutas que F1.
16. Archivos: `src/lib/reports/data-fetcher.ts:146` + los mismos del caso F1.

**F3a `get_store_analytics_advanced(uuid, date, date, int)` → jsonb**
1. LIVE: SECDEF, VOLATILE, `search_path=public`.
2. Args: `p_store_id, p_start_date, p_end_date, p_days`.
3-7. jsonb · SECDEF true · postgres · ACL `{postgres, authenticated, service_role}` · `{public}`.
8. Tablas: `transactions`, `transaction_items`, `products` (≈10 subconsultas: ventas, costos, top productos, weekday/hour, days_without_sales).
9. Modificadas: ninguna.
10. store_id: `p_store_id` — **obligatorio**: `WHERE t.store_id = p_store_id` (y `p.store_id = p_store_id` para productos).
11. Filtros: por tienda + rango/días; sin rama `IS NULL OR`.
12. Joins: `transaction_items ⋈ transactions ⋈ products`.
13. NULL: p_store_id NULL → comparación de igualdad falsa → agregados vacíos (sin leak, pero implícito).
14. Caller: `useStoreAnalytics.ts:255` (browser, storeId requerido — lanza error si falta).
15. Callers: 1 hook.
16. Archivos: `src/hooks/api/useStoreAnalytics.ts`.

**F3b `get_sales_since_last_closure(uuid)` → TABLE(total_sales, total_cash, total_transfer, last_closure_at)**
1. LIVE: SECDEF, **STABLE**, `search_path=public, extensions`.
2. Args: `p_store_id uuid`.
3. Return: TABLE 4 columnas (totales por método de pago).
4-7. SECDEF true · postgres · ACL 3 roles · `{public, extensions}`.
8. Tablas: `public.cash_closures` (último cierre `status='cerrado'`), `public.transactions` (desde ese cierre).
9. Modificadas: ninguna.
10. store_id: `p_store_id` obligatorio en ambas consultas.
11. Filtros: `WHERE store_id = p_store_id AND status = 'cerrado'` / `WHERE store_id = p_store_id AND created_at > last_closure_at`.
12. Joins: ninguno.
13. NULL: sin rama → NULL no devuelve datos.
14. Caller: `cash-service.ts:8` con Zod validation (`getSalesSinceLastClosureParamsSchema`).
15. Callers: 1 servicio (UI de cierre de caja).
16. Archivos: `src/services/cash-service.ts`.

**F3c `get_paginated_products(uuid, text, text, int, int)` → TABLE 28 columnas**
1. LIVE: SECDEF, VOLATILE, `search_path=public`.
2. Args: `p_store_id, p_search_term, p_category, p_limit, p_offset`.
3. Return: TABLE (catálogo completo incl. `cost_price`, `cost_average`, `stock_current`, `store_id`).
4-7. SECDEF true · postgres · ACL 3 roles · `{public}`.
8. Tablas: `public.products`, `public.inventory` (SUM stock por producto+tienda), `public.stock_movements` (EXISTS `has_movements`).
9. Modificadas: ninguna.
10. store_id: `p_store_id` obligatorio: `WHERE p.store_id = p_store_id AND p.is_active = true` (COUNT y SELECT).
11. Filtros: tienda + activo + búsqueda/categoría opcional + paginación.
12. Joins: subconsultas correlacionadas (inventory/stock_movements).
13. NULL: igualdad con NULL → 0 filas (fail-closed accidental, no explícito).
14. Callers (3): `useInventory.ts:30,69` (browser; `getCleanStoreId` puede enviar NULL→hoy 0 filas); `fetchReportData` case `'inventory'` (browser+API); **SSR `tienda/[slug]/page.tsx:154` con `getSupabaseAdminSafe()` = service_role y `p_store_id = store.id` derivado server-side de la búsqueda pública por `slug` (stores `is_active=true`)** — comentario en código documenta el cambio a admin client (el RPC con anon históricamente lanzaba "Authentication required").
15. Callers: 2 hooks + 1 wrapper + 1 SSR (uso dinámico: `const rpcName = 'get_paginated_products'; supabase.rpc(rpcName, params)`).
16. Archivos: `src/hooks/api/useInventory.ts`, `src/lib/reports/data-fetcher.ts:68`, `src/app/tienda/[slug]/page.tsx:154`.

**F3d `get_products_for_reception(uuid, text, int, int)` → TABLE 11 columnas**
1. LIVE: SECDEF, VOLATILE, `search_path=pg_catalog, public, pg_temp`.
2. Args: `p_store_id, p_search_term, p_page, p_page_size`.
3. Return: TABLE (id, name, sku, barcode, `cost_price`, price, stock_current, min_stock, total_count).
4-7. SECDEF true · postgres · ACL 3 roles · `{pg_catalog, public, pg_temp}`.
8. Tablas: `products`.
9. Modificadas: ninguna.
10. store_id: `p_store_id` obligatorio: `WHERE p.store_id = p_store_id AND p.is_active = true`.
11. Filtros: tienda + activo + búsqueda (name/sku/barcode) + orden por relevancia + LIMIT/OFFSET.
12. Joins: ninguno.
13. NULL: sin rama; el hook hace early-return si no hay storeId.
14. Caller: `useReceptionProductSearch.ts:45` (browser).
15. Callers: 1 hook.
16. Archivos: `src/hooks/api/useReceptionProductSearch.ts`.

**F3e `get_product_stock_ledger_paginated(uuid, uuid, int, int)` → TABLE 15 columnas**
1. LIVE: SECDEF, VOLATILE, `search_path=public, extensions`.
2. Args: `p_product_id uuid, p_store_id uuid, p_limit int, p_offset int`.
3. Return: TABLE kardex (movimientos con `unit_cost`, `balance_after` calculado con window function).
4-7. SECDEF true · postgres · ACL 3 roles · `{public, extensions}`.
8. Tablas: `public.stock_movements` (CTE interna `movements`).
9. Modificadas: ninguna.
10. store_id: `p_store_id` — filtro: `WHERE m.product_id = p_product_id AND (p_store_id IS NULL OR m.store_id = p_store_id)`.
11. Filtros: producto + tienda opcional + ventana temporal por `created_at/id` para saldo corrido.
12. Joins: ninguno (CTE + window).
13. NULL semantics: **p_store_id NULL → movimientos del producto en TODAS las tiendas** (con unit_cost). Ruta activa en la app: `useKardex.ts` envía `getCleanStoreId(storeId)` que **retorna null** si storeId falta/`'null'`/`'undefined'`.
14. Callers (3): `useKardex.ts:38` (browser; NULL posible); `fetchReportData` case `'kardex'` (browser+API, storeId del reporte); `/api/inventory/[productId]/history/route.ts:38` (server: `getSupabaseAuthClient(session.token)` = JWT authenticated + middleware `withStoreAccess` con storeId obligatorio).
15. Callers: 1 hook + 1 wrapper + 1 API route.
16. Archivos: `src/hooks/api/useKardex.ts`, `src/lib/reports/data-fetcher.ts:80`, `src/app/api/inventory/[productId]/history/route.ts`.

**F4a `get_daily_expenses_aggregated(uuid, date, date, int)` → jsonb**
1. LIVE: SECDEF, VOLATILE, `search_path=public, pg_temp`.
2. Args: `p_store_id, p_date_from, p_date_to, p_limit`.
3. Return: jsonb (agregados diarios de gastos).
4-7. SECDEF true · postgres · ACL 3 roles · `{public, pg_temp}`.
8. Tablas: `receipts`.
9. Modificadas: ninguna.
10. store_id: `p_store_id`.
11. Filtros: `(p_store_id IS NULL OR r.store_id = p_store_id) AND (fechas NULL OR ...)` (agregación por día).
12. Joins: ninguno.
13. NULL: **NULL → todas las tiendas** (agregado global diario).
14. Caller: case `'daily_expenses'` de `fetchReportData` — **pasa `p_store_id: storeId` siempre** (nunca NULL desde la app).
15. Callers: 1 wrapper, 2 rutas (browser + API reports).
16. Archivos: `src/lib/reports/data-fetcher.ts:136` + rutas F1.

**F4b `get_low_stock_count(uuid)` → bigint**
1. LIVE: SECDEF, VOLATILE, `search_path=public`.
2. Args: `p_store_id uuid`.
3. Return: bigint (contador).
4-7. SECDEF true · postgres · ACL 3 roles · `{public}`.
8. Tablas: `public.products`.
9. Modificadas: ninguna.
10. store_id: `p_store_id`.
11. Filtros: `(p_store_id IS NULL OR store_id = p_store_id) AND is_active = true AND stock_current <= min_stock` (contador).
12. Joins: ninguno.
13. NULL: **NULL → conteo de todas las tiendas**.
14. Callers (2): `useStoreNotifications.ts:83` (itera tiendas RLS-visibles: para usuarios regulares solo sus tiendas — `stores_select_authenticated = is_global_admin() OR is_store_member(id)`; con fallback client-side si la RPC falla); `SalesHubView.tsx:198` (tienda activa del usuario).
15. Callers: 1 hook + 1 vista.
16. Archivos: `src/hooks/api/useStoreNotifications.ts`, `src/components/views/terminal/views/sales_hub/SalesHubView.tsx`.

---

## FASE 3 — MODELO DE AUTORIZACIÓN POR FUNCIÓN (NO copiar el guard KPI a ciegas)

El guard de `get_batch_store_daily_kpis` (000004) corresponde al **Modelo B** (array validado por elemento). Ninguna de las 9 funciones recibe arrays. Clasificación explícita:

| Función | Modelo | Justificación |
|---|---|---|
| `get_cash_closures` | **A** | Recibe `p_store_id`; reporte de caja de UNA tienda. NULL=todas no tiene flujo app (ver FASE 4). No hay capacidad multi-tienda legítima definida en UI para usuarios no-admin. |
| `get_transfers` | **A** | Recibe `p_store_id`; semántica del filtro ya es "transferencias que tocan MI tienda" (origin OR destination). El NULL global no es usado por la app. |
| `get_store_analytics_advanced` | **A** | `p_store_id` obligatorio en el body; analítica de UNA tienda. |
| `get_sales_since_last_closure` | **A** | `p_store_id` obligatorio; totales desde el último cierre de UNA tienda (flujo de cierre de caja del operador de esa tienda). |
| `get_paginated_products` | **A** (con caller server Model-E-flavor) | `p_store_id` obligatorio. El caller SSR `tienda/[slug]` usa service_role (bypass natural del guard) — NO requiere revoke de EXECUTE ni cambio de ACL. |
| `get_products_for_reception` | **A** | `p_store_id` obligatorio; búsqueda de productos para recepción en UNA tienda. |
| `get_product_stock_ledger_paginated` | **A** | Recibe producto + tienda; kardex de UNA tienda. La rama NULL (todas) es la única vía multi-tienda y NO es una capacidad legítima documentada del UI (es ruta defensiva de `useKardex`). |
| `get_daily_expenses_aggregated` | **A** | Recibe `p_store_id`; la app siempre lo envía. |
| `get_low_stock_count` | **A** | Recibe `p_store_id`; contador de UNA tienda, invocado por-tienda desde el UI. |

```text
Modelo B (array):  0 funciones  (el único caso era get_batch_store_daily_kpis — R1)
Modelo C (store por joins): 0 funciones  (todas filtran por p_store_id directo)
Modelo D (multi-tienda por rol): 0 funciones ACTIVAS — la capacidad NULL→todas de
  F1/F2/F3e/F4a/F4b no corresponde a ningún flujo legítimo del UI actual
Modelo E (internal-only, revoke EXECUTE): 0 funciones — las 9 tienen flujos browser
  legítimos; además anon ya carece de EXECUTE y las ACL no se tocan
```

Conclusión: **guard uniforme Modelo A** con política NULL explícita (FASE 4/7); sin cambios de ACL; sin parámetros nuevos; sin wrappers nuevos.

---

## FASE 4 — SEMÁNTICA NULL (quién envía NULL hoy y qué debe pasar)

Principio: **NULL ≠ vulnerabilidad por sí mismo**; se analiza emisor por emisor.

| Función | NULL hoy significa | ¿Alguien envía NULL? | ¿Pantalla? | Comportamiento UI esperado | ¿"Todas" es legítimo? | Decisión |
|---|---|---|---|---|---|---|
| `get_cash_closures` | todas las tiendas | NO — `data-fetcher` pasa `storeId` (obligatorio en `/api/reports/generate` por FIX-SEC-M1) | vista Reportes → tipo "Caja" | lista de cierres de LA tienda activa | No hay flujo admin-global en UI | **Eliminar para authenticated** (opción A del mandato): NULL → 42501 |
| `get_transfers` | todas (origin OR destination) | NO — case `'transfer'` pasa `storeId` | vista Reportes → tipo "Transferencias" | transferencias que tocan MI tienda | No | **Eliminar** (A): NULL → 42501 |
| `get_store_analytics_advanced` | sin efecto (0 filas) | NO — hook exige storeId | Dashboard/Analytics | analítica de LA tienda | No | NULL → 42501 (explícito, fail-closed) |
| `get_sales_since_last_closure` | sin efecto | NO — Zod + flujo de caja | pantalla Caja | totales desde cierre de LA tienda | No | NULL → 42501 |
| `get_paginated_products` | 0 filas (igualdad NULL) | Edge: `useInventory` con `getCleanStoreId()=null` | vista Inventario (siempre con tienda activa en práctica) | lista vacía hoy; tras guard → error 42501 | No | NULL → 42501 (ver FASE 9) |
| `get_products_for_reception` | sin efecto (hook early-return) | NO | Recepción | búsqueda en LA tienda | No | NULL → 42501 |
| `get_product_stock_ledger_paginated` | **movimientos del producto en TODAS las tiendas** | **SÍ — `useKardex` envía `getCleanStoreId(storeId)` que puede ser null** | KardexModal (en práctica siempre con tienda) | kardex de LA tienda actual | No (filtra costos cross-store) | **Eliminar** (A): NULL → 42501; impacto UI documentado |
| `get_daily_expenses_aggregated` | todas las tiendas | NO — case `'daily_expenses'` pasa `storeId` | Reportes → "Gastos" | gastos diarios de LA tienda | No | **Eliminar** (A): NULL → 42501 |
| `get_low_stock_count` | todas las tiendas | NO (siempre store.id de tienda RLS-visible) | Notificaciones + SalesHub | contador por tienda | No | **Eliminar** (A): NULL → 42501 |

Respuestas a las preguntas del mandato para F1/F2 (`NULL → TODAS LAS TIENDAS`):

1. **¿Qué significa NULL actualmente?** Dump global de la organización (todas las tiendas).
2. **¿Quién lo envía?** Nadie en la app (verificado: `data-fetcher.ts` siempre pasa `p_store_id: storeId`; la ruta API exige store_id). NULL solo alcanzable por RPC directo (atacante) o service_role/scripts.
3. **¿Qué pantalla lo utiliza?** Ninguna con NULL; las pantallas de reportes operan sobre la tienda activa.
4. **¿Qué espera la UI?** Datos de LA tienda seleccionada.
5. **¿NULL significa "todas las tiendas"?** Sí, hoy.
6. **¿Existe caso legítimo multi-store?** No identificado en UI ni scripts operativos; para un admin global, la vista consolidada no existe como producto hoy.
7. **¿Qué rol puede realizarlo?** Hoy: cualquier `authenticated` (vulnerabilidad). Tras remediación: solo `service_role` (capacidad operativa interna, igual que KPI 000004).

Decisión por opción del mandato: **A. eliminarse** (para authenticated) — las opciones B (limitar a roles), C (consulta explícitamente autorizada) y D (array autorizado) quedan documentadas como posible capacidad futura si el producto pide vista consolidada admin; NO se implementan en esta remediación (mínima intervención).

---

## FASE 5 — CALLERS REALES (cadena completa, sin fiarse solo de grep del nombre)

Búsqueda ejecutada: nombre de función en ts/tsx/js/cjs (fuera de node_modules/.next/audit-evidence), patrón `.rpc(`, wrappers (`fetchReportData`, `reportService`, `withLogging`, `wrapRpcWithTracing`), invocación dinámica (`const rpcName = ...`), rutas API, SSR, tests y scripts.

### Cadenas UI → función

**C1 — Reportes (afecta F1, F2, F4a, F3c, F3e):**
```text
UI Reportes (useReportState.ts / ReportPreview.tsx)
  ↓ reportService.fetchReportData  [src/services/report-service.ts:163]
  ↓ supabase = browser client (anon key + sesión JWT)  [src/lib/supabaseClient.ts:17]
  ↓ fetchReportData case cash/transfer/daily_expenses/inventory/kardex  [data-fetcher.ts]
  ↓ POST /rest/v1/rpc/<fn>  rol=authenticated
  ↓ parámetros: p_store_id = storeId del estado del reporte (tienda activa)
```
**C2 — API de generación de PDF (afecta F1, F2, F4a, F3c, F3e):**
```text
POST /api/reports/generate  [withRole('manager') + validateOrigin CSRF + Zod]
  ↓ store_id OBLIGATORIO (FIX-SEC-M1) + validación membership activa (admin bypass) [route.ts:38-60]
  ↓ supabase = getSupabaseAuthClient(session.token)  →  rol authenticated (NO service_role)  [route.ts:35]
  ↓ fetchReportData(supabase, { storeId: effectiveStoreId, ... })
  ↓ POST /rest/v1/rpc/<fn>  rol=authenticated
```
**C3 — Analítica (F3a):** `UI Analytics → useStoreAnalytics.ts:255 → browser client → authenticated → p_store_id=storeId (requerido)`.
**C4 — Caja (F3b):** `UI Caja → cash-service.ts:8 (Zod) → browser client → authenticated → p_store_id=storeId`.
**C5 — Inventario (F3c):** `UI Inventario → useInventory.ts:30/69 (withLogging wrapper; rpcName dinámico-literal) → browser client → authenticated → p_store_id=getCleanStoreId(storeId)`.
**C6 — Recepción (F3d):** `UI Recepción → useReceptionProductSearch.ts:45 → browser client → authenticated → p_store_id=storeId (early-return si falta)`.
**C7 — Kardex (F3e):** `KardexModal → useKardex.ts:38 → browser client → authenticated → p_store_id=getCleanStoreId(storeId)` (**puede ser null hoy**).
**C8 — API history (F3e):** `GET /api/inventory/[productId]/history?storeId=… → withStoreAccess (session + storeId obligatorio, FIX-SEC-H1) → getSupabaseAuthClient(JWT) → authenticated → p_store_id=storeId`.
**C9 — Storefront público (F3c):** `GET /tienda/<slug> (SSR) → lookup stores por slug (is_active=true) → adminClient=getSupabaseAdminSafe() → **service_role** → p_store_id=store.id (server-derived) → fallback anon+RLS`.
**C10 — Notificaciones (F4b):** `useStoreNotifications.ts:83 → SELECT stores RLS-visible (usuario regular: SOLO sus tiendas por stores_select_authenticated) → por cada store.id → get_low_stock_count → browser → authenticated (fallback client-side ante rpcError)`.
**C11 — SalesHub (F4b):** `SalesHubView.tsx:198 → tienda activa → browser → authenticated`.

### Conteo y cobertura

| Función | Nº de rutas caller | Archivos |
|---|---|---|
| get_cash_closures | 2 (C1 browser, C2 API) | data-fetcher.ts, report-service.ts, useReportState.ts, ReportPreview.tsx, api/reports/generate |
| get_transfers | 2 (C1, C2) | ídem |
| get_store_analytics_advanced | 1 (C3) | useStoreAnalytics.ts |
| get_sales_since_last_closure | 1 (C4) | cash-service.ts |
| get_paginated_products | 4 (C1, C2, C5, C9) | useInventory.ts, data-fetcher.ts, report-service.ts, api/reports/generate, tienda/[slug]/page.tsx |
| get_products_for_reception | 1 (C6) | useReceptionProductSearch.ts |
| get_product_stock_ledger_paginated | 3 (C1, C2+C7, C8) | useKardex.ts, data-fetcher.ts, api/inventory/[productId]/history |
| get_daily_expenses_aggregated | 2 (C1, C2) | data-fetcher.ts + rutas |
| get_low_stock_count | 2 (C10, C11) | useStoreNotifications.ts, SalesHubView.tsx |

Notas estructurales:
- **0 rutas** `authenticated → API → service_role → <fn>`: los flujos server (C2, C8) usan JWT del usuario; el único uso de service_role (C9) deriva `store.id` server-side de un slug público y no expone el RPC al cliente.
- Wrapper `test_contract_rpcs_store_access.mjs` (V2.6) tiene las 9 en ALLOWLIST bajo el supuesto "validadas por API route" — supuesto refutado por R2 (los hooks llaman directo). Tras la remediación el guard las hará cumplir el contrato automáticamente; el allowlist puede reducirse (decisión de esa fase).
- `wrapRpcWithTracing` (admin) y `withLogging` (hooks) son tracing/logging; no alteran identidad ni parámetros.
- `useProductFCStatus.ts` y `useCatalogProducts.ts`/`CatalogView.tsx` solo referencian `get_paginated_products_v2` (función protegida) o comentarios — no son callers de las 9.

---

## FASE 6 — CONTRATO FUNCIONAL (estado deseado post-remediación)

### ¿Quién puede llamarla? (ACL sin cambios: EXECUTE = {postgres, authenticated, service_role}; anon denegado)

| Función | anon | authenticated (miembro) | authenticated (no miembro) | admin global | service_role |
|---|---|---|---|---|---|
| get_cash_closures | denegado (ACL) | sus datos de tienda | **42501** | datos de tiendas donde tenga membership o todas (is_admin bypass de has_store_access) | PASS (operativa) |
| get_transfers | denegado (ACL) | ídem | **42501** | ídem | PASS |
| get_store_analytics_advanced | denegado (ACL) | analítica propia | **42501** | ídem | PASS |
| get_sales_since_last_closure | denegado (ACL) | ídem | **42501** | ídem | PASS |
| get_paginated_products | denegado (ACL) | catálogo propio | **42501** | ídem | PASS (SSR storefront) |
| get_products_for_reception | denegado (ACL) | ídem | **42501** | ídem | PASS |
| get_product_stock_ledger_paginated | denegado (ACL) | kardex propio | **42501** | ídem | PASS |
| get_daily_expenses_aggregated | denegado (ACL) | ídem | **42501** | ídem | PASS |
| get_low_stock_count | denegado (ACL) | ídem | **42501** | ídem | PASS |

### ¿Qué datos puede devolver? (sin cambios respecto a hoy, PERO solo de tiendas autorizadas)

F1 cierres financieros fila-a-fila (`declared_cash/vouchers/system_total/difference/operator`) · F2 transferencias+items+costos+nombres · F3a analítica completa de ventas/márgenes · F3b totales por método de pago · F3c catálogo con `cost_price/cost_average/stock` · F3d productos con costos para recepción · F3e kardex con `unit_cost` · F4a agregados diarios de gastos · F4b contador de stock bajo.

### Matriz de comportamiento contractual (todas las 9)

| Estado | Comportamiento post-remediación |
|---|---|
| store válida + miembro (status=active) | PASS — datos de esa tienda |
| store válida + no miembro | RAISE 42501 |
| store inexistente | RAISE 42501 (has_store_access → false: no existe membership posible) |
| NULL | RAISE 42501 (política NULL explícita; ninguna de las 9 conserva "NULL=todas" para authenticated) |
| múltiples stores | N/A — ninguna recibe array (Modelo B = solo KPI/R1); si un futuro caller necesita multi-tienda, se diseña como función nueva con validación por elemento |
| usuario sin membership | RAISE 42501 |
| service_role | PASS — sin guard (capacidad operativa interna; identity-less por diseño, igual que 000004) |
| admin global (is_admin) | PASS vía `has_store_access → is_admin()` bypass — capacidad ya existente del helper, sin cambio |

---

## FASE 7 — DISEÑO DE GUARD (específico por función; NO copia literal donde no corresponde)

Patrón base autorizado por el mandato (idéntico al precedente verificado 20260916000004), colocado como **primeras sentencias del bloque BEGIN**, antes de cualquier acceso a datos:

```sql
IF auth.role() <> 'service_role' THEN
    IF p_store_id IS NULL THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: NULL' USING ERRCODE = '42501';
    END IF;
    IF NOT has_store_access(p_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: %', p_store_id USING ERRCODE = '42501';
    END IF;
END IF;
```

Especificación por función (las 9 comparten especificación porque todas son Modelo A con un único `p_store_id`):

```text
Función:            las 9 (F1, F2, F3a-e, F4a, F4b)
Guard type:         identity-check + membership-check (has_store_access) — uniforme Modelo A
Input validado:     p_store_id (uuid) — único parámetro de tienda en cada firma
Authorization src:  auth.role() (branch service_role) + has_store_access(p_store_id)
                    → has_store_access usa auth.uid() + user_store_memberships (+ is_admin bypass)
NULL policy:        REJECT (42501) para authenticated — elimina "NULL=todas las tiendas";
                    service_role conserva NULL=todas (capacidad operativa actual sin cambio)
Cross-store policy: REJECT (42501) — has_store_access(p_store_id) false → denegación;
                    fail-closed (NULL en has_store_access → false → 42501)
service_role policy: bypass (sin validación — mantiene SSR storefront, scripts y tooling)
Expected SQLSTATE:  42501 (insufficient_privilege) — misma convención que 000004
Cambios de ACL:     NINGUNO (EXECUTE se mantiene {postgres, authenticated, service_role})
Cambios de firma:   NINGUNO (mismos parámetros, mismo return, mismas overloads)
Volatilidad:        sin cambios (F1/F2/F3a/c/d/e/F4a/F4b VOLATILE; F3b STABLE)
search_path:        sin cambios en esta remediación (los 9 LOW preexistentes NO se tocan;
                    nota: las 9 ya tienen search_path seteado, no están entre los 9 LOW)
```

Justificación de decisiones de diseño:

1. **¿Por qué no `auth.uid() IS NULL` como única defensa?** El patrón 000004 (ya certificado en staging 14/14 y verificado LIVE) usa `auth.role() <> 'service_role'` + `has_store_access`; reutilizar el patrón probado minimiza riesgo y facilita la verificación byte-equal del estilo R1.
2. **¿Por qué REJECT NULL y no "NULL = mis tiendas"?** La variante "NULL → intersección con tiendas propias" (`current_user_store_ids()`) fue considerada y descartada: ninguna pantalla la usa, añade lógica nueva no probada y rompe el principio de mínima intervención. Queda documentada como opción futura (Modelo D) si el producto pide vista consolidada.
3. **¿Por qué no revoke EXECUTE (Modelo E)?** Las 9 tienen flujos browser legítimos (FASE 5); revocar rompería la app. El guard DB es la capa de autorización; la ACL queda intacta.
4. **F2 get_transfers:** el guard valida el `p_store_id` recibido; la semántica de filtro interna (origin OR destination) se conserva — el usuario ve las transferencias que tocan SU tienda, que es el contrato del reporte.
5. **F3c get_paginated_products:** el caller SSR público usa service_role → bypass → cero impacto en la vitrina; el fallback anon+RLS de ese caller no llama al RPC.

---

## FASE 8 — SEGURIDAD DE has_store_access (dependencia de R2)

Verificación read-only LIVE de `has_store_access(uuid)` (captura `03_prep-live-capture.json`):

```text
SECURITY DEFINER                    true
Identidad derivada de               auth.uid() EXCLUSIVAMENTE (v_user_id := auth.uid())
Acepta identidad de usuario         NO — única firma has_store_access(uuid) = p_store_id
Consulta                            user_store_memberships ⋈ stores ⋈ profiles (tenant-coherencia)
NULL handling                       RETURN false si v_user_id IS NULL OR p_store_id IS NULL (fail-closed)
Bypass admin                        public.is_admin() → true (SECDEF, identidad auth.uid()+profiles.role)
search_path                         {public, pg_temp} (pg_temp al final — seguro)
ACL                                 {postgres, authenticated, service_role} EXECUTE
Volatilidad                         STABLE
Camino de manipulación              NO encontrado: sin SQL dinámico, sin tablas parametrizadas,
                                    sin p_user_id, sin ORs que neutralicen el WHERE de membership
```

Cadena de dependencia verificada (read-only LIVE):

```text
has_store_access → is_admin()       SECDEF, EXISTS(profiles WHERE id = auth.uid() AND role='admin'),
                                    search_path {public, pg_temp}
              → (indirecto) is_global_admin()  SECDEF, misma lógica (usada por policies, no por el guard)
```

**Advertencia contractual:** si durante la remediación R2 `has_store_access` (o su cuerpo, ACL o search_path) cambia, es un **cambio de superficie crítica** que invalida esta preparación y exige re-certificación completa (byte-equality con esta captura como línea base). Las migraciones de R2 NO deben tocarla.

---

## FASE 9 — IMPACTO EN LA APLICACIÓN (documentado; NO se cambia el frontend ahora)

| Función + guard | Error UI | Consulta vacía | Cambio de filtros | Pérdida legítima | Cambio de parámetros | Cambio de permisos | Cambio de callers |
|---|---|---|---|---|---|---|---|
| F1 cash_closures | No | No | No | No (app nunca envía NULL) | No | No | No |
| F2 transfers | No | No | No | No | No | No | No |
| F3a analytics | No | No | No | No | No | No | No |
| F3b sales_since_closure | No | No | No | No | No | No | No |
| F3c paginated_products | **Edge:** `useInventory` con storeId null hoy recibe lista vacía; tras guard recibirá error 42501 → estado de error en el hook (en práctica la vista Inventario siempre tiene tienda activa) | Solo ese edge | No | No | No | No | Mitigación futura (post-remediación): early-return en `useSuspenseInventory` cuando `cleanStoreId` sea null — 2 líneas, NO se ejecutan en esta fase |
| F3d reception | No (hook early-return) | No | No | No | No | No | No |
| F3e kardex | **Edge:** `useKardex` con storeId null hoy recibe kardex cross-store (que es el comportamiento vulnerado); tras guard → 42501 → error en KardexModal (en práctica el modal se abre desde una tienda) | Solo ese edge | No | No (el "null=kardex global" no es capacidad legítima, es el bug) | No | No | Mitigación futura: early-return o storeId requerido en hook |
| F4a expenses | No | No | No | No | No | No | No |
| F4b low_stock | No | No | No | No (admin global sigue viendo todas vía is_admin; usuarios regulares ya iteraban solo sus tiendas por RLS de stores) | No | No | No |

Casos especiales verificados:
- **C9 storefront SSR (`tienda/[slug]`)**: usa service_role → bypass → **cero impacto** en la vitrina pública.
- **C2 `/api/reports/generate`**: rol authenticated + validación membership en la ruta → miembros siguen PASS; el guard añade defensa en profundidad (un bypass de la validación de app ahora choca con 42501 en DB).
- **C10 `useStoreNotifications`**: la ruta de fallback ante `rpcError` (query client-side a products con RLS) queda como degradación graciosa natural si un caso imprevisto recibe 42501.
- **`test_contract_rpcs_store_access.mjs`**: tras la remediación las 9 cumplen la regla general del contrato (llaman has_store_access) — el test seguirá OK aunque su allowlist no se toque; recomendar reducción del allowlist en la fase siguiente (opcional, con su propio ciclo).

---

## FASE 10 — PRIORIZACIÓN DE REMEDIACIÓN (propuesta, sin ejecutar)

```text
FASE R2-A:  F1 get_cash_closures · F2 get_transfers           (HIGH — financieros fila-a-fila, NULL=global, cadena F2→F3)
FASE R2-B:  F3 get_store_analytics_advanced · get_sales_since_last_closure ·
            get_paginated_products · get_products_for_reception ·
            get_product_stock_ledger_paginated                 (MEDIUM — requieren UUID previo)
FASE R2-C:  F4 get_daily_expenses_aggregated · get_low_stock_count  (LOW — agregados)
```

Verificación de independencia que sostiene el orden (análisis LIVE de cuerpos):

1. **Ninguna de las 9 llama a otra de las 9** ni a función alguna con guard (solo consultan tablas) → el orden no altera resultados.
2. **Dependencia compartida única: `has_store_access`** — usada por los guards de todas, pero NO se modifica en ninguna fase → sin riesgo de orden.
3. **Sin dependencias de datos entre fases** (tablas distintas y no solapadas en escritura; todas READ).
4. Cada función puede migrarse de forma aislada (CREATE OR REPLACE de un solo cuerpo) → riesgo de fase acotado.

**Conclusión: la priorización F2-A → F2-B → F2-C se MANTIENE** (F1/F2 independientes entre sí y del resto; el único acoplamiento es has_store_access, que queda congelado).

Sugerencia de migración (para la fase siguiente, NO ejecutada): 3 migraciones (una por fase R2-A/B/C), cada una con `CREATE OR REPLACE FUNCTION` verbatim del cuerpo LIVE actual + guard insertado, sin tocar ACL/firmas/otros objetos.

---

## FASE 11 — MATRIZ DE TESTS (diseño previo a tocar cualquier función)

Convención: ejecutables como tests R2 independientes (fichero nuevo, p. ej. `scripts/r2-guard-tests.cjs`) con service client + JWT de prueba EN STAGING (prohibido crear usuarios en LIVE — FASE 9 del mandato R2). En LIVE la verificación será estructural (byte-equality del guard) + dinámica service_role/anon (como en R1).

| Test | F1 | F2 | F3a | F3b | F3c | F3d | F3e | F4a | F4b | Descripción |
|---|---|---|---|---|---|---|---|---|---|---|
| T1 auth + store propia → PASS | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 200 + datos solo de esa tienda |
| T2 auth + store ajena → 42501 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | usuario real de otra tienda |
| T3 auth + store_id manipulado → 42501 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | UUID desconocido / del vecino / borrado |
| T4 auth + NULL → 42501 (contrato) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | elimina NULL=todas |
| T5 usuario sin membership → 42501 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | cuenta válida sin membresía |
| T6 service_role + store → PASS | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | operativa (y NULL→todas sigue OK para service_role) |
| T7 anon → denegado | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | hoy: denegado por ACL (sin EXECUTE) — post-guard: además 42501 si la ACL cambiara |
| T8 array autorizado → PASS | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | ninguna de las 9 recibe arrays |
| T9 array parcial no autorizado → DENY | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | ídem |
| T10 array mezclado → sin fuga parcial | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | ídem (el caso array ya está cubierto por R1/KPI) |

Fail-closed de arrays: NO APLICABLE a estas 9 (no hay parámetros array). Regla registrada para funciones futuras: `[autorizada, no_autorizada]` debe DENEGAR completo salvo diseño explícito documentado (el precedente KPI 000004 valida por elemento y falla completo al primer elemento sin acceso — comportamiento a replicar).

Pruebas complementarias recomendadas (mismo fichero R2): filtrado post-guard (T1 devuelve SOLO la tienda pedida — comparar store_id/origin/destination en filas), presencia del guard en cuerpo (byte-check), y smoke de las 11 cadenas caller (C1-C11) en staging con usuarios de prueba.

---

## FASE 12 — BASELINE DE REGRESIÓN (intacto, sin modificar cifras)

Ejecutado en esta fase (read-only) para confirmar zero-touch:

```text
Layer A (LIVE):   141/141 · 0 violaciones · PIN REM-INV-2R OK
Layer B (estático): 188 · CONTRATO OK · mismos 9 LOW (SEARCH_PATH_NOT_SET, sin allowlist)
Layer C:          141/141 representadas · 0 divergencias
Pre-existing LOW: 9 — sin cambios
```

Regla para la fase de remediación:
- El contract existente (141/141) NO se sustituye ni se renumerifica; se ejecuta PRE y POST de cada migración.
- La cobertura R2 (guards + tests T1-T7) vive en ficheros R2 separados y se reporta como:
  `Existing contract: 141 · New R2 coverage: N · Total: 141 + N` — nunca como reemplazo del 141/141.
- Tras cada migración: Layer A debe seguir 141/141 (los 9 SECDEF-read no están en el surface write; su guard no debe alterar firmas que el surface detecta) y Layer B/C sin divergencias nuevas.

---

## FASE 13 — VERIFICACIÓN DE LAS 13 NO-FINDING (anti-falso-positivo)

Re-verificación read-only LIVE de las 13 (cuerpos completos en `03_prep-live-capture.json`):

| Function | Why candidate | Why protected | Protection mechanism | Authenticated behavior | Evidence |
|---|---|---|---|---|---|
| `current_user_store_ids()` | READ + tabla memberships | devuelve SOLO tiendas del caller | `auth.uid()` en WHERE | propia vista | LIVE: `m.user_id = auth.uid()` |
| `get_audit_logs(uuid,text,ts,ts,int)` | READ + p_store_id | valida acceso antes de leer | `auth.uid()` + `has_store_access` | datos propios o 42501/empty | LIVE: ambos presentes en body |
| `get_batch_store_daily_kpis(uuid[],date)` | READ + array tiendas | guard 000004 por elemento | `auth.role() <> 'service_role'` + `has_store_access(s)` + RAISE 42501 | arrays ajenos → 42501 completo | LIVE: RAISE 'ERR_UNAUTHORIZED_STORE: %' 42501 |
| `get_paginated_products_v2(int,int,uuid,…)` | READ + p_store_id | exige identidad + tienda | `auth.uid()` + `has_store_access` + RAISE 42501 ('Authentication required', 'p_store_id is required') | no-miembro → 42501 | LIVE: RAISEs presentes |
| `get_products_for_pos(uuid,text,text,int)` | READ + p_store_id | ídem | ídem | ídem | LIVE: RAISEs presentes |
| `get_transactions(uuid,text,ts,ts,…)` | READ + p_store_id | filtra por acceso | `auth.uid()` + `has_store_access` | no-miembro → sin datos/42501 | LIVE: presentes |
| `get_transferable_stores(uuid,uuid)` | READ + acepta p_user_id | **binding RC-3**: p_user_id ≠ auth.uid() salvo service_role → RAISE | RAISE 'ERR_TRANSFERABLE_STORES_UNAUTHORIZED' + `has_store_access_as` | p_user_id manipulado → RAISE | LIVE: binding verificado (modelo de referencia) |
| `has_store_access(uuid)` | READ + memberships | es el propio control | identidad auth.uid()-only | boolean fail-closed | LIVE (FASE 8 completa) |
| `has_store_role(uuid,text[])` | READ + memberships | scope caller | `auth.uid()` en WHERE | boolean de sí mismo | LIVE: `m.user_id = auth.uid()` |
| `has_store_role(uuid,uuid,text[])` | READ + acepta p_user_id | p_user_id IGNORADO para no-service_role | `CASE WHEN auth.role()='service_role' THEN p_user_id ELSE auth.uid()` | p_user_id manipulado → se evalúa al caller | LIVE: CASE verificado (patrón V2.12.9) |
| `is_admin_with_access(uuid)` | READ + p_store_id | combinación admin/membership | `is_admin() OR has_store_access` | boolean sin leak de datos | LIVE: verificado |
| `is_managed_user(uuid)` | READ + acepta p_target_user_id | scope por tienda compartida + rol manager/encargado del caller | EXISTS anidado con `usm_me.user_id = auth.uid()` | boolean only, sin datos | LIVE: verificado |
| `is_store_member(uuid)` | READ + memberships | scope caller | `auth.uid()` en WHERE | boolean de sí mismo | LIVE: verificado |

**Resultado: 13/13 confirmadas como protegidas. No se detectó ningún falso positivo del autotagger ni función vulnerable omitida.** Los dos vectores clásicos de BOLA entre las NO-FINDING (parámetros tipo user_id en `get_transferable_stores`, `has_store_role/3`, `is_managed_user`) están neutralizados por binding a `auth.uid()` o por retorno booleano scoped.

---

## FASE 14 — CRITERIOS DE ACEPTACIÓN DE LA FASE PREP

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Inventario reproducible de las 9 findings | ✅ | FASE 2 (16 puntos × 9) + `03_prep-live-capture.json` (defs byte-nivel) + `02_remediation-matrix.json` |
| 2 | Inventario de las 13 NO-FINDING | ✅ | FASE 13 (13/13 con mecanismo y evidencia LIVE) |
| 3 | Callers identificados | ✅ | FASE 5 (11 cadenas C1-C11, conteo y archivos por función; wrappers, dinámicos, tests) |
| 4 | Modelo de autorización por función | ✅ | FASE 3 (9/9 Modelo A; B/C/D/E = 0, con justificación) |
| 5 | Semántica NULL documentada | ✅ | FASE 4 (emisor por emisor; decisión A para las 9) |
| 6 | Dependencia has_store_access validada | ✅ | FASE 8 (auth.uid()-only, fail-closed, cadena is_admin verificada, advertencia de congelación) |
| 7 | Diseño específico de guard por función | ✅ | FASE 7 (spec uniforme Modelo A + 5 decisiones de diseño justificadas) |
| 8 | Impacto funcional documentado | ✅ | FASE 9 (tabla completa + 2 edges + casos especiales C2/C9/C10) |
| 9 | Matriz de tests completa | ✅ | FASE 11 (T1-T7 × 9; T8-T10 N/A con regla fail-closed registrada; pruebas complementarias) |
| 10 | Orden de remediación propuesto | ✅ | FASE 10 (R2-A/B/C confirmado con verificación de independencia) |
| 11 | Rollback strategy | ✅ | ROLLBACK PLAN (function-specific/ACL-specific/grant-specific) |
| 12 | Zero-touch confirmado | ✅ | FASE 12 (Layer A 141/141 · B 188 · C 141/141 · 0 divergencias · 9 LOW — re-ejecutados hoy) |

---

## ROLLBACK PLAN (para la fase de remediación — específico, NO genérico)

Para cada migración futura (R2-A, R2-B, R2-C):

1. **PRE (obligatorio, ya disponible como base):** capturar y congelar de LIVE:
   - definición completa (`pg_get_functiondef`) de la función objetivo — incluida en `03_prep-live-capture.json`;
   - ACL exacta (`proacl` = `{postgres,authenticated,service_role}`) y grants detallados (`aclexplode`);
   - resultados de tests PRE (Layer A 141/141, static 188/141/141, smoke del caller afectado).
2. **Cambio mínimo:** un solo `CREATE OR REPLACE FUNCTION public.<fn>(...)` por función, cuerpo = LIVE + guard insertado; sin `DROP`, sin `ALTER ... OWNER`, sin `GRANT/REVOKE` (la ACL ya es correcta y no debe regenerarse), sin tocar `has_store_access` ni ningún otro objeto.
3. **POST:** byte-check del guard (42501 + patrón) y del resto del cuerpo (diff vacío contra PRE salvo el bloque guard); Layer A 141/141; smoke dinámico service_role PASS + anon denegado.
4. **Regresión → rollback quirúrgico por función:**
   ```sql
   -- restaurar EXACTAMENTE la definición PRE de ESA función (cuerpo congelado en PRE):
   CREATE OR REPLACE FUNCTION public.<fn>(<firma PRE>) ... AS '<cuerpo PRE byte-a-byte>';
   -- re-afirmar la ACL PRE de ESA función (aunque no se tocó, por idempotencia del rollback):
   REVOKE ALL ON FUNCTION public.<fn>(<firma PRE>) FROM PUBLIC, anon, authenticated, service_role;
   GRANT EXECUTE ON FUNCTION public.<fn>(<firma PRE>) TO postgres, authenticated, service_role;
   ```
   Nada de rollback genérico por fase: si falla una función, se restaura SOLO esa función con su ACL y grants exactos, y se re-ejecuta POST + Layer A hasta 141/141.
5. **Granularidad:** una migración por fase (3 en total) para acotar el blast radius; dentro de cada fase, el rollback es por función individual.

---

## EJECUCIÓN FUTURA — NOTAS PRE-ARMADAS (insumo, no ejecución)

- **Cuerpos LIVE congelados** para F1-F4: disponibles byte-nivel en `03_prep-live-capture.json` (`funcs.<nombre>[].def`) — el punto de partida exacto para generar los `CREATE OR REPLACE` con guard, sin re-lectura.
- **Firma de cada guard** (colocación): inmediatamente después de `BEGIN` (F1/F2/F4a tienen `DECLARE v_results jsonb; BEGIN ...` — insertar tras BEGIN; F3b STABLE igual; F3c/d/e/F4b igual).
- **Errores esperados post-guard** (para los tests): `42501` con mensaje `ERR_UNAUTHORIZED_STORE: ...` — mismo formato que 000004.
- **Orden de verificación post-migración** (por función): byte-check → Layer A → dynamic service_role (200) → anon (ACL denegado) → smoke caller.
- **Criterio de éxito de la remediación:** 9/9 con guard · Layer A 141/141 · static sin divergencias nuevas · T1-T7 en staging 9×7 PASS · zero-touch en tenants protegidos (contadores bitwise) · baseline sin renumerificación.

## CLASIFICACIÓN DE EVIDENCIA DE ESTA FASE

| Evidencia | Tipo |
|---|---|
| Cifras del inventario R2 + manifest 5/5 | STATIC (repo) |
| Defs/ACL/volatilidad/search_path/argnames/rettype de 21 nombres (22 firmas) | **LIVE DIRECT** (SELECT-only vía Management API) |
| Grants EXECUTE detallados (aclexplode: anon/PUBLIC ausentes) de las 9 | **LIVE DIRECT** |
| Cuerpos de has_store_access/is_admin/is_global_admin | **LIVE DIRECT** |
| Policies RLS de stores (stores_select_authenticated = member o global admin) | **LIVE DIRECT** |
| Análisis de cuerpos F1-F4 (filtros, joins, NULL, tablas, DML) | **LIVE DIRECT** (cuerpos) + STATIC (razonamiento) |
| Cadenas de callers C1-C11 (hooks/rutas/SSR/wrappers/allowlist V2.6) | STATIC (búsqueda completa del repo) |
| Baseline Layer A/B/C re-ejecutado hoy sin cambios | **LIVE DIRECT** + STATIC |

Producción: **cero escrituras** — solo SELECT; sin usuarios/tiendas/registros/migraciones/policies/funciones/datos de prueba creados; sin cambios de código, UI, ACL, RLS ni migraciones en el repo.

---

R1: REMEDIATED AND VERIFIED
R2: FINDINGS CONFIRMED
R2 REMEDIATION: PREPARED
PRODUCTION CHANGES THIS PHASE: 0
