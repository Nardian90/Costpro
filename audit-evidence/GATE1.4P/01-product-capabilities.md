# GATE 1.4P — 01 PRODUCT CAPABILITIES (DECISIÓN 1)

Fecha: 2026-09-22 · Baseline: `7222b62d` (HEAD == origin/main, worktree limpia) · Método: reconstrucción forense desde código + APIs + migraciones Supabase (censo REM-INV-4) + datos reales (consultas REST solo-lectura, `Prefer: count=exact`) + telemetría `usage_aggregates`.

> Regla cumplida: "legacy" NO se usa como sinónimo de "sin entrada de menú". Cada clasificación se apoya en evidencia técnica específica.

## 0. Contexto: el hallazgo de GATE 1.4 y su corrección

GATE 1.4 (05-orphan-inventory.md) clasificó las tres capacidades como huérfanas con "sin entrada en menú/palette/hub cards". Este gate añade lo que aquel no medía: **backends completos, migraciones con RLS, datos reales, telemetría y triggers UI que el grep original no reportó**.

Corrección factual importante: `StoreDashboardView.tsx:473` contiene un disparador real `setCurrentView('ofertas')` ("Crear oferta" en la tarjeta "Movimiento lento"), introducido en el commit `ba954c20` ("Fix 23062026") y **presente ya durante el GATE 1.4**. Ofertas no era 100% huérfana: tenía un acceso contextual no descubierto.

## 1. Tabla de clasificación

| Capacidad | UI real | Backend real | Datos | Referencias | Uso medible | Sustituida | Clasificación | Evidencia |
|---|---|---|---|---|---|---|---|---|
| **Ofertas** | SÍ — completa (master-detail, 1.674 LOC en 9 archivos) | SÍ — CRUD completo + PDF (3 rutas, Zod, RLS-verificada) | Tabla `ofertas` (migr. `20260612000000` + RLS + trigger); **0 registros** | 6 superficies (dashboard, móvil, tips, help, VALID_VIEWS, TECHNICAL_VIEW_IDS); sin menú/palette/breadcrumb | **SÍ, débil**: 18 req jun–jul 2026 (orgánico esparso), ago 6 = pruebas, sep 21 = auditoría | NO (Cotizaciones es otra capacidad distinta) | **B — VIGENTE PERO SIN DISCOVERY** | §2 |
| **Clientes CRM** | SÍ — parcial (listado + alta; sin editar/eliminar/detalle) | SÍ — GET+POST (`/api/customers`) | Tabla `customers` (RLS CRUD completa en migr. `20260726000002` V1.2); **2 registros = semillas de prueba** ("Hot Customer A/B", 2026-08-06) | 4 superficies técnicas; sin menú/palette/tips; colisión de id `customers` con tab de IPV | **NO orgánico**: 13 req — jul 25-26 (pruebas V1.2), ago 6 (pruebas), sep 21 (auditoría) | INDETERMINADO (fragmentación con `CustomerCatalog` de IPV sobre Dexie) | **C — PARCIAL / INCOMPLETA** | §3 |
| **Conciliación Bancaria** | MÍNIMA — 39 LOC, listado solo-lectura; el estado vacío remite al POST de API | SÍ — GET+POST import + POST `/match` (RPC `auto_match_bank_items` desplegada) | Tablas `bank_statements` + `bank_statement_items` (migr. V2.1 `20260726000004`, endurecida V2.12.9); **0 registros** | 3 superficies técnicas; sin menú/palette/tips/hub | **NO orgánico**: 15 req — jul 26 (pruebas V2.1, incl. /match), ago 6 (1), sep 21 (auditoría) | NO | **C — PARCIAL / INCOMPLETA** | §4 |

Leyenda de clasificación (definiciones operativas del gate): A vigente · B vigente sin discovery · C parcial/incompleta · D legacy · E duplicada/sustituida.

## 2. OFERTAS — expediente

### 2.1 UI (real y terminada)

