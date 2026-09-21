# GATE 1.4 — 06 DISCOVERABILITY TESTS (GATE 8) + NOVATO (GATE 21)

Fecha: 2026-09-21 · Método: browser real (agent-browser) como usuario que conoce el NEGOCIO pero no el código. Registro por tarea. Clicks contados desde Inicio (o contexto indicado). Carga cognitiva estimada por ambigüedad de labels y densidad.

## Simulación de tareas (17 del mandato + 4 extra)

| # | TASK | START | DESTINO esperado | DESTINO real | CLICKS/TAPS | DISCOVERABILITY | AMBIGÜEDAD | FAILURE |
|---|---|---|---|---|---|---|---|---|
| 1 | Crear una ficha de costo | Inicio | Fichas de Costo → generar | OPERACIÓN > Costo > Fichas de Costo (GENERAR FÁCIL, tabs Rápida/Experta) | 3 | ALTA (label claro, primary) | Baja (¿Rápida o Experta? aceptable) | NO |
| 2 | Ver mis fichas existentes | Inicio | lista de fichas | **EN EL TERMINAL: no hay listado accesible sin abrir editor**; el listado existe en el MVP /fc/. En terminal, el editor `main` gestiona la ficha activa; búsqueda de fichas no visible en gen-easy | — | **BAJA** | Media | **SÍ (parcial)** — gap real detectado |
| 3 | Consultar tablero de fichas | Inicio | Tablero Principal/Dinámico | ANÁLISIS > Tablero Dinámico (1 sección + 1 clic) | 2 | MEDIA (nombre no dice "fichas") | Alta (Tablero Consolidado vs Dinámico vs Dashboard) | NO |
| 4 | Usar modo asistido | Inicio / Fichas | Modo Asistido | Solo: abrir ficha → panel flotante → Asistido; o deep-link | 4+ (y oculto) | **MUY BAJA** | Baja si lo encuentras | **SÍ (palette 0 resultados, medido)** |
| 5 | Generar un informe | Inicio | Informe de ficha / Reportes | "Reportes" (ANÁLISIS) es el resultado obvio pero NO es el Informe de la ficha; el Informe real = modo reading del editor | 2 (a la pista equivocada) | BAJA | **Alta (falsa pista)** | **SÍ (semántica)** |
| 6 | Exportar una ficha a Excel | ficha abierta | acción exportar | CostSheetNav/ActionsPanel → Exportar Excel ✓ | 1-2 desde la ficha | ALTA contextual | Baja | NO |
| 7 | Exportar ficha a PDF | ficha abierta | acción exportar | CostSheetNav → PDF (modal, formato Res. 148/2023) ✓ | 1-2 | ALTA contextual | Baja | NO |
| 8 | Importar ficha JSON | ficha abierta | acción importar | CostSheetNav → Importar JSON ✓ (sin ficha abierta: palette "json" da falsos positivos) | 1-2 (contextual) | MEDIA (contextual OK; global NO) | Media | NO (con contexto) |
| 9 | Hablar con DarianAI | Inicio | Chat IA | FAB flotante (1 clic, cualquier vista) + palette "darian" ✓ + rail sidebar | 1 | **MUY ALTA** | Baja | NO |
| 10 | Ver mi tienda activa | Inicio | tienda activa | Header dropdown "ENERVIDA-VITALLCONS" siempre visible | 1 | ALTA | Baja | NO |
| 11 | Ver dashboard de mi tienda | Inicio | dashboard tienda | Card de tienda → "Dashboard" (overlay con KPIs) ✓ 1 clic | 1 | ALTA | Media (2 botones "Dashboard" y "Dashboard KPI avanzado" por card — ¿diferencia?) | NO |
| 12 | Administrar mis tiendas | Inicio | gestión tiendas | OPERACIÓN > Gestión de Tiendas > tab Gestión Tiendas | 3 | MEDIA (hub default muestra Tablón primero — clic extra mental) | Media | NO |
| 13 | Ver la vitrina | Inicio | vitrina | A) hub → tab Vitrina; B) palette "Vitrina Pública" ✓ (pero breadcrumb miente UX-002) | 2-3 | MEDIA | Media (dos entradas, dos nombres) | NO |
| 14 | Consultar noticias | Inicio | tablón | Gestión de Tiendas (tab default ES noticias) ✓ — o palette "noticias" → Gestión RSS/Gestión (indirecto) | 2 | ALTA (por el default) | Baja | NO |
| 15 | Vender | Inicio | POS | OPERACIÓN > Vender (1 sección + 1 clic) o tab móvil VEND | 2 | MUY ALTA | Baja | NO |
| 16 | Consultar caja | Inicio | Caja | B) palette "caja" ✓ 1 acción; A) Ventas hub → card Caja; móvil tab CAJA | 2-3 | ALTA | Baja | NO |
| 17 | Consultar historial de ventas | Inicio | historial | Ventas hub → Historial; palette "venta" lista "Historial de Ventas" ✓ | 2-3 | ALTA | Baja | NO |
| 18 | (extra) Encontrar Arena FC | Fichas de Costo | Arena FC | **IMPOSIBLE por UI** (solo deep-link) | ∞ | **NULA** | n/a | **SÍ (P0)** |
| 19 | (extra) Encontrar Ofertas | Inicio | Ofertas | **IMPOSIBLE por UI** | ∞ | NULA | n/a | **SÍ** |
| 20 | (extra) Encontrar Clientes (CRM) | Inicio | Clientes | **IMPOSIBLE por UI** | ∞ | NULA | n/a | **SÍ** |
| 21 | (extra) Configurar impuestos/plan | Inicio | Ajustes | SISTEMA > Ajustes ✓ | 2 | ALTA | Baja | NO |

