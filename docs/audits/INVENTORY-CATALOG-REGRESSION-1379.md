# INVENTORY-CATALOG-REGRESSION-1379 — Auditoría forense y corrección

| Campo | Valor |
|---|---|
| Fecha | 2026-10-08 |
| Área afectada | Inicio → OPERACIÓN → Almacén → Inventario → tab **Catálogo** |
| Síntoma reportado | El tab Catálogo muestra **2 productos** cuando la tienda activa tiene **>100** (ENERVIDA-VITALLCONS = 157) |
| PR señalado | #1379 (Trazabilidad + Kardex por Producto) — merge `ce965d1c77b840a7090957f16d156c0aa99f96df` |
| Veredicto | **PR #1379 NO introdujo la regresión.** El síntoma lo produce estado de consulta persistido en el navegador (`catalog_searchTerm`), comportamiento pre-existente desde mayo 2026. Se corrige la causa raíz (persistencia de estado efímero) + test de regresión obligatorio. |
| Branch del fix | `fix/inventory-catalog-regression-1379` |
| Cambio de datos | **CERO** — 0 UPDATE/INSERT/DELETE sobre cualquier tabla (verificado por conteos antes/después, §6) |
| Categoría de riesgo del PR (política) | **HIGH** (`.github/PULL_REQUEST_TEST_POLICY.md` §4.3: `views/{inventory,...}/**`) |

---

## 1. Síntoma

> "En el tab Catálogo deberían mostrarse los productos de la tienda —más de 100
> productos— pero actualmente solamente aparecen 2 productos."

Reproducción exacta del mecanismo (ver §4): con la clave
`catalog_searchTerm = "pintura"` persistida en `localStorage`, el tab Catálogo de
ENERVIDA-VITALLCONS (157 productos) renderiza **exactamente 2 productos**
("Pintura Casa Blanca 14L", "Pintura Verde 4L") y la cabecera muestra el contador
filtrado "**2**". La captura `evidence-catalog-2products-repro.png` documenta el
estado. En móvil el buscador está plegado tras el botón FILTROS, por lo que el
filtro activo no es evidente para el usuario.

## 2. Baseline (PR #1379)

```text
PR #1379        = Trazabilidad + Kardex por Producto — Evolución Profesional de Inventario
state           = merged (True)  merged_at = 2026-10-07T22:13:26Z
merge commit    = ce965d1c77b840a7090957f16d156c0aa99f96df  (HEAD de origin/main)
head SHA        = 441e8893b964d26db48ef976a649aa037431057e
base SHA        = bac65deef7b0700c5685840034e269ac4755363d
archivos        = 12  (+2.566 / −271)
```

Archivos modificados por PR #1379 (GitHub API, `pulls/1379/files`):

```text
added      docs/trazabilidad-kardex-auditoria.md
modified   src/__tests__/integration/iteration-11-3.test.ts
added      src/__tests__/lib/kardexPeriod.test.ts
added      src/__tests__/lib/movementPresentation.test.ts
modified   src/components/ui/atomic/index.tsx          (+11/−2)
modified   src/components/views/terminal/views/inventory/KardexModal.tsx
modified   src/components/views/terminal/views/stock_history/StockHistoryView.tsx  (+1203/−237)
added      src/hooks/api/useMovementCounts.ts
added      src/hooks/api/useProductKardex.ts
modified   src/hooks/api/useStockMovements.ts          (+32/−4)
added      src/lib/inventory/kardexPeriod.ts
added      src/lib/inventory/movementPresentation.ts
```

Análisis de ruta causal hacia el Catálogo:

