# REM-INV-2 — 07: STATUS GUARD (staging aislado)

Protocolo: intentar recibir compras en estados draft / cancelled / voided / already received / partial / completed / invalid y determinar si la operación verifica explícitamente el estado permitido.

## 1. Resultados de staging (mismo entorno de 06)

| Estado de la OC | ¿La V1 verifica el estado? | Resultado observado |
|---|---|---|
| `draft` | NO verifica — acepta (correcto por accidente) | stock aplicado, status→received |
| `cancelled` | **NO** — `receive_purchase(PO_CANCELLED)` procesa sin error | status→`received` (¡desde cancelled!), 1 movimiento +10, received_at set. **Una OC ANULADA convirtió stock real en staging.** |
| `received` (already received) | **NO** — re-procesa | nuevo movimiento +10 sobre PO ya recibida; received_at reemplazado (doble recepción, ver 06) |
| `partial` | NO hay lógica — mismo tratamiento ciego | acepta (caso draft) |
| `voided` / estados inválidos | n/a en el enum (`purchase_status_enum`: draft/sent/partial/received/cancelled); el tratamiento ciego sería idéntico | acepta cualquier valor del enum |

## 2. Evidencia de definición (coherente con staging)

El `UPDATE purchase_orders SET status='received', received_at=now() WHERE id=p_purchase_id` **no contiene ninguna condición sobre `status`** — no existe transición de estado, sino sobrescritura incondicional. Contraste con la máquina de estados canónica: `receive_against_po` exige `status IN ('draft','sent','partial')`, deniega `cancelled` (`ERR_PO_CANCELLED`) y terminales (`ERR_PO_NOT_RECEIVABLE`); `set_purchase_order_status` implementa la state machine server-side con auditoría.

## 3. Consecuencia

`receive_purchase` no distingue una compra por recibir de una anulada o ya recibida. **FAIL del control status guard** — cualquier llamada (y en particular una llamada directa autenticada, único vector vivo) puede arrastrar una OC legítima de `draft/sent/cancelled` a `received` sin recepción real (con `purchase_items` vacío: mutación de estado SIN stock ni kardex — corrupción de estado del documento).
