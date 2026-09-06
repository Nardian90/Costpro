# W9.5 — B-10b-OBS-2-R2 · 07-kardex.md
# GATE 7 — KARDEX · PASS (con hallazgo semántico registrado para backlog)

## Fila de kardex generada por la venta (paso P3)

| Campo | Observado | Esperado | OK |
|---|---|---|---|
| movement_type | **out** | out (sale → out) | ✓ |
| quantity | **2** | 2 (ABS) | ✓ |
| unit_cost | **490** (numeric(12,2)) | WAC 489.999…9700 @2dp | ✓ |
| total_value | **980** | 2 × 490 | ✓ |
| balance_quantity | **17** | stock post-movimiento | ✓ |
| balance_unit_cost / balance_total_value | 490 / 8.330 | stock_current × cost_average | ✓ |
| reference_type / reference_id | stock_movement / **id del stock_movement** | 1:1 trazable | ✓ |
| reference_description | **'Venta POS v2'** | reference_doc del movement | ✓ |
| created_by | 051c6157 | actor | ✓ |

## Coherencia kardex ↔ stock_movement

```text
Generación 1:1 por trigger trg_auto_kardex (AFTER INSERT ON stock_movements) — 0 inserciones manuales
Mapeo observado en R2: sale→out · sale_void→out · sale_reverse→sale_reverse · initial→in
El kardex NUNCA fue modificado directamente por las pruebas.
```

## Semántica de balance documentada (empírica)

`balance_quantity` refleja el stock POST-movimiento (17 tras la venta de 2; 965 en el fixture de stock elevado; 19/966/95.5 en las aperturas del batch R1). El kardex es el espejo del ledger: `Σ kardex rows == Σ stock_movements rows` por producto y por tienda.

## ⚠ HALLAZGO PARA BACKLOG (no bloqueante — REGLA SUPREMA: descubrir, no corregir)

```text
F-1 · auto_kardex_on_stock_movement clasifica movement_type='sale_void' como 'out'
     (CASE: WHEN NEW.movement_type IN ('sale','void','sale_void','issue_slip_out') THEN 'out').
     Un sale_void RESTAURA stock (+q) pero el kardex lo muestra como salida con cantidad ABS(q).
     Impacto: presentación/semántica del kardex (lectura humana/reports); NO afecta stock,
     inventory, WAC, payments ni la trazabilidad 1:1 (reference_description='Void de venta',
     notes=tx_id permiten reconstruir el evento real).
     Comportamiento preexistente al R2 (misma lógica en B-8/B-10b); NO hotfix — registrado.
```

## Veredicto GATE 7

```text
PASS — kardex coherente 1:1 con stock_movements; hallazgo F-1 documentado para backlog
```
