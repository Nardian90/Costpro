# EXPEDIENTE FINAL — MISIÓN MAESTRA CP-FIN-FINAL-EXECUTION-001

**Fecha de generación:** 2026-11-14 (UTC) · **Ejecutor:** agente, bajo delegación general del propietario (§1 de la misión del 13/11) · **Entornos:** producción COSTPRO (`wthkddeleylijmonclxg`), GitHub `Nardian90/Costpro`, Vercel · **Tiendas:** ENERVIDA-VITALLCONS (contabilizada por lotes) y PUERTO PADRE (fase independiente, NO contabilizada).

Este expediente es REPRODUCIBLE: cada afirmación se verifica con los scripts versionados (`scripts/m017…`, `scripts/m018…`, `scripts/m020…`, `scripts/f8-verify-todos.mjs`, `scripts/f9-controles.mjs`) y las evidencias citadas. Nada se declara sin verificación en el entorno real.

---

## 1 · Estado final de los seis PR de la misión

| PR | Título (resumen) | Estado | Merge SHA |
|---|---|---|---|
| #1612 | Servicios Recibidos §17.1 (moneda del documento) | **merged → main** | `b949342e6a7777041c20ce09147310a84debfda0` |
| #1614 | Dry-run F1 espejo de pagos + hash estructural v4 | **merged → rama CP-FIN** `feat/fin-backfill-dryrun-20261113` | `d4ccc80f4e56e7281862a2262ce726dc1670bf87` |
| #1615 | Semántica VENTA en divisa (total_amount = CUP-eq) | **merged → main** | `0b52d7afc180288817669de43aa4e44209dff55c` |
| #1616 | Ciclo completo de la devolución en divisa | **merged → main** (después de #1615, regla cumplida) | `fe2c5cb7e4988234456b31ea0d2ca50c7b4c03f1` |
| #1617 | Expediente migración legacy (165 ventas) | **merged → main** | `0f85e4dd6272eb7073d160457cdd1028593e78be` |
| #1618 | Expedientes de cierre (3 ventas, matriz, hash v4, trazabilidad) | **merged → main** | `8ecbc67b26e4d6101046a633e5300853d2271df4` |

PRs adicionales creados por la ejecución de la misión: **#1619** (m017 — migraciones + ledger + contract-surface; merged `84c44e6bb7b92b821367433e1b499e3537c739d7`), **#1620** (m018 — migración legacy aplicada; merged `5d63481a027ffe92a6acdb31bf1d4b7c966530f8`) y el PR de m020 (este expediente).

**Conflictos resueltos bajo autorización §1:** #1615 y #1616 chocaron con main en `writers.manifest.json` / `e2e-migrations-manifest.json` / test de replay (tras el merge de #1612). Resueltos con unión de entradas + regeneración determinista del manifiesto (159 → 160 migraciones incluidas, `CHECK-WRITERS OK`, test de replay 7/7 local). La rama CP-FIN se sincronizó con main (merge `8f3bdcc61`). Ningún check se alteró para lograr verde; el único fallo de check (E2E de #1619) fue un test de UI flaky (`fc-template-picker`), reproducido exitoso al relanzar el mismo job.

## 2 · SHA de todos los merges (orden cronológico UTC)

1. `b949342e6a…` #1612 → main (2026-11-14 00:21:05)
2. `0f85e4dd62…` #1617 → main (00:22:27)
3. `8ecbc67b26…` #1618 → main (00:25:10)
4. `0b52d7afc1…` #1615 → main (00:36:34)
5. `fe2c5cb7e4…` #1616 → main (00:47:50)
6. `d4ccc80f4e…` #1614 → rama CP-FIN (00:50 aprox.) + sync `8f3bdcc61`
7. `84c44e6bb7…` #1619 (m017) → main
8. `5d63481a02…` #1620 (m018) → main

main se tomó desde `86d9b1312` (línea base, verificado en FASE I) hasta los merges anteriores con **CI de main VERDE en cada punto** (CI, Test Coverage, Security CI Gate, SQL Security Gate — 4/4 success en `b949342e`, `0b52d7af`, `fe2c5cb7`).

## 3 · Migraciones aplicadas y sus resultados (m017, PR #1619)

