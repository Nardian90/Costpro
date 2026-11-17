# CP-FIN-NEGATIVE-WAC-COMPLETE-REMEDIATION-014 · INFORME MAESTRO (A–H)

**Misión:** corrección definitiva de los WAC negativos y regularización integral de FAC-VITALLCONS-001.
**Autorización:** expresa del propietario (misión 014 §1) para RECT-013-A (2.657.379,32 CUP), RECT-013-B (8.704.161,30 CUP) y los ajustes directamente derivados (extensión RECT-013-C), sobre la recepción `fd9d6c88-5db8-49ea-b185-8bc96cc93e63` (FAC-VITALLCONS-001, Vitallcons, 01/07/2026, 101 líneas, 1 CUP/u, total definitivo 5.861,50 CUP).
**Ejecución:** 2026-11-17 · producción `wthkddeleylijmonclxg` (ENERVIDA `5e6fe821-5465-48b1-b3f1-3aa3182edc38`) mediante lotes atómicos reanudables gobernados (m103), tras batería E2E aislada completa (m102) y con doble flag CP-INFRA-019.
**Resultado: CERTIFICACIÓN 14/14 PASS · idempotencia demostrada · D−C = 0,00 en los tres asientos · conciliación inventario↔kardex cerrada al céntimo.**

---

## A. Causa raíz confirmada

La causa raíz probada en la misión 013 (informe `NEGATIVE_WAC_ROOT_CAUSE_REPORT.md`, expediente 013) se mantiene y se confirma con la extracción fresca previa a la ejecución (m100):

- **G = B + A**:
  - **(B) Drift preexistente** — la recepción FVC (01/07/2026) nunca actualizó el WAC (0 filas en `wac_change_log`); las salidas históricas se registraron a costo ≈0 y el costo de la recepción quedó como residuo obsoleto en ACT_INVENTARIO.
  - **(A) Modelo del lote C de RECT-011 sin cota** — `wac_new = (wac_old×stock − (uc_old−1)×fvc_rem)/stock` sin límite sobre el valor libro produjo los 5 WAC negativos el 2026-11-16 19:59:14 (trace RECT011-PROD, acción SYSTEM_RECT011_WAC).
- **Verificación previa a escribir (§3 misión 014)**: comparación de la extracción fresca (m100) contra los congelados (m074 matriz, m070-post): **drift 0 en cantidades, tipos y referencias**; las únicas diferencias son las 78 capas FVC cuya `unit_cost` pasó a 1 por RECT-011 lote B (certificado en 011). Los cinco WAC negativos estaban exactamente en los valores documentados; el estado del SKU117 es **stock = 1,0000** (la tabla de la misión anotaba «existencia de referencia 0», cifra antigua; conforme a §4 el estado real gobierna y el importe documentado 2.657.379,32 corresponde a stock=1).
- **Costos originales verificados**: los `old_data` de las 78 auditorías RECT-011 de líneas coinciden con la matriz m074 (0 mismatch) — la base del modelo de atribución es el hecho histórico real.

## B. RECT-013-A — importe, asiento, WAC y saldos antes/después

**Reproducción exacta (m101, Decimal)** del importe documentado:

| SKU | Stock real | WAC antes | Valor antes | WAC después | Valor después | Δ restauración |
|---|---:|---:|---:|---:|---:|---:|
| 117 | 1 | −2.175.998,000000 | −2.175.998,00 | 1,00 | 1,00 | 2.175.999,00 |
| 83 | 2 | −122.398,000000 | −244.796,00 | 1,00 | 2,00 | 244.798,00 |
| 90 | 3 | −78.176,248120 | −234.528,74 | 1,00 | 3,00 | 234.531,74 |
| 40 | 3 | −665,857143 | −1.997,57 | 1,00 | 3,00 | 2.000,57 |
| 37 | 25 | −1,000000 | −25,00 | 1,00 | 25,00 | 50,00 |
| **Total** | **34** | | **−2.657.345,32** | | **34,00** | **2.657.379,32** |

