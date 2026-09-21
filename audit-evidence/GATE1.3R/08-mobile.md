# GATE 1.3R.1 — 08 MOBILE (§22, §26) — 390 / 375

## Tabs (390px) — `07-command-palette.json` → mobileTabs

Tab bar inferior derivada de la definición: **Vender · Ventas · Recibir · Inventario · Caja · Más**
(alturas de botón 50px ≥ 44px touch target; un par 36px corresponde a accesos del header).

## Flujo verificado

| Acción | Resultado |
|---|---|
| Tap tab **Vender** | **1 tap** → `/?view=pos` ✓ |
| Tap tab **Ventas** | Abre el MISMO dominio: `?view=sales-hub` con `h2 Ventas`, tarjetas **Vender / Caja / Historial de Ventas** (featured full-width) + "Otras opciones" con las 6 secundarias — sin 9 tarjetas igual de prominentes ✓ |
| Overflow horizontal 390 | **0 px** |
| Overflow horizontal 375 | **0 px** |

## Sheet "Más" (residuos §22)

```text
hasTerminalDeVenta: false
hasVentaAlone:      false
hasVentas:          true   (como item de sección — permitido)
hasVender:          false  (Vender vive como TAB, no duplicado en el sheet)
```

El sheet se deriva de `navigation-definition` (agrupado por sección) — sin labels eliminados
que reaparezcan.

Capturas: `cap-ventas-mobile-390.png`, `cap-mobile-mas-sheet.png`, `cap-ventas-mobile-375.png`.
