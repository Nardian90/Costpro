# GATE 1.4P — 03 MY COST SHEETS (DECISIÓN 3)

Fecha: 2026-09-22 · Baseline: `7222b62d` · Alcance: **terminal COSTPRO** (CostSheetView y su ecosistema). `/fc/FC.html` se documenta solo como separación de alcance (MVP demostrativo, storage `localStorage` — 1 ocurrencia, sin conexión al terminal).

## 1. Descubrimiento central: DOS modelos de persistencia, no uno

La pregunta "¿existe Mis Fichas?" exige distinguir dos tablas que conviven:

| | **`cost_sheets`** | **`product_cost_sheets`** |
|---|---|---|
| Modelo mental | **Documento con autor**: fichas guardadas como unidades nombradas | **Registro por producto**: estado FC actual de CADA producto (1:1 con producto activo) |
| Columnas clave | id, name, description, category, **data (JSONB de la ficha completa)**, **created_by**, store_id, created_at, updated_at | id, **product_id**, store_id, template_id, modalidad, calculated_data, cost_price, sync_status, deleted_at, cost_price_updated_at |
| Escritura | `/api/cost-sheets/save` (INSERT siempre nuevo) — invocada por **DarianEditor** (AI) dentro de CostSheetView/CostSheetSidePanel; también expuesta al toolkit de AI tools (`lib/ai/tools/registry.ts`) | `/api/product-cost-sheets` POST (check-then-insert/update por product_id) + RPCs `get_or_create_product_cost_sheet` / `save_product_cost_sheet` (migr. `20260615000002`), auto-generate, recalculate-on-price-change |
| Registros reales | **8 — con actividad reciente** (últ. 2026-09-21, 2026-09-15, 2026-05-27) | **0** |
| Lecturas UI | `RecentCostSheets` (Dashboard), `ArenaFC` (comparador), hook `useCostSheets` (limit 200) | `useProductFCStatus` (cobertura FC en CatalogView/InventoryView), `useFCPriceSync` |

La migración `20260615000002_create_product_cost_sheets_and_alter_products.sql` demuestra que `product_cost_sheets` fue diseñado como **caché/registro de costo por producto** (con soft-delete parcial `WHERE deleted_at IS NULL` y vínculo `products.cost_sheet_id`), NO como colección de documentos de usuario. Por construcción, ese modelo **no puede producir "Mis Fichas"**: no guarda autoría, ni nombre, ni historial de documentos — guarda el estado de costo vigente de cada producto.

**"Mis Fichas" solo puede apoyarse en `cost_sheets`** — y ahí la respuesta cambia respecto a lo asumido en GATE 1.4R.1: **la persistencia existe y se usa de verdad**.

## 2. Niveles de investigación (sobre `cost_sheets`)

### Nivel 1 — Persistencia: SÍ, real y con uso

- Tabla con autoría (`created_by`) y ámbito de tienda obligatorio (comentario FIX-AUDIT-2 en save route: "store_id is now mandatory — cost sheets are always store-scoped").
- El guardado ejecuta el motor real server-side: `buildEngineFicha` + `calculateFicha(ficha, { actor: 'ai-system' })`, y persiste `metadata.calculationSnapshot` con los valores calculados.
- **8 registros reales**: "Ejemplo — Servicio de pintura y mantenimiento" (×3: 2026-09-21, 09-18, 09-02), "Ficha 4 (edit local viejo) (copia en conflicto)" (2026-09-15), "Servicio de costura X", "Dulce de coco artesanal", "Pan de casabe 500g" (2026-09-15), "Secret Sheet Tenant B" (2026-05-27, semilla de test de multi-tenant).
- Brecha de instrumentación: `usage_aggregates` no muestra filas para `/api/cost-sheets/save` (filtro directo: 0) pese a los registros de sep-2026 — el escritor pudo ser el toolkit de AI tools u otra ruta no trackeada; la tabla de documentos es la fuente de verdad, no la telemetría.

