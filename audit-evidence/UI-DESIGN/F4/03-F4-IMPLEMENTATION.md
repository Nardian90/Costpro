# F4-C/D — IMPLEMENTACIÓN (cambios realizados)

Rama: `audit/f4-information-architecture` · Base: `60dd04ac`
Principio rector: mínimo cambio — cada edición cita su hallazgo (F-xx de 01-F4-AUDIT.md) y su justificación de IA (no estética).

---

## P1 — Alto impacto / bajo riesgo

| # | Hallazgo | Archivo | Cambio |
|---|---|---|---|
| 1 | F-10 ghost crumbs | `src/config/navigation/navigation-map.ts` | `VIEW_TO_HUB_MAP` +12 entradas: `storefront-config → management-hub` ("Vitrina Pública") y las 10 sub-vistas de bots → `whatsapp-hub`/`telegram-hub` (Configuración/Conversaciones/Invitaciones/Dashboard/Grupo de Ventas). El crumb fantasma "Módulo No Disponible" en refresh/bookmark desaparece; el fallback para strings desconocidos se PRESERVA (test gate1-viewid-contract §6 sigue en verde) |
| 2 | F-05 "TPV" | `src/components/views/terminal/views/pos/POSView.tsx` | h2 "TPV" eliminado (desktop-only). El título lo dan Header + breadcrumb ("Vender"). Término prohibido por el task book y retirado por GATE 1.3 |
| 3 | F-07 pérdida de contexto | `src/components/views/TerminalShell.tsx` (case `recepcion`) | `onCancel` de Nueva Recepción: `setCurrentView('inventory')` → `setCurrentView('reception_list')` — vuelve al dominio Recepciones (ambas entradas al flujo viven ahí) |
| 4 | F-04 management-hub | `ManagementHubView.tsx` | (a) breadcrumb local ELIMINADO (duplicaba el global con segmento falso "MULTI-TIENDA"); (b) h2 "Gestión" → "Gestión de Tiendas" (label de menú); (c) tab "Gestión Tiendas" → "Tiendas" (id persiste, sin efecto en localStorage guard); (d) import `ChevronRight` retirado |
| 5 | F-03 identidades de settings | `SettingsView.tsx` + `Header.tsx` | h2 "Ajustes Globales" → "Ajustes"; menú usuario "Configuración" → "Ajustes". La vista, el menú lateral, el menú de usuario y el error-boundary ahora comparten UN nombre |
| 6 | F-06/F-03 nombres de error | `TerminalShell.tsx` | `viewName` "Configuración"→"Ajustes", "Historial de Recepciones"→"Recepciones" (alineados al menú) |
| 7 | F-09 splash legacy | `CostSheetView.tsx:492` | Splash "Tablero Principal" → "Fichas de Costo" (nombre retirado por GATE 1.4R) |

## P2 — Nomenclatura secundaria + higiene

