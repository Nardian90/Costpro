# GATE 1.4 — 05 ORPHAN INVENTORY (GATE 7)

Fecha: 2026-09-21 · Método: cruce VALID_VIEWS × NAVIGATION_SECTIONS × ACTION_EXTENSIONS × TECHNICAL_DIRECT_ROUTES × browser (deep-links reales) × grep de triggers UI.

## ORPHAN INVENTORY

| Vista | Evidencia de existencia | Última ruta conocida | Acceso actual | Importancia | Acción recomendada | Prioridad |
|---|---|---|---|---|---|---|
| **Arena FC** | ArenaFC.tsx completo (motor calculateFicha, export informe, comparación lado a lado); tip en view-tips ("Compara fichas de costo lado a lado"); ruta técnica navigation-map | `/?view=cost-sheets&tab=arena-fc` | **Deep-link ONLY** — grep completo: 0 botones/setActiveSection('arena-fc') en src/; palette "arena" aterriza en gen-easy | Alta (funcionalidad diferencial del módulo Costo) | Entrada como tarjeta/vista en el dominio Fichas de Costo (Fase A) | **P0** |
| **Ofertas** | OfertasView registrada (case 'ofertas'); en VALID_VIEWS y TECHNICAL_VIEW_IDS; tip "Crea promociones y combos activos"; MOBILE_ACTIVE_VIEW la mapea al tab Vender | `/?view=ofertas` | Deep-link; sin entrada en menú/palette/hub cards; browser: contenido sin H1, título header falso (UX-002) | Media (capacidad comercial real: promociones/combos) | Decidir: si está en producción, darle lugar (Ventas > Ofertas o tarjeta de hub); si es legacy, marcar LEGACY | **P1** |
| **Clientes (CRM)** | CustomersView registrada (case 'customers'); TECHNICAL_DIRECT_ROUTES la declara | `/?view=customers` | Deep-link; browser ✓ renderiza pero header dice "Módulo No Disponible" (UX-002); sin menú/palette | Media-alta (CRM de clientes, ventas dependen de clientes) | Entrada en dominio Ventas (tarjeta) o Inventario>Catálogo si es maestro | **P1** |
| **Conciliación Bancaria** | BankReconciliationView registrada; TECHNICAL_DIRECT_ROUTES | `/?view=bank-reconciliation` | Deep-link; browser ✓ renderiza, header miente (UX-002); sin menú/palette | Media (finanzas;可能与 IPV/Inteligencia Cambiaria relacionada) | Ubicar en ANÁLISIS o SISTEMA según alcance real; o LEGACY | **P1** |
| **Modo Asistido** | CostSheetWizard; deep-link funciona (browser ✓); modo del editor | tab view-assisted | Editor (panel flotante) + deep-link; palette 0 resultados | Alta (onboarding de generación de fichas) | Modelo correcto: modo del editor + descubribilidad (ver 14) | P1 (HIDDEN) |
| **Informe de ficha** | viewMode reading; browser ✓ | tab view-reading | Ídem Asistido | Alta (salida formal Res. 148/2023) | Ídem | P1 (HIDDEN) |
| **Explorador de Plantillas** | CostSheetTemplateExplorer; ActionsPanel "Explorar Plantillas" | tab templates | Solo con ficha abierta (panel) o deep-link | Media-alta (arranque rápido) | Camino sin ficha abierta (hub/herramientas) | P2 |
| **Generación Masiva** | CostSheetMassiveGenerator | tab massive-gen | Solo ActionsPanel / deep-link | Media | Ídem | P2 |
| **Calculadora Estructural** | SteelStructureCalculator | tab steel-calculator | Solo ActionsPanel / deep-link | Media | Ídem | P2 |
| **cash_report (modal elevado a vista)** | CashReportWrapper (FIX-CASH-REPORT 2026-07-14); breadcrumb correcto | `/?view=cash_report` | Tarjeta Caja en hub Ventas; browser ✓ | Correcta | — | OK (no-orphan, evidencia de contraste) |
| Legacy alias (occ, costos, cost_views, ipv_*, punto_venta, tienda, otros, administracion, recursos, gen-quick, gen-expert…) | LEGACY_VIEW_ALIASES + cases Group/SectionHub | normalizan | Automático por migración de estado | Baja | Mantener mientras existan bookmarks; limpiar en Fase F | P3 |
| /fc/FC.html (MVP) | public/fc/ release 12.10.0 + sw.js propio | `/fc/` | Landing "Continuar con Ficha de Costo" | Externa al alcance (aclaración del usuario: MVP demo) | Documentar; no forma parte del terminal | P3 (fuera de alcance) |

## Balance

- La reorganización GATE 1.x **rescató huérfanas previas** (abc-analysis → ANÁLISIS, fiscal-close → SISTEMA — comentarios "rescatada" en la definición) y **no creó huérfanas nuevas en Ventas** (todas las tarjetas del hub tienen palette + breadcrumb).
- Los huérfanos ACTUALES se concentran en **3 clusters**: (1) dominio Costo experimental (Arena FC + herramientas del panel), (2) capacidades sin dominio asignado (ofertas, customers, bank-reconciliation), (3) legacy alias (intencional, aceptable).
- Patrón raíz: toda vista que NO está ni en el árbol de navegación ni en VIEW_TO_HUB_MAP queda **invisible + con breadcrumb falso** — no existe red de seguridad ("accessible-but-hidden" en el mejor caso, orphan en el peor).