### Nivel 2 — Listado: PARCIAL (widget + comparador; no hay vista de listado)

| Superficie | Archivo | Qué lista | Límites |
|---|---|---|---|
| **Fichas Recientes** (widget del Dashboard/Inicio) | `dashboard/RecentCostSheets.tsx` | Top 4 por `created_at desc`: nombre, categoría, costo total, precio venta, fecha (del `calculationSnapshot`) | Solo 4; **se auto-oculta si 0 fichas** (`if (!costSheets || length===0) return null`) |
| **Arena FC** | `cost_sheet/ArenaFC.tsx:254-267` | Carga TODAS las `cost_sheets` (id, name, category, data, updated_at) con `searchQuery` por nombre y selección para comparación lado a lado | Su propósito declarado es comparar, no gestionar |
| Hook de listado | `hooks/api/useCostSheets.ts` | `select('*')` order created_at desc limit 200 + Zod (FIX-LOG-007) | No hay vista dedicada que lo consuma como listado gestionable |

Búsqueda: solo dentro de Arena FC (para comparar). Filtrado/orden/selección múltiple: no en ninguna superficie de usuario. **Listar/buscar/filtrar como capacidad de primer nivel: NO EXISTE.**

### Nivel 3 — Gestión

| Operación | Estado | Evidencia |
|---|---|---|
| Abrir | **SÍ** | Widget: click → `setSheet(sheet.data)` + `setCurrentView('cost-sheets')` — abre la ficha en el editor (store `cost-sheet-store`) |
| Editar | SÍ, indirecta | Una vez abierta, se edita en el editor completo; el guardado por IA **inserta SIEMPRE un documento nuevo** (`/save` no tiene ruta de update) → proliferación de versiones (3× "Ejemplo — Servicio de pintura" idénticos lo evidencian) |
| Duplicar | NO | Sin ruta ni UI |
| Eliminar | NO para `cost_sheets` | Sin DELETE en `/api/cost-sheets`, sin UI; (soft-delete existe SOLO en `product_cost_sheets` vía PATCH admin) |
| Exportar | SÍ (individual, desde el editor) | Guardar Ficha = descarga JSON; Exportar Excel/PDF |
| Historial | Parcial por diseño de hecho | Cada guardado IA crea un nuevo documento (historial implícito sin UI) |

### Nivel 4 — Descubrimiento: NO para el novato

- El único camino de listado (widget) **requiere que ya existan fichas**: un usuario nuevo ve el Dashboard SIN el widget → no descubre la capability.
- No hay entrada de menú, palette, tarjeta de hub ni deep-link documentado hacia un listado ("Ver Todas" aterriza en el editor `cost-sheets` principal, no en un listado).
- El guardar visible ("Guardar Ficha" en CostSheetModuleNav) **NO guarda en el servidor**: aria-label "descarga la ficha actual como archivo JSON" (`CostSheetModuleNav.tsx:155`, handler `tool-save` → `handleExportJSON` en `useCostSheetActions.ts:263`). La persistencia real ocurre por el flujo Darian AI — un camino distinto al que el usuario percibe como "guardar".

### Nivel 5 — Integración con el dominio Fichas de Costo

| Pieza | Relación con cost_sheets |
|---|---|
| Generar Fácil (gen-easy) | Genera en estado del editor; no persiste en servidor |
| Editor (CostSheetView) | Estado en `useCostSheetStore` (zustand persist local); "Guardar Ficha"=JSON; DarianEditor → `/api/cost-sheets/save` (INSERT) |
| Plantillas | `store_cost_templates` (0 registros) + plantilla reinicio embebida; independiente de cost_sheets |
| Arena FC | Consumidor principal del listado (comparación) |
| Análisis de Fichas (cost-analytics) | Analítica de costos; no lee cost_sheets como documentos |
| Generación Masiva | Salida hacia el editor/estado; no persiste documentos |
| Calculadora Estructural | Herramienta; sin relación |
| product_cost_sheets | Registro FC por producto; alimenta badges de cobertura FC (Catálogo/Inventario) y sincronización de precio |

