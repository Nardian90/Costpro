# GATE 1.3R.1 — 07 COMMAND PALETTE (§21)

Método: browser real, `Ctrl+K`, búsqueda término a término (`07-command-palette.json`).

El acceso global NO se alteró (cero cambios en CommandPalette/navigation-definition).

| Término | Primer resultado | Correcto |
|---|---|---|
| caja | **Caja** | ✓ |
| vender | **Vender** (sin competencia de Ventas/Terminal) | ✓ |
| ventas | **Ventas** + Historial + Vender + Venta por Conteo + Cuentas por Pagar | ✓ |
| venta | Ventas, Vender, Historial de Ventas, Venta por Conteo (sin "Terminal de Venta") | ✓ |
| terminal | **Vender** (keyword técnica resuelve a la acción, no a un label muerto) | ✓ |
| historial | **Historial de Ventas** | ✓ |
| devoluciones | **Devoluciones** | ✓ |
| cotizaciones | **Cotizaciones** | ✓ |
| conteo | **Venta por Conteo** | ✓ |
| cobros | **Cobros por Antigüedad** | ✓ |

Sin entradas duplicadas; sin nuevas rutas.

Captura: `cap-command-palette.png`.
