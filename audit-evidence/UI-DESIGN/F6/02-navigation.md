# F6 — 02 NAVIGATION QA (F6-B)

## Fuente única de verdad

`src/config/navigation/navigation-definition.ts` (1.274 líneas) sigue siendo el único
registro de navegación. Importadores verificados (10): `actions.ts` (palette),
`navigation-map.ts` (breadcrumbs), `sidebar.structure.ts` (sidebar + guard de roles),
`useTerminalNavigation.ts` (header), `useViewUrlSync.ts` (deep-links), `store/index.ts`,
`MobileTabBar.tsx`, `ChatBot.tsx` + 2 tests de contrato gate1.
**0 listas paralelas nuevas** detectadas.

## Auditoría como sistema

| Elemento | Verificación | Resultado |
|---|---|---|
| Primary nav (desktop) | secciones OPERACIÓN/ANÁLISIS/SISTEMA/AYUDA/EN DESARROLLO; expansión contextual por vista (p.ej. OPERACIÓN visible en `?view=sales`) | ✓ |
| Secondary nav | hubs con tarjeta+palette (Ventas, Inventario, Gestión de Tiendas) — patrón F4 certificado, sin duplicación nueva | ✓ |
| Mobile nav | tab bar Vender/Recibir/Inventario/Caja/**Más** (49px) + secciones INICIO…EN DESARROLLO en drawer; colapsar barra (48px) | ✓ |
| Breadcrumbs | reales y consistentes en TODAS las vistas visitadas (12 rutas); marcado `disabled` en el crumb actual | ✓ |
| Deep links | `?view=X` en 16 ids: pos, sales-hub, sales, cash, devolutions, quotations, inventory, reception_list, inventory_count, reports, ipv, cost-sheets, settings, management-hub, dashboard, tienda (alias) — todos renderizan la vista correcta | ✓ |
| Back behavior | breadcrumbs "Inicio/OPERACIÓN/…" navegables; "Volver a Ventas" en POS; Cancelar→contexto (F4) sin regresión observada | ✓ |
| Active state | tab seleccionada (`selected`) en Inventario; crumb actual disabled; estados aria correctos | ✓ |
| Focus state | focus visible 3px en tabulación; drawer "Más" mueve focus dentro del diálogo | ✓ |
| Drawer | abre con role=dialog; **Escape cierra** (0 diálogos restantes); focus management correcto | ✓ |
| Tabs | STOCK ACTUAL/CATÁLOGO/TRAZABILIDAD con role=tab y aria-selected | ✓ |

## Anti-duplicación (contrato F4)

* **No hubs duplicados**: un solo hub por dominio (Ventas, Inventario, Gestión de Tiendas, Análisis).
* **No títulos duplicados nuevos**: el patrón doble-H1 (título del header + título de página)
  es la **deuda estructural ya documentada en F4 (clase C: "triple apilado")** — se mantiene
  estable, sin empeoramiento respecto al baseline certificado. Detalle en 10-defects.
* **No navegación paralela**: 0 archivos nuevos con listas de navegación hard-codeadas.
* **No rutas falsas**: `?view=management` (id inexistente) cae a "Módulo No Disponible"
  con breadcrumb honesto — comportamiento correcto, no se crean entradas ficticias.
* **No breadcrumbs fantasma**: cada crumb visitado corresponde a una vista real alcanzable.

## Búsqueda de menú (hallazgo clasificado)

La búsqueda del sidebar (`Sidebar.tsx:94-101` — `filteredNavigation` por label/children)
existe y su mecanismo reaccionó al despachar un evento `input` compatible con React.
Con la simulación estándar del tool (fill/type) el filtro no es observable en el DOM —
limitación conocida de tooling documentada desde F5 (eventos sintéticos React).
La búsqueda primaria de navegación es el **Command Palette (Ctrl+K)**, verificado
operativo. Clasificado **R2-no-confirmado** (10-defects §D-1); no es corrección F6
(no cumple "reproducible").
