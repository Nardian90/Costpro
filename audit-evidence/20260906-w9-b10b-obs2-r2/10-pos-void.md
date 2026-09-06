# W9.5 — B-10b-OBS-2-R2 · 10-pos-void.md
# GATE 10 — VOID DEL POS (Modelo C Nivel 1) · PASS

Función: `void_transaction` (SECURITY DEFINER; ACL incluye authenticated). Prueba: P7/P8 sobre la venta cash tx1, dentro de la ventana de 30 s.

## Política Modelo C verificada — `can_pos_undo_transaction`

| Condición | Estado en la prueba | OK |
|---|---|---|
| actor autorizado | `auth.uid() = 051c6157` (claims; p_user_id no puede convertirse en actor) | ✓ |
| misma tienda | tx.store_id = d1c4ba0e (la venta es de la tienda bajo prueba) | ✓ |
| ownership (venta propia) | tx.seller_id == actor (la venta sintética se creó con p_seller_id=actor) | ✓ |
| ventana ≤ 30 s | void inmediato in-tx: created_at == now() del statement → < 30 s | ✓ |
| estado completed | guard explícito: solo completed puede anularse | ✓ |
| rol POS permitido | profile role=admin (también cubre membership admin/manager/encargado/clerk) | ✓ |

## Efectos observados (P7)

```text
transactions:  status completed → voided · void_reason='R2 POS undo synthetic (rollback sandbox)'
               · cancelled_at set · updated_at set
movement:      sale_void · +2 · balance_after=19 · unit_cost=cost_at_sale de la venta
               · reference_doc='Void de venta' · notes=<tx_id>  (genealogía por notes)
kardex:        fila 1:1 (type 'out' — hallazgo F-1 en 07-kardex.md; no bloqueante)
audit:         VOID_SALE · operation=POS_UNDO · old_status=completed · new_status=voided
comisiones:    trigger reverse_commissions_on_sale_void: 0 filas a flaggear (store sin comisiones) — correcto
```

## Restauración exacta (P8)

```text
stock_after_void = 18 == estado antes del void (16) + 2          ✓
netting de tx1:  Σ(movements reference_id=tx1 ∪ notes=tx1) = −2 + 2 = 0   ✓
stock_current == inventory.quantity == Σledger                    ✓
inventory.version 1 → 2 → 3 (auditabilidad completa)              ✓
```

Nota de diseño de prueba: el estado absoluto de FA tras el void es 18 (no 19) porque la venta zelle tx2 (−1) seguía abierta dentro del sandbox; la restitución **exacta de tx1** se demuestra por el netting == 0 y por P10 (reverse) que devuelve FA a 19.

## Veredicto GATE 10

```text
PASS — POS undo operativo sobre inventario reparado: venta → void → stock exacto
```