| Componente | Archivo | LOC | Qué hace |
|---|---|---|---|
| OfertasView | `src/components/views/terminal/views/ofertas/OfertasView.tsx` | 233 | Contenedor master-detail: listado + formulario, dirty-guard con ConfirmDialog |
| OfertaFormPanel | `…/ofertas/OfertaFormPanel.tsx` | 958 | Formulario completo: suministrador (prellenado desde la tienda: REUP, NIT, dirección, cuenta bancaria, sello/firma), cliente, productos, moneda CUP, ITBIS, validez, condiciones, escala de sello/firma |
| OfertaListPanel | `…/ofertas/OfertaListPanel.tsx` | 310 | Listado con búsqueda server-side, filtro por estado (draft/sent/accepted/rejected), paginación, eliminación con confirmación |
| Soporte | CollapsibleSection, ConfirmDialog, FinancialSummary, ProductRow, constants | ~170 | Componentes de soporte dedicados |

Contratos tipados: `src/contracts/oferta.ts` (OfertaContract, OfertaFactory, OfertaSuministradorFactory) + `src/types/oferta.ts` (Oferta, OfertaStatus). Render: `TerminalShell.tsx` case `'ofertas'` con ViewErrorBoundary — renderiza.

### 2.2 Backend (real)

| Ruta | Métodos | Evidencia de calidad |
|---|---|---|
| `/api/ofertas` | GET, POST | Rate-limit, CSRF `validateOrigin`, `withStoreAccess`, Zod `ofertaCreateSchema`, verificación de membresía R-6, cálculo automático de subtotal/descuento/ITBIS (impuesto dominicano/cubano en moneda), inserción con `created_by`, servicio role para write |
| `/api/ofertas/[ofertaId]` | GET, PATCH, DELETE | CRUD completo por id |
| `/api/ofertas/export-pdf` | POST | Generador de PDF de 29.6 KB de código — documento comercial formal |

Hooks cliente: `src/hooks/api/useOfertas.ts` (useOfertasList, useOfertaDetail, mutaciones React Query con invalidación por tienda).

### 2.3 Datos

- Tabla `ofertas`: 20 columnas (numero, fecha, objeto, suministrador, cliente, productos, status, subtotal, descuento, itbis, total, moneda, validez, condiciones_pago/entrega, notas, stamp/sign url+scale, created_by, store_id). Verificada por OpenAPI de PostgREST (solo lectura).
- Migración `20260612000000_create_ofertas.sql`: tabla + RLS "Users can view ofertas from their stores" + trigger `set_ofertas_updated_at`. Revisada/conservada por `20260619000006_rls_policies_versioned.sql`.
- **Registros actuales: 0** (`content-range: */0`).

### 2.4 Referencias internas (superficies que la mencionan)

| Superficie | Referencia |
|---|---|
| `StoreDashboardView.tsx:472-473` | Tarjeta "Movimiento lento" → acción "Crear oferta" → `setCurrentView('ofertas')` (commit `ba954c20`, jun 2026) |
| `MOBILE_MAIN_TABS` (`navigation-definition.ts:1127`) | `ofertas` en activeViews del tab móvil "Vender" |
| `VALID_VIEWS` (:1165) y `TECHNICAL_VIEW_IDS` (:910) | Deep-link `?view=ofertas` aceptado (fallback `setCurrentView` directo en TerminalShell:323) |
| `view-tips.ts:45` | Tip "Crea promociones y combos activos" |
| `HelpLauncher.tsx:77` | Mapea `ofertas` → doc de ayuda `help/02-como-hacer/07-como-aplicar-descuento.md` |
| Palette / menú / VIEW_TO_HUB_MAP | **Cero entradas** → breadcrumb cae en "Módulo No Disponible" (UX-002, pendiente Fase A-resto) |

### 2.5 Sustitución y evidencia histórica

