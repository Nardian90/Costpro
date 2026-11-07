# DIAGNÓSTICO — Auditoría READ-ONLY de la vista "Vales de Salida"

> Fase 1-2 del brief: auditoría previa obligatoria antes de modificar código.
> Alcance (aclaración del usuario): **exclusivamente** `Inicio → Operación → Almacén → Vales de Salida`.
> El acceso desde Vender puede seguir existiendo; esta vista debe ser un módulo propio y especializado.

---

## 1. Arquitectura actual (mapeada)

| Capa | Archivo | Rol |
|---|---|---|
| Registro | `src/config/viewRegistry.ts` (`vales_salida`) | id/route `/?view=vales_salida` |
| Navegación | `src/config/navigation/navigation-definition.ts` | Grupo Inventario/Almacén, keywords vale/salida |
| Shell | `src/components/views/TerminalShell.tsx:121,473` | dynamic import + ErrorBoundary |
| Vista | `src/components/views/terminal/views/inventory/ValesSalidaView.tsx` (419 líneas) | Listado + detalle inline + reversión |
| Reversión | `src/components/views/terminal/views/inventory/ValeSalidaReverseModal.tsx` | POST `/api/vale-salida/[id]/reverse` (focus trap, motivo) |
| Creación (hoy) | `pos/ValeSalidaPanel.tsx` + `pos/useValeSalidaCheckout.ts` | Depende del **carrito de Vender** |
| API | `src/app/api/vale-salida/route.ts` | Zod + trust boundary + RPC `create_vale_salida` |
| BD | `supabase/migrations/20260817000001_vale_salida.sql` (+posteriores) | Tablas, RPCs, numeración `VS-NNNNNN-YYYY` |

### Modelo documental REAL (verificado en código + migraciones)

- `issue_slips`: `slip_number`, `status` **CHECK (completed|voided|reversed)** — nace `completed`, **no existe borrador**; `notes` REQUERIDO; `production_order_id` opcional; `total_cost`; `created_by/at`; `voided_*`.
- `issue_slip_items`: `product_id`, `variant_id`, `production_order_item_id`, `quantity`, `unit_cost`, `total_cost`.
- `stock_movements` ↔ Documento: `reference_id = issue_slips.id`, `reference_doc = 'Vale de Salida ' || slip_number`, `movement_type ∈ {issue_slip_out, issue_slip_reverse}` → **la relación Documento↔Movimiento existe y es recuperable**.
- Invariantes RPC (NO ROMPER): costo server-side (`cost_average`), `store_id` derivado de `profiles.active_store_id`, `user_id` del JWT, `idempotency_key` obligatoria, bloqueo por stock insuficiente y sobreconsumo de OT, reversión solo si `completed`.

---

## 2. Problemas detectados (justificados)

### P1 — «Crear Vale de Salida» abandona el módulo (crítico)
`handleCreate()` hace `setOperationType('issue_slip')` + `setCurrentView('pos')`. En esta vista la intención del usuario es inequívoca («crear documento de salida»), pero el sistema la interpreta como «iniciar venta y cambiar su tipo»: navega a Vender, pierde el contexto del módulo y obliga a pasar por el checkout de ventas. **Violación directa del requisito 1.**

### P2 — «Ver» no muestra el documento real (crítico)
El Eye solo expande items en la misma tarjeta (inline, sin encabezado documental, sin estado, sin trazabilidad completa). No existe un «Detalle del Vale de Salida». Además el expandir queda deshabilitado si el vale no tiene items (`itemCount > 0`): un vale sin líneas es invisible. **Violación de los requisitos 7-8.**

### P3 — Un solo modo de visualización (tarjetas)
Sin modo tabla densa para gestión con muchos documentos (requisitos 5-6). No hay orden por columnas ni densidad tipo ERP.

