# F4 — DEEP-LINK CONTRACT VALIDATION

Fecha: 2026-09-28 · Método: verificación EN VIVO con navegador real (agent-browser) contra pm2 localhost:3000, sesión admin autenticada, rama F4 con cambios aplicados.

## Formato canónico (sin cambios en F4)

```text
/                        → Inicio (dashboard)
/?view=X                 → vista directa
/?view=ipv&tab=Y         → vista-módulo IPV
/?view=cost-sheets&tab=Y → vista-módulo Fichas
/?view=help&doc=…        → deep-link de ayuda (preservado)
```

F4 NO modificó `useViewUrlSync.ts`, `LEGACY_VIEW_ALIASES`, el store ni ningún id/route.
Solo se AÑADIERON mapeos de breadcrumb (VIEW_TO_HUB_MAP) y se quitó 1 entrada
shadowed nunca efectiva (`TECHNICAL_DIRECT_ROUTES['customers']`).

## Resultados en vivo (contrato mínimo + vistas afectadas)

| Deep-link | Render | Breadcrumb real | "Módulo No Disponible" |
|---|---|---|---|
| `/?view=pos` | ✓ POSView | Inicio > OPERACIÓN > VENDER | NO |
| `/?view=sales-hub` | ✓ SalesHubView | Inicio > OPERACIÓN > VENTAS | NO |
| `/?view=sales` | ✓ SalesHistoryView | Inicio > OPERACIÓN > VENTAS > HISTORIAL DE VENTAS | NO |
| `/?view=cash` | ✓ CashClosureView | Inicio > OPERACIÓN > VENTAS > CAJA | NO |
| `/?view=inventory` | ✓ InventoryView | Inicio > OPERACIÓN > ALMACÉN > INVENTARIO | NO |
| `/?view=catalog` | ✓ CatalogView | Inicio > OPERACIÓN > ALMACÉN > INVENTARIO > CATÁLOGO | NO |
| `/?view=reception_list` | ✓ ReceptionsHistoryView | Inicio > OPERACIÓN > LOGÍSTICA > RECEPCIONES | NO |
| `/?view=recepcion` | ✓ ProductReceptionView | Inicio > OPERACIÓN > LOGÍSTICA > RECEPCIONES > NUEVA RECEPCIÓN | NO |
| `/?view=reports` | ✓ ReportsView | Inicio > ANÁLISIS > REPORTES | NO |
| `/?view=cost-sheets` | ✓ CostSheetView (tab Experto) | Inicio > OPERACIÓN > COSTO > FICHAS DE COSTO > EXPERTO | NO |
| `/?view=settings` | ✓ SettingsView | Inicio > SISTEMA > AJUSTES | NO |
| `/?view=management-hub` | ✓ ManagementHubView | Inicio > OPERACIÓN > GESTIÓN DE TIENDAS | NO |
| `/?view=storefront-config` | ✓ StorefrontConfigView | Inicio > OPERACIÓN > GESTIÓN DE TIENDAS > VITRINA PÚBLICA ← **F4 fix** | NO (antes SÍ) |
| `/?view=whatsapp-config` | ✓ (hub tab) | Inicio > OPERACIÓN > REDES > WHATSAPP > CONFIGURACIÓN ← **F4 fix** | NO (antes SÍ) |
| `/?view=telegram-group` | ✓ (hub tab) | Inicio > OPERACIÓN > REDES > TELEGRAM > GRUPO DE VENTAS ← **F4 fix** | NO (antes SÍ) |

## Journey D (regresión del fix F-07, en vivo)

```text
Paso 1  /?view=recepcion          → ProductReceptionView
Paso 2  click "Cancelar"          → (botón existente)
Paso 3  URL resultante            → /?view=reception_list   ← ANTES: /?view=inventory
Paso 4  breadcrumb                → Inicio > OPERACIÓN > LOGÍSTICA > RECEPCIONES
Veredicto: el usuario regresa al contexto Recepciones ✓ (pérdida de contexto eliminada)
```

## Alias legacy (spot-check de cobertura, sin cambios)

`occ|core → dashboard` · `tienda → management-hub` · `costos|cost_* → cost-sheets` ·
`punto_venta → sales-hub` · `administracion → users` · `gen-quick|gen-expert → cost-sheets`
— todos con destino canónico vigente (verificados en suite `gate1-url-sync` 10/10 y
`gate1-navigation` 100/100).

## Conclusión

Deep-link contract INTACTO. 15/15 URLs del contrato mínimo + afectadas renderizan
la vista correcta con breadcrumb real y sin crumb fantasma. Los únicos cambios
breadcrumb son ADITIVOS (contexto donde antes había "Módulo No Disponible").
