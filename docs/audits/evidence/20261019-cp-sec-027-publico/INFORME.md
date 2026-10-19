# EVIDENCIA — CP-SEC-027: catálogo público sin exposición de costos (2026-10-19)

**Proyecto:** COSTPRO 4 Multitienda · **BD viva:** Supabase `wthkddeleylijmonclxg`
**Tarea:** CP-SEC-027 (P1) — lectura pública (anon) de `cost_average`/costos de productos vía PostgREST con la clave publishable. Origen: hallazgo F3 del protocolo DT-03/Decisión B (ver `../20261019-dt03-matriz-acceso/INFORME.md`).
**Corrección decidida por el propietario:** vista `public_catalog_v` (instrucción operativa DT-03/PR #1422 del 2026-10-19, sección 2.A).
**Rama:** `fix/cp-sec-027-catalogo-publico` (creada desde `main`; PR independiente de #1422 — justificación abajo).

---

## 1. Estado VIVO pre-fix (introspección read-only + verificación PostgREST)

Método: SELECT read-only vía Management API + requests GET anónimos vía PostgREST. Scripts: `scripts/cpsec027_live_introspection.js`, `scripts/cpsec027_post_migration_verify.js`. Cero escrituras, cero DDL.

| # | Hecho verificado | Evidencia |
|---|---|---|
| 1 | `products_public_read_anon` (SELECT TO anon: `is_active AND visible_en_tienda`) permite leer TODAS las columnas de `products`, incluidas `cost_average` (WAC real), `cost_price`, `precio_empresa`, `supplier`, `min_stock`, `tenant_id` | `raw/03_politicas_vivas.json` |
| 2 | **103/103 productos públicos tienen `cost_average` real ≠ 0 legible por anon** | `raw/08_exposicion_actual.json` |
| 3 | `GET /rest/v1/products?select=cost_average` con la clave publishable → **HTTP 200** (confirmación empírica de la exposición) | `raw/10_verificacion_pre_migracion.txt` (18/18 checks fallan pre-fix) |
| 4 | `stores_select_anon` (SELECT TO anon: `is_active`) expone TODAS las columnas de `stores`: `tenant_id`, `bank_account`, `nit`, `signature_url`, `stamp_url`, `created_by`, `backup_restore_protected` | `raw/03_politicas_vivas.json` |
| 5 | `"Variantes públicas - lectura"` (SELECT TO **anon,authenticated** — policy creada OUT-OF-BAND, sin representación en migraciones) expone `precio_empresa` y `conversion_factor` de variantes de productos visibles | `raw/03_politicas_vivas.json` |
| 6 | RLS habilitado en las 4 tablas; el rol anon tiene el paquete completo de privilegios por defecto (SELECT/INSERT/...) — las policies son la única fila de defensa de filas; NO hay defensa de columnas | `raw/02_rls_status.json`, `raw/04_grants_tabla.json` |
| 7 | No existe ninguna vista de catálogo público previa (`public_catalog_v` no existía) | `raw/05_vistas_existentes.json` (0 filas) |
| 8 | `get_low_stock_count` NO tiene grant EXECUTE a anon en la BD viva (pese a que la migración 20260630120000 lo concede) — sin exposición activa por esa vía | `raw/06_rpc_grants_anon.json` |

## 2. Consumidores ANON reales del catálogo (investigación de código, corrije la conclusión previa)

La investigación del 2026-10-18 (commit 4ac12bcf9, rama PR #1422) concluyó que «la policy anon no tiene consumidor activo». **La investigación de hoy la corrige:** `createServerClient()` (`src/lib/supabaseClient.ts`) usa la clave **anon** sin JWT de usuario → todo SSR que lo usa consulta PostgREST como rol `anon`:

| Consumidor | Tablas vía anon | Detalle |
|---|---|---|
| `src/app/tienda/[slug]/page.tsx` (vitrina SSR) | `stores` (×3: generateStaticParams, generateMetadata, página), `products` (fallback), `product_variants`, `inventory` (fallback) | El fallback de productos seleccionaba explícitamente `cost_price, cost_average, min_stock` (fetch de costos al cliente SSR — mitigado solo por el mapeo FIX-SEC-H6 que los descarta antes de renderizar) |
| `src/app/api/storefront/[slug]/route.ts` (API pública) | `stores`, `products`, `product_variants` (embed) | Selects ya saneados (FIX-SEC-H6); sin costos |

Sin consumidor anon: publish flows de WhatsApp/Telegram (service-role, línea 74/71), ruta RPC de la vitrina (`getSupabaseAdminSafe`), resto de rutas API (withAuth/admin). `inventory` NO tiene policy anon → el fallback de stock de la vitrina siempre devolvía 0 (falla silenciosa preexistente). El query de variantes de la vitrina filtraba `.eq('is_active', true)` sobre una columna **inexistente** en `product_variants` → fallaba silenciosamente (variantes nunca visibles en vitrina — bug preexistente corregido de paso por la vista).

## 3. Corrección implementada (rama `fix/cp-sec-027-catalogo-publico`)

**Migración `supabase/migrations/20261019000001_cp_sec_027_catalogo_publico.sql`** (nueva, no toca ninguna existente):

1. **`public_catalog_v`** (security_barrier): columnas de presentación EXACTAS de los flujos públicos (`id, store_id, name, description, sku, price, price_currency, price_visible, stock_visible, stock_current, on_promotion, unit_of_measure, image_url, public_image_url, category, is_active, visible_en_tienda`) con `WHERE is_active AND visible_en_tienda` (paridad de filas con la policy retirada). **Excluidas:** `cost_average, cost_price, precio_empresa, precio_empresa_currency, supplier, min_stock, tenant_id, cost_sheet_id, status, is_complete, has_movements, fc_auto_enabled, barcode, barcode_type, category_id, search_vector, created_at, updated_at`.
2. **`public_storefronts_v`** (security_barrier): columnas de vitrina de `stores` (paridad con los 3 consumidores SSR + API; `WHERE is_active`). **Excluidas:** `tenant_id, bank_account, nit, signature_url, stamp_url, created_by, latitude, longitude, is_archived, archived_at, archived_by, backup_restore_protected`.
3. **`public_variants_v`** (security_barrier): variantes de productos públicos (`WHERE EXISTS producto padre is_active AND visible_en_tienda` — más estricta que la policy out-of-band previa, que no verificaba is_active del padre). **Excluidas:** `precio_empresa` (sensible según el propio FIX-SEC-H6), timestamps.
4. **GRANT SELECT de las 3 vistas a anon** (solo anon; authenticated/service_role no lo necesitan).
5. **DROP** `products_public_read_anon`, `stores_select_anon`; la policy de variantes se **recrea sin anon** (mismo predicado para authenticated — cero cambio de comportamiento con sesión; primera representación en el stream de migraciones de una policy que existía solo out-of-band).
6. **REVOKE SELECT** de `products`, `stores`, `product_variants` al rol anon (defensa en profundidad: sin privilegio, una policy reaparecida no basta).
7. Procedimiento de **reversión completo** documentado dentro del archivo (recrea las 3 policies + re-grants + drop vistas) y **despliegue en 3 fases** (aditiva → código → retirada) para ventana corta sin interrupción.

**Cambios de código (2 archivos, los únicos consumidores anon):**
- `src/app/tienda/[slug]/page.tsx`: las 3 consultas de tiendas → `public_storefronts_v`; fallback de productos → `public_catalog_v` (select sin costos; stock desde la vista, eliminada la consulta a `inventory` que siempre devolvía 0 para anon); variantes → `public_variants_v` (sin `precio_empresa`; eliminado el filtro de columna inexistente).
- `src/app/api/storefront/[slug]/route.ts`: tienda → `public_storefronts_v`; productos → `public_catalog_v`; variantes → consulta separada a `public_variants_v` (misma forma de respuesta `product_variants(id, name, sku, price)`; evita depender de embedding de vistas en PostgREST).

**Sin cambios:** publish flows (service-role), ruta RPC de la vitrina, RLS de authenticated, RPCs, cualquier otra tabla.

## 4. Pruebas y verificación

| Prueba | Resultado |
|---|---|
| `src/__tests__/integration/cpsec027-public-catalog.test.ts` (nuevo: 26 invariantes A-migración/B-código/C-evidencia) | **26/26 PASS** |
| Suite completa `vitest run` (regresión) | **3196 passed / 0 failed** (189 archivos) |
| `scripts/security-contract-test-static.cjs` (contrato de seguridad CI) | **CONTRATO OK** — Capa A 137/137 · Capa B 198, 17 baseline, **0 nuevas** · Capa C 137/137, **0 divergencias** |
| Smoke local de compilación (pm2 dev, routes compiladas on-demand) | Storefront API → 404 «Tienda no encontrada» (esperado pre-migración: la vista aún no existe en la BD viva; degradación elegante, sin 500). Vitrina → not-found (idéntico al comportamiento para slug inexistente — verificado con control). |
| Verificación viva pre-fix (`scripts/cpsec027_post_migration_verify.js`, read-only) | **18/18 checks FALLAN** — exactamente el estado que la migración corrige (`raw/10_verificacion_pre_migracion.txt`) |

**Verificación post-migración (cuando el propietario autorice):** el mismo script `cpsec027_post_migration_verify.js` debe dar **0 fallos** (tablas → 401/403 para anon; vistas → 200; columnas sensibles → 400 en vistas; policies/grants verificados vía catálogo). Además: E2E-SF-001/002/003 (`e2e/flows/catalog-storefront.spec.ts`) como puerta funcional, y smoke manual de `/tienda/puerto-padre-vitallcons`.

## 5. Por qué PR independiente desde `main` (decisión de ubicación)

Criterios del propietario (instrucción del 2026-10-19, §2.A): implementar en #1422 **solo si** puede hacerse «sin mezclar cambios ajenos ni aumentar el riesgo»; si «requiere una migración independiente, tiene un riesgo distinto o complica la revisión del PR #1422» → PR separado desde `main` con alcance exclusivo. **Se cumplen los tres:**

1. **Migración independiente:** la corrección exige su propia migración DDL/DCL (20261019000001) distinta de la de #1422 (20261018000000, pendiente de Decisión E). Acoplarlas forzaría una sola decisión de aprobación sobre dos clases de riesgo no relacionadas.
2. **Riesgo distinto:** #1422 añade gates internos a RPCs (validate_operation_date); este cambio modifica la **superficie pública anon** (vitrina + storefront API + verificación publish). Modos de fallo y procedimientos de reversión diferentes.
3. **Complicaría la revisión:** #1422 está CI-verde y con revisión completa pendiente solo de Decisión E; añadir 3 vistas + cambios en vitrina forzaría re-revisar todo el PR y re-certificar la superficie.
4. **Cero dependencias circulares:** 0 archivos en común entre #1422 y este PR (verificado con `git diff origin/main...HEAD`). Ambos pueden fusionarse en cualquier orden.

## 6. Pendiente de decisión del propietario

- **Aplicación de la migración a la BD viva** (Decisión E-adjacente): NO se aplicó nada. Procedimiento recomendado en 3 fases dentro del propio archivo. Tras autorización: ejecutar `scripts/cpsec027_post_migration_verify.js` (esperado 0 fallos) + E2E-SF.
- **¿Algún consumidor externo/futuro necesita catálogo anónimo directo y con qué columnas?** La superficie pública pasa a ser exactamente `public_catalog_v`/`public_storefronts_v`/`public_variants_v`.
- Observación vinculada (sin cambio, scope disciplinado): la policy "Variantes públicas - lectura" también permite a **authenticated** de cualquier tenant leer variantes de productos visibles de cualquier tienda (OR-eada con la policy de membership) — pertenece al análisis de convergencia de capas CP-SEC-025, no a este fix.

## 7. Trazabilidad

- Introspección read-only: `scripts/cpsec027_live_introspection.js` → `raw/01..09_*.json`.
- Verificación pre-fix con clave publishable: `raw/10_verificacion_pre_migracion.txt` (18/18 fallos esperados).
- Tests de regresión: `src/__tests__/integration/cpsec027-public-catalog.test.ts` (ejecutables en CI).
- Verificación post-fix preparada: `scripts/cpsec027_post_migration_verify.js` (read-only).
- Reversión: procedimiento completo dentro de la migración (auditable, idempotente).
- Migración: `supabase/migrations/20261019000001_cp_sec_027_catalogo_publico.sql`.
