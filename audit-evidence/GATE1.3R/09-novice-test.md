# GATE 1.3R.1 — 09 NOVICE TEST (§27) — clicks reales medidos

Método: browser real, navegación exclusivamente por UI (sidebar focus-mode → drill-in
OPERACIÓN → item; hub → tarjeta). Cero navegación URL para contar clicks.

| Tarea | Clicks reales | Destino | Esperado §27 | PASS |
|---|---|---|---|---|
| Vender | **1** (sidebar OPERACIÓN → Vender) | `/?view=pos` | 1 | ✓ |
| Caja | **2** (Ventas → tarjeta Caja) | `/?view=cash` | máx 2 | ✓ |
| Historial | **2** | `/?view=sales` | máx 2 | ✓ |
| Devoluciones | **2** | `/?view=devolutions` | máx 2 | ✓ |
| Cotizaciones | **2** | `/?view=quotations` | máx 2 | ✓ |
| Cobros | **2** | `/?view=accounts_receivable` | máx 2 | ✓ |
| Conteo | **2** | `/?view=inventory_count` | máx 2 | ✓ |
| Recepción | 1–2 (Logística en sidebar; tab Recibir en barra = 1) | — | máx 2 | ✓ |
| Transferencia | 1–2 (Logística en sidebar; Transferencia Stock en sheet Más = 2) | — | máx 2 | ✓ |
| Inventario | 1 (Almacén en sidebar; tab Inventario = 1) | — | — | ✓ |

No hubo navegación artificialmente favorable: los 2 clicks de las tareas del dominio Ventas
son el camino natural (sidebar → hub → tarjeta), y el hub ahora PRIORIZA exactamente las
acciones más frecuentes (Caja e Historial ascienden a la capa primaria).

Móvil: Vender = 1 tap (tab). Ventas → hub = 1 tap; Caja/Historial desde hub = 2 taps.
