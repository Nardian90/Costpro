# PLAN ESTRATÉGICO UX/IA — COSTPRO
## Arquitectura de Información, Navegación y Descubribilidad

Fecha: 2026-09-22 · Basado en: GATE 1.4 — FINAL REPORT · GATE 1.4R — FINAL-REPORT (CERTIFIED) · Estado Git: `a603d7cc` (HEAD == origin/main, worktree limpia)

> Versión PDF: `/home/z/my-project/download/Plan_Estrategico_UX-IA_CostPro.pdf` · Este MD es la fuente versionada en repo (contrato de alcance).

---

## 1. Resumen ejecutivo

Este plan define la hoja de ruta de producto e ingeniería para consolidar la arquitectura de información (IA), la navegación y la descubribilidad de CostPro, a partir de la evidencia del audit GATE 1.4 y de la remediación GATE 1.4R del dominio Fichas de Costo. El diagnóstico: la reorganización de menús logró un árbol coherente y sin duplicaciones (Ventas como patrón), pero el precio se concentró en capacidades sin camino visible, vistas técnicas con breadcrumbs falsos y vocabulario no normalizado.

La primera fase ya está ejecutada y certificada: GATE 1.4R resolvió el dominio Fichas de Costo de extremo a extremo (Arena FC P0 recuperada, "Análisis de Fichas" renombrado, modos y acciones descubribles por palette, breadcrumbs corregidos en la fuente), con 2.164 tests en verde, navegador real en 5 viewports y prueba de novato 7/8. Veredicto: **CERTIFIED**. **Fichas de Costo queda TACHADA como resuelta.**

Lo que queda: extender el patrón probado al resto de dominios, normalizar vocabulario global, resolver la deuda móvil y cerrar 4 decisiones de producto. Cada fase = un gate independiente con evidencia obligatoria.

## 2. Estado consolidado de hallazgos (GATE 1.4 → hoy)

| ID | Hallazgo | Sev. | Estado | Cierra en |
|---|---|---|---|---|
| UX-001 | Arena FC huérfana (0 triggers UI) | P0 | **RESUELTO** | GATE 1.4R |
| UX-002 | Breadcrumb falso "Módulo No Disponible" | P0 | **PARCIAL** — resuelto en Costo; pendiente storefront-config, customers, bank-reconciliation, ofertas | Fase A-resto |
| UX-003 | Modos Asistido/Informe invisibles | P1 | **RESUELTO** (palette-acciones) | GATE 1.4R |
| UX-004 | Vocabulario tableros/dashboards superpuesto | P1 | **PARCIAL** (Análisis de Fichas ✓; falta Comparativa de Tiendas + labels de cards) | Fase B |
| UX-005 | Tablón default en Gestión; warehouses mal colgados | P1 | PENDIENTE | Fase B |
| UX-006 | Vitrina doble entrada / dos nombres | P2 | PENDIENTE | Fase B |
| UX-007 | Móvil: drawer autoabierto, sheet plano, labels truncados | P1 | PENDIENTE | Fase E |
| UX-008 | Palette sin acciones + falsos positivos fuzzy | P2 | **RESUELTO en Costo** (patrón extensible) | GATE 1.4R + E |
| UX-009 | storeId legacy vs activeStoreId | P3 | PENDIENTE | Fase D |
| UX-010 | Ofertas/Clientes/Conciliación sin dominio | P1 | PENDIENTE (decisión de producto) | Fase A-resto |
| UX-013 | Sesión envejecida sin gate visible | P3 | PENDIENTE | Fase F |
| UX-014 | Sin listado de fichas en terminal | P2 | PENDIENTE (decisión de producto) | Fase C |
| Patrón | Vistas fuera de árbol+VIEW_TO_HUB_MAP invisibles | P0 | **PATRÓN CORREGIDO en Costo**; extender | Fase A-resto |

## 3. Principios rectores (contrato de diseño permanente)