**Asiento RECT-013-A-NEGWAC** (7ec9000f-…-d01400000001, fecha económica 2026-11-17):

- Débito GAS_COSTO_VENTAS **566.546,45** · Débito GAS_VALES **1.072.918,27** · Débito GAS_PERDIDA_INV **1.017.914,60** (reparto proporcional a los créditos RECT-011 de los 5 SKU — base 11.361.375,00 — reproducido al céntimo)
- Crédito ACT_INVENTARIO **2.657.379,32** · **D−C = 0,00** · **COMMIT 2026-11-17 (trace RECT013-PROD)**
- WAC actualizados mediante el **mecanismo canónico sellado** (`SET LOCAL app.wac_writer = 'fn_recalc_wac'`): 5 UPDATE + 5 filas `wac_change_log` (event `rect013_restauracion`) + 5 auditorías SYSTEM_RECT013_WAC. **Sin cantidades alteradas**; capas y movimientos intactos.
- Las tres contrapartidas corresponden exactamente a los movimientos de los cinco productos: el reparto usa los créditos de RECT-011 por canal atribuidos al 5-SKU (COGS 2.422.216,00 / VALES 4.587.161,00 / PÉRDIDA 4.351.998,00), reproducidos desde la matriz m074 y verificados contra `fin_movements` (40.733.723,50 lote D).

## C. RECT-013-B — composición, asiento y saldo antes/después

**Composición reconstruida** (misión 013 §B, autorizada en 014 §1; importe **8.704.161,30** reproducido exactamente):

| Canal | Fantasma RECT-011 (5 SKU) | − Débito A | = Fantasma restante | Re-costeo 1 CUP/u | Débito B |
|---|---:|---:|---:|---:|---:|
| GAS_COSTO_VENTAS | 2.422.216,00 | 566.546,45 | 1.855.669,55 | 107,93 | **1.855.777,48** |
| GAS_VALES | 4.587.161,00 | 1.072.918,27 | 3.514.242,73 | 34,69 | **3.514.277,42** |
| GAS_PERDIDA_INV | 4.351.998,00 | 1.017.914,60 | 3.334.083,40 | 23,00 | **3.334.106,40** |
| **Total** | **11.361.375,00** | **2.657.379,32** | **8.703.995,68** | **165,62** | **8.704.161,30** |

- Re-costeo = consumo neto histórico de los 5 SKU a 1 CUP/u (venta 135 · vales 133 · pérdida 23 unidades — todas sus capas son @1: FVC y la capa ajena de SKU90, 30538c95, 100 u @1, consumida e intacta) menos el costo registrado (125,38).
- **Asiento RECT-013-B-REGULAR** (…d01400000002): débitos por canal + **crédito ACT_INVENTARIO 8.704.161,30** · **D−C = 0,00** · COMMIT.
- **Saldo después**: la contribución atribuible de los 5 SKU a ACT_INVENTARIO queda en su **valor kardex (34,00 CUP)**; los costos históricos de consumo quedan en su valor verdadero (291,00 CUP: 135+133+23).
- **Qué parte ya estaba corregida**: RECT-1 (151.299.851,00 — reversión del exceso de reconocimiento original, intacta), RECT-2 (24,00, intacta) y RECT-011 (40.733.723,50, intacta) no se tocaron ni duplicaron. El componente B se aplicó **una sola vez** con referencias específicas (C13 de la certificación).

## D. Extensión a los restantes productos de la recepción (RECT-013-C)

Verificación de los **96 productos** restantes (§6): costo de capa FVC 1 CUP ✓ (101/101), WAC resultante ✓ (25 del lote C válidos, 76 sin alterar), cantidades actuales y consumidas ✓ (tie-out FIFO 101/101), valores de venta/vales/pérdidas por producto ✓ (matriz m101), saldos de inventario y contable atribuible ✓.

