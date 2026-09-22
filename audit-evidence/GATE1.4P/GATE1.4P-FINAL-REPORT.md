# GATE 1.4P — FINAL REPORT

Fecha: 2026-09-22 · Gate: GATE 1.4P — Product Decisions / Discovery · Veredicto: **READY_FOR_PRODUCT_DECISION**

---

## 1. Baseline

| Verificación | Resultado |
|---|---|
| HEAD / origin/main | `7222b62d50f3a27482cd472413c0db128a43c5b7` (iguales tras `git fetch`) |
| Worktree | Limpia al inicio y al cierre (única escritura: esta carpeta de evidencia) |
| GATE 1.4 / 1.4R / 1.4R.1 / Plan Estratégico | Verificados en historial y en `audit-evidence/` + `docs/plan-estrategico-ux-ia.md` (detalle en `00-baseline.md`) |
| Comandos destructivos | Ninguno (sin reset/clean/overwrite) |

## 2. Metodología

1. **Reconstrucción desde código actual** (no desde los MD anteriores): `navigation-definition.ts` (VALID_VIEWS, TECHNICAL_VIEW_IDS, MOBILE_MAIN_TABS, roles), `navigation-map.ts` (TECHNICAL_DIRECT_ROUTES, IPV_ROUTES, VIEW_TO_HUB_MAP, resolución de breadcrumb), TerminalShell (case de vistas, fallback de deep-links), componentes de las 5 capacidades, hooks de API, contratos/Zod.
2. **Backend**: auditoría de rutas `/api/*` (métodos, auth, rate-limit, CSRF, Zod, service-role), RPCs (`get_or_create_product_cost_sheet`, `save_product_cost_sheet`, `auto_match_bank_items`) y su historial de endurecimiento.
3. **Migraciones**: censo Supabase preexistente (`audit-evidence/REM-INV-4/raw/census/`, 246 cuerpos) cruzado con `migration-ops.json` (ops CREATE_POLICY/TRIGGER/FUNCTION).
4. **Datos reales, solo lectura**: REST de PostgREST con service role del entorno (`Prefer: count=exact`; nunca INSERT/UPDATE/DELETE), OpenAPI del schema (378 entradas) para censo completo de tablas.
5. **Telemetría accesible de forma segura**: `usage_aggregates` (métrica `api_request` por endpoint, series temporales), `business_events` (verificado: solo `low_stock_alert` — no es telemetría de navegación).
6. **Arqueología Git**: `git log/show` sobre commits de unificación del hub (`b8c15082`, `8d7d9795`) y del disparador de ofertas (`ba954c20`).
7. **Disciplina anti-sesgo**: verificación explícita de marcadores de sustitución; prohibición de inferir "sin uso" (se declara "no orgánico detectable" o "no medible" según el caso); distinción sistemática persistencia / listado / gestión / descubrimiento.

## 3. Evidencia por decisión (síntesis; detalle en cada expediente)

### DECISIÓN 1 — Ofertas / Clientes CRM / Conciliación (`01-product-capabilities.md`)

- **Ofertas → B (vigente sin discovery)**: stack completo y terminado (1.674 LOC UI; CRUD + PDF; Zod; RLS migrada 20260612); 0 registros; acceso contextual real en el dashboard (corrección factual al inventario de GATE 1.4); uso orgánico esparso jun–jul 2026 + clusters de prueba/auditoría claramente separables. No sustituida por Cotizaciones (capacidades distintas que solapan).
- **Clientes CRM → C (parcial/incompleta)**: listar+alta reales; sin editar/eliminar/detalle; campos analíticos CRM sin alimentar; 2 registros = semillas de prueba; **fragmentación** con el catálogo local IPV (Dexie) — dos implementaciones de "clientes" sin sincronización ni deprecación.
- **Conciliación Bancaria → C (parcial/incompleta)**: backend real (import + RPC `auto_match_bank_items` desplegada V2.1 y endurecida V2.12.9) con UI de 39 LOC solo-lectura cuyo estado vacío remite al POST de API; sin UI de importar/conciliar/discrepancias; 0 registros; sin uso orgánico.

