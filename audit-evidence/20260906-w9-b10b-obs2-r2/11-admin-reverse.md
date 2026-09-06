# W9.5 — B-10b-OBS-2-R2 · 11-admin-reverse.md
# GATE 11 — REVERSIÓN ADMINISTRATIVA (Modelo C Nivel 2) · PASS

Función: `reverse_transaction_v2` (SECURITY DEFINER; **ACL postgres+service_role** — la ejecución de la prueba usó la conexión privilegiada con JWT claims, desviación ya documentada en R1; `auth.role()='authenticated'`, `auth.uid()=actor`).

Prueba: P10 sobre la venta zelle tx2 (completed → reversión administrativa).

## Política Modelo C verificada — `can_admin_reverse_transaction`

| Condición | Estado en la prueba | OK |
|---|---|---|
| rol admin global | profile role=admin → true (alcance transversal) | ✓ |
| alternativo: membership activa admin/manager/encargado | no requerido aquí (actor es admin global) | ✓ |
| ownership | NO exigido (venta propia ajena permitida dentro del alcance) — documentado | ✓ |
| ventana temporal | sin ventana (doc vigente; la de 24 h está superseda) | ✓ |
| estado | solo completed reversible (guard + fn_validate_document_transition) | ✓ |

## Efectos observados (P10)

```text
retorno:      status=success · units_restored=1
transactions: status completed → voided (semántica observada: reverse converge a 'voided';
              el enum 'reversed' queda reservado; transición permitida por fn_validate_document_transition)
movement:     sale_reverse · +1 · balance_after=19 · reference_id=<tx_id> · reference_doc='Reverso de venta'
kardex:       fila 1:1 · movement_type='sale_reverse' (clasificación dedicada, a diferencia de sale_void — F-1)
audit:        REVERSE_TRANSACTION_V2 · operation=ADMIN_REVERSE · units_restored=1
stock:        FA 18 → 19 (restauración exacta de la venta zelle de 1 unidad)
```

## Chain completa demostrada en el mismo sandbox

```text
venta (cash) → POS void     → netting 0 → stock exacto   (P7/P8)
venta (zelle) → admin reverse → +1 exacto → FA vuelve a 19 (P10)
```

Tras P10: `products.stock_current == inventory.quantity == Σledger == 19` para el Fixture A.

## Veredicto GATE 11

```text
PASS — reversion administrativa operativa; completed → voided con restauración exacta
```
