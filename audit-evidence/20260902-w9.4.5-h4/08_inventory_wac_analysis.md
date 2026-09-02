# W9.4.5 — H-4 | FASE 8 — INVENTORY + WAC

## Autoridad W7 (vigente en producción)
- trg_guard_wac_writer (BEFORE UPDATE OF cost_average ON products): RECHAZA cualquier
  UPDATE de cost_average sin token app.wac_writer='fn_recalc_wac'
  (ERR_WAC_SINGLE_WRITER_VIOLATION).
- fn_recalc_wac (6 args): blend D-01 ca_new=(S·ca_prev+q·uc)/(S+q); para q<0 EXIGE
  S+q>0 (RAISE ERR_WAC_REVERSE_NEGATIVE_STOCK); bitácora wac_change_log; token local.

## Consecuencia clave
El cuerpo PR-4 del repo (WAC inline UPDATE cost_average) es INViable en producción
actual: el guard lo rechazaría. Por eso la canónica NO puede ser PR-4 → base = W7.

## GREATEST(0) de la viva — ¿oculta inconsistencias? SÍ (demostrado)
Escenario con datos reales de producción (FASE 18, receipt fd9d6c88, ítem qty=19,
stock=18):
- Viva: clamp → new_stock=0 → SKIP fn_recalc_wac → 1 unidad "fantasma" desaparece
  del stock SIN corrección de costo y SIN error. Inconsistencia silenciada.
- Canónica: PERFORM fn_recalc_wac(-19) → RAISE ERR_WAC_REVERSE_NEGATIVE_STOCK
  (S+q≤0) → transacción íntegra aborta → el operador debe resolver la discrepancia
  (ajuste de inventario), no continuar con números falsos.
Esto es EXACTAMENTE el diseño W7 (inversa exacta) y el contrato B-12/PR-4
('RAISE ERR_INSUFFICIENT_STOCK si stock < qty' — PT-11.3.5). La viva lo había anulado.

## Verificación del flujo WAC (FASE 18, escenario sintético rollback)
pre: stock=1000 (forzado en tx), cost_average=200; ítem qty=2 unit_cost=100.
post: cost_average=200.2004008016 = (1000·200 − 2·100)/998 ✓ (blend inversa exacta);
stock_movements purchase_reverse=1; doble reversión bloqueada.
(Post_stock final 530: el trigger fn_sync_inventory_on_movement re-sincroniza
stock_current desde el ledger de inventory — autoridad del ledger sobre el UPDATE
aritmético; comportamiento preexistente, no alterado por H-4.)

## Negative stock / WAC corruption
La canónica DETECTA (RAISE) en vez de silenciar: negative stock → ERR_WAC_REVERSE_…;
WAC corrupto → imposible por single-writer + bitácora wac_change_log.