## Novato sin ViewIds — Fichas (10 tareas del mandato)

1. Tablero Principal: encontrado con 2 clics pero con confusión de nombre (Tablero Dinámico ≠ Tablero Consolidado ≠ Dashboard) — SEMI-FAIL cognitivo.
2. Crear ficha: OK 3 clics.
3. Modo Asistido: FAIL (invisible).
4. Informe: FAIL semántico (falsa pista a Reportes).
5. Arena FC: FAIL (sin camino).
6. Guardar ficha: OK contextual (⌘S / botón).
7. Exportar Excel: OK contextual.
8. Exportar PDF: OK contextual.
9. Importar JSON: OK contextual / FAIL global (palette).
10. DarianAI: OK excelente (3 canales).

## Novato — Tiendas (11-14): todos OK (dashboard 1 clic desde Inicio; cambiar tienda por header; Vitrina 2 caminos; noticias default del hub).
## Novato — Ventas (15-18): todos OK (arquitectura GATE 1.3 consolidada: hero Vender + Caja/Historial + Otras opciones).

## Métricas por problema (GATE 17 — 0..3, mayor=mejor)

| Problema | Discov. | SemFit | Depth | CogLoad | Consist | Recov. |
|---|---|---|---|---|---|---|
| Arena FC orphan | 0 | 3 | 0 | 0 | 1 | 1 |
| Modo Asistido invisible | 0 | 2 | 1 | 1 | 1 | 2 |
| Informe falsa pista | 1 | 1 | 2 | 1 | 1 | 2 |
| Colisión Tablero/Dashboard | 2 | 1 | 3 | 1 | 1 | 3 |
| Breadcrumb "Módulo No Disponible" falso | 2 | 0 | 3 | 0 | 0 | 2 |
| Vitrina doble entrada | 2 | 2 | 2 | 2 | 1 | 3 |
| Tablón como default del hub | 3 | 1 | 3 | 2 | 2 | 3 |
| Herramientas Costo sin pista global | 1 | 2 | 2 | 2 | 2 | 2 |

(Las métricas explican los problemas; NO se produce score global — §23.)
