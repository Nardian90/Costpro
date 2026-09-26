# FASE E-SEC-FINAL — 07 ROUNDING (D5)

## Política establecida (decisión del responsable funcional)

```text
precio monetario de línea → 2 decimales
subtotal de línea        → 2 decimales
total de venta           → suma de subtotales de línea ya redondeados
```

## Servidor (create_sale_v2)

```sql
-- tras la validación ERR_INVALID_PRICE:
v_price := ROUND(v_price, 2);
-- referencia de catálogo también monetaria:
v_reference_price := ROUND(v_reference_price, 2);
-- subtotal de LÍNEA redondeado; el total es su suma:
v_calculated_subtotal := v_calculated_subtotal + ROUND((v_price * v_qty), 2);
```
Descuento global/impuestos/total: fórmulas existentes sobre la base redondeada. Tolerancia `ERR_TOTAL_MISMATCH` 0.01 se mantiene como red de seguridad (divergencias ≤0.01 pasan; >0.01 = error VISIBLE, jamás silencioso).

## Cliente (src/store/cart.ts)

- `round2(x)`: half-up EXACTO sobre el decimal (truco `e2` + `toFixed(12)` recortando polvo binario) — semántica idéntica a `ROUND(numeric,2)` de PostgreSQL (half-away-from-zero; valores ≥0). Evita el clásico `Math.round(19.995*100)=1999` del float.
- `effectiveUnitPrice()` → SIEMPRE 2dp: el payload V2 envía el precio unitario redondeado; el servidor lo re-redondea sin cambio.
- `calculateItemSubtotal()` → `round2(effectiveUnitPrice(...) × qty)`: el subtotal se calcula DESDE el unitario YA redondeado — réplica exacta de la aritmética del RPC (elimina la amplificación unit→línea: 22.232×10 = 222.32 vs ROUND(22.23×10) = 222.30 divergían 0.02 → ERR_TOTAL_MISMATCH; con la réplica, 0).
- Totales existentes (`.toFixed(2)`), WAC, impuestos, split multi-moneda: intactos (no se reescribe la aritmética financiera — mandato D5).

## Contrato compartido

`total = Σ round2(round2(unit) × qty)` — misma expresión en cliente y servidor. Divergencia residual teórica solo en mitades de centavo donde el binario difiere del decimal; acotada por tolerancia 0.01 y siempre visible (ERR_TOTAL_MISMATCH), nunca silenciosa.

## Evidencia

**Unit tests** (`effective-unit-price.test.ts`, 15 PASS): 19.99/33.33/99.95/0.01 exactos; `round2(19.995)=20.00` (el float daría 19.99); `round2(0.1+0.2)=0.3`; `round2(490.00000000000006)=490`; qty fraccional 33.33×0.5 → 16.67; negativos half-away-from-zero; coherencia Σ(unit×qty) == aritmética del RPC.

**LIVE** (matriz RD1/RD2):
- RD1 multi-línea `19.99×3 + 33.33×2 + 99.95×1 + 0.01×1`: total esperado 226.59 → **200**, `transactions.total_amount` en DB = **226.59** (UI total == server total == DB total).
- RD2 `33.33 → 22.22 × 3` (descuento 33.33% autorizado): **200**, DB `price_at_sale = 22.22` (2dp exacto), línea `catalog=33.33/discount_value=33.33/pct=33.33`.
- Browser B2: precio negociado $10 fijo sobre 500 → VALOR VENTA $490.00 visible en UI, DB `total_amount=490.0`, `price_at_sale=490.0` — UI == server == DB.