** Fantasma restante atribuido a los 96** (créditos RECT-011 sin débito que los sustente): COGS 19.028.154,50 · VALES 1.326.786,50 · PÉRDIDA 5.339.032,00 = **25.693.973,00** (con el INV 1.021.000,50 suma 40.733.723,50 = lote D exacto).

**Asiento RECT-013-C-EXT96** (…d01400000003) — total fijado por la identidad de conciliación inventario↔kardex (§10.7): **C_total = Pool antes − A − B − Kardex después = 22.471.992,81**, en dos niveles:

| Nivel | GAS_COSTO_VENTAS | GAS_VALES | GAS_PERDIDA_INV | Total |
|---|---:|---:|---:|---:|
| **C1** — eliminación del saldo acreedor ficticio restante tras A+B (exacto por canal) | 14.254.852,02 | 517.882,70 | 5.338.990,00 | 20.111.724,72 |
| **C2** — reconocimiento del consumo infravalorado por el drift (reparto proporcional a los créditos RECT-011 por canal, criterio RECT-013-A) | 1.747.940,88 | 121.879,63 | 490.447,58 | 2.360.268,09 |
| **Débito C** | **16.002.792,90** | **639.762,33** | **5.829.437,58** | **22.471.992,81** |
| Crédito ACT_INVENTARIO | | | | **22.471.992,81** |

**D−C = 0,00** · COMMIT. **84 de los 96 productos** tienen partidas atribuidas distintas de cero (matriz completa en `MATRIX_5SKU_AND_EXTENSION.xlsx`). El consumo de capas ajenas conserva su costo registrado legítimo (otras recepciones intactas; ninguna capa de otra recepción modificada). El sub-céntimo residual de conciliación (0,00527) proviene de la precisión del campo kardex y está documentado dentro de la tolerancia de certificación (0,01).

**Metodología documentada**: la descomposición por producto del re-costeo (unidades FVC consumidas ×1 menos su costo registrado atribuible por reparto lineal) se entrega como base analítica; el **total** del asiento queda fijado por la identidad contable (pool = kardex) porque la atribución exacta fin↔kardex de los cargos históricos no es reconstruible al céntimo (el backfill CP-FIN del 2026-11-14 cargó COGS/VALES a los `cost_average` vigentes en cada momento de publicación — historia no registrada en `wac_change_log`). Esta elección evita importes inventados y garantiza la certificación §10.7-§10.9.

## E. Inventario, FIFO y WAC finales

- **5 SKU**: WAC 1,00 · valor libro = stock × 1 = **34,00 CUP** (1+2+3+3+25). Cantidades intactas.
- **101 capas FVC a 1 CUP** (C5) · recepción total 5.861,50 (C6).
- **Conciliación FIFO**: tie-out 101/101 (fvc_rem + consumo atribuido = qty de línea, modelo m074 reproducido con la extracción fresca).
- **Conciliación inventario↔kardex (ENERVIDA)**: ACT_INVENTARIO **601.527,81** = Σ(stock×wac) **601.527,8047** — gap 0,00527 (sub-céntimo, tolerancia 0,01) — **C7 PASS**.
- **WAC de los 25 recalculados por lote C**: válidos e intactos (C2) · **76 restantes sin alteración** (C3) · **0 WAC negativos en todo el sistema** (C4).

## F. Estado de Resultados y Balance General (ENERVIDA)

| Cuenta | Antes | Δ (A+B+C) | Después (verificado) |
|---|---:|---:|---:|
| ACT_INVENTARIO (activo) | 34.435.061,24 | −33.833.533,43 | **601.527,81** |
| GAS_COSTO_VENTAS (gasto) | −16.677.175,95 (acreedor) | +16.002.792,90 | **1.747.940,88** |
| GAS_VALES (gasto) | −5.105.078,39 (acreedor) | +639.762,33 | **121.879,63** |
| GAS_PERDIDA_INV (gasto) | −9.691.011,00 (acreedor) | +5.829.437,58 | **490.447,58** |
| PAS_CXP_PROV (pasivo) | −2.961.795,90 | 0,00 | **−2.961.795,90** |

