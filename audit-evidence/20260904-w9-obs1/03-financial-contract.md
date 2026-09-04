# 03 — CONTRATO FINANCIERO (establecido documental y empíricamente)

## Cadena real encontrada (GATE 1)

```
transactions (total_amount, sale_currency, sale_exchange_rate)  ──┐
payment_transactions (amount, currency, amount_cup GENERATED)   ──┼─→ get_cash_report (RPC SQL, SECURITY INVOKER)
commission_payments (final_amount, currency, amount_cup escrito) ──┘        │
                                                                            ▼
                                                            /api/cash-report/route.ts (withAuth)
                                                            — NO reconvierte; suma p.total para desglose CUP cash
                                                                            ▼
                                              CashReportModal.tsx / CashClosureView.tsx
                                              — usa x.total (CUP/USD por grupos) y totals.sales_total_cup/balance_cup
                                              — NO reconvierte (T11: sin segunda conversión en frontend)
```

- Definición en vivo (OID 137379) == migración `20260801000001_v2_12_37_fix_e2e_bugs.sql` (cuerpo byte-idéntico, 4455 bytes, md5 e64710ab5af2d5f5c0c3520940a57e55).
- Única función en vivo con el patrón `total_amount * COALESCE(sale_exchange_rate,...)` (escaneo pg_proc del 2026-09-04).
- Rutas auxiliares (`payment-totals`, `details`, `items-summary`, `commissions-summary`) consultan tablas directamente; no llaman al RPC ni reconvierten.

## Tabla de contrato por campo

| Campo | Moneda real | Semántica | Fuente de autoridad |
|---|---|---|---|
| `transactions.total_amount` | **CUP siempre** | Total de la venta (obligación), inmutable post-INSERT | COMMENT PR-4.4I: "CONTRATO CONTABLE: SIEMPRE CUP"; invariante create_sale_v2: `SUM(amount_cup) == total_amount`; frontend envía `getExpectedTotalCup()` |
| `transactions.sale_currency` | — | Moneda en que se cobró al cliente | COMMENT 2026-07-02 |
| `transactions.sale_exchange_rate` | CUP/USD | "Tasa aplicada a la venta (ej: 500 CUP/USD)" — multiplicativa USD→CUP | COMMENT 2026-07-02; create_sale_v2: zelle original = monto/rate |
| `payment_transactions.amount` | nativa (`currency`) | cash/transfer: CUP rate=1; zelle: USD nativo | create_sale_v2 15a/15b/15c |
| `payment_transactions.amount_cup` | CUP | GENERATED: `CASE WHEN currency='CUP' THEN amount ELSE amount*exchange_rate END` | 20260712000001 + COMMENT hardening 4i "CONTRATO CONTABLE: Equivalente CUP" |
| `commission_payments.amount_cup` | CUP | Escrito: `final_amount * exchange_rate` | COMMENT 20260712000002 |
| cash report `sales[].total` | CUP (aunque el grupo sea USD) | SUM(total_amount) | definición RPC (pre-existente, no modificado por el fix) |
| cash report `sales[].total_cup` | CUP | Debe ser el equivalente CUP del grupo | objetivo del fix |
| cash report `totals.*_cup`, `balance_cup` | CUP | Totales del período | objetivo del fix |

## Respuestas explícitas (GATE 2)

- **A. Moneda base del cash report:** CUP (todos los totales `*_cup` y `balance_cup`).
- **B. ¿Pagos USD almacenados como USD o ya convertidos?** En `payment_transactions` el importe nativo USD se almacena como USD (`amount`) y su equivalente CUP se deriva estructuralmente por columna GENERATED `amount_cup` (una sola conversión, en escritura/lectura del ledger). En `transactions`, `total_amount` ya está en CUP aunque `sale_currency='USD'`.
- **C. Significado de la tasa:** `sale_exchange_rate` (y `exchange_rate` de pagos) es CUP por unidad de moneda extranjera — `1 USD = 680 CUP` ⇒ multiplicativa USD→CUP. No es la inversa.
- **D. ¿El ledger contiene importes originales y/o normalizados?** Ambos: `amount` (nativo) + `amount_cup` (normalizado, GENERATED — autoridad estructural). En `transactions`, solo CUP (`total_amount`) + la tasa de referencia para derivar el nativo (`total_amount / rate`).
- **E. ¿Qué debe devolver `get_cash_report`?** `total_cup` = `base_currency_amount` (CUP). El campo `total` (nativo por grupo) ya existe y no se modifica. El RPC no expone nativo USD derivable fiable por fila de grupo (requeriría dividir por tasa — no es parte del contrato actual).
- **F. Responsabilidad única de conversión:** la escritura (`create_sale_v2` / columna GENERATED `amount_cup`). Las rutas de lectura deben consumir `total_amount`/`amount_cup` SIN reconvertir. `get_cash_report` violaba esta autoridad única reconvirtiendo `total_amount`.

## Empírica de verificación del contrato (2026-09-04)

- 14/14 ventas USD (todas las existentes, 2026-08-11→17, tienda 5e6fe821): `total_amount == SUM(amount_cup)` con ratio 1.0000; 0/14 compatibles con `total_amount × rate`.
- Invariante CUP: 341/506 exactas; 165 violadas = ventas legacy pre-PR-4.4I sin filas en `payment_transactions` (fuera de alcance OBS-1; no afecta el contrato de moneda).
