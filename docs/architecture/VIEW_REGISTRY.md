# View Registry — Mapa de Vistas de Costpro

> **Resolución del hallazgo "orphan views"** del `review_queue.json` (Phase 15/16 — Documentation Consistency, prioridad high).

## Contexto

La auditoría automatizada de Phase 15 detectó **23 orphan views** (vistas sin documentar) y **29 undocumented components** en `src/components/views/`. Este archivo documenta canónicamente todas las vistas existentes para cerrar ese gap.

## Estructura

El registry canónico está en [`view-registry.json`](./view-registry.json) con el siguiente esquema por vista:

```json
{
  "path": "src/components/views/terminal/views/dashboard/DashboardView.tsx",
  "module": "dashboard",
  "name": "DashboardView",
  "purpose": "Dashboard principal con KPIs"
}
```

## Resumen actual

- **Total de vistas**: 56 (generado desde archivos reales, no desde el review_queue desactualizado)
- **Módulos**: 3 (`terminal`, `executive-demo`, `health`)
- **Submódulos del terminal**: 25 (academy, audit, cash_closure, catalog, chat, cost_sheet, costeo_dinamico, dashboard, exchange_intelligence, help, inventory, inventory_count, ipv, legal, purchase_orders, receptions, reports, rss, sales, sales_hub, section_hub, settings, stock_history, stores, transfers, users, wiki)

## Módulos principales

| Módulo | Vistas | Propósito |
|---|---|---|
| `dashboard` | 4 | KPIs, multi-tienda, OCC, store-specific |
| `inventory` | 5 | Inventario (card/table/adjustments/reception) |
| `ipv` | 10 | Inteligencia de pagos y ventas |
| `cost_sheet` | 4 | Fichas de costo (Res. 148/2023) |
| `stores` | 1 | Gestión multi-tienda |
| `users` | 2 | Roles y usuarios |
| `pos` | 1 | Punto de venta |

## Notas sobre el review_queue original

El reporte de Phase 15 listaba 23 vistas "orphan", pero al verificar físicamente:

- **Vistas que ya no existen** (eliminadas en refactorings posteriores):
  - `src/components/views/terminal/views/audit/AuditTableView.tsx`
  - `src/components/views/terminal/views/health/SystemHealthView.tsx`

- **Vistas renombradas o consolidadas** que aparecen bajo otro nombre en este registry.

Este registry se generó escaneando `src/components/views/**/*View.tsx` directamente, por lo que refleja el estado real del código.

## Mantenimiento

Cuando se añada o elimine una vista, actualizar `view-registry.json`. Para regenerar automáticamente:

```bash
find src/components/views -name "*View.tsx" -type f | sort
```

---

*Generado: 2026-06-30 · Auditoría v3.0 · Costpro Enterprise*