- Cero marcadores `legacy/deprecated/obsolete/removed/replaced` asociados a ofertas en `src/`.
- **No es sustituida por Cotizaciones**: `quotations` (tabla `quotations` + `quotation_items`, RPC `create_quotation`, migr. V2.12.x, vista de 217 LOC en el hub Ventas con "estados de seguimiento") es una capacidad más simple y orientada a venta rápida; `ofertas` es un **documento comercial formal** (identidad del suministrador con REUP/NIT, sellos y firmas escalables, condiciones de pago/entrega, ITBIS, PDF formal). Solapan en el espacio "propuesta comercial" pero no comparten tabla ni motor ni UI. El solapamiento parcial se documenta para Producto, no se resuelve aquí.

### 2.6 Uso medible (usage_aggregates, api_request)

Serie temporal de `/api/ofertas` (datos leídos con service role, solo-lectura):

| Periodo | Requests | Lectura |
|---|---|---|
| 2026-06-26 → 2026-07-27 | 9 req en 9 fechas distintas (~1/semana) | Uso orgánico esparso (desarrollo o uso real — sin atribución por usuario) |
| 2026-08-06 23:35–23:40 | 5 req | Cluster de pruebas (mismo minuto que creación de semillas "Hot Customer" y `stores/reset`) |
| 2026-09-21 11:40 | 4 req | Coincide con la verificación browser GATE 1.4R.1 (sesión admin@demo.com) |

Registros creados: **0**. Conclusión: la API se probó y se llamó esporádicamente en jun–jul; nunca se consolidó uso productivo medible. **Uso débil pero no nulo; NO se puede declarar "sin uso"** (la telemetría no atribuye usuarios ni sesiones).

### 2.7 Expediente narrativo (6 preguntas del gate)

1. **Qué hace actualmente**: genera, lista, edita, elimina y exporta en PDF ofertas comerciales formales por tienda, con cálculo automático de impuestos y datos legales del suministrador (la propia tienda).
2. **Qué parte está realmente operativa**: todo el stack — UI completa, CRUD API, PDF, validación, hooks. Si se navega a `?view=ofertas`, funciona (con breadcrumb falso).
3. **Qué parte parece histórica/incompleta**: nada estructural; lo inacabado es el **acceso y la adopción** (0 registros, breadcrumb falso, sin menú).
4. **¿Debe conservarse?**: la evidencia técnica (inversión de ~2.500 LOC frontend+backend, integración con dashboard, dominio del negocio MiPyme) respalda conservación; la evidencia de adopción (0 registros) es contraria. **Decisión de producto requerida** — no se recomienda aquí meterla al menú automáticamente.
5. **Dominio semántico que parece corresponderle**: Ventas (es un documento comercial pre-venta; el dashboard la vincula a promoción de productos de lenta rotación; móvil la agrupa bajo "Vender").
6. **Información que falta**: si existe algún flujo comercial real fuera de este entorno (este Supabase es el del entorno auditado), si Cotizaciones debería absorberla o coexistir, y si el documento formal (sellos/REUP/NIT) responde a un requisito regulatorio vigente.

## 3. CLIENTES CRM — expediente

### 3.1 UI (real pero parcial)

`CustomersView.tsx` (134 LOC): listado con búsqueda server-side (nombre, CI, teléfono), botón "Nuevo Cliente" + modal de alta (nombre, CI, teléfono, email, dirección, notas), badge de visitas, recarga manual. **No implementa**: edición, eliminación, vista de detalle, historial de compras (aunque el modelo y el RLS los contemplan).

### 3.2 Backend (real, parcial)

`/api/customers` GET (con paginación + search) y POST (alta). Sin PATCH/DELETE en API. Autenticación `withAuth` + rate-limit + tracing.

### 3.3 Datos