| # | Hallazgo | Archivo | Cambio |
|---|---|---|---|
| 8 | F-13 colisión "Caja" | `POSView.tsx` | Botón carrito desktop "Caja (n)" → "Carrito (n)" (aria-label, móvil y live-region ya decían "carrito"); **test actualizado** `pos-cart-counter.test.tsx` (aserciones "Caja (n)"→"Carrito (n)", comportamiento medido intacto) |
| 9 | F-15 3er nombre de Historial | `POSView.tsx` | Botón "Registro" → "Historial" (destino `sales` = "Historial de Ventas" en todo el resto del sistema) |
| 10 | F-12 término retirado | `useKeyboardShortcuts.ts` + `system-prompt-builder.ts` | "Ir a Vender (Terminal de Venta / POS)" → "Ir a Vender (POS)"; prompt IA "Vender (Terminal de Venta / POS): pos" → "Vender (POS): pos". Nav keywords intactas (test gate1 :270-275 verde) |
| 11 | F-12b "Tabla IPV" | `useSalesCatalog.ts` + `salesCatalogExport.ts` | Toast "Tabla IPV limpiada" → "Tabla de Venta limpiada"; instrucciones Excel (Pasos 1 y 5) "Tabla IPV" → "Tabla de Venta" |
| 12 | F-16 ortografía | `Header.tsx` | "Cerrar Sesion" → "Cerrar Sesión" |
| 13 | F-11 (limitado) PageHeader F2 | `ReceptionsHistoryView.tsx` + `InventoryCountView.tsx` | Encabezados self-made migrados 1:1 a PageHeader (título/descripción/acciones; íconos Warehouse/ClipboardList). En InventoryCountView corrige además h2 con clases duplicadas en conflicto (text-foreground+text-primary, font-black ×2, uppercase ×2). Receptions: Nueva=primaryAction; Express/Tasas/Exportar=secondaryActions (misma jerarquía visual, jerarquía F2 canónica). **SalesCatalogView se difiere a P3**: su título ya coincide con la navegación y es una superficie compacta de trabajo (migrar = reestructurar toolbar, riesgo > beneficio) |
| 14 | Higiene config | `navigation-definition.ts` | (a) `TECHNICAL_VIEW_IDS`: retirados los 6 ids con doble clasificación (`sales`, `inventory_count`, `devolutions`, `quotations`, `accounts-payable`, `ofertas`) — ya están en ACTION_EXTENSIONS y la lista decía "sin entrada de navegación"; sin consumidor runtime (guard default-open) = cambio documental puro; (b) `VALID_VIEWS` + `'costo'` (ViewType real con case SectionHubView, faltaba en el set de integridad) |
| 15 | Higiene config | `navigation-map.ts` | `TECHNICAL_DIRECT_ROUTES['customers']` eliminado (shadowed por `IPV_ROUTES['customers']` en el spread — nunca fue efectivo; CRM canónico = id `clientes`; deep-link `/?view=customers` sigue resolviendo por case del shell + breadcrumb "Clientes" vía VIEW_TO_HUB_MAP) |

## NO tocado (por diseño)

- MobileTabBar, sheet "Más", sidebar drawer, touch targets (F1).
- PageHeader existentes, tokens tipográficos, cp-page-title CSS (F2).
- useFocusTrap, modales, toasts de F3; solo cambió el DESTINO de un cancel.
- Roles, permisos, backend, APIs, lógica de negocio, `isViewAllowedForRole`, `COSTO_ALLOWED_VIEWS`.
- "Dashboard de Tiendas" (ANÁLISIS) y "Mi Perfil" — candidatos D documentados, sin eliminar (no-sorpresa).
- Componentes muertos/huérfanos — F-class documentado, sin borrado.
- `MobileTabBar.costTabs`, `RoleForm.AVAILABLE_VIEWS`, `HELP_DOC_BY_VIEW` — listas locales aceptadas/deuda documentada.

## Difusiones conscientes (P3, no bloquean)

- PageHeader en ~22 vistas restantes (migración masiva = 20+ vistas → fuera de F4).
- Triple apilado estructural (Header h1 + crumb + título de vista) — requiere registro vista→PageHeader y toque global.
- Consolidación dashboard Inicio/Dashboard de Tiendas y fusión Mi Perfil — decisión de producto.
- Limpieza de 26 huérfanos.

## Validación de esta implementación

```text
bunx tsc --noEmit                        → 0 errores
eslint (15 archivos tocados)             → 0 errores, 51 warnings PREEXISTENTES
                                           (advisory V2.12.25 <button> crudo, mismo patrón
                                           previo en las mismas superficies — nada nuevo)
vitest run (suite completa)              → 116 files: 2355 passed, 24 skipped, 0 failed
  · gate1-navigation.test.ts             → 100/100 ✓ (labels, keywords, breadcrumbs)
  · gate1-viewid-contract.test.tsx       → 20/20 ✓ (fallback "Módulo No Disponible" preservado)
  · gate1-url-sync.test.ts               → 10/10 ✓ (deep-links)
  · pos-cart-counter.test.tsx            → 3/3 ✓ (aserciones alineadas al label F4)
git diff --check                         → CLEAN
Diff: 15 archivos, +171/−103 · 0 componentes nuevos · 0 fuentes de verdad nuevas
```
