# GATE 1.4 — FINAL REPORT · AUDITORÍA UX EXTENSIVA

Proyecto: COSTPRO · HEAD auditado: `86d99d54` (== origin/main, worktree limpia) · Fecha: 2026-09-21 · Modo: READ-ONLY (cero cambios de producto; única escritura: esta carpeta de evidencia)

---

## 1. Arquitectura actual (resumen)

5 secciones (INICIO única + OPERACIÓN + ANÁLISIS + SISTEMA + AYUDA + EN DESARROLLO), 8 hubs/submenús, ~44 hojas de menú, ~95 ViewTypes válidos, 41 vistas técnicas, 20 alias legacy, palette derivada + ACTION_EXTENSIONS, móvil derivado (4+1 tabs + sheet). Fuente única real (`navigation-definition.ts`) con derivadores verificados. GATE 1.3 (Ventas) certificado e intacto.

## 2. Capacidades huérfanas (sin camino razonable)
- **Arena FC** (P0 — motor completo, 0 triggers UI)
- **Ofertas** (P1) · **Clientes CRM** (P1) · **Conciliación Bancaria** (P1)
- (Modo Asistido / Informe / Plantillas / Masiva / Estructural: HIDDEN — con acceso contextual parcial pero palette/menu-invisibles)

## 3. Capacidades mal ubicadas
- Tablón de Noticias como tab DEFAULT de Gestión de Tiendas (transversal en dominio ajeno)
- Almacenes y Depósitos: breadcrumb de Gestión de Tiendas en desktop vs Inventario en móvil
- Tablero Dinámico (fichas) sin indicación de "de qué" ni presencia en su dominio

## 4. Tabs semánticamente incorrectos
Gestión de Tiendas (default+mix), cost-sheets (tabs técnicas que son modos/herramientas/vistas), warehouses. Detalle: 04.

## 5. Acciones que deberían ser acciones (y hoy no se descubren como tales)
Guardar ficha · Exportar Excel/PDF · Importar JSON · Abrir Modo Asistido · Generar Informe · Abrir turno de caja — correctas en contexto (editor/Caja), ausentes de palette como ACCIONES (UX-008).

## 6. Vistas que deberían ser hubs
**Fichas de Costo** (justificado: 9 capacidades relacionadas e independientes; patrón Ventas ya probado). Gestión de Tiendas ya es hub (reordenar).

## 7. Vistas que deberían ser globales
Ninguna nueva (DarianAI y Calculadora ya son globales correctas). Tablón candidato a transversal (decisión de producto).

## 8. Vistas que deberían ser contextuales (y ya lo son — mantener)
cash_report (modal elevado), Nueva Recepción, tarjetas de Ventas, modos del editor. La maqueta §5 NO debe convertirse en tarjetas literalmente: Asistido/Informe son MODOS, Guardar/Export/Import son ACCIONES.

## 9–14. Fichas de Costo propuesta · Gestión de Tiendas propuesta · Dashboard de tienda activa · Vitrina · Tablón · Ventas
Ver 14-proposed-navigation.md. Síntesis: hub Fichas (Generar hero + Mis fichas + Análisis + Plantillas + Arena FC + Herramientas; modos y export/import permanecen en el editor y suben a palette como acciones) · Gestión de Tiendas con Tiendas como default, Vitrina entrada única, Tablón secundario · Dashboard de tienda activa YA accesible 1-clic desde Inicio (verificado) — formalizar · Ventas: SIN CAMBIOS.

## 15. Command Palette
Deriva solo de vistas de menú + ACTION_EXTENSIONS → todo lo demás es invisible ("asistido"=0 resultados medido; "json" falsos positivos). Propuesta: capa de ACCIONES + labels técnicos registrados. Detalle: 07.

## 16. Mobile
Paridad estructural por fuente única ✓; sheet MÁS plano y largo, drawer autoabierto, labels truncados; las capacidades ocultas también lo son en móvil. Detalle: 08.

## 17. Breadcrumbs
Correctos en todo el árbol + hubs (GATE 1.1 sólido). Rotura sistémica: vistas fuera de árbol+VIEW_TO_HUB_MAP → "Módulo No Disponible" falso (UX-002, 4 vistas verificadas en browser).

## 18. Deep-links
Todos los probados renderizan su componente (19/19 WORKS a nivel de contenido); 4 con breadcrumb/header falso; sin gate de sesión visible al caducar (UX-013). Detalle: 09.

## 19. Permisos
Sin modificaciones. Modelo UI≠auth correcto. Riesgo potencial: huérfanas default-open por URL. La arquitectura propuesta conserva la herencia de roles. Detalle: 10.

## GATE 19 — Matriz ANTES / DESPUÉS de la reorganización reciente (evidencia, no memoria)

