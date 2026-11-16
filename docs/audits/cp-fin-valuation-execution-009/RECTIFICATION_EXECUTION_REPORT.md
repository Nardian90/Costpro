# RECTIFICATION_EXECUTION_REPORT — CP-FIN-FINAL-VALUATION-EXECUTION-009

**Misión:** CP-FIN-FINAL-VALUATION-EXECUTION-009 · **Fecha:** 2026-11-16 · **Operador:** agente CP-FIN (canal gobernado)
**Autorización:** EXPRESA DEL PROPIETARIO contenida en la misión 009 §1 — RECT-1 (151.299.851,00 CUP) y RECT-2 (24,00 CUP). Total autorizado y ejecutado: **151.299.875,00 CUP**.

---

## 1. Documentos rectores y mecanismo

La ejecución se realizó **íntegramente** conforme a:

- `docs/audits/valuation-rectification-release-gate-004/RECT004_PRODUCTION_RUNBOOK.md` (§5 RECT-1, §6 RECT-2, §2 pre-flight en transacción, §7 verificación, §8 idempotencia, §11 criterios de aborto, §12 operaciones permitidas/prohibidas).
- `docs/audits/valuation-rectification-release-gate-004/RECT004_ADDENDUM_T12_GUARD.md` (salvaguarda T12 server-side; regularización de residual por asiento manual con `reversal_of`).
- `docs/audits/valuation-rectification-release-gate-004/RECT004_REVERSAL_SEMANTICS.md` (semántica parcial de `reversal_of` — la anulación completa de la FVC NO se realizó).

**Canal:** Supabase Management API `/database/query` contra producción `wthkddeleylijmonclxg`. Cada operación = **UNA llamada = UNA transacción atómica** (`BEGIN…COMMIT` completos en la llamada), semántica validada previamente con la sonda E2E aislada (6/6 PASS, `evidencias/m061-sonda-transaccional-e2e.json`).

## 2. Cadena de control previa (todo APROBADO antes de escribir)