- Tabla `customers`: 14 columnas con **campos CRM de análisis ya definidos** (`total_purchases`, `total_visits`, `last_visit_date`, `is_active`, `created_by`) — diseñada para integrarse con el POS (visitas/compras), pero esos campos están en 0/nulos en los registros existentes.
- Migración `20260726000002_v1_2_devolutions_customers_quotations_kardex_fiscal.sql`: RLS completa (select/insert/update/delete own_store) — parte del hito versionado V1.2 junto a devolutions y quotations.
- **Registros: 2** — "Hot Customer A/B 1786058718" creados 2026-08-06 23:26, teléfonos secuenciales +53500000099/98: **semillas de prueba**, no datos reales.

### 3.4 Referencias internas

| Superficie | Referencia |
|---|---|
| `VALID_VIEWS` (:1172) y `TECHNICAL_VIEW_IDS` (:908) | Deep-link aceptado |
| `TECHNICAL_DIRECT_ROUTES` (`navigation-map.ts:122`) | Ruta técnica directa |
| **`MODULE_ROUTES` IPV (`navigation-map.ts:74`)** | `customers: { view: 'ipv', tab: 'customers' }` — el id "customers" también nombra una tab del módulo IPV |
| Palette / menú / tips / dashboard | **Cero** |

### 3.5 Fragmentación (no sustitución formal)

Existen **dos implementaciones paralelas de "clientes"**:
1. `CustomersView` → Supabase `customers` (server-side, CRM-lite) — vista terminal huérfana.
2. IPV `CustomerCatalog.tsx` (491 LOC) → **Dexie/IndexedDB local** (`src/lib/dexie.ts:393,424`, tabla con índices `ci, nombre, normalized_name, status`), con CRUD completo local, sincronización desde transacciones (`syncCatalogFromTransactions`), propagación de identidad y estadísticas.

No hay marcadores de deprecación entre ambas; no hay sincronización entre `customers` (Supabase) y la tabla Dexie de IPV. Es **fragmentación de dominio**, no sustitución documentada.

### 3.6 Uso medible

| Periodo | Requests | Lectura |
|---|---|---|
| 2026-07-25/26 | 4 | Noche de release V1.2 (migración `20260726000002` — pruebas de despliegue) |
| 2026-08-06 23:20–23:25 | 4 | Cluster de pruebas (misma ventana que semillas) |
| 2026-09-21 11:40 | 7 | Verificación browser GATE 1.4R.1 |

**No hay uso orgánico detectable.** Los tres clusters se explican por desarrollo/pruebas/auditoría.

### 3.7 Expediente narrativo

1. **Qué hace actualmente**: alta y consulta de clientes por tienda en Supabase, con campos pensados para CRM analítico.
2. **Operativa**: listado + alta + búsqueda.
3. **Histórica/incompleta**: edición/borrado/detalle ausentes en UI y API; campos analíticos sin alimentar; sin vínculo real con transacciones de POS en este entorno.
4. **¿Debe conservarse?**: no determinar aquí. Factores para Producto: las ventas dependen de clientes en cualquier CRM; existe dominio ya modelado; pero también existe el catálogo local de IPV que hoy cumple un rol de clientes en otro módulo.
5. **Dominio semántico**: Ventas (CRM de clientes) o maestro compartido (catálogo) — a decidir; la fragmentación con IPV debe resolverse en la misma decisión.
6. **Falta**: qué implementación es la "oficial" por producto (Supabase vs Dexie/IPV), y si el POS debe alimentar `total_visits/total_purchases`.

## 4. CONCILIACIÓN BANCARIA — expediente

### 4.1 UI (mínima, no operativa como flujo)

`BankReconciliationView.tsx`: **39 LOC**. Lista extractos importados (fecha, cuenta, estado reconciled/discrepancy/pending, N movimientos, saldo, créditos/débitos). El **estado vacío le pide al usuario usar el endpoint POST manualmente**: "Usa el endpoint POST /api/bank-reconciliation para cargar un extracto" — evidencia directa de que el flujo principal (importar) **no tiene UI**. No hay UI de matching ni de revisión de discrepancias.