| Capacidad | Antes (pre-GATE 1) | Ahora (86d99d54) | Resultado |
|---|---|---|---|
| Tablero Principal | accesible (hoja propia) | **accesible** — renombrado "Tablero Dinámico", en ANÁLISIS + tab de cost-sheets | ✓ recuperado (nombre confuso) |
| Generar Ficha/Fichas | accesible (21 hojas) | **accesible** — 1 entrada → GENERAR FÁCIL | ✓ consolidado |
| Modo Asistido | accesible (hoja propia) | **HIDDEN** — modo del editor + deep-link; palette 0 resultados | ✗ degradada |
| Informe | accesible (hoja propia) | **HIDDEN** — ídem + falsa pista a "Reportes" | ✗ degradada |
| Arena FC | accesible (hoja propia) | **ORPHAN** — solo deep-link, 0 triggers UI | ✗✗ perdida |
| Guardar / Export Excel / Export PDF / Import JSON | accesibles (grupo Herramientas) | **contextuales del editor** (correcto) pero palette-invisibles | ◐ correcto-ahora, invisible-antes |
| DarianAI | accesible | **accesible ×3 canales** (FAB, palette, rail) | ✓ mejorada |
| Dashboard de tienda | accesible vía Gestión | **accesible 1-clic desde Inicio** (cards) | ✓ mejorada |
| Vitrina | accesible (hoja) | **accesible ×2** (tab hub + palette) con breadcrumb falso en la 2ª | ◐ con defecto UX-002 |
| Tablón noticias | accesible (hoja) | **accesible** (tab default del hub + vista) | ✓ con duda semántica |
| Ofertas / Clientes / Conciliación | accesibles (hojas "Otros"*) | **ORPHAN** (sin dominio asignado) | ✗ perdidas |
| Ventas (ciclo comercial) | accesible (grupos) | **accesible y jerárquico** (hub certificado GATE 1.3) | ✓ mejorada |
| Conocimiento (Ayuda/Wiki/Academia/Legal) | accesible | accesible (sección AYUDA) | ✓ |

\* según árbol histórico referenciado en GATE 0.1/GATE 1 (21 hojas sidebar incl. wrappers muertos).

## GATE 20 — Regresión de navegación
`86d99d54` no tocó archivos de navegación → sin regresiones nuevas por el último commit. Los P0/P1 documentados son **deuda de la consolidación GATE 1/1.1** (21→1 hojas del dominio Costo y limpieza de grupos), no del cierre 1.3R.1. Detalle: 09 §GATE 20.

## GATE 22 — Accesible ≠ descubierto (clasificación final de canales)
- DIRECTLY DISCOVERABLE: Inicio, Vender, Ventas(+9), Almacén(+7), Logística(+4), Costo(3+gen), Trabajadores, Gestión(3 tabs), Redes(2), Análisis(5), Sistema(8), Ayuda(4), Desarrollo(3), Chat, Calculadora, Nueva Recepción
- CONTEXTUALLY DISCOVERABLE: cash_report, catalog/history/lots, modos y acciones del editor, Dashboard por tienda, Darian en ficha
- COMMAND-PALETTE ONLY: ninguna (correcto)
- DEEP-LINK ONLY: **Arena FC, Ofertas, Clientes, Conciliación, Plantillas** (y tabs técnicas view-assisted/view-reading como entradas)
- BROKEN (UX, no render): storefront-config, customers, bank-reconciliation, ofertas (breadcrumb/header falso — UX-002)

## Novato (GATE 21): 14/21 tareas OK · 2 semánticas (Informe/Tablero) · 5 imposibles por UI (Arena FC, Ofertas, Clientes, Conciliación, Asistido-sin-ficha). Detalle: 06.

## Plan de remediación
FASE A (recuperar P0) → B (semántica) → C (hub Fichas) → D (tienda activa/legacy id) ∥ → E (palette/móvil/breadcrumb) → F (limpieza). Detalle con archivos/riesgos/tests/aceptación: 15.

## Checklist de cierre (§33)

```
✓ inventario completo (01: 70+ filas con evidencia)
✓ todas las vistas importantes identificadas
✓ vistas huérfanas identificadas (05: 3 orphans + 5 hidden)
✓ capacidades perdidas por reorganización identificadas (GATE 19)
✓ tabs semánticamente auditados (04: 17 filas)
✓ Fichas de Costo auditadas completamente (02: 10 preguntas × 10 capacidades)
✓ Gestión de Tiendas auditada completamente (03)
✓ Dashboard de tienda activa auditado (03 GATE 5, browser)
✓ Vitrina auditada (03 + 11 D-2)
✓ Tablón de Noticias auditado (03 GATE 4)
✓ Command Palette auditada (07: 23 queries medidas en browser)
✓ Mobile auditado (08: 375 real + derivación)
✓ deep-links auditados (09: 19 rutas probadas)
✓ permisos auditados sin modificaciones (10)
✓ duplicaciones auditadas (11: 9 casos D-*)
✓ arquitectura propuesta (14)
✓ plan de remediación separado (15)
✓ cero cambios de producto durante este gate (worktree: solo audit-evidence/GATE1.4/)
```

## Preguntas abiertas (no bloquean el veredicto)
1. ¿Vigencia de producto de Ofertas y Conciliación Bancaria (¿vistas o legacy)? — decide producto en Fase A.
2. ¿El Tablón debe ser transversal-global o tab de Gestión? — decisión de producto en Fase B.
3. ¿"Mis fichas" existe como listado en el terminal o es exclusivo del MVP /fc/? — define alcance de Fase C.

---

## VEREDICTO

```text
GATE 1.4 = CONDITIONAL — AUDIT COMPLETE WITH OPEN QUESTIONS
```

Fundamento: la auditoría está COMPLETA (checklist 18/18, evidencia por browser + git + código, cero cambios de producto). Es CONDITIONAL —no BLOCKED— porque 3 preguntas de producto (vigencia Ofertas/Conciliación, destino del Tablón, alcance "Mis fichas") condicionan detalles de las Fases A–C pero no la validez del diagnóstico ni del plan. No aplica CERTIFIED: este gate es diagnóstico arquitectónico, no implementación.

Hallazgo-cabecera: **la reorganización logró un menú coherente y sin duplicaciones (Ventas es el patrón correcto), pero el precio pagado fue concentrar la deuda en el dominio Costo (Arena FC perdida, modos invisibles) y en un falso "Módulo No Disponible" para vistas técnicas — ambos con remediación de riesgo bajo/medio ya planificada.**