| Fase | Herramienta | Resultado |
|---|---|---|
| Recuperación §2 misión | git/API | `main = 8433e46b5` (cierre 008 integrado, PR #1634); CI del push del merge: CI 43874994186 + Test Coverage 43874994277 = success; expediente RECT004 disponible; T12/hardening/surface certificados en 008 |
| Preflight oficial existente | m050b + m053 | **PRE-FLIGHT VIGENTE 20/20** — secciones congeladas idénticas; RECT-1/RECT-2 sin recálculo |
| Preflight §3 misión | m060 | **19/19 PASS** (S1-S10 condiciones + T1-T9 técnicas); baselines anotadas: X_act = 201.681.043,51 · X_cxp = 207.255.150,57 |
| Sonda de canal | m061 --probe (BD E2E aislada) | **6/6 PASS** — 1 llamada = 1 transacción atómica persistente; error a mitad → rollback |
| Manifiesto de escritores | check-writers | CHECK-WRITERS OK (m061/m062 declarados escritores gobernados autorizados) |

**Condición material sin cambios:** 0 pagos/anticipos/notas del proveedor; `reversal_of` de la FVC = 0 (sin RECT previa); líneas 111/112 íntegras en 2.500/1.000 USD@680; los 24 CUP sin contabilización previa; VS-000223 (par neto 0) fuera de alcance; kardex 21 movimientos, salidas uc=0 = exactamente las 7 filas congeladas / 26 u; sin movimientos nuevos post-corte; T12 activa; hardening vigente.

## 3. RECT-1 — EJECUTADA (16:06:56–16:06:58 UTC)

Transacción gobernada (guards internos A-1..A-3 pre-flight dentro de `BEGIN`, cerrando la ventana TOCTOU; escape hatch M021 `SET LOCAL app.allow_receipt_item_edit='on'` solo en sesión; advisory lock `fin:RECEPCION:`; conteos esperados 2/1/2 con RAISE→ROLLBACK; verificación D=C intra-transacción):

| Paso | Efecto | Filas |
|---|---|---:|
| S1 | `receipt_items` 111/112 → 1 CUP @ tasa 1 (antes 2.500 / 1.000 USD @680) | 2 |
| S2 | `receipts.total_cost` → 40.739.585,00 (antes 192.039.436,00) | 1 |
| S3 | Capas de compra kardex → uc 1 (antes 1.700.000 / 680.000) — **con filtro de producto (hallazgo 009, ver §6)** | 2 |
| S4 | `wac_change_log` (event `rectificacion`, ids deterministas) | 2 |
| S5 | Asiento RECT-1 `FAC-VITALLCONS-001-RECT` (ajuste_manual, `reversal_of=93bb5da9…`) + 2 movimientos D `PAS_CXP_PROV` 151.299.851 / C `ACT_INVENTARIO` 151.299.851 | 1+2 |
| S6 | Auditoría por fila (`trace_id='RECT-PROD'`): 2 VALUATION + 1 TOTAL + 2 MOV_UC + 1 ENTRY | 6 |
| — | Balance D=C intra-transacción | **0,00** |

**POST-VERIFICACIÓN 9/9 PASS** (`evidencias/m061-rect1-postverificacion.json`): cabecera/lineas/capas exactas; 2 asientos de la FVC (original intacto + RECT-1 enlazado); par exacto 151.299.851 D/C; idempotencia (re-ejecución tocaría 0 filas); auditoría completa; **ninguna otra línea tocada**.

## 4. RECT-2 — EJECUTADA (16:07:46–16:07:48 UTC)

Transacción SEPARADA (advisory lock `fin:RECEP2:`; pre-guard: RECT-1 presente y posted; sin `GAS_COSTO_VENTAS` — COGS del motor preservado; VS-000223 NO contabilizado):

| Paso | Efecto | Filas |
|---|---|---:|
| T1 | Las 7 salidas uc=0 → uc=1 (26 u; ids verificados contra las 7 congeladas — RAISE si difieren) | 7 |
| T2 | Asiento RECT-2 `FAC-VITALLCONS-001-RECT-SAL` (AJUSTE_INVENTARIO/ajuste_manual) + 3 movimientos: D `GAS_VALES` 6 + D `GAS_PERDIDA_INV` 18 / C `ACT_INVENTARIO` 24 | 1+3 |
| T3 | Auditoría por fila: 7 MOV_SALIDA (cada una con su documento origen) + 1 ENTRY | 8 |
| — | Balance D=C intra-transacción | **0,00** |

**POST-VERIFICACIÓN 6/6 PASS** (`evidencias/m062-rect2-postverificacion.json`): D/C exactos (6/18/24); salidas uc=0 restantes = 0; las 7 congeladas a uc=1; COGS de las 5 ventas = 7,00 CUP intacto y 0 movimientos nuevos de `GAS_COSTO_VENTAS`; 3 asientos de la FVC todos posted; auditoría total 14 filas.

## 5. Certificación financiera final — m063 11/11 PASS

Ver `POST_EXECUTION_CERTIFICATION.md`. Síntesis:

- **Mayores exactos:** `ACT_INVENTARIO` = 50.381.168,51 (= X_act − 151.299.851 − 24) · `PAS_CXP_PROV` = 55.955.299,57 (= X_cxp − 151.299.851) — deltas numéricos < 0,01 (épsilon).
- **Kardex:** 21 movimientos, valorizado 111/112 = 30,00 = 10×1 + 20×1; salidas uc=0 = 0.
- **COGS 7,00 CUP intacto** (5 asientos; 0 nuevos) · GAS_VALES porción 111/112 = 94,00 (88 kardex + 6 RECT-2) · GAS_PERDIDA_INV porción RECT-2 = 18,00.
- **Idempotencia total** (S1/S2/S3/T1 tocarían 0 filas) · T12 activa · RLS/ACLs vigentes · `fin_posting_errors` = 0 · auditoría RECT-PROD = 14 filas.
- **Alcance protegido intacto:** las 99 líneas (≠111/112) idénticas al snapshot congelado — incluidas las 71 no verificables y las 4 discrepancias de moneda (SKU 999 1 CUP@1 · SKU 90 5 USD@680 · SKU 120 1 CUP@1 · SKU 92 1 CUP@1). Precios de venta maestros sin alteración (2.000 CUP / 1.000 USD). Existencias 10/20 sin cambios.
- **Actividad comercial viva:** 0 asientos ajenos en la ventana de ejecución (separación de alcance confirmada).

## 6. Hallazgos técnicos de la ejecución (documentados en AUDIT_REFERENCES.json)

1. **S3-scope (alta, mitigado):** el SQL literal del runbook S3 habría tocado 80 capas de compra con uc≠1 — 78 fuera del alcance autorizado. Se ejecutó **con filtro de producto** (`AND product_id IN (sku111,sku112)`), tocando exactamente las 2 capas autorizadas (1.700.000→1 · 680.000→1). El alcance económico autorizado quedó PRESERVADO (el propio runbook espera "2 filas"). Corrección de defecto técnico amparada en la misión 009 §7.
2. **RETURNING post-update (documental):** los valores `RETURNING` son post-update; los valores ANTES reales constan en `audit_logs.old_data`.
3. **Sesiones del canal (canal):** cada llamada API es una sesión independiente; toda transacción gobernada cabe completa en una llamada (validado por la sonda).
4. **GAS_PERDIDA_INV preexistente (informativa):** 1 CUP previo ajeno a la rectificación; global 19 = 1 + 18 (la porción RECT-2 = 18 exacta).

## 7. Cumplimiento del alcance (§6 de la misión)

- Anulación completa de la FVC: **NO realizada** (semántica parcial `reversal_of` respetada).
- `GAS_COSTO_VENTAS` adicional: **NO debitado** (COGS 7 CUP intacto).
- Las 71 líneas no verificables, las 4 discrepancias de moneda, las 18 legítimas y las 6 sin problema: **intactas** (verificación id a id).
- Otros productos de la recepción, transacciones comerciales ajenas y cantidades físicas: **sin alteración**.
- La valoración de 40.739.585,00 CUP sigue siendo **preliminar** de la recepción completa, no una certificación de las 101 líneas.

## 8. Criterios de cierre (§10 de la misión) — 15/15 CUMPLIDOS

- [x] RECT-1 ejecutada y verificada (9/9) · [x] RECT-2 ejecutada y verificada (6/6) · [x] Total 151.299.875 CUP · [x] Asientos equilibrados (3/3 D=C) · [x] Referencias documentales completas (reversal_of + audit por fila + wac_change_log) · [x] Costos SKU111/112 rectificados a 1 CUP/u · [x] COGS 7 CUP sin duplicación · [x] Reingreso VS-000223 correctamente tratado (fuera de alcance) · [x] T12 y hardening conservados · [x] 71 líneas no verificables intactas · [x] 4 discrepancias de moneda intactas · [x] Kardex e inventario conciliados (30,00) · [x] Auditoría e idempotencia verificadas (14 filas / 0 filas) · [x] Expediente publicado e integrado (este PR) · [x] Worklog actualizado.
