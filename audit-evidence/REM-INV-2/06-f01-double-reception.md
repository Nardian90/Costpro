# REM-INV-2 — 06: F-01-A DOUBLE RECEPTION (reproducción en staging aislado)

**Infraestructura**: PostgreSQL efímero local (pgserver, datadir desechable `scripts/rem-inv-2/pgdata`, socket unix). **0 llamadas de red mutativas; 0 acceso a producción** (las credenciales de prod jamás entraron al entorno de staging). La definición de `receive_purchase` se copió **verbatim** de producción (`pg_get_functiondef`, 1264 chars) y se verificó por round-trip.

**Fixture**: store A (ENERVIDA-STG) + store B; PO1 draft con items {P1: qty 10 @ 5, P2: qty 4 @ 7}; inventory inicial P1=5, P2=0; products.cost_average P1=100, P2=50.

## Ejecución y medición (salida literal del staging)

```text
before   : p1_stock=None p2_stock=None movements=0 po_status=draft
after 1st: p1_stock=10   p2_stock=4    movements=2 (sum=+14) po_status=received received_at=…34.562
after 2nd: p1_stock=20   p2_stock=8    movements=4 (sum=+28) po_status=received received_at=…34.563
```

## Veredicto

| Medición | 1ª recepción | 2ª recepción | Esperado (protocolo) |
|---|---|---|---|
| stock P1 | 5 → 15 (+10) | 15 → **25** (+10 otra vez) | sin cambio |
| stock P2 | 0 → 4 | 4 → **8** | sin cambio |
| movimientos | 2 | **4** (kardex duplicado) | sin cambio |
| WAC (cost_average) | 100 / 50 | 100 / 50 (jamás tocado) | — |
| status OC | draft → received | received (re-sobrescrito) | DENIED |
| received_at | set | **reemplazado** (evidencia de re-proceso) | — |

**Resultado: FAIL (DEFECTO F-01 REPRODUCIDO)** — la segunda recepción del mismo documento re-aplica stock y kardex íntegros. `segunda recepción = DENIED / IDEMPOTENT` NO se cumple: `stock += quantity` ocurre nuevamente, exactamente el defecto reportado en F-01.

Causa raíz estructural (de 02-v1-definition.md): acumulación ciega `quantity + r.quantity` sin guard de estado ni idempotency key; el `UPDATE … SET status='received'` sin `WHERE status` previo acepta re-procesos ilimitados.

Corolario de producción: en la DB real `purchase_items` tiene **0 filas** y ningún camino de la aplicación puede poblarla (04 §S19), por lo que el doble cómputo de stock no es triggerable hoy vía datos existentes; el defecto permanece latente en el binario de la función y en la superficie de EXECUTE directo (sobre OC del modelo vigente, la llamada directa solo corrompe estado del documento — ver 16/VERDICT riesgo residual).