### P4 — Información incompleta / sin jerarquía
- Cantidad **sin unidad** en el detalle (`×3`, sin `UN`/`KG`).
- No se muestra el total de unidades del vale en el listado (solo nº de líneas).
- `notes` es el concepto/destino real del vale pero se muestra como texto plano secundario.
- Estados anulado/devuelto/completado no jerarquizados visualmente en el listado.

### P5 — `limit(100)` silencioso
Consulta con `.limit(100)` sin paginación ni aviso: con >100 vales los antiguos desaparecen y la búsqueda no los encuentra. El usuario no recibe indicio del truncado.

### P6 — Exceso de clics para la operación principal
Crear hoy: salir del módulo → Vender → buscar/agregar → carrito → panel → emitir. La operación núcleo del módulo exige abandonarlo.

### P7 — Trazabilidad dentro del documento ausente
El detalle del vale no lista los movimientos de inventario que generó (`issue_slip_out` / `issue_slip_reverse` vía `reference_id`), aunque la relación existe en BD. El requisito pide entender «este movimiento pertenece a este vale» (requisito 9) **dentro del módulo**.

### P8 — Estados vacíos desalineados con el objetivo
El texto de vacío instruye «Emitidos desde Vender → Carrito…», reforzando el acoplamiento que el brief pide romper.

### P9 — Encabezado sin jerarquía de ubicación
Sin breadcrumb/contexto (Inicio → Operación → Almacén) ni indicación de tienda activa en el header (solo en estado vacío).

### P10 — Hook de creación acoplado al carrito
`useValeSalidaCheckout` lee `items/valeNotes/productionOrderItemIds` del cart store: no reutilizable fuera de Vender. El flujo dedicado necesita un hook propio que llame al **mismo endpoint** (misma Zod server-side, misma RPC, misma numeración) sin duplicar la lógica de negocio.

---

## 3. Solución diseñada (sin duplicar negocio)

| # | Pieza | Reutiliza | Crea |
|---|---|---|---|
| A | Modal dedicado «Crear Vale de Salida» (2 pasos: Documento → Confirmación) + estado «registrado» | `/api/vale-salida`, RPC, Zod server, `useProducts` (`get_products_for_pos`), patrón focus-trap de `ValeSalidaReverseModal` | `ValeSalidaCreateModal.tsx` + `useCrearValeSalida.ts` |
| B | Modo tabla profesional (persistido) + modo tarjetas conservado y mejorado | `DocumentStatusBadge`, tokens/diseño CostPro | render de tabla + toggle |
| C | Modal «VALE DE SALIDA» (documento real: encabezado, tabla de productos con unidad, pie de trazabilidad, movimientos generados vía `reference_id`) | `supabase` RLS, `DocumentStatusBadge`, `BaseModal` | `ValeSalidaDetalleModal.tsx` |
| D | Mejoras listado: paginación «Cargar más» (misma query RLS), unidades, contador por estado, empty states alineados, breadcrumb | TanStack Query existente | ajustes en `ValesSalidaView.tsx` |

**Fuera de alcance (por aclaración del usuario):** la vista Trazabilidad/StockHistory. El vínculo Documento↔Movimiento se resuelve **dentro de este módulo** mostrando los movimientos del vale en su detalle.

**No se toca:** reglas contables, RPCs, permisos, RLS, numeración, reversión, flujo de Vender (el botón de Vender sigue operativo).

---

## 4. Plan de implementación (commits)

1. `docs(audit):` este documento (base del PR).
2. `feat(vales): modal dedicado de creación` — create modal + hook + validación pre-confirmación.
3. `feat(vales): modo tabla profesional` — toggle persistido + tabla densa.
4. `feat(vales): detalle documental real` — modal VALE DE SALIDA + movimientos del vale.
5. `refactor(vales): mejoras de listado y estados` — paginación, unidades, jerarquía, empty states, breadcrumb.
6. `test(vales):` actualizar/expandir tests de vista + navegación; regresión de Ventas.
7. Informe final (A–G) como comentario del PR.
