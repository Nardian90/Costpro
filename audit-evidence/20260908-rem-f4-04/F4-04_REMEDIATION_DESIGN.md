# F4-04 REMEDIATION DESIGN — WAC CANONICAL PATH
**Gate:** REM-F4-04 | **Fecha:** 2026-09-09 | **Baseline:** 310fad7d (HEAD == origin/main, worktree clean)
**Pack:** audit-evidence/20260908-rem-f4-04/

---

## 1. ¿Cuál era exactamente el defecto?

El camino real de recepción (HTTP) no actualiza el WAC:

```
POST /api/inventory/receptions  →  HTTP 201
  → register_reception (RPC, SECURITY DEFINER)
    → receipt creado (status='active')
    → receipt_items insertados
    → register_stock_movement → stock incrementa, movement creado
    → products.cost_average SIN CAMBIAR (permanece 0 si inició en 0)
```

Evidencia RECON (20260908-fase4-e2e-1-recon, veredicto RECON COMPLETE — P1s RECONFIRMED):
`stock: 0 → 10, WAC: 0 → 0` sobre AUDIT F4E1 STORE A (producto Arena).

## 2. ¿Cuál es el root cause?

`register_reception` (definición viva, guardada en
`evidence/register_reception_live.sql`, líneas 125-127) contiene el comentario:

```
-- A1 WAC HOTFIX (v2.22.0): Path 3 eliminado.
-- El WAC lo calcula register_stock_movement (Path 2, corregido en A2)
-- y el trigger trg_update_product_wac (Path 1).
```

Ese comentario delega el WAC a dos mecanismos que NO existen en la BD viva:

- **Path 1:** trigger `trg_update_product_wac` — AUSENTE en `pg_trigger`
  (verificado 2026-09-09; solo existen `trg_ensure_product_barcode`,
  `trg_guard_wac_writer`, `trg_maintain_product_completeness`,
  `trigger_audit_product_changes` en `products` y
  `trg_check_reception_cost_variation`, `trg_sync_has_movements_receipt`
  en `receipt_items`).
- **Path 2:** `register_stock_movement` — su cuerpo (líneas 38-41) dice:
  `"A2 WAC HOTFIX (v2.22.0): WAC update removed from register_stock_movement.
  The trigger trg_update_product_wac handles WAC for receipt_items."`
  Es decir, cada mecanismo delega en el otro → el WAC nunca se escribe.

El único escritor funcional en la BD viva es `fn_recalc_wac`, invocado por el
camino canónico `confirm_pending_reception` (RECON: WAC 800 → 802 exacto).

## 3. ¿Cuál será el único escritor de WAC?

**`public.fn_recalc_wac(p_store_id, p_product_id, p_event, p_qty_in, p_uc_in, p_source_ref)`**

Propiedades verificadas (definición completa en `evidence/remf404-db-inspection.txt` §A2):

| Propiedad | Valor |
|---|---|
| Fórmula entrada | `ca_new = (S·ca_prev + q·uc) / (S+q)` (blend canónico D-01) |
| Fórmula salida pura (q=0) | `ca_new = ca_prev` (invariante) |
| Fórmula reversa (q<0) | inversa exacta del blend; exige `S+q > 0` |
| Atomicidad | `SELECT ... FOR UPDATE` sobre la fila de product |
| Token de escritor | `SET LOCAL app.wac_writer='fn_recalc_wac'` durante su propio UPDATE |
| Auditoría | INSERT en `wac_change_log` (before/after/event/qty/uc/source_ref/auth.uid()) |
| Seguridad | SECURITY DEFINER; ACL EXECUTE: postgres, service_role (NO anon, NO authenticated directo) |
| Enforcement externo | trigger `trg_guard_wac_writer` BEFORE UPDATE OF cost_average ON products exige el token — cualquier otro UPDATE de cost_average falla con `ERR_WAC_SINGLE_WRITER_VIOLATION` |

## 4. ¿Dónde se invocará?

Dentro de `register_reception`, inmediatamente ANTES de la llamada a
`register_stock_movement`, en el mismo loop por ítem:

```sql
PERFORM public.fn_recalc_wac(
  p_store_id   := p_store_id,
  p_product_id := v_product_id,
  p_event      := 'reception_in',
  p_qty_in     := v_units_to_add,
  p_uc_in      := v_uc_base,
  p_source_ref := jsonb_build_object('rpc','register_reception','receipt_id',v_receipt_id)
);
```

**Orden doctrinal W62-01 §6** (mismo que `confirm_pending_reception`, línea 29
de su definición: "WAC primero → movimiento después (kardex ve ca_new)").
Este orden es matemáticamente obligatorio: `fn_recalc_wac` mezcla con el stock
PREVIO a la entrada (`S·ca_prev + q·uc)/(S+q)`); si se invocara después del
movimiento, `S` ya incluiría `q` y la entrada se contaría dos veces
(ej.: (100·800+1·1000)/101 = 802.86 ≠ 802).