### 4.2 Backend (real y más avanzado que la UI)

| Ruta | Métodos | Detalle |
|---|---|---|
| `/api/bank-reconciliation` | GET, POST | GET lista extractos con items; POST importa extracto + items (dos tablas) |
| `/api/bank-reconciliation/match` | POST | Dispara el matching automático; valida ownership de la tienda vía `bank_statements.store_id` |

En base de datos: función RPC `auto_match_bank_items` — creada en `20260726000004_v2_1_deep_integrations.sql` (hito **V2.1 "deep integrations"**) y endurecida en `20260727000006_v2_12_9_spoofing_p_user_id.sql` (security definer). Es decir, el motor de conciliación se desplegó y se mantuvo (parche de seguridad V2.12.9), pero **ningún componente del frontend lo invoca** (grep de `bank-reconciliation/match` en src fuera de api/: 0 resultados).

### 4.3 Datos

- `bank_statements` (13 cols: statement_date, bank_account, opening/closing_balance, total_credits/debits, status, reconciled_at/by, store_id, notes) + `bank_statement_items`. Ambas existen, **0 registros**.

### 4.4 Referencias

`VALID_VIEWS` (:1173), `TECHNICAL_VIEW_IDS` (:908), `TECHNICAL_DIRECT_ROUTES` (`navigation-map.ts:123`). Palette/menú/tips/dashboard: cero.

### 4.5 Sustitución

Ninguna. No hay marcadores de deprecación. La inteligencia de tasas (IPV) es un dominio distinto.

### 4.6 Uso medible

| Periodo | Requests | Lectura |
|---|---|---|
| 2026-07-26 00:10–00:15 | 4 (+2 a `/match`) | Noche de release V2.1 (migr. `20260726000004`) — pruebas |
| 2026-08-06 23:55 | 1 | Cluster de pruebas |
| 2026-09-21 11:40 | 7 | Auditoría GATE 1.4R.1 |

**No hay uso orgánico detectable.**

### 4.7 Expediente narrativo

1. **Qué hace actualmente**: lista extractos previamente importados vía API; el matching automático existe en BD pero es inalcanzable desde la UI.
2. **Operativa**: backend completo (import + match RPC endurecido); UI de solo lectura.
3. **Histórica/incompleta**: los flujos de usuario esenciales (cargar extracto, ejecutar conciliación, revisar discrepancias) no tienen UI; el propio componente lo admite en su estado vacío.
4. **¿Debe conservarse?**: decisión de producto; el backend endurecido por seguridad dos veces sugiere inversión mantenida, pero cero adopción y UI esqueleto sugieren capacidad abortada a mitad de camino.
5. **Dominio semántico**: Finanzas/ANÁLISIS (el plan estratégico §5 sugería ANÁLISIS si hay uso) — el uso no existe; la decisión de dominio solo aplica si se decide completarla.
6. **Falta**: intención de producto original de V2.1 (documentación de esa versión no está en el repo), y si la conciliación debía integrarse con wallet/cash-closures.

## 5. Incertidumbres declaradas (transversales)

1. **Atribución de uso**: `usage_aggregates` no registra usuario ni sesión; los clusters de jun–jul de ofertas podrían ser desarrollo o uso real — indistinguible desde este entorno.
2. **Alcance del dato**: el Supabase auditado es el del entorno actual; si hubo otros entornos de producción, este censo no los cubre.
3. **Comentarios de versión** ("V1.2", "V2.0", "V2.1") indican que las tres capacidades se entregaron como **hitos versionados de producto** (no experimentos privados), pero no existe en el repo changelog formal de esas versiones para confirmar alcance prometido.
4. `usage_aggregates` no muestra filas para `/api/cost-sheets/save` (0 en filtro directo) pese a existir registros recientes en `cost_sheets` — brecha de instrumentación o ruta de escritura alternativa (AI tools); tratado en 03-my-cost-sheets.md §2.6.
