# INCIDENTE — ERROR UUID EN INVENTARIO → CATÁLOGO (TIENDA CENTRAL COSTPRO)

**Proyecto:** COSTPRO 4 Multitienda (`Nardian90/Costpro`)
**Fecha:** 2026-10-15
**Módulo afectado:** `Inicio → OPERACIÓN → Almacén → Inventario → pestaña Catálogo`
**Tienda afectada:** TIENDA CENTRAL COSTPRO · **Referencia sin defecto:** ENERVIDA-VITALLCONS
**Severidad:** Alta (módulo completo inutilizable en una tienda operativa)
**Rama:** `fix/uuid-catalogo-central-costpro` · Base: `main` @ `9fdf673` (PR #1406 mergeado)

---

## 1. Resumen ejecutivo

El catálogo de inventario de **TIENDA CENTRAL COSTPRO** mostraba «Ha ocurrido un error» con
una validación Zod (`Invalid UUID` en `p_store_id`). La causa raíz fue **una sobre-validación
en el cliente**: el esquema `catalogProductsV2ParamsSchema` (`src/hooks/api/useCatalogProducts.ts`)
usaba `z.string().uuid()` de **Zod 4**, que exige bits de versión `[1-8]` y de variante `[89ab]`
según RFC 4122/9562, mientras que el **UUID canónico de Central**
(`d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576`, variante `e`) es un UUID sintético-legítimo que
**Postgres acepta** (el tipo `uuid` admite cualquier hex 8-4-4-4-12) y que la RPC
`get_paginated_products_v2` procesa correctamente. El `.parse()` lanzaba **antes de cualquier
llamada de red**, y el error crudo (JSON de Zod) se renderizaba tal cual.

No se envió nunca un nombre de tienda, una cadena vacía ni un ID ajeno: **el valor enviado era
siempre el UUID correcto**; lo que fallaba era la validación, no el dato. Es el **mismo patrón
de defecto ya corregido dos veces en el repo** (`accounts-payable` el 2026-07-14 y `reverse`
en V2.4.4, con comentarios explícitos), reintroducido en el hook v2 del catálogo.

**Corrección:** alinear la validación con el contrato real de la RPC usando el `uuidRegex`
canónico del proyecto (permisivo 8-4-4-4-12) y convertir el guard silencioso en un
error controlado con mensaje útil. **Verificado en vivo**: Central carga «24 de 126 productos»,
Enervida «24 de 161» sin regresión, y la suite completa queda en **2.947 passed / 0 failed**.

---

## 2. Fase 1 — Auditoría de solo lectura (evidencia)

### 2.1 Identidades reales de las tiendas (consultadas en BD, no deducidas del nombre)

| Tienda | UUID canónico (`stores.id`, tipo `uuid`) | `is_active` | Membresía `admin@demo.com` |
|---|---|---|---|
| **TIENDA CENTRAL COSTPRO** | `d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576` | `true` | `active` (admin) |
| **ENERVIDA-VITALLCONS** | `5e6fe821-5465-48b1-b3f1-3aa3182edc38` | `true` | `active` (admin) |

El UUID de Central tiene **variante `e`** (no RFC 4122) — válido para Postgres, rechazado por
Zod estricto. El de Enervida tiene variante `b` — pasa ambas validaciones. Esa diferencia
explica por qué el defecto solo se manifestaba en Central.

### 2.2 Función SQL y firma

```
get_paginated_products_v2(
  p_limit integer DEFAULT 24, p_offset integer DEFAULT 0,
  p_store_id uuid DEFAULT NULL, p_search_term text DEFAULT NULL,
  p_category text DEFAULT NULL, p_sort_key text DEFAULT 'name',
  p_sort_dir text DEFAULT 'asc', p_stock_filter text DEFAULT 'all',
  p_active_filter text DEFAULT 'all'
)
```

Protecciones server-side verificadas en el cuerpo (solo lectura): exige `auth.uid()`,
`p_store_id IS NULL` solo para admins, `has_store_access(p_store_id)` en el WHERE, y scoping
por `tenant_id`. **El backend nunca fue el problema.**

### 2.3 Origen del valor y primer punto de fallo

Cadena completa (todas las estaciones verificadas):

1. `profiles.active_store_id` de `admin@demo.com` = `d1c4ba0e-…` (**valor correcto**).
2. La vista lo propaga íntegro: `InventoryView` → `CatalogView` →
   `useCatalogProductsInfinite/Page({ storeId: user?.activeStoreId })` — sin corromperse.
3. Guard antiguo `if (cleanStoreId && !isUuidRegex.test(cleanStoreId)) return empty` usaba el
   `uuidRegex` **permisivo** del proyecto → el UUID de Central **pasaba el guard**.
4. **PUNTO DE FALLO:** `fetchProductsPage()` → `catalogProductsV2ParamsSchema.parse()` →
   `z.string().uuid()` (Zod 4.4.3, estricto en variante) → **lanza** `Invalid UUID`
   en `path: ["p_store_id"]` → `catalogInfinite.error` / `catalogPage.error` →
   `StateRenderer` renderiza «Ha ocurrido un error» + el JSON crudo.
5. **La RPC nunca se invocó** en el flujo defectuoso (verificado en la pestaña de red del
   navegador: cero llamadas a `get_paginated_products_v2` con Central activa).

### 2.4 Reproducción en vivo (pre-fix, sesión real `admin@demo.com`)

| Paso | Observado |
|---|---|
| Central activa → Inventario → Catálogo | «Ha ocurrido un error» + `[{"code":"invalid_format","format":"uuid","path":["p_store_id"],"message":"Invalid UUID"}]` (captura `repro-central-error-antes.png`) |
| Mismo flujo en Enervida | Catálogo carga «24 de 161 productos» sin error (captura `repro-enervida-catalogo-funciona-antes.png`) |
| Red en Central (pre-fix) | Solo `get_paginated_products` (v1, pestaña Stock). **Cero** llamadas v2 |
| Consola | Sin JS exceptions: el fallo era el error state de React Query |

### 2.5 Hipótesis descartadas (con su verificación)

| Hipótesis | Veredicto |
|---|---|
| Se envía el nombre de la tienda | Falso: el store state transporta el UUID canónico (hook fetch + logs `SET_ACTIVE_STORE`) |
| Cadena vacía / `undefined` / `null` textual | Falso: `getCleanStoreId` los normaliza a `null` y el error reportado era `Invalid UUID` sobre un string presente |
| ID obsoleto de caché/localStorage | Falso: la sesión limpia reprodujo el error con el mismo UUID correcto |
| UUID de otra tienda | Falso: `p_store_id` capturado = el canónico de Central |
| Registro de tienda inexistente/mal registrado | Falso: `stores.id` existe, tipo `uuid`, tienda activa con 126 productos y membresía activa |
| Defecto de RLS/permisos | Falso: la validación Zod fallaba **antes** de tocar la red |

---

## 3. Fase 2 — Corrección implementada (causa raíz)

**Archivo modificado:** `src/hooks/api/useCatalogProducts.ts` (+ tests nuevos; sin cambios
en BD, sin migraciones, sin tocar RLS ni permisos).

1. **Contrato alineado con Postgres:** `p_store_id: z.string().regex(uuidRegex, 'UUID de
   tienda inválido').nullable()` — usa el `uuidRegex` canónico del proyecto (mismo criterio
   documentado en `accounts-payable` 2026-07-14 y `reverse` V2.4.4). Acepta todo lo que el
   tipo `uuid` de Postgres acepta; rechaza lo que Postgres rechazaría.
2. **Guard con error controlado** (`resolveCatalogStoreId`):
   - Sin tienda (`null`): estado vacío normal, **sin llamar a la RPC** (antes se llamaba con
     `null`, camino reservado a admins que podía mezclar tiendas).
   - String no-UUID: `Error` con mensaje útil y accionable (sustituye al estado vacío
     silencioso que enmascaraba defectos — requisito UI-02 de la misión anterior).
   - En ningún caso consulta datos ni sustituye el ID por otra tienda.
3. **Sin parches de ocultación:** no se capturó la excepción para mostrar otra cosa; se
   corrigió el origen (la validación) y se mejoró el reporte del caso degenerado.

## 4. Fase 3 — Verificación de datos (solo lectura)

| Verificación | Resultado |
|---|---|
| Central corresponde a tienda real | ✓ (`stores` id `d1c4ba0e-…`, activa, creada 2026-02-09) |
| UUID válido y coincide con el contexto de la app | ✓ (captura del body POST real: `"p_store_id":"d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576"`) |
| La RPC recibe el UUID correcto | ✓ (red: `POST get_paginated_products_v2 → 200`) |
| Datos pertenecen a Central | ✓ UI «24 de 126» = BD `count(products where store_id=Central) = 126` |
| Sin mezcla con Enervida | ✓ Enervida UI «24 de 161» = BD `count = 161`; conteos distintos e independientes |
| Tienda sin catálogo → estado vacío | ✓ (test F4-08: datos `[]`, sin error; el caso «0 productos» ya no puede confundirse con el error de UUID) |

## 5. Fase 4 — Pruebas de regresión

**Nueva suite:** `src/__tests__/hooks/useCatalogProducts-uuid-guard.test.tsx` — **17/17 PASSED**

| # Misión | Prueba | Cobertura | Resultado |
|---|---|---|---|
| 1 | Abrir Catálogo en Central | Live (§6) | ✅ carga sin error |
| 2 | `p_store_id` = UUID real en Central | Live (body POST) + test F4-02 | ✅ |
| 3 | Catálogo en Enervida sigue OK | Live pre/post-fix + test schema | ✅ |
| 4 | Central → Enervida usa ID activo | Test F4-04 (queryKey por tienda) | ✅ |
| 5 | Enervida → Central no reutiliza ID | Test F4-05 (`refetchOnMount: 'always'`) | ✅ |
| 6 | Sin tienda → no se llama la RPC | Test F4-06 (page + infinite) | ✅ |
| 7 | ID inválido → error controlado, sin consulta | Test F4-07 (RPC nunca llamada, mensaje útil sin JSON Zod) | ✅ |
| 8 | Tienda sin productos → vacío, no error | Test F4-08 | ✅ |
| 9 | Usuario sin permisos → autorización existente | Server-side intacto: `has_store_access` en la RPC verificada por lectura; sin cambios en RLS/roles | ✅ (por diseño) |
| 10 | Aislamiento entre tiendas | Live (conteos 126/161 reconciliados con BD) + test «nunca p_store_id undefined/null implícito» | ✅ |

**Validaciones estáticas y suite del proyecto:**

| Check | Resultado |
|---|---|
| Suite completa `vitest run` | **2.947 passed · 24 skipped · 0 failed** (163 archivos; antes de la misión: 2.930 — solo se sumaron los 17 tests nuevos) |
| `tsc --noEmit` | exit 0 (con PM2 pausado por RAM de la caja, protocolo del runbook) |
| `eslint` (2 archivos tocados) | 0 errores |
| Tests relacionados preexistentes (`catalog-stale-search-regression`) | 4/4 pasan (el hook mockeado no se rompe) |

## 6. Fase 5 — Verificación visual (evidencias en `docs/audits/` y adjuntas al PR)

| Evidencia | Contenido |
|---|---|
| `repro-central-error-antes.png` | Central pre-fix: «Ha ocurrido un error» + JSON Zod completo con `path p_store_id` |
| `repro-enervida-catalogo-funciona-antes.png` | Enervida pre-fix: catálogo normal (contraste) |
| `fix-central-catalogo-ok.png` | Central post-fix: catálogo cargado con productos CAT-000x, sin error |
| `fix-central-catalogo-movil-390.png` | Mismo flujo en viewport móvil 390×844, sin overflow horizontal |

Adicional post-fix verificado en vivo: búsqueda operativa («CAT-0» filtra 126 → 114), consola
sin errores, y ambos flujos desktop/móvil usables. Al finalizar, la sesión quedó con
Central activa (estado inicial de la misión preservado).

## 7. Fase 6 — Entrega, CI y despliegue

- **Rama dedicada:** `fix/uuid-catalogo-central-costpro` desde `main` (no se usó el PR #1407
  de protección de entorno: alcance distinto y ya en revisión).
- **Diff:** 1 archivo de aplicación + 1 archivo de tests + 1 informe. Mínimo, sin migraciones,
  sin cambios de permisos/RLS, sin datos de negocio modificados.
- **Despliegue:** Vercel vía el pipeline estándar del repo. Este informe **no declara**
  producción corregida hasta que el merge y el deploy de Vercel se completen; el estado real
  se acredita en el PR (CI + preview + producción).

## 8. Riesgos residuales y recomendaciones

1. **Instancias latentes del mismo patrón (fuera del alcance de este incidente):** estas
   validaciones usan `z.string().uuid()` estricto con `store_id` y fallarían con Central:
   `api/auth/supervisor-check`, `api/analytics-views`, `api/product-cost-sheets/invalidate`,
   `api/stores/bulk/*`, `api/inventory/costeo-dinamico/{simulate,commit}`,
   `api/inventory/receptions/backfill-tasas`, `api/whatsapp/{config,invitations,messages/send,test-bot}`.
   **Recomendación:** PR de seguimiento que las unifique al `uuidRegex` canónico (o a un
   `storeUuidSchema` central), con test por endpoint.
2. El UUID de Central es sintético (variante `e`): **no se propone reescribirlo** — sería una
   migración invasiva sobre todas las FK para un problema ya resuelto en la capa de validación.
3. El error controlado expone hasta 64 caracteres del valor recibido: es un store_id (no
   sensible) y facilita diagnóstico; si seguridad lo desea, se puede eliminar del mensaje.
4. La verificación del caso «tienda sin productos» se hizo por test unitario (no existe hoy
   una tienda operativa sin catálogo; las E2E PILOT tienen datos).

## 9. Conclusión de aceptación

- ✅ El catálogo abre correctamente en Central de Costpro (live, post-fix).
- ✅ `p_store_id` contiene el UUID canónico correcto (captura del POST real).
- ✅ Enervida continúa funcionando (live, pre y post-fix).
- ✅ 2.947 pruebas en verde demuestran ausencia de contaminación entre tiendas (conteos
  reconciliados contra BD; RPC con guard `has_store_access` intacto).
- ⏳ Pendiente del ciclo de entrega: CI del PR, merge y deploy de Vercel (proceso estándar).