### Nota sobre unidades (decisión D3)

`fn_recalc_wac` espera `p_uc_in` = costo por unidad BASE (las mismas unidades
que `p_qty_in` y que `stock_current`). `register_reception` calcula
`v_unit_cost_cup = unit_cost × tasa_cambio_recepcion` (costo por unidad de
ítem/variante). Para variantes con `conversion_factor ≠ 1` se usa:

```sql
v_uc_base := CASE WHEN COALESCE(v_conversion_factor, 1.0) > 0
                  THEN v_unit_cost_cup / COALESCE(v_conversion_factor, 1.0)
                  ELSE v_unit_cost_cup END;
```

Así `q × uc = v_units_to_add × (v_unit_cost_cup / factor) = v_unit_cost_cup × v_quantity`
= valor pagado exacto (idéntico al acumulado en `receipts.total_cost`).
En el caso estándar (sin variante, factor=1) `v_uc_base == v_unit_cost_cup`:
**no se introduce ninguna regla financiera nueva**, solo se expresa el costo
en las unidades que la fórmula canónica espera. (§19: usar la regla existente.)

## 5. ¿Qué camino dejará de escribir directamente?

Ninguno escribía directamente. Tras el cambio:

- `register_reception` DELEGA en `fn_recalc_wac` (deja de asumir triggers
  inexistentes). Su comentario obsoleto "A1 WAC HOTFIX (v2.22.0)" se elimina.
- `register_stock_movement` permanece INTACTO (no escribe WAC; comportamiento
  ya verificado, solo registra movimiento y stock).

## 6. ¿Cómo se garantiza atomicidad?

- Todo ocurre dentro de la MISMA transacción: `register_reception` es plpgsql
  SECURITY DEFINER; `fn_recalc_wac` y `register_stock_movement` se ejecutan con
  `PERFORM`/subllamada en esa transacción. Cualquier fallo (p.ej.
  `ERR_WAC_SINGLE_WRITER_VIOLATION`, `ERR_INVALID_UNIT_COST`) revierte receipt,
  items, movimiento, WAC y audit log atómicamente.
- `SET LOCAL app.wac_writer` es transaccional por definición → el token nunca
  escapa a otra transacción.
- `fn_recalc_wac` toma `FOR UPDATE` sobre la fila del producto → sin carreras
  de concurrencia en el blend.

## 7. ¿Cómo se evita doble cálculo?

1. `register_reception` invoca `fn_recalc_wac` UNA sola vez por ítem, en el
   orden WAC→movimiento (el stock aún no incluye la entrada).
2. `register_stock_movement` no escribe WAC (verificado en cuerpo vivo).
3. El trigger ausente NO se recrea → no hay segundo escritor.
4. La guarda `trg_guard_wac_writer` bloquea cualquier UPDATE de cost_average
   sin token → imposible que un cuarto mecanismo aparezca sin token.
5. `confirm_pending_reception` mantiene su propia llamada canónica (sin tocar);
   los dos caminos de recepción son mutuamente excluyentes (receipt 'active'
   vs 'pending'), no pueden dispararse ambos sobre el mismo receipt.

## 8. ¿Cómo se evita WAC=0 con stock>0?

- `register_reception` valida B4: `unit_cost > 0` → `v_uc_base > 0`
  (tasa ≥ 0.01 validada C1) → toda entrada posterior al fix incorpora costo
  positivo al blend → si el producto recibe con stock 0/WAC 0, el WAC queda
  `uc` exacto (S=0 → ca_new = q·uc/q = uc) y nunca regresa a 0 por recepciones.
- El caso `stock>0 ∧ WAC=0` SOLO puede persistir como deuda histórica
  (productos anteriores al fix). Se cuantifica en el control negativo (§15)
  y queda registrado como backlog — NO se repara en masa en esta corrida.

## 9. ¿Cómo se preserva el camino `confirm_pending_reception`?

NO se modifica ni su firma ni su cuerpo. El fix añade una llamada en
`register_reception` que replica exactamente su patrón (evento `reception_in`,
mismo orden doctrinal). La prueba de regresión §16 re-ejecuta el caso RECON
(99 @ 800 + 1 @ 1000 = 802) vía `confirm_pending_reception` real (PostgREST
con JWT de usuario) sobre fixture dedicado.

## 10. ¿Cómo se evita afectar ventas/reversas?

- `register_reception` es exclusivo del flujo de recepción; ventas
  (`create_sale*`, checkout POS), reversas (`reverse_transaction*`,
  `reverse_receipt*`, `reverse_devolution*`) y retiros de producción NO lo
  invocan (verificado por censo de escritores y grep de consumidores).
