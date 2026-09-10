# 16_ZERO_TOUCH — §20 (raws: ztx_PRE.json, ztx_POST.json)

Snapshot determinista PRE (23:37, pre-migración) y POST (00:0x, post-migración y post-suites):
- Estructura: label/captured_at (metadatos, difieren por diseño) + stores + overall_md5.
- **stores PRE == POST: 0 DIFERENCIAS** (comparación JSON estricta de la sección stores).
- overall_md5: **427e64eb0806e812a207e3e554945ba8 en AMBOS** (idéntico al md5 canónico de
  REM-F4-06b — continuidad inter-gate).

13 métricas por tienda (ENERVIDA 5e6fe821-…, PUERTO PADRE 43a4dabc-…):
products (conteo/stock/WAC/price/hash), stock_movements, receipts, receipt_items,
transactions (hash), payment_transactions, commission_payments (hash), cash_closures,
cash_movements, fiscal_closings (conteo — 0 filas en ambas tiendas de producción),
audit_logs (conteo+hash), wac_change_log, inventory.

Ninguna mutación de negocio ejecutada sobre ENERVIDA/PUERTO PADRE (todos los fixtures
confinados a AUDIT STORE A y checks de solo-lectura en STORE_B).