Canal canónico (Management API + `NOTIFY pgrst 'reload schema'`, guard CP-INFRA-019 doble flag, lote único por archivo, HTTP 201):

| Migración | SHA-256 del archivo aplicado | Origen |
|---|---|---|
| `20261113120800_fix_servicios_recibidos_moneda_documento.sql` | `50d09c66…` | PR #1612 |
| `20261114120000_cp_fin_semantica_total_amount_cup.sql` | `44a77548…` | PR #1615 |
| `20261114140000_cp_fin_ciclo_devolucion_divisa.sql` | `2cfc4580…` | PR #1616 |

Identidad de bytes con lo validado: los SHA coinciden con `audit-evidence/INFRA-011/e2e-migrations-manifest.json` (los checks «E2E Aislado» de los PR validaron exactamente estos archivos en la BD aislada). Verificación POST: marcadores presentes (§17.1, 20261114120000, 20261114140000), **DELTA 0** en 12 tablas de negocio y en asientos, RLS FORCED ×8 intacto. **Regularización del libro `production_migration_ledger`: 15 filas de aplicaciones 11/11–13/11 documentadas sin registro + 3 nuevas = 32 filas** (divergencia de FASE I corregida con evidencia; horas exactas solo asentadas cuando el expediente original las documenta).

**Contract-surface re-certificado tras la aplicación:** 207 funciones SECURITY DEFINER de escritura, sha256 `c8b362b8cbae9c6bebfb0ee591c5030c05786fd7abb51cd140902d21d945f59a`.

## 4 · Estado final de las funciones contables (CP-FIN)

- 30 funciones `fin_*` operativas; 8 tablas `fin_*` con RLS FORCED; 44 categorías activas; 15 tipos documentales; **10 reglas v1 activas**; 41 métricas.
- Semántica corregida en producción y verificada EN VIVO: venta USD real `dbff3625` (total 1.496.000 CUP-eq) → `total_cup = total_amount` con Σcobros zelle exacta (antes: doble conversión → ERR_UNBALANCED). Ciclo de devolución en divisa cerrado going-forward (M1–M4, sin reescritura de histórico). Servicios §17.1 consistentes en moneda de documento (0 servicios en divisa hoy: sin cambio numérico en CUP).
- Verificación independiente: `scripts/f8-verify-todos.mjs` re-deriva el plan motor-exacto (`fin_compute_metrics` + `fin_apply_templates` + regla activa) de cada asiento y lo compara con lo contabilizado — **hash v4 idéntico** (ver §13).

## 5 · Evidencia del backfill de las 161 ventas legacy (m018, PR #1620)

- Secuencia de la FASE III (11 pasos) completa: población reconstruida (165/161/4 exactos), importes legacy == total (165/165), sin pagos previos, moneda CUP demostrada, sin devoluciones/store credit/liquidaciones, **dry-run previo coincidente (161/170/3.128.769,998)**, ejecución transaccional del `MIGRACION.sql` validado en BD aislada (SHA `73fdcd96…`, HTTP 201), verificación fila a fila (P1 fechas 0 desvíos, P2 métodos/monedas 170/170, P5/P7 vinculación 170/170, **Σ por venta == total en 161/161**), integridad (campos legacy intactos — Σ 45.208.654,99 antes y después; 0 asientos nuevos; 0 errores) e **idempotencia** (re-ejecución no inserta).
- `payment_transactions` 944 → **1.114** (+170 exactas: cash 138 + transfer 14 + mixtas 9×2).
- Nota de transparencia: el chequeo por FILA de la primera corrida dio un falso negativo en las 9 ventas mixtas (componente vs total); corregido a verificación POR VENTA sin re-ejecutar nada (los datos ya eran correctos). Documentado en `docs/audits/2026-11-14-migracion-legacy-aplicada/`.

## 6 · Las cuatro ventas Zelle + CUP — BLOQUEADAS