### DECISIÓN 2 — Tablón (`02-news-board.md`)

- El Tablón es un **lector RSS de inteligencia de mercado MiPyme** (8 feeds reales: BCC, FMI, Banco Mundial, OMC, Cepal, CIAT, BBC, Granma; tasas BCC; keywords ONAT/Gaceta/MiPyme).
- **Modelo semántico por evidencia: GLOBAL/TRANSVERSAL** — sin store_id en modelo/UI/API; no cambia con activeStoreId; intención histórica "visible para todos" (commit `b8c15082`); default del hub de Gestión = efecto mecánico de reducción de menú (2026-07-12), no pertenencia semántica.
- Uso orgánico recurrente (36+ req `/api/rss` en ~7 semanas) — el más sólido de las capacidades auditadas.
- Contradicción estructural documentada: tab abierta a todos los roles, pero item del hub restringido a admin/manager/encargado.

### DECISIÓN 3 — Mis Fichas (`03-my-cost-sheets.md`)

- **Dos modelos de persistencia** distinguidos por primera vez: `cost_sheets` (documentos con autor, 8 registros reales hasta 2026-09-21, guardado por DarianEditor con cálculo server-side) vs `product_cost_sheets` (registro FC 1:1 por producto, 0 registros, alimenta cobertura FC de Catálogo/Inventario).
- **Clasificación: E — existe pero incompleta**: widget "Fichas Recientes" (top 4, apertura real al editor, auto-oculto si vacío) + Arena FC (carga completa con búsqueda para comparar) + persistencia usada; sin vista de listado gestionable, sin filtrado, sin update/delete/duplicar (INSERT-only → proliferación de versiones), descubrimiento condicionado a datos pre-existentes, y semántica dividida de "Guardar Ficha" (JSON visible vs servidor oculto).

## 4. Incertidumbres

1. `usage_aggregates` no atribuye usuarios ni sesiones → los patrones "orgánicos" (ofertas jun–jul; rss continuo) no son atribuibles a usuarios concretos ni distinguibles con certeza absoluta de actividad de desarrollo repetida.
2. El censo de datos cubre **este** Supabase (el del entorno auditado); otros entornos, si existieran, quedan fuera.
3. No existe en el repo changelog formal de las versiones V1.2/V2.0/V2.1 que confirmen el alcance prometido de las tres capacidades de la Decisión 1.
4. El flujo de guardado de `cost_sheets` no aparece en `usage_aggregates` (posible brecha de instrumentación o ruta alternativa vía AI tools) — la tabla es la fuente de verdad adoptada.
5. La intención de producto de 2026-07-12 (reducción de menú) se reconstruye del mensaje de commit; la conversación original no está en el repo.

## 5. Datos que NO pudieron verificarse

- Usuarios/frecuencia por persona (sin telemetría con autoría).
- Existencia de uso en entornos distintos al auditado.
- Contenido íntegro de `rss_settings` adicional a keywords (columnas no críticas no volcadas).
- Identidad de quién creó los 8 documentos de `cost_sheets` (los nombres sugieren mezcla test/real; `created_by` existe en la tabla pero se optó por no exponer UUIDs de usuarios en evidencia).
- Motivación de producto original de Conciliación Bancaria en V2.1 (sin documentación de esa versión en el repo).

## 6. Decisiones que Producto YA puede tomar (con la evidencia de este gate)

| # | Decisión | Opciones ya informadas |
|---|---|---|
| 1a | Ofertas: consolidar en Ventas / fusionar con Cotizaciones / retirar con métrica | Clasificación B, evidencia de dominio y de adopción disponibles |
| 1b | Clientes: implementación oficial (Supabase vs IPV-local) y alcance del CRUD | Fragmentación y estado real documentados |
| 1c | Conciliación: completar UI (importar+conciliar) o marcar pendiente y retirar el esqueleto | Brecha backend/UI cuantificada |
| 2 | Ubicación y modelo del Tablón (GLOBAL confirmado; elegir ubicación: tab, widget Inicio, o centro transversal) + resolver la contradicción de roles | Modelo, uso e historia disponibles |
| 3 | "Mis Fichas": construir la vista sobre `cost_sheets` / mantener widget condicionado / extender a cobertura FC por producto | Base real, brechas y prerrequisitos (update/delete, semántica de guardado) documentados |