- `register_stock_movement` y `fn_recalc_wac` no cambian su definición.
- El evento nuevo `'reception_in'` desde `register_reception` es el MISMO
  string que ya usa `confirm_pending_reception` → sin cardinalidades nuevas
  en `wac_change_log.event`.
- Pruebas §17 (venta: COGS = qty × WAC) y §18 (reversa: stock restaurado,
  ledger consistente) sobre fixture VIGA2 demuestran la no-regresión.

## 11. ¿Cómo se hará rollback?

- La definición previa de `register_reception` está preservada byte a byte en
  `evidence/register_reception_live.sql` (capturada PRE vía pg_get_functiondef).
- Rollback = `CREATE OR REPLACE FUNCTION public.register_reception(...)` con
  ese cuerpo (misma firma → OR REPLACE válido, ACLs intactas).
- Script de rollback: `evidence/rollback_register_reception.sql` (generado en
  esta corrida, no ejecutado salvo decisión del principal).
- La migración es idempotente y no toca datos: rollback no requiere reparación
  de datos (los receipts/WAC creados post-fix son válidos bajo ambos cuerpos).

---

## Censo de escritores de `products.cost_average` (§7 CRITICAL)

Fuente: censo prosrc completo (`evidence/remf404-writer-census.txt` + raw JSON).

| # | Objeto | Clasificación | Mecanismo |
|---|--------|---------------|-----------|
| W1 | `fn_recalc_wac` | **ÚNICO ESCRITOR CANÓNICO** | UPDATE con token `app.wac_writer` |
| W2 | `confirm_pending_reception` | delega | PERFORM fn_recalc_wac |
| W3 | `reverse_receipt_v2` | delega | PERFORM fn_recalc_wac ('reception_reversal') |
| W4 | `perform_inventory_adjustment` | delega | PERFORM fn_recalc_wac |
| W5 | `receive_production_output` | delega | PERFORM fn_recalc_wac |
| W6 | `reverse_devolution`, `reverse_production_order`, `void_closed_production_order` | delegan | PERFORM fn_recalc_wac |
| W7 | `fn_process_receipt` (x2 overloads) | delegan | PERFORM fn_recalc_wac |
| W8 | **`register_reception`** | **DEFECTO — no delegaba ni escribía** | (post-fix) PERFORM fn_recalc_wac |
| W9 | `reset_store_data` (overload target_store_id) | ⚠️ hallazgo backlog | `UPDATE products SET stock_current=0, cost_average=0` SIN token → incompatible con la guarda W62 (fallaría con ERR_WAC_SINGLE_WRITER_VIOLATION). Preexistente, FUERA de alcance F4-04 (§5). Registrado como observación F-08/backlog. |
| — | `register_stock_movement` | NO escribe (solo comentario histórico) | — |
| — | Resto (~25 funciones con matches) | LECTORES (SELECT/Old/New en triggers de auditoría/reports) | — |

**Enforcement:** `trg_guard_wac_writer` (BEFORE UPDATE OF cost_average ON
products → `w62_guard_wac_writer()`) hace que W1 sea el único escritor EFECTIVO
de la BD viva. W9 es código muerto bajo la guarda actual.

## Mapa completo del flujo (§7)

```
HTTP POST /api/inventory/receptions        (ruta Next.js, sesión NextAuth/Supabase JWT)
  └─ authClient.rpc('register_reception', {7 args})     [client autenticado → RLS]
       └─ public.register_reception (SECURITY DEFINER)
            ├─ validate_operation_date + has_store_access_as  [anti-spoofing]
            ├─ INSERT receipts (status='active')
            └─ FOR cada item:
                 ├─ validaciones B3/B4/C1/C2/B5 + normalización multimoneda
                 ├─ INSERT receipt_items
                 ├─ [NUEVO REM-F4-04] PERFORM fn_recalc_wac('reception_in')   ← ÚNICO ESCRITOR
                 └─ PERFORM register_stock_movement('purchase')               ← stock + movement
       └─ UPDATE receipts.total_cost + INSERT audit_logs

RPC confirm_pending_reception (camino canónico, intacto)
  └─ FOR cada receipt_item: fn_recalc_wac('reception_in') → INSERT stock_movements
```

## Decisión de opción (§10)

**Opción A** (modificar el RPC de recepción para invocar `fn_recalc_wac`):
- Es la vía de mínimo cambio (una función, un bloque PERFORM).
- Replica el patrón exacto ya existente en `confirm_pending_reception`
  (misma doctrina, mismo evento, mismo escritor) → coherente con la
  arquitectura actual.
- NO recrea el trigger ausente (evita fórmula duplicada legacy que escribía
  `cost_price`, columna obsoleta, ver `20260301_control_fallos_harden.sql`).
- NO duplica lógica financiera en JS/API; el costo proviene del servidor
  (normalización `unit_cost × tasa` ya validada C1/F-21 en servidor).
- `single writer` + `atomic transaction` + `same mathematical oracle` ✓