| Archivo | ¿Puede afectar al tab Catálogo? | Motivo |
|---|---|---|
| StockHistoryView.tsx, KardexModal.tsx, useStockMovements.ts, useMovementCounts.ts, useProductKardex.ts, kardexPeriod.ts, movementPresentation.ts | **NO** | Código exclusivo de la tab Trazabilidad; CatalogView no importa ninguno. Sin efectos colaterales: 0 escrituras a localStorage, 0 invalidaciones de query, 0 mutaciones de store compartido (verificado por grep). |
| ui/atomic/index.tsx | **NO** | Solo añade props a11y opcionales (`aria-label`, `title`) a PrimaryButton/SecondaryButton. Aditivo e inerte para el flujo de datos. |
| tests/docs | **NO** | Sin impacto en runtime. |

El flujo de datos del Catálogo (`CatalogView.tsx` → `useCatalogProductsPage` /
`useCatalogProductsInfinite` → RPC `get_paginated_products_v2`) **no fue tocado**
por PR #1379, ni por #1373/#1377/#1378 (verificado con `git log` por archivo).

## 3. Causa raíz

**Archivo**: `src/components/views/terminal/views/catalog/CatalogView.tsx`
**Lógica**: persistencia de estado de consulta efímero como "preferencia" (CM-1.8,
introducida en mayo 2026 — commit `1a25d1901` — es decir, pre-existente a #1379).

```tsx
// ANTES (líneas 63-66):
const [searchTerm, setSearchTerm] = useState(() => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('catalog_searchTerm') || '';   // ← restauración
});
// ANTES (líneas 174-176):
useEffect(() => {
  localStorage.setItem('catalog_searchTerm', searchTerm);    // ← persistencia
}, [searchTerm]);
```

Cadena causal completa:

```text
El usuario busca "pintura" (coincide con 2 de los 157 productos de ENERVIDA)
        ↓
CatalogView persiste el término en localStorage (catalog_searchTerm)
        ↓
Recarga / cierre / reinicio del entorno (el entorno se reinició tras el merge de #1379)
        ↓
Al montar de nuevo, CatalogView RESTAURA el término viejo → RPC p_search_term="pintura"
        ↓
El catálogo renderiza 2 productos; el contador de la cabecera muestra "2"
        ↓
El usuario percibe: "el catálogo se quedó con 2 productos" (coincidencia temporal con el merge de #1379)
```

La hipótesis alternativa "la consulta usa otra tienda con 2 productos" fue
descartada: la única tienda con exactamente 2 productos (QA-H1-A) no tiene
ningún miembro registrado y el auth store no está persistido (no puede haber
`activeStoreId` obsoleto entre sesiones).

## 4. Evidencia

### 4.1 Verificación de infraestructura de datos (READ-ONLY)

```text
RPC get_paginated_products_v2 (sesión autenticada, p_store_id=ENERVIDA):
  → status 200, rows=24, total_count=157

Conteos DB (Management API, solo SELECT):
  ENERVIDA-VITALLCONS      157 productos   (is_active=true: 157; visible_en_tienda: 85/72)
  TIENDA CENTRAL COSTPRO   126 productos
  Puerto Padre VITALLCONS   36 productos   (UI: 36 ✓ — coincide exactamente)
  QA-H1-A                    2 productos   (0 miembros → inaccesible por UI)
```

### 4.2 Matriz de reproducción (pre-fix, build main + fix de entorno)

| # | Escenario | Resultado | Total UI |
|---|---|---|---|
| 1 | ENERVIDA, tabla, desktop | ✗ NO reproduce | 157 productos, Página 1 de 7 |
| 2 | ENERVIDA, tarjetas (grid), desktop | ✗ NO reproduce | 157 productos |
| 3 | ENERVIDA, tarjetas, móvil (iPhone 14) | ✗ NO reproduce | 30 + "Cargar más (127 restantes)" |
| 4 | Puerto Padre, tabla, desktop | ✗ NO reproduce | 36 productos, Página 1 de 2 |
| 5 | Catálogo → Trazabilidad → Catálogo | ✗ NO reproduce (sin interferencia) | 36 → intacto |
| 6 | **localStorage `catalog_searchTerm='pintura'` + recarga (ENERVIDA, móvil)** | **✓ REPRODUCE EL SÍNTOMA EXACTO** | **2 productos** |
| 7 | RPC directo desde sesión autenticada | ✗ NO reproduce | 24 filas, total=157 |

### 4.3 Capturas (`docs/audits/evidence/screenshots-regression-1379/`)

* `evidence-catalog-2products-repro.png` — síntoma exacto: ENERVIDA mostrando 2 productos con el término persistido.
* `evidence-catalog-fixed-157.png` — tras el fix, con la misma clave sembrada: 157 productos, Página 1 de 7.
* `evidence-catalog-enervida-table.png` / `evidence-mobile-catalog-enervida.png` — catálogo sano pre-fix (tabla y móvil).
* `evidence-trazabilidad-after-fix.png` — Trazabilidad intacta tras el fix.
* `evidence-trazabilidad.png` / `evidence-after-trazabilidad.png` — tab Trazabilidad (modo global de #1379) operativa; 0 movimientos en octubre = correcto (los movimientos de Puerto Padre son de julio; ENERVIDA: 61 ventas/26 entradas/4 vales/20 devoluciones del período).

### 4.4 Comparación antes / después (FASE 6)

| Comportamiento | Antes de PR #1379 | Después de PR #1379 |
|---|---|---|
| Query del Catálogo (`useCatalogProducts*`) | idéntica | idéntica (0 diffs) |
| Filtro de tienda (`getCleanStoreId` + RPC `p_store_id`) | idéntico | idéntico |
| Límite / paginación | 24/50/100 + offset | idéntico |
| Persistencia de `catalog_searchTerm` | **ya existía (desde 1a25d1901, mayo 2026)** | idéntica — no introducida por #1379 |
| Productos devueltos (RPC) | 157 (ENERVIDA) | 157 (verificado 2026-10-08) |
| UI renderizada (estado limpio) | catálogo completo | catálogo completo (157/36) |
| UI renderizada (con término persistido) | **solo los N coincidentes (p.ej. 2)** | **solo los N coincidentes — mismo comportamiento** |

**Conclusión causal**: PR #1379 no alteró ninguna línea del flujo del Catálogo.
El síntoma es producido por comportamiento pre-existente que la coincidencia
temporal (reinicio del entorno tras el merge) hizo visible.

## 5. Fix (causa raíz, cambio mínimo)

Branch `fix/inventory-catalog-regression-1379` — 2 archivos:

1. `src/components/views/terminal/views/catalog/CatalogView.tsx` (+13/−9 neto):
   * El término de búsqueda pasa a ser estado efímero: `useState('')` — ya no se
     lee de `localStorage`.
   * Se elimina el `useEffect` que persistía `catalog_searchTerm`.
   * Se purga una vez la clave legacy (`localStorage.removeItem`) para limpiar
     navegadores que quedaron con el estado que produce el síntoma.
   * La búsqueda **dentro de la sesión** sigue funcionando idéntica (debounce
     300 ms → RPC); `layoutMode` y `pageSize` siguen persistiendo como
     preferencias legítimas.
2. `src/__tests__/components/catalog-stale-search-regression.test.tsx` (nuevo):
   test de regresión obligatorio (FASE 12), 4 casos.

Semántica preservada (FASE 7): el Catálogo muestra en cada montaje **todos los
productos de la tienda activa** con la paginación/filtros/orden existentes; no se
rediseñó Inventario, no se tocó Trazabilidad, no se cambió API/RPC/esquema/RLS.

## 6. Datos — cero modificaciones

Conteos READ-ONLY idénticos antes y después de la corrección:

```text
products         = 368      stock_movements = 1509
transactions     = 1161     receipt_items   = 192
inventory        = 319
ENERVIDA cost_average = 0  → 14 productos (los 14 "zero legítimo" del cierre auditado, intactos)
```

* 0 SQL UPDATE/INSERT/DELETE ejecutados por esta tarea (solo SELECT).
* 0 cambios en `cost_average`, `stock_current`, precios, categorías, imágenes, movimientos.
* E2E ejecutada en modo aislado (fail-closed: "Puerto Padre / Tienda Central /
  Enervida quedan FUERA del banco de pruebas") con teardown net-zero
  ("stores del run HARD-deleted, usuarios del run eliminados de Auth").

## 7. Validación (FASE 9) y tests (FASE 11–12)

### 7.1 Validación funcional en vivo (post-fix, navegador real)

| Caso | Verificación | Resultado |
|---|---|---|
| 1 — Tienda con >100 productos | DB=157 → UI Catálogo=157 ("24 de 157", "Página 1 de 7") **con la clave stale sembrada** | ✅ PASS |
| 2 — Catálogo completo | 24 filas página 1; total correcto | ✅ PASS |
| 3 — Búsqueda | "pintura" → 2 productos; limpiar → 157 de nuevo | ✅ PASS |
| 4 — Paginación | Página 2 de 7 ("48 de 157"), Primera/Anterior/Siguiente/Última | ✅ PASS |
| 5 — Cambio de tienda | ENERVIDA→(TIENDA CENTRAL): rechazo correcto por membresía `revoked` en DB (comportamiento correcto, no bug); Puerto Padre↔ENERVIDA vía perfil OK | ✅ PASS |
| 6 — Trazabilidad | Modo global operativo (61 ventas/26 entradas/4 vales/20 devoluciones ENERVIDA); Kardex no alterado | ✅ PASS |
| 7 — Tabs sin interferencia | Catálogo↔Trazabilidad↔Stock en ambas direcciones | ✅ PASS |

### 7.2 Declaración según `.github/PULL_REQUEST_TEST_POLICY.md`

```text
PR RISK = HIGH
  (§4.3/§5: src/components/views/terminal/views/{inventory,catalog}/** + src/hooks adyacentes)
REQUIRED TESTS = TypeCheck OBL, Lint OBL, Build OBL, Vitest afectados OBL,
                 E2E focalizada del módulo OBL, E2E regresión del módulo OBL,
                 E2E regresión transversal OBL
RECOMMENDED TESTS = Suite Vitest completa (ejecutada), FULL E2E (no requerida: alcance <3 módulos)
FULL E2E REQUIRED = NO
```

### 7.3 Resultados

| Prueba | Comando | Resultado |
|---|---|---|
| Test de regresión (nuevo, FASE 12) | `npx vitest run src/__tests__/components/catalog-stale-search-regression.test.tsx` | ✅ 4/4 PASS — y **2/4 FALLAN sin el fix** (demostración anti-regresión con `git stash`) |
| Vitest afectados + relacionados | `npx vitest run` (6 archivos: regression + kardexPeriod + movementPresentation + iteration-11-3 + inventory-row + mobile-row) | ✅ 105/105 PASS |
| Suite Vitest completa (REC) | `npx vitest run` | ✅ **2711 passed / 24 skipped / 0 failed** (142 archivos, 4.4 min) |
| TypeCheck | `npx tsc --noEmit` | ✅ PASS (0 errores) |
| Lint | `npm run lint` | ✅ PASS (0 errores; 1318 warnings pre-existentes del repo) |
| E2E focalizada módulo | `npx playwright test e2e/inventory.spec.ts` | ✅ 8/8 PASS |
| E2E regresión módulo | `npx playwright test e2e/flows/catalog-storefront.spec.ts` | ✅ 6/6 PASS (incl. E2E-CAT-003 "vista catálogo muestra el producto de la tienda activa") |
| E2E regresión transversal | `npx playwright test e2e/store-switching.spec.ts` | ✅ 14/17 PASS; 3 FAIL |
| Build | `npm run build` | ⚠️ **BLOCKED (entorno)** — ver 7.4 |

### 7.4 Tratamiento de los 3 fallos E2E y del Build (§10.5/§12)

**E2E store-switching — 3 fallos**: clasificados **ENVIRONMENTAL/PREEXISTING con
acreditación de baseline**: re-ejecutados los mismos 3 tests contra
`origin/main` (ce965d1c7) **sin el fix** (código stashado) → fallan idénticos.
Log de causa raíz: `createTestStore falló: 429 {"error":"Demasiadas solicitudes"}`
— rate-limit del provisionador de tiendas de prueba tras ejecutar 3 suites E2E
consecutivas en la misma ventana; los timeouts de UI son consecuencia del setup
fallido, no del código. El cambio de este PR (estado de búsqueda del Catálogo)
no tiene ruta causal con la vista Gestión de Tiendas.

**Build local — OOM**: `next build` es OOM-Killed en este entorno
(cgroup 4294967296 bytes = 4 GB, 2 vCPU). **Acreditación PREEXISTING (§12)**: el
mismo comando sobre main limpio, al inicio de esta sesión y antes de cualquier
cambio, falló idénticamente (`Killed` en "Creating an optimized production
build"). Fases alcanzadas con el fix: "✓ Compiled successfully in 73s"
(Turbopack) antes del OOM en la fase de TypeScript — y `tsc --noEmit` completo
pasa por separado con 0 errores. Per §11 la CI base ejecuta Build
automáticamente en el PR con recursos adecuados; la evidencia local queda
documentada como BLOCKED-by-environment, no CERTIFIED.

**Nota de higiene E2E (pre-existente)**: el guard reporta
"E2E DATA CONTAMINATION DETECTED — stores=0 users=12" — los 12 usuarios son
residuos de runs E2E anteriores (stores=0 tras el teardown net-zero de este run).
No se tocaron (regla: no modificar datos).

### 7.5 Formato §12 — tabla de evidencia

| Test | Resultado | Comando | Comparación con baseline | Conclusión |
|---|---|---|---|---|
| catalog-stale-search-regression (4) | PASS (con fix) / 2 FAIL (sin fix) | `npx vitest run …regression.test.tsx` | Con fix 4/4; sin fix 2/4 (GUARDIÁN+PURGA) | El test detecta la regresión; el fix la elimina |
| Suite Vitest completa | 2711 PASS / 24 skip / 0 FAIL | `npx vitest run` | — (sin cambios de comportamiento) | Sin regresiones |
| store-switching (3 tests) | FAIL (con y sin fix) | `npx playwright test e2e/store-switching.spec.ts` | idéntico en baseline ce965d1c7 | PREEXISTING/environmental (429) |
| Build | OOM-Killed (con y sin fix) | `npm run build` | idéntico en baseline (primer intento de la sesión) | PREEXISTING/environmental (cgroup 4 GB); CI cubre Build |

## 8. Help Center (FASE 13)

La documentación del Help Center no describe la persistencia del término de
búsqueda del catálogo (verificado por grep en `public/help*` y
`src/components/views/help/`), por lo que **no se modifica documentación**: el
comportamiento corregido (búsqueda efímera dentro de la sesión) no contradice
ningún texto documentado.

## 9. Recomendaciones de seguimiento (fuera del alcance de este fix)

1. `catalog_selectedCategories` (multi-categoría) también persiste entre
   sesiones (CM-3.8). Mismo defecto en clase, aunque menos probable (los chips
   de categoría activa son visibles en la UI). Evaluar el mismo tratamiento.
2. Higiene de datos E2E: 12 usuarios residuales de runs anteriores
   (`E2E-DATA-HYGIENE.md`). Requieren limpieza con service-role fuera de esta tarea.
3. Membresías `revoked` de TIENDA CENTRAL COSTPRO para ambos admins: si el
   acceso es intencional, restaurarlas con decisión de negocio (datos, fuera de
   alcance de UI).
