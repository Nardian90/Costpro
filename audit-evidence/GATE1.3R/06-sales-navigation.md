# GATE 1.3R.1 — 06 SALES NAVIGATION (GATE 3 · §15–§20, §23–§26)

## Cambio implementado (`SalesHubView.tsx`)

Arquitectura **contenedor de trabajo** (§16): 3 acciones principales con jerarquía visual +
capa secundaria "Otras opciones" (progressive disclosure). Etiqueta "Otras opciones" (semántica)
en lugar de "Más" (§16).

```text
VENTAS — Administración del ciclo comercial
┌────────────────────────────────────────────┐
│ VENDER (featured, ancho completo)          │  → viewId pos
└────────────────────────────────────────────┘
┌──────────────────┐  ┌──────────────────────┐
│ CAJA             │  │ HISTORIAL DE VENTAS  │
└──────────────────┘  └──────────────────────┘
OTRAS OPCIONES
Tabla de Venta · Venta por Conteo · Devoluciones ·
Cotizaciones · Cuentas por Pagar · Cobros por Antigüedad
```

Orden §19 implementado en `SECONDARY_CARDS`. Subtítulo del hub: "Administración del ciclo
comercial" (§18). Alerta de carrito: CTA "Ir a Terminal" → **"Ir a Vender"** (consistencia).

## §17 — NO duplicación del modelo

- Sidebar OPERACIÓN sin cambios: **Vender (1 click → POS) + Ventas (hub)**.
- La tarjeta "Vender" del hub navega con `setCurrentView('pos')` — MISMO viewId, MISMO
  componente POS (TerminalShell `case 'pos'`), CERO rutas/componentes/implementaciones nuevos.
- `navigation-definition.ts` INTACTO (fuente única; solo cambió un tip descriptivo en view-tips).

## §25 — IDs intactos

`pos, sales-hub, sales, cash, sales_catalog, inventory_count, devolutions, quotations,
accounts_payable, accounts_receivable` — sin cambios. Sin cambios de URLs, backend ni permisos.

## Validación browser real (§26) — `06-sales-navigation.json`

| Verificación | Resultado |
|---|---|
| Sidebar OPERACIÓN | `hasVender: true, hasVentas: true` |
| Vender desde sidebar | **1 click** → `/?view=pos` |
| Hub h2 / subtítulo | "Ventas" / "Administración del ciclo comercial" ✓ |
| Tarjetas primarias | Vender ✓ Caja ✓ Historial de Ventas ✓ |
| Featured full-width | `featuredFullWidth: true` (ancho == contenedor) |
| Header "Otras opciones" | `true` |
| 6 secundarias presentes y en orden §19 | `secondaryOrderOk: true` |
| §28 Vender desde hub | → `/?view=pos` (mismo destino) ✓ |
| Caja desde hub | → `/?view=cash` (1 click desde hub) |
| Historial desde hub | → `/?view=sales` |

## §23 — Breadcrumbs

Derivados de `navigation-definition.ts` (sin cambios):
- POS → `Inicio > Operación > Vender` (73/73 tests de navegación lo assertionan).
- SalesHub → `Inicio > Operación > Ventas`; Caja/Historial/etc. → `… > Ventas > <hoja>`.
- La tarjeta del hub no intercala pasos: NO existe `Ventas > Vender > POS`.

## Deep links (§26) — `06-sales-navigation.json` + `08-mobile-deeplinks-refresh.json`

| ?view= | Heading renderizado |
|---|---|
| pos | Vender |
| sales-hub | Ventas |
| cash | Caja |
| sales | Historial de Ventas |
| sales_catalog | Tabla de Venta |
| inventory_count | Venta por Conteo |
| devolutions | Devoluciones |
| quotations | Cotizaciones |
| accounts_payable | Cuentas por Pagar |
| accounts_receivable | Cobros por Antigüedad |
| cash_report | Reporte de Entrega (accesible, no dead route) |

Refresh/back/forward en `?view=cash`: heading persiste ("Caja"), back → `/`, forward → "Caja".
Nota: el detector de error dio `err:true` por un texto de error-boundary dentro de un
`<SCRIPT>` (payload RSC) — **falso positivo** verificado en `07-command-palette.json`
(`deepErrInspect.hits[0].visible: false`, `posVisible: true`).

Capturas: `cap-ventas-desktop.png`, `cap-vender-pos.png`, `cap-caja.png`, `cap-historial.png`,
`cap-fresh-browser.png`.
