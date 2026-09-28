# F5 — 07 RESPONSIVE AUDIT (A11)

Fecha: 2026-09-29 · Método: verificación programática de overflow horizontal + navegación real. NO reabre hallazgos F1 salvo regresión demostrable.

## Overflow horizontal (scrollWidth − innerWidth)

| Ancho | POS | Dashboard | Settings |
|---|---|---|---|
| 320 | 0px | 0px | 0px |
| 360 | 0px | — | — |
| 375 | 0px | — | — |
| 390 | 0px | 0px | — |
| 400 | 0px | — | — |
| 768 | 0px | 0px | 0px |
| 1024 | 0px | — | — |
| 1280 | 0px | 0px | 0px |
| 1440 | 0px | 0px | 0px |

→ **0px overflow en toda la matriz probada** — sin regresión responsive F1.

## Verificaciones visuales

- Mobile 320 POS (shot `before-mobile-320-pos.png`): tab bar inferior presente (VENDER/
  RECIBIR/INVENT…/CAJA/MÁS), touch targets correctos, cookie consent con safe-area,
  sin clipping de buscador ni chips (scroll horizontal interno de chips, por diseño).
- Light mobile dashboard (shot `before-light-dashboard.png`): tab bar F1 intacta,
  jerarquía PageHeader correcta, watermark decorativo visible (hallazgo 04-D, no responsivo).
- Breadcrumbs/drawers/headers: sin solapamientos observados en 320–1440.
- Modals probados (visor de imagen catálogo): cierran con Escape y restauran focus (F3 ✓).

## Veredicto

RESPONSIVE: SANO. F5 no introduce cambios de layout (solo color/typografía local y
retiro de decoración), por lo que la matriz se re-validará post-implementación en los
anchos extremos (320/1440) sobre las superficies modificadas.