1. **VISTA / MODO / ACCIÓN / HERRAMIENTA, sin mezclas** — la clasificación depende del modelo mental del usuario, no de la existencia de ViewType/tab/deep-link. Prohibido convertir modos en tarjetas o acciones en páginas.
2. **Fuente única de verdad** — todo nace en `navigation-definition.ts`; las vistas técnicas se registran con metadatos (label/keywords/roles). Ninguna lista paralela.
3. **Contexto primero, descubrimiento por palette** — acciones contextuales que "abren el módulo y ejecutan"; no navegación ficticia.
4. **No duplicación como regla dura** — el acceso nuevo reutiliza componente, estado, motor y ruta.
5. **Accesible ≠ descubierto** — la prueba de novato es el estándar de aceptación.
6. **Evidencia antes que declaración** — cada gate produce artefactos verificables y veredicto explícito.

Estos principios ya están protegidos por tests (GATE 1.4R): modos que no pueden volver a ser hojas de menú, entradas palette que no pueden perder su tab, tabs técnicas que no pueden volver al breadcrumb de error.

## 4. Ejes estratégicos (Fases B–F)

### Fase B — Normalización semántica global (M, riesgo medio)
"Dashboard de Tiendas"→"Comparativa de Tiendas" · unificar 3 labels de cards de dashboard en "Dashboard de la tienda" · default del hub Gestión = "Tiendas" (no Tablón) · "Almacenes y Depósitos" al dominio Almacén · Vitrina nombre único. Keywords actualizadas junto a cada label + snapshot de palette por rol.

### Fase A-resto — Registro técnico + huérfanos restantes (M, riesgo bajo-medio)
Extender el patrón COST_SHEETS_TABS (registro con label) a las vistas técnicas de otros dominios → cero "Módulo No Disponible" en todo el sistema; ejecutar decisión sobre Ofertas/Clientes/Conciliación. Test genérico: "toda vista registrada tiene breadcrumb sin Módulo No Disponible".

### Fase C — Hub Fichas de Costo (M-L, riesgo medio) — condicionada a Decisión 1
Evolucionar la entrada única a hub de tarjetas (patrón Ventas, reutilizando SectionHub): Generar Ficha hero + Análisis + Arena FC + herramientas; modos/acciones siguen en el editor. Compat de deep-links como test obligatorio.

### Fase D — Contexto único de tienda activa (M, riesgo medio-alto, paralelizable)
Purga de `storeId` en favor de `activeStoreId`; un canal primario + palette para cambio de tienda. Tests de integración multi-tienda + smoke RLS antes del cierre.

### Fase E — Móvil + palette global + breadcrumb total (M, riesgo medio)
Sheet "Más" plegado por sección; drawer inicial cerrado en móvil (UX-007c); labels de tab bar; acciones contextuales por dominio; umbral fuzzy; test de breadcrumb sobre catálogo completo.

### Fase F — Limpieza y endurecimiento (S, riesgo bajo)
Alias legacy medidos antes de retirar; tips históricos; viewIds duplicados unificados; purga de estado local ante 401 global → login (UX-013).

## 5. Decisiones de producto requeridas

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| 1 | "Mis Fichas" en el terminal (UX-014) | (a) listado real desde `product_cost_sheets`; (b) solo editor; (c) hub sin listado | **(a)** listado real como vista del dominio — pregunta #2 del novato |
| 2 | Vigencia de Ofertas y Conciliación (UX-010) | (a) asignar dominio; (b) legacy formal | (a) Ofertas→Ventas, Conciliación→ANÁLISIS si hay uso; si no, (b) con métrica |
| 3 | Destino del Tablón (UX-005) | (a) tab secundaria; (b) transversal | (a) tab secundaria con default "Tiendas"; re-evaluar (b) con métricas |
| 4 | Header de tabs de módulo | (a) nombre del módulo; (b) leaf del registro | **(b)** leaf del registro (dato ya existe en COST_SHEETS_TABS) |