## 7. Decisiones que todavía requieren información adicional (fuera del repo)

- Ofertas: si existe uso real fuera de este entorno y si el documento formal (REUP/NIT/sellos) responde a un requisito regulatorio vigente.
- Clientes: si el POS debe alimentar `total_visits/total_purchases` (decisión de producto + posible trabajo en POS).
- Conciliación: intención original de V2.1 y vínculo deseado con wallet/cash-closures.
- Mis Fichas: expectativa real del usuario respecto a "guardar" (JSON local vs servidor) — requiere validación con usuarios o decisión directa de producto.

## 8. Impacto sobre las fases del Plan Estratégico (Fases A-resto, B, C, E, F)

| Fase | Impacto de este gate |
|---|---|
| **A-resto** (registro técnico + huérfanos) | Ejecuta la decisión 1: si Producto elige conservar alguna capacidad, su registro/breadcrumb entra aquí; si elige retirar, A-resto no debe exponerla. La corrección factual del disparador de ofertas debe reflejarse en el inventario de huérfanas. |
| **B** (semántica global) | Ejecuta la ubicación decidida para el Tablón (UX-005). La evidencia GLOBAL reduce el riesgo de la fase: el cambio es de ubicación/roles, no de modelo. La contradicción de roles del hub entra como hallazgo B-adjunto. |
| **C** (Hub Fichas de Costo) | Desbloqueada: la Decisión 1 del plan ("Mis Fichas") ya tiene base factual (clasificación E + modelo `cost_sheets`). Si Producto elige construir la vista, C la integra al hub; si no, C procede sin tarjeta "Mis Fichas" (sin tarjeta falsa). |
| **E** (móvil + palette + breadcrumbs) | Las capacidades conservadas por Producto deben incluirse en el catálogo de queries canónicas y en la prueba de breadcrumb completa. |
| **F** (limpieza) | Recibe la lista de candidatos a retiro documentados (Conciliación UI-esqueleto, aliases) y la brecha de instrumentación de uso (/api/cost-sheets/save) como tarea previa a cualquier retiro basado en métricas. |

## 9. Confirmación explícita: NO hubo cambios de producto

- **Cero** modificaciones a `navigation-definition.ts`, `navigation-map.ts`, `actions.ts`, componentes, palette, breadcrumbs, tabs, labels, rutas, permisos, base de datos o esquema.
- Base de datos: solo consultas REST de lectura (`GET` + `Prefer: count=exact`); ningún INSERT/UPDATE/DELETE; sin RPC ejecutadas con efectos.
- Los únicos archivos creados son los de `audit-evidence/GATE1.4P/` (6 documentos) y los scripts de consulta en `/home/z/my-project/scripts/` (fuera del repo).
- No se implementó ninguna fase B–F ni ninguna de las opciones descritas.

## 10. Veredicto

**READY_FOR_PRODUCT_DECISION**

Las tres preguntas cuentan con evidencia suficiente para que Producto seleccione opciones sin adivinar: las ambigüedades que este gate debía eliminar ("legacy" ≠ "huérfana", "existe tabla" ≠ "existe vista usable", "tiene deep-link" ≠ "es descubrible", "aparece en Gestión" ≠ "pertenece a Gestión") están resueltas con datos técnicos, de uso y arqueológicos. Las incertidumbres residenciales (§4/§7) están declaradas y ninguna bloquea la selección de opciones; las respuestas ejecutivas en `PRODUCT-DECISIONS.md` incluyen los campos "INDETERMINADO/NO DISPONIBLE" donde corresponde en lugar de inferencias.
