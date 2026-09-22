# FASE B — 00 BASELINE

Fecha: 2026-09-22 · Fase: **B — Semántica Global y Navegación Transversal** (post GATE 1.4P)

## 1. Estado Git verificado (GATE 0)

| Verificación | Resultado |
|---|---|
| HEAD | `7222b62d50f3a27482cd472413c0db128a43c5b7` |
| Mensaje HEAD | `docs(gate1.4r.1): closure evidence — git verification + FINAL-REPORT (CERTIFIED)` |
| origin/main (fetch) | `7222b62d50f3a27482cd472413c0db128a43c5b7` |
| HEAD == origin/main | **SÍ** |
| Worktree (`git status --short`) | `?? audit-evidence/GATE1.4P/` (única entrada) |
| Branch | `main` tracking `origin/main`, sin divergencia |
| Comandos destructivos | Ninguno (sin reset/clean/overwrite) |

## 2. Estado post GATE 1.4P — verificación de pertenencia

El GATE 1.4P fue READ-ONLY sobre producto: su único output es la carpeta de evidencia
`audit-evidence/GATE1.4P/` (6 documentos, veredicto `READY_FOR_PRODUCT_DECISION`), creada
sobre el mismo HEAD `7222b62d` que declara su propio baseline. El repositorio **corresponde
al estado posterior a GATE 1.4P**: no existe commit de producto posterior ni divergencia de
contenido.

**Divergencia menor documentada**: la carpeta `audit-evidence/GATE1.4P/` quedó **sin trackear**
(el gate anterior no la commiteó). Decisión: se integra al commit de cierre de FASE B para
que la cadena de evidencia GATE 1.4 → 1.4R → 1.4R.1 → 1.4P → FASE B quede completa en el
repositorio y el worktree final quede limpio.

## 3. Evidencia obligatoria leída (GATE 0 paso 4)

| Archivo | Leído | Contenido clave para FASE B |
|---|---|---|
| `00-baseline.md` | SÍ | Baseline `7222b62d`; las 3 preguntas abiertas; restricciones anti-sesgo |
| `01-product-capabilities.md` | SÍ | Ofertas → **B (vigente sin discovery)**; Clientes → **C (parcial)** + fragmentación IPV (Dexie); Conciliación → **C (parcial)** (UI 39 LOC esqueleto, backend real) |
| `02-news-board.md` | SÍ | Tablón = lector RSS de inteligencia de mercado; **sin store_id**; no cambia con activeStoreId; intención histórica "visible para todos"; default del hub Gestión = efecto mecánico de reducción de menú (`b8c15082`); uso orgánico 36+ req |
| `03-my-cost-sheets.md` | SÍ | Mis Fichas = E (incompleta) — **fuera de alcance FASE B** (Fase C) |
| `PRODUCT-DECISIONS.md` | SÍ | Dominios propuestos: Ofertas→Ventas; Clientes→Ventas (condicionado a coexistencia IPV); Conciliación→Finanzas/ANÁLISIS solo si se completa; Tablón→GLOBAL/TRANSVERSAL |
| `GATE1.4P-FINAL-REPORT.md` | SÍ | §8: Fase B ejecuta ubicación del Tablón; contradicción de roles entra como hallazgo B-adjunto |

## 4. Plan Estratégico UX/IA leído (GATE 0 paso 5)

`docs/plan-estrategico-ux-ia.md` (commit `3cf6446c`): Fase B = semántica global; hallazgos
UX-002 (breadcrumb falso pendiente en ofertas/customers/bank-reconciliation/storefront-config),
UX-004, UX-005 (Tablón), UX-010 (Ofertas/Clientes/Conciliación). La decisión de producto
ejecutada en este gate (instrucción FASE B) refina la recomendación del plan §5-3: el Tablón
pasa a sección global/transversal con la evidencia GATE 1.4P, no permanece como tab del hub.

**Alcance de este gate** (según instrucción FASE B): Tablón, Ofertas, Clientes CRM,
Conciliación (estatus navegacional), Breadcrumbs, Command Palette, Mobile.
**Fuera de alcance** (queda pendiente, documentado): renombres de vocabulario del plan §4
(UX-004 Comparativa de Tiendas / cards de dashboard, UX-006 Vitrina nombre único,
"Almacenes y Depósitos" a Almacén), storefront-config breadcrumb (A-resto), consolidación
técnica CRM, Mis Fichas (Fase C).

## 5. Coherencia con PRODUCT-DECISIONS.md (regla §12 anti-contradicción)

| Decisión FASE B | PRODUCT-DECISIONS.md | ¿Contradice? |
|---|---|---|
| Tablón → sección global (ANÁLISIS) | "MODELO SEMÁNTICO SUGERIDO: GLOBAL (TRANSVERSAL)" | NO |
| Ofertas → descubrible en Ventas (tarjeta+palette+breadcrumb), Cotizaciones se conserva | "DOMINIO PROPUESTO: Ventas"; "NO es sustituida por Cotizaciones" | NO |
| Clientes → destino canónico único = CustomersView (Supabase) en Ventas; IPV queda contextual | "DOMINIO PROPUESTO: Ventas (CRM)"; fragmentación documentada | NO |
| Conciliación → fuera de navegación principal, breadcrumb honesto, sin comando público | "Mantenerla como está no es una opción segura: sugiere función que no existe" — se corrige su representación (no se promueve ni se aparenta completa) | NO |

## 6. Verificaciones técnicas previas (reconstrucción de arquitectura real)

- `navigation-definition.ts` (1.200 líneas): secciones OPERACIÓN/ANÁLISIS/SISTEMA/AYUDA/EN DESARROLLO; `ACTION_EXTENSIONS`; `SALES_HUB_PALETTE_ENTRIES`; `COST_SHEETS_TABS`; `TECHNICAL_VIEW_IDS`; `MOBILE_MAIN_TABS` (pos.activeViews ya incluye `ofertas`); `VALID_VIEWS`.
- `navigation-map.ts`: `VIEW_TO_HUB_MAP` (news → management-hub, sin ofertas/customers/bank-reconciliation); orden del master lookup `TECHNICAL_DIRECT_ROUTES → IPV_ROUTES → COSTOS_ROUTES → DEFINED_ROUTES → LEGACY_ROUTES` (IPV_ROUTES **pisa** la ruta directa de `customers`; DEFINED_ROUTES pisa a IPV si el id se define como hoja/extensión).
- `TerminalShell.tsx`: cases `news`/`ofertas`/`customers`/`bank-reconciliation` renderizan (con ViewErrorBoundary); guard de roles `isViewAllowedForRole` aplica a todas.
- `CommandPalette.tsx`: dispatch `setCurrentView(action.route)` en direct-routes — **usa el id y no `route.view`** → la acción preexistente `accounts-receivable` (id ≠ view) aterriza en "Módulo No Disponible" (pista falsa preexistente, se documenta y corrige).
- `ManagementHubView.tsx`: tab `news` es default (`useState('news')`, persistencia `mgmt-hub-tab` con fallback si el tab guardado ya no existe).
- `MobileTabBar.tsx`: sheet "Más" 100% derivado de la definición (agrupado por sección).
- `useTerminalNavigation.ts` / `sidebar.structure.ts` / `actions.ts`: 100% derivados — sin listas paralelas.
- Tests existentes: `src/__tests__/navigation/gate1-navigation.test.ts` (577 líneas, contratos GATE 1/1.4R/1.4R.1), `gate1-url-sync.test.ts`, `gate1-viewid-contract.test.tsx`.