Criterio transversal: no convertir "existe en código" en "debe estar en menú" sin evidencia; no inventar implementaciones para llenar huecos de navegación.

## 6. Hoja de ruta

| Orden | Fase | Tamaño | Riesgo | Depende de |
|---|---|---|---|---|
| 1 | B — Semántica global | M | Medio | — |
| 2 | A-resto — Registro técnico + huérfanos | M | Bajo-Medio | Decisión 2 |
| 3 | C — Hub Fichas de Costo | M-L | Medio | Fase B, Decisión 1 |
| 3-par | D — Tienda activa única | M | Medio-Alto | — |
| 4 | E — Móvil + palette + breadcrumbs | M | Medio | B, C |
| 5 | F — Limpieza + sesión | S | Bajo | Métricas de uso |

Reglas de secuenciación: recuperar accesos antes que embellecer; no acumular dos fases de riesgo medio en la misma ventana; desarrollo en rama con PM2 local como banco de pruebas (flujo validado en 1.4R).

## 7. Métricas de éxito

| Métrica | Instrumento | Línea base (post 1.4R) | Objetivo |
|---|---|---|---|
| Capacidades huérfanas | orphan × grep + browser | 3 (otros dominios) | 0 |
| Vistas con breadcrumb falso | test genérico + browser | 4 fuera de Costo | 0 |
| Novato descubrible | prueba estandarizada | 7/8 en Costo | ≥ en todos los dominios |
| Falsas pistas de palette | queries medidas | 0 (12 canónicas Costo) | 0 en catálogo completo |
| Suite de tests | vitest run | 2.164/0 | verde y creciente |
| Paridad móvil | browser 390/375 | estructural; drawer pendiente | completa |

Métricas de guardia: cero duplicaciones por gate (test anti-duplicación extendido) y trazabilidad archivo→hallazgo (regla STOP).

## 8. Gobernanza

Protocolo de gate (7 pasos): baseline (HEAD==origin/main, worktree limpia, sin reset/clean) → reconstrucción de arquitectura real desde código → clasificación VISTA/MODO/ACCIÓN/HERRAMIENTA → implementación mínima sobre fuente única → suite de tests completa → browser real (1440/1280/1024/390/375) → cierre Git con push verificado. Veredicto: CERTIFIED / CONDITIONAL / BLOCKED. Evidencia obligatoria en `audit-evidence/<GATE>/`: baseline, clasificación, before/after, palette, browser, regresión, tests, git-closure, FINAL-REPORT. Commits atómicos por gate; cada archivo vinculado a un hallazgo.

Este plan es el **contrato de alcance**: los gates futuros citan la fase que ejecutan; cualquier desvío actualiza el plan antes que el código.

## 9. Riesgos y mitigaciones

| Riesgo | Prob | Impacto | Mitigación |
|---|---|---|---|
| Renombrar labels rompe hábitos/tests | Media | Medio | keywords legacy como puente + snapshot palette por rol (B) |
| Purga storeId afecta RLS/hooks | Media | Alto | integración multi-tienda + smoke RLS previos; fase aislada (D) |
| Palette reintroduce falsas pistas | Media | Bajo | catálogo de queries canónicas por gate (E) |
| Hub duplica navegación / rompe deep-links | Baja | Medio | compat deep-links obligatoria; reusar SectionHub (C) |
| Limpieza rompe bookmarks reales | Baja | Bajo | medir uso antes de retirar (F) |
| Deriva de alcance | Media | Medio | regla STOP + plan como contrato (§8) |

---

*Elaborado a partir de: `audit-evidence/GATE1.4/` (17 documentos + screenshots) y `audit-evidence/GATE1.4R/` (14 documentos + 7 screenshots). Fichas de Costo: RESUELTO (GATE 1.4R CERTIFIED, commits `63918468` + `a603d7cc`).*