`c5965c77` (15.300) · `cb3052c3` (4.760) · `119a4f5e` (4.760) · `1558287f` (9.520 = cash 2.720 + zelle 6.800) — **total 34.340 CUP**. El importe es CUP nominal (demostrado documento a documento) pero el riel zelle contradice PT005 (zelle exige USD/EUR/MLC). **PT005 NO se deshabilitó globalmente; ningún cobro se reclasificó.** Quedan bloqueadas para decisión del propietario (opciones a/b/c del expediente #1617). Verificación actual: **0 filas de pago y 0 asientos** sobre ellas.

## 7 · Las tres ventas inconsistentes — BLOQUEADAS (re-investigadas)

`1df5d727` (total 0,00 · cobrado 12.000) · `8ab7becf` (15.800 · 16.000, +200) · `28e94349` (177.770 · 169.670, −8.100). Re-investigadas en FASE IV: historial audit_logs intacto (CREATE_SALE_V2 + SALE_PAYMENT_INCIDENT con las notas de registro fuente), 0 devoluciones/store credit/liquidaciones, 0 asientos, motor → NO EQUILIBRADA (ERR_UNBALANCED por diseño). **Sin nueva evidencia que habilite corrección documental** (alternativas 1–3 de cada expediente siguen siendo decisión del propietario). Permanecen bloqueadas; **ningún importe se modificó, ningún cobro/devolución/crédito se inventó, ningún documento se anuló**.

## 8 · Matriz de costos final de ENERVIDA (FASE V — sin reconstrucción)

- **90 productos con `cost_average = 1,00`** (verificación fresca: intacto — NINGÚN costo/WAC se actualizó); 78 con recepciones documentales activas (costo>0); 12 sin respaldo (valor predeterminado). Matriz consolidada: `docs/audits/2026-11-13-matriz-costos-enervida/` + xlsx entregado al propietario (13/11).
- **La reconstrucción NO se ejecutó**: el paso 5 de las verificaciones obligatorias exige contrastar recepciones con documentos originales (facturas/costos unitarios), evidencia externa no disponible; el propio expediente advierte la improbabilidad de costos por caja/lote (p.ej. «Grapas 49 unid. a 2.500×680 = 1.700.000 CUP/unidad»). Reconstruir sin ese contraste fabricaría saldos. **Decisión mantenida pendiente del propietario.**
- COGS contabilizado conforme a la regla canónica v1 (`cost_at_sale`; fallback `cost_average` para líneas sin costo histórico — ver §18.3).

## 9 · Estado de los 34 vales con costo cero — EXCLUIDOS

34 vales completados con `total_cost = 0` (más 1 anulado, excluido de todos modos) permanecen **sin asiento** (verificado: 34/34 sin entrada contable; clasificación VALORACIÓN_INCOMPLETA). Los **198 vales con costo documental válido quedaron contabilizados** (Lote C: hash plan==real `077135a7…`, D=C exacto).

## 10 · Estado independiente de PUERTO PADRE (FASE VI — NO contabilizada)

- 58 productos sin costo válido (0 líneas de venta con costo real > 1); valoración no confiable → **ninguna operación financiera de PP contabilizada** (prohibición de backfill de ventas/COGS y de saldos iniciales estimados respetada).
- Subconjuntos futuros verificables identificados (para cuando su matriz esté completa): 2 servicios activos (6.900 CUP), 5 recepciones activas (1.616,50 CUP), 1 vale con costo, 0 flujos de caja. Plantilla de recolección de costos reales entregada al propietario (13/11). **El cierre de ENERVIDA no se mezcló con el de PP.**

## 11 · Documentos contabilizados por lote (ENERVIDA — primera contabilización histórica)

| Lote | Contenido | Docs | Asientos | Movimientos | Hash v4 plan==real |
|---|---|---|---|---|---|
| A | Servicios recibidos (reconocimiento + 14 pagos) | 14 (+14 pagos) | 28 | 56 | `beacf9ca…` / global |
| B | FLUJO_CAJA 2 · COMISION 1 · AJUSTE_INVENTARIO 1 | 4 | 4 | 8 | `1fffce32…` |
| C | Vales con costo válido | 198 | 198 | 396 | `077135a7…` |
| D | Recepciones (reconocimiento) | 88 | 88 | 176 | `6cd85fcc…` |
| E | Ventas CUP íntegras (incluye las 161 migradas) | 569 | 569 | 2.306 | `f558e0bd…` (2 tandas) |
| F | Ventas USD | 130 de 131 | 130 | 536 | `fe919563…` |
| G | Devoluciones de venta | 2 | 2 | 8 | `ba0b3333…` |
| — | **TOTAL MISIÓN** | 1.019 (+14 pagos) | **1.019** | **3.486** | global `af45b324…` |

Ejecución: `fin_post_document` por documento (atómico, idempotente) con actor = propietario (superadmin `a1111111…`), guard CP-INFRA-019. La tienda de prueba COSTPRO y PUERTO PADRE fueron excluidas por diseño. Cada lote: plan motor-exacto (dry-run) → conteos/totales esperados → verificación de dependencias (migraciones aplicadas, legacy migrado, #1616 integrado) → ejecución → conciliación (hash plan==real) → evidencia (`docs/audits/2026-11-14-primera-contabilizacion-enervida/lotes.json`).

**Exclusiones de diseño dentro de ENERVIDA (todas SIN asiento, verificado):** 3 ventas inconsistentes + 4 zelle+CUP + 1 venta con deriva de céntimos (`3fad8395`, D−C = 0,01 — preferible incidencia a asiento descuadrado) + 34 vales cero + ventas con total ≤ 0 + devoluciones anuladas.

## 12 · Conteos de asientos y movimientos (ENERVIDA, final)

**1.023 asientos / 3.496 movimientos** totales (1.019/3.486 de la misión + 4/10 vivos del 13/11 pre-existentes, incluidos en la verificación). Por tipo: VENTA 700 · RECEPCION 89 · VALE_SALIDA 198 · SERVICIO_RECIBIDO 30 · DEVOLUCION_VENTA 2 · FLUJO_CAJA 2 · COMISION 1 · AJUSTE_INVENTARIO 1. **Unicidad estructural: 0 duplicados (tipo, doc, evento, payment_ref).**

## 13 · Hash v4 antes y después

- Referencia 13/11 (informe dry-run v4): dos pasadas idénticas `d3dae0d9…` (1342 asientos planificados, plantilla simplificada de análisis).
- Dry-run oficial re-ejecutado hoy contra producción corregida: hash idempotente (2 pasadas iguales), semántica de divisa confirmada (131 USD / 11.070.884,97 CUP reales; inflación evitada 7.566.770.544,63 CUP; sin_pagos = exactamente las 4 zelle).
- **Motor-exacto (este expediente): plan `af45b3249646d27a787fcaf7ac1fe487d434f56d66172b6ce5358367167ee2da` == real `af45b324…`** — la estructura CONTABILIZADA coincide con la planificada para el mismo conjunto de documentos (0 asientos con estructura distinta). Serialización v4 de estructura completa con orden canónico determinista (los id de movimientos son UUID aleatorios).

## 14 · Conciliación CUP y USD

- **Mayor moneda única CUP** (0 movimientos en otra moneda); la divisa de origen documentada por movimiento: 538 movimientos con `currency_origin='USD'` (130 ventas USD contabilizadas + sus COGS).
- Ingresos ING_VENTAS contabilizados: **40.410.821,90 CUP-equivalentes** (700 ventas), de los cuales **12.101.943,40 CUP-eq** corresponden a las 130 ventas USD (importe nominal USD 37.204,64 según el dry-run; nunca se sumaron CUP+USD como una misma magnitud).
- Cobros por riel verificados por documento (control 3: débitos por método/moneda == Σamount_cup, 0 desajustes): efectivo CUP / efectivo USD / bancos (transfer+zelle) cada uno en su cuenta, con `amount_cup` generado por la tasa del pago.
- Pasivos CXP_PROV: 194.995.370,40 CUP == valor documental de las 89 recepciones activas (cuentas por pagar REALES conservadas — ningún saldo se eliminó para cuadrar).

## 15 · Estado de `fin_posting_errors`

**0 filas** (ENERVIDA y global). Los documentos bloqueados no generan errores contaminantes: quedan fuera de la contabilización por selección explícita (no por fallo silencioso).

## 16 · Partida doble

**D = C exacto (0,00 de deriva) en cada uno de los 1.023 asientos.** La tolerancia de céntimos del motor (≤0,01) NO se usó para publicar ningún asiento descuadrado: la única venta con deriva (0,01) quedó bloqueada (§11).

## 17 · Inventario y Kardex

La contabilización financiera **no modificó existencias ni duplicó movimientos**: `stock_movements` 1.775 (antes y después), `kardex_entries` 1.775, `inventory` 258 filas — idénticos a la línea base. Los movimientos contables viven solo en `fin_movements`.

## 18 · Incidencias residuales (sin ocultar)

1. **4 ventas Zelle+CUP** (34.340 CUP) — bloqueadas; PT005 intacto; decisión del propietario (a/b/c).
2. **3 ventas inconsistentes** (12.000 sobrepago con total 0 · +200 · −8.100 pendiente) — bloqueadas; cada expediente con alternativas documentadas; decisión del propietario.
3. **Costo histórico incompleto (conocido y cuantificado):** 333 líneas de venta sin `cost_at_sale` contabilizaron COGS por el fallback canónico `cost_average` (2.754.857,48 CUP; 75 de esas líneas en productos con `cost_average=1`). La infravaloración potencial de los 90 productos (riesgo documentado de 23,76 MM CUP en la matriz) y los 12 productos sin respaldo siguen pendientes de decisión documental del propietario. **No se usó 1,00 como sustituto declarado de costo real; no se actualizaron costos ni WAC.**
4. **34 vales con costo cero** — excluidos (VALORACIÓN_INCOMPLETA).
5. **1 venta con deriva de céntimos** (`3fad8395`, 0,01 CUP) — bloqueada por integridad de partida doble estricta.
6. **PUERTO PADRE** — sin contabilizar (58 productos sin valoración confiable); plantilla de costos pendiente de recolección del propietario; 20 servicios en borrador.
7. **Tienda COSTPRO (Prueba)** — no contabilizada por diseño (datos de prueba; fuera del alcance financiero).
8. **Higiene de dependencias:** engine.io 6.6.9 → 6.6.10 (parche del advisory GHSA-2gc4-cqfq-p2gv high, dentro del rango semver de socket.io) aplicado en PR dedicado con CI; undici 7.29.0 (vía @ai-sdk) está FUERA del rango afectado (>=8.1.0 <8.10.2) — el undici 8.x de jsdom es solo de tests; actualización mayor de undici NO compatible con @ai-sdk (^7.28) → documentada y diferida. Los advisories restantes (DOMPurify, brace-expansion, etc.) siguen en auditoría con `continue-on-error` (decisión del propietario del 13/11).
9. **Apertura contable:** `fin_opening_balances` = 0 — no se registró ningún saldo inicial (la primera contabilización opera documento a documento; la propuesta de saldos iniciales de la rama CP-FIN sigue siendo PROPUESTA sin aplicar).

## 19 · Despliegue y salud de producción

- **Vercel Production**: deployments success en cada fusión (última verificación: `b949342e` 13/11 18:38 success + despliegues posteriores por merge); main final = merges m020 + higiene (ver SHA del merge de este PR). Health del sitio: workflow E2E sobre despliegues `e2e-isolated` y previews OK (49/50→50/50 tests tras re-ejecución del flaky).
- **CI de main**: 4/4 workflows success en cada punto de fusión (CI · Test Coverage · Security CI Gate · SQL Security Gate).
- **Servidor local del propietario**: PM2 online con `.env` principal restaurado y `GET /api/health` 200 (verificado al cierre de la sesión).

---

## Distinción final exigida por la misión (§14)

- **A. CP-FIN técnicamente operativo: SÍ** — motor activo, semánticas corregidas en producción, posting en vivo verificado, 12/12 controles de integridad sobre lo contabilizado.
- **B. ENERVIDA históricamente contabilizada en los bloques aptos: SÍ** — lotes A–G publicados, conciliados, idempotentes y con hash v4 plan==real.
- **C. ENERVIDA con incidencias económicas pendientes: SÍ** — §18.1–§18.5 (34.340 + 3 ventas + costos + 34 vales + 1 céntimo): bloqueadas y documentadas, ninguna ocultada, ninguna resuelta inventando datos.
- **D. PUERTO PADRE preparado o contabilizado según su propia evidencia: PREPARADO EN SUBCONJUNTOS, NO CONTABILIZADO** — su valoración de 57/58 productos y controles propios siguen pendientes.

**La misión se declara COMPLETADA al máximo cierre seguro y posible alcanzado con evidencia documental real.** El porcentaje restante de contabilización no se persiguió artificialmente: los bloqueos responden a falta de respaldo documental o a política contable reservada al propietario, exactamente como ordena la regla final.
