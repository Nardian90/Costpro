# PRODUCTION_EXECUTION_EVIDENCE · CP-FIN-NEGATIVE-WAC-COMPLETE-REMEDIATION-014

**Ejecución autorizada en producción** (misión 014 §1 — autorización expresa del propietario; sin solicitudes adicionales).
**Canal:** Management API /database/query · **1 llamada = 1 transacción** por lote (patrón sonda transaccional m061) · doble flag CP-INFRA-019 (`ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND`) · guardas fail-closed por lote · advisory locks por operación · ON CONFLICT DO NOTHING (idempotencia).

## 1. Estado previo verificado (m103 --status, read-only)

- Exactamente **5 WAC negativos** en ENERVIDA con los valores documentados: SKU117 −2.175.998,00 · SKU83 −122.398,00 · SKU90 −78.176,248120300752 · SKU40 −665,857142857143 · SKU37 −1,00 (drift 0 frente a la extracción m100).
- **0 asientos RECT-013** previos · saldos: ACT_INVENTARIO 34.435.061,24 · COGS −16.677.175,95 · VALES −5.105.078,39 · PÉRDIDA −9.691.011,00 · CXP −2.961.795,90 · Σ kardex −2.055.851,5110.
- CXP del documento FAC-VITALLCONS-001 = 5.861,50 (guarda de lote 1 y lote 3).

## 2. Lotes aplicados (transacciones atómicas independientes)

| Lote | Asiento (id) | Documento | Importe | D−C | Commit (UTC) |
|---|---|---|---:|---:|---|
| 1 | 7ec9000f-0000-4000-8000-d01400000001 | RECT-013-A-NEGWAC | 2.657.379,32 | 0,00 | 2026-11-17 16:02:17,452 |
| 2 | 7ec9000f-0000-4000-8000-d01400000002 | RECT-013-B-REGULAR | 8.704.161,30 | 0,00 | 2026-11-17 16:02:27,855 |
| 3 | 7ec9000f-0000-4000-8000-d01400000003 | RECT-013-C-EXT96 | 22.471.992,81 | 0,00 | 2026-11-17 16:02:41,345 |

**Total regularizado: 33.833.533,43 CUP** · A+B = **11.361.540,62** (referencia conjunta §1 — coincidencia exacta).

## 3. Detalle de movimientos por asiento

**RECT-013-A-NEGWAC** (lote 1): DR GAS_COSTO_VENTAS 566.546,45 · DR GAS_VALES 1.072.918,27 · DR GAS_PERDIDA_INV 1.017.914,60 · CR ACT_INVENTARIO 2.657.379,32.
**RECT-013-B-REGULAR** (lote 2): DR GAS_COSTO_VENTAS 1.855.777,48 · DR GAS_VALES 3.514.277,42 · DR GAS_PERDIDA_INV 3.334.106,40 · CR ACT_INVENTARIO 8.704.161,30.
**RECT-013-C-EXT96** (lote 3): DR GAS_COSTO_VENTAS 16.002.792,90 · DR GAS_VALES 639.762,33 · DR GAS_PERDIDA_INV 5.829.437,58 · CR ACT_INVENTARIO 22.471.992,81 (C1 20.111.724,72 + C2 2.360.268,09).

## 4. WAC sellados (mecanismo canónico)

`wac_change_log` (event `rect013_restauracion`, 5 filas, 2026-11-17 16:02:17 UTC):

| SKU | wac_before | wac_after |
|---|---:|---:|
| 117 | −2.175.998,0000000 | 1,00 |
| 83 | −122.398,0000000 | 1,00 |
| 90 | −78.176,2481203 | 1,00 |
| 40 | −665,85714285714 | 1,00 |
| 37 | −1,0000000000 | 1,00 |

Mecanismo: `SET LOCAL app.wac_writer = 'fn_recalc_wac'` (única vía posible — el guard `trg_guard_wac_writer` rechaza escrituras sin token, verificado en E2E) · 5 UPDATE en `products` · 5 auditorías SYSTEM_RECT013_WAC · sin alteración de cantidades.

## 5. Trazabilidad

- **audit_logs** (trace `RECT013-PROD`): SYSTEM_RECT013_WAC ×5 · SYSTEM_RECT013_ENTRY ×3 (old_data `{"entrada":null}`, new_data con entry_id/importes/componente).
- **Advisory locks**: `m014:restauracion|regularizacion|extension96:<store>` — sin solapamiento posible.
- **Guardas aplicadas por lote**: lote 1 (5 negativos exactos + CXP 5.861,50) · lote 2 (A aplicado, B no) · lote 3 (A+B aplicados, C no, acreedor restante vivo = constantes C1 al céntimo + CXP 5.861,50). Cualquier desvío → abort sin escritura.

## 6. Reanudabilidad demostrada

Durante la batería E2E (mismo código m103) se produjo una interrupción real tras el lote 1 (fallo controlado en lote 2): **el lote confirmado se conservó** y la reanudación (`--all`) continuó sin repetir efectos (guard YA_APLICADO). En producción, la re-ejecución completa (`m104 --idem`) devolvió **YA_APLICADO ×3 con 0 cambios** (3558 movimientos · 3 asientos · 5 wcl · Σ kardex estable 601.527,8047).

## 7. Salidas de comando (resumen)

```
$ m103 lote1 → LOTE 1 COMMIT · asiento 7ec9000f-…-d01400000001 · D−C = 0.00
$ m103 lote2 → LOTE 2 COMMIT · asiento 7ec9000f-…-d01400000002 · D−C = 0.00
$ m103 lote3 → LOTE 3 COMMIT · asiento 7ec9000f-…-d01400000003 · D−C = 0.00
$ m104 --verify → CERTIFICACIÓN: 14/14 PASS
$ m104 --idem  → YA_APLICADO ×3 · PASS (0 cambios)
```

Detalle completo en `scripts/out/m014/prod-ejecucion-db.json` (entradas, movimientos, auditoría, wac_change_log).