## 3. Tabla exigida por el gate

| Pregunta | Evidencia | Resultado |
|---|---|---|
| ¿Existe persistencia? | Tabla `cost_sheets` con created_by/store_id/data JSONB; 8 registros reales (últ. 2026-09-21); guardado server-side con motor de cálculo | **SÍ** |
| ¿Existe listado? | Widget "Fichas Recientes" (top 4, se oculta si vacío) + carga completa en Arena FC | **PARCIAL** |
| ¿Existe búsqueda? | `searchQuery` en ArenaFC (contexto de comparación) | **SOLO EN ARENA FC** |
| ¿Existe filtrado? | Sin filtros en widget ni Arena FC (categoría mostrada, no filtrable) | **NO** |
| ¿Existe apertura? | Click en widget → `setSheet` + navegación al editor | **SÍ** |
| ¿Existe edición? | Tras abrir, en el editor; sin update server-side (cada guardado IA = INSERT nuevo) | **PARCIAL** |
| ¿Existe duplicación? | Ninguna ruta/UI | **NO** |
| ¿Existe gestión del ciclo de vida? | Sin delete/update/duplicar para documentos; soft-delete solo en product_cost_sheets | **NO** |
| ¿Es descubrible? | Widget condicionado a existir datos; sin menú/palette/hub; "Ver Todas" no lleva a un listado | **NO (condicionada)** |
| ¿Pertenece al terminal? | CostSheetView, DarianEditor, RecentCostSheets, ArenaFC son componentes del terminal | **SÍ** |
| ¿Depende del MVP? | `/fc/FC.html` usa localStorage; sin conexión con cost_sheets | **NO** |
| Clasificación final | Ver §4 | **E — EXISTE PERO ES INCOMPLETA** |

## 4. Clasificación final razonada

**E — EXISTE PERO ES INCOMPLETA** (no C pura, no B pura):

- NO es "A — ya existe como vista funcional": no hay vista de listado gestionable.
- NO es "B — solo backend sin vista": existe un listado parcial visible (widget del Dashboard con apertura real) y un comparador con búsqueda (Arena FC).
- NO es "C — solo parte del editor": la persistencia y lectura trascienden al editor (widget en Inicio).
- SÍ es "E — existe pero incompleta": persistencia real y usada + apertura real, pero sin búsqueda/filtrado/gestión de ciclo de vida, con guardado visible que no persiste (JSON) vs. guardado IA que sí persiste, sin update server-side (proliferación de versiones), y descubrimiento condicionado a que ya existan datos.

Precisión sobre GATE 1.4R.1: aquel gate documentó "Mis Fichas no existe" a nivel de **navegación** (ninguna entrada/hub) — correcto y vigente. Este gate precisa que **sí existe una base funcional real** (tabla usada + widget + apertura + comparador) que Producto puede decidir completar, sin inventar nada desde cero.

## 5. Incertidumbres

1. **Autoría de los 8 registros**: sin telemetría de `/save`, no puedo atribuir si fueron creados por uso real de Darian AI, pruebas de desarrollo, o inserciones directas. Los nombres sugieren mezcla de ambos ("Secret Sheet Tenant B" = test; "Servicio de costura X"/"Dulce de coco artesanal" = plausiblemente reales).
2. No hay garantía de que el flujo Darian AI sea percibido por el usuario como "guardar mi ficha" (la UI del editor dice "Guardar Ficha" para la descarga JSON) — la semántica de guardado del terminal está dividida.
3. `usage_aggregates` tiene filas limitadas (1000 muestreadas); no descarta uso anterior no muestreado, aunque el filtro directo por endpoint devolvió vacío.