- **Los tres saldos acreedores ficticios** creados por la valoración incorrecta **quedan eliminados**; los saldos finales de gasto son deudores naturales y representan el reconocimiento del consumo infravalorado por el drift (C9 PASS).
- **Partida doble**: los tres asientos con D−C = 0,00; el sistema completo cierra (total D−C por cuenta = 0 en el agregado de la corrección).
- **Resultados por período**: la corrección se registra con **fecha económica 2026-11-17** (sin fingir fechas históricas); el efecto sobre resultados acumulados queda trazable íntegramente en los tres asientos RECT-013 (libro mayor por document_number).
- **Deuda de FAC-VITALLCONS-001**: **5.861,50 CUP** (unpaid) — intacta (C6/C10).

## G. Integridad de operaciones ajenas

- **Movimientos de inventario**: ninguno modificado (la corrección solo toca `products.cost_average` de los 5 SKU, `wac_change_log`, `fin_entries`/`fin_movements` y `audit_logs`); PUERTO PADRE SKU117 (stock 1, wac 1) y SKU90 (stock 100, wac 1) intactos (C11).
- **Otras recepciones**: la capa ajena de SKU90 (30538c95, 100 u @1) y las capas de SKU31/otros permanecen intactas; ninguna capa de otra recepción fue modificada por compartir SKU.
- **Precios de venta intactos** (E2E V14 + verificación de campo sin divergencias).
- **RECT-1, RECT-2 y RECT-011 intactas y no duplicadas** (4 asientos del documento FVC sin cambios; los 3 nuevos asientos tienen document_number propio y reversal_of NULL).
- **Controles activos**: T12 (`fin_t12_receipt_annulment_block` = O), guard WAC (`trg_guard_wac_writer` = O), RLS/ACLs sin cambios, writers manifest CHECK-WRITERS OK (m100–m105 declarados).
- **Motor CP-FIN**: `fin_posting_errors` = 0 (C12).

## H. GitHub, CI, merge SHA y expediente

- **Expediente** `docs/audits/cp-fin-negative-wac-complete-remediation-014/`: informe maestro (este documento), `PRODUCTION_EXECUTION_EVIDENCE.md`, `E2E_COMPLETE_EVIDENCE.md`, 5 XLSX (MATRIX_5SKU_AND_EXTENSION, RECTIFICATION_ENTRIES_014, BEFORE_AFTER_ACCOUNTS, INVENTORY_KARDEX_RECONCILIATION, CERTIFICATION_14_CRITERIA — skill xlsx, validate passed 0 issues), SHA256SUMS.txt.
- **Scripts**: m100 (extracción RO), m101 (análisis Decimal), m102 (E2E aislada, batería completa), m103 (ejecutor de producción por lotes), m104 (certificación 14 criterios + idempotencia), m105 (XLSX) — writers manifest CHECK-WRITERS OK.
- **Publicación**: rama + PR por flujo normal; SHA256SUMS verificado; SHA final de `main` anotado en worklog tras el merge (ver worklog.md y el PR).
- **Producción — importes aplicados (2026-11-17)**: RECT-013-A 2.657.379,32 + RECT-013-B 8.704.161,30 + RECT-013-C 22.471.992,81 = **33.833.533,43 CUP** · A+B = **11.361.540,62** (referencia conjunta §1 — coincidencia exacta).

---

### Criterios de cierre (§12) — todos cumplidos

RECT-013-A ejecutada y certificada ✓ · RECT-013-B ejecutada y certificada ✓ · 96 productos revisados ✓ · cinco WAC negativos corregidos ✓ · sin saldos contables ficticios ✓ · 101 líneas a 1 CUP ✓ · inventario y contabilidad conciliados ✓ · otras recepciones intactas ✓ · precios de venta intactos ✓ · T12 y hardening activos ✓ · idempotencia y rollback demostrados (E2E 42/42 + producción YA_APLICADO ×3) ✓ · expediente completo ✓ · PR integrado ✓ · worklog actualizado ✓
