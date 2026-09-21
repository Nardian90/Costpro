# GATE 1.4 — 07 COMMAND PALETTE (GATE 10)

Fecha: 2026-09-21T11:36Z · Método: script `scripts/gate14-palette-audit.js` (fuera del repo) ejecutando 23 queries contra la palette REAL en navegador (admin@demo.com). Evidencia cruda: `palette-raw-results.md`. Implementación: actions.ts (SYSTEM_ACTIONS derivado), búsqueda Fuse.js sobre label+keywords+description, stores como kind='store'.

## Resultados verificados

| Query | Resultados (palette real) | Veredicto |
|---|---|---|
| ficha | Fichas de Costo · Análisis ABC · Inteligencia Cambiaria | OK (1er hit correcto) |
| tablero | Tablero Dinámico · Inicio | OK pero colisión de nombres (¿cuál?) |
| **asistido** | **(vacío)** | **FALLO — Modo Asistido invisible** |
| informe | Reportes | FALLO semántico (Informe de ficha ≠ Reportes) |
| arena | Fichas de Costo | FALLO indirecto (aterriza gen-easy, no Arena FC) |
| excel | Reportes · Monitoreo | FALLO (no sugiere acción exportar de ficha) |
| pdf | Reportes | Ídem |
| **json** | Usuarios · Vitrina Pública | **FALLO — falsos positivos fuzzy, Importar JSON inhallable** |
| darian | Chat con Darian (IA) | OK |
| tienda | TIENDA CENTRAL COSTPRO · Gestión de Tiendas | OK (mezcla tienda-acción + vista) |
| vitrina | Vitrina Pública · Gestión de Tiendas | OK (aunque la entrada directa tiene UX-002) |
| dashboard | Dashboard de Tiendas · Inicio | OK (colisión conceptual documentada) |
| noticias | Dashboard de Tiendas · Gestión RSS · Gestión de Tiendas | PARCIAL (la vista news no aparece como "Tablón de Noticias" directo) |
| venta | Dashboard de Tiendas · Ventas · Vender · Historial de Ventas · Venta por Conteo · Inventario · Reportes · Ajustes · Devoluciones | OK (rica) |
| caja | Dashboard de Tiendas · Caja · Trabajadores · Academia | OK |
| conteo | … Venta por Conteo · Ventas · Costeo · Fichas | OK |
| devoluciones | Dashboard · Devoluciones · Ventas | OK |
| cotizacion | Dashboard · Cotizaciones · Ventas | OK |
| cuentas | 9 resultados incl. Cuentas por Pagar · Cobros por Antigüedad | OK |
| calculadora | Dashboard · Calculadora | OK |
| recepcion | Dashboard · Recepciones · Nueva Recepción · CxP | OK (vista + acción) |
| news | Dashboard · Órdenes… · Tablero Dinámico | FALLO (keyword en inglés no matchea nada útil) |
| stores | Dashboard · Vitrina Pública · tiendas | PARCIAL |

## Arquitectura de la palette (hallazgos)

1. **La palette deriva SOLO de vistas de menú + ACTION_EXTENSIONS**: las tabs técnicas de cost-sheets (asistido, reading, arena, templates, tools, masiva, estructural), las vistas huérfanas (ofertas, customers, bank-reconciliation) y las tabs de hubs (news, stores, catalog…) NO existen para la palette. → toda capacidad sin entrada de menú es **COMMAND-PALETTE-INVISIBLE por construcción**.
2. **ACCESSIBLE-BUT-HIDDEN (GATE 22)**: ninguna vista relevante depende SOLO de palette hoy (las paletizadas también tienen tarjeta/hub), PERO el caso inverso sí existe: vistas reales que ni menú ni palette (arena-fc, ofertas, customers, bank-reconciliation) = ORPHAN puro.
3. Duplicados/aliases en palette: "Cuentas por Pagar" aparece por keywords de accounts-payable; los cambios de tienda (kind store) se mezclan con vistas en resultados (UX aceptable, subtítulo "Cambiar a esta tienda" lo distingue).
4. Labels históricos residuales en palette: ninguno detectado como duplicado activo (Terminal de Venta murió correctamente; queda como keyword de Vender — recognition over recall, correcto).
5. La palette NO tiene ACCIONES de dominio (exportar/importar/guardar ficha) — solo navegación + cambio de tienda. Oportunidad estructural (ver 14-proposed-navigation.md §Palette).
