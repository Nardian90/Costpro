# RECTIFICACIONES HISTÓRICAS — mandato §8

Ejecutadas en producción 2026-11-19 (lote atómico HTTP 201; idempotencia verificada por re-ejecución: YA_APLICADO/NULL).

| ID | Venta | Rectificación | Importe CUP | Tasa documental (evidencia) | Asiento |
|---|---|---|---:|---:|---|
| R1 | 9d1ccef8 | cash/USD→cash/CUP | 6,510 | 930 (pago registrado) | RECT-MON-9D1CCEF8-cash-USD |
| R2 | 97263a9c | cash/USD→cash/CUP | 9,200 | 920 | RECT-MON-97263A9C-cash-USD |
| R3 | abab9e20 | cash/USD→cash/CUP | 16,200 | 900 | RECT-MON-ABAB9E20-cash-USD |
| R4 | e825ba93 | cash/USD→cash/CUP | 60,840 | 845 | RECT-MON-E825BA93-cash-USD |
| R5 | 8757444f | cash/USD→cash/CUP | 32,000 | 800 | RECT-MON-8757444F-cash-USD |
| R6 | 6501f8da | cash/USD→cash/CUP | 930 | 930 | RECT-MON-6501F8DA-cash-USD |
| R7 | 7d9ad144 | componente cash/USD→CUP (componente CUP 2,790 intacto) | 6,510 | 930 | RECT-MON-7D9AD144-cash-USD |
| R8 | 28e94349 | caso «asiento obsoleto» (motor M-015, reparto por ítems a 810) | 167,670 | 810 (reconstruida del propio débito) | RECT-MON-28E94349-cash-USD |
| P1 | 8ab7becf | reconocimiento ausente (cobro 16,000; total 15,800; sobrepago 200 MISIÓN-FLEX) | 16,000 | n/a | VENTA reconocimiento |
| P2 | 1df5d727 | reconocimiento ausente (catálogo 0; recibido 12,000) | 12,000 | n/a | VENTA reconocimiento |

Conservadas sin cambio: RECT-FIN-E2614F36 (FIN-001, no re-ejecutar), RECT-015-A/B/D (M-015 §C con confirmación del propietario), FLUJO_CAJA IE-000001/000002.
Reglas cumplidas: no se alteran ingresos/COGS/inventario/precios/cantidades/tasas; asientos originales intactos; trazas con ref_entry/ref_mov/causa; identidad determinista (venta+método+moneda); un asiento por rectificación.
SQL: `RECTIFICACIONES-A-EJECUTAR.sql`. Resultado: `rectificaciones-result.json` / `rectificaciones-reintento.json`.
