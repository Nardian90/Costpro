# RECT004 — INFORME MAESTRO
## CP-FIN-VALUATION-RECTIFICATION-RELEASE-GATE-004 · Auditoría final, validación contable y preparación segura de la rectificación SKU 111/112

**Fecha del informe:** 2026-11-15 (corte de datos de producción: 2026-11-14T19:41Z–20:17Z UTC)
**Misiones encadenadas:** CP-INVENTORY-TRACEABILITY-RECONCILIATION-001 → CP-FIN-VALUATION-CORRECTION-002 →
CP-FIN-VALUATION-RECTIFICATION-003 → **esta misión (004)** · PR #1628.
**Producción:** **INTACTA** — verificación de integridad en §F.
**Estado de la rectificación:** técnicamente cerrada y demostrada; **pendiente SOLO de la autorización del
propietario para ejecutar** (DP-6).

---

## 1. Resumen ejecutivo

Esta misión cerró las incertidumbres técnicas y contables que impedían ejecutar la rectificación de SKU 111/112
del FAC-VITALLCONS-001:

1. **Entorno recuperado** tras el reciclaje del sandbox (protocolo de resiliencia 11c): rama
   `fix/valuation-rectification-003-20261115` @ `5970107e7`, PR #1628 OPEN, expediente 003 íntegro en el repo.
2. **Todas las verificaciones de producción re-hechas desde cero** (read-only): DP-1, DP-2, DP-3, las 119
   salidas con su reingreso, la conciliación de costo/inventario/COGS, la protección de las 75 líneas y un
   snapshot nuevo con diff contra el de la misión 003.
3. **La semántica de `reversal_of` quedó demostrada con el motor real** (13 pruebas en BD aislada): el diseño
   RECT-1 es compatible con la arquitectura; se identificó y mitigó una trampa real (T12).
4. **El prototipo E2E final (16 fases, TODO_PASS)** demuestra RECT-1 y RECT-2 **separables**, idempotentes,
   con interrupción/reanudación, rollback individual y total byte a byte, concurrencia y controles intactos.
5. **Se corrigieron dos defectos de CI reales del PR #1628** (guarde CP-INFRA-020 ausente en m042/m049;
   escritores no declarados) y se re-ejecutaron los gates localmente (TypeCheck/Lint/Tests/SEC-TS/
   destructive-guard/check-writers PASS; Build compila — el sandbox de 4 GB no completa la fase TS del build).
6. **Runbook definitivo** con pre-flight intra-transacción, tabla de permitidas/prohibidas, contingencias y
   criterios de aborto. **La rectificación NO se ejecutó.**

| Concepto | SKU 111 | SKU 112 | Conjunto |
|---|---:|---:|---:|
| Cantidad recibida | 49 u | 100 u | 149 u |
| Valor defectuoso (2.500/1.000 USD@680) | 83.300.000,00 | 68.000.000,00 | 151.300.000,00 |
| Valor correcto (1 CUP/u) | 49,00 | 100,00 | 149,00 |
| **Exceso a revertir (RECT-1)** | **83.299.951,00** | **67.999.900,00** | **151.299.851,00** |
| Salidas netas demostradas | 39 u | 80 u | 119 u |
| Existencias (históricas y actuales) | 10 u | 20 u | 30 u = 30 CUP en libros |

**Total corregido de la recepción: 40.739.585,00 CUP — PRELIMINAR** (71 líneas no verificables y 4
discrepancias de moneda pendientes del propietario).

---

## 2. Recuperación del entorno (§3 de la misión)

| Componente | Estado verificado |
|---|---|
| Sandbox | RECONSTRUIDO (reciclado); recuperación vía estado remoto (regla 11c) |
| Repo | `git clone` OK (7.325 archivos) |
| Rama misión 003 | `fix/valuation-rectification-003-20261115` @ **5970107e7** (2026-11-14 19:22:38 UTC; 6 commits sobre el main de entonces) |
| PR #1628 | **OPEN**, head 5970107, sin conflictos de fusión; último cambio 2026-11-14 |
| CI en el PR (remoto) | Codex review FALLIDO por *usage limits* del servicio (infra externa, no código); Render preview deployment FALLIDO (servicio externo; config en `deploy/render.yaml`); el resto de checks no reportable vía API sin token (rate limit) → verificación LOCAL al código vigente (§7) |
| main | Avanzó con PR #1627 (adenda-002) — no toca los expedientes de la misión 003 |
| Expediente 003 | Recuperado íntegro de `docs/audits/valuation-rectification-003-20261115/` (13 archivos) |
| Scripts m031/m041/m042/m047/m048/m049 | Localizados en `scripts/` con sus evidencias en el expediente |
| .env | Restaurado EXACTO desde el prompt de inicio (sección 4+6); `.env*` gitignored (verificado); secretos JAMÁS impresos ni commiteados |
| Toolchain | bun 1.3.14 EXACTO ✓ · `bun install --frozen-lockfile` OK · pg OK |
| GITHUB_PAT | **REDACTADO en el prompt → no disponible**: push imposible en esta sesión; commits LOCALES en la rama del PR (ver §7); operaciones remotas solo read-only |
| Aislamiento | Probe m050a: producción Management API OK (PG 17.6) + BD E2E `lguovmvrozxgssupkwpf` sentinela `true` (REST+SQL) — ninguna var de escritura apunta a producción |

**Nada se inventó:** rama, SHA, expediente y scripts provienen del estado remoto real; los estados de CI no
verificables se declaran como tal y se sustituyen por verificación local documentada.

---

## 3. DP-1 — Costo real de SKU 111 y SKU 112 (verificado)

* **Separación costo/precio confirmada en los registros de origen:** la FVC conserva sus 101 líneas con las 2
  líneas del alcance en 2.500/1.000 **USD@680** (el defecto, aún sin corregir); el maestro de productos mantiene
  precios de venta **2.000 CUP (111)** y **1.000 USD (112)** — intactos; WAC = 1 en ambos.
* El error histórico queda delimitado con precisión: precios de **venta en CUP** leídos como importes **USD** y
  multiplicados por 680. **La tasa 680 NO se aplica a estos dos SKU** (solo a las ~20 líneas USD auténticas,
  cuyo tratamiento aprobado se conserva).
* Recomputo independiente: 101 líneas → **192.039.436,00 = total de cabecera (delta 0,00)**; escenario corregido
  **40.739.585,00**; reducción **151.299.851,00** (83.299.951 + 67.999.900).
* Diseño de rectificación y snapshots mantienen separados: costo de adquisición (1 CUP), precio de venta
  (2.000/1.000), moneda original (CUP real vs USD registrado), tasa (1 vs 680), importe contabilizado y
  valoración de inventario (30 CUP). Evidencia: `RECT004_ACCOUNTING_RECONCILIATION.xlsx` + `rect004-faseDP-snapshot.json`.

## 4. DP-2 — Contrapartida de 151.299.851 CUP (verificación NUEVA, documento por documento)

Re-verificación read-only al corte 2026-11-14T19:41Z UTC (no se aceptó el dato histórico como prueba):

| Verificación | Resultado |
|---|---|
| Pagos con `ref_id` = FVC | **0** |
| Pagos al proveedor por ref_type (receipt/proveedor/supplier/purchase) en 200 transacciones de la tienda | **0** (solo sale/in 181, service/in 17, cash_flow/out 2) |
| Pagos no vinculados (reference/notes con Vitallcons/FAC) | **0** |
| Anticipos/compensaciones (direction=out) | 2 cash_flow 2026-10-23 (egresos de caja; NO pagos de recepciones) |
| Notas de crédito a proveedor | La FVC sigue `active` (la devolución a proveedor se modela como reversa de recepción: no existe) |
| Anulaciones de la FVC (`reversal_of`) | **0** |
| Duplicados del documento en 70 recepciones del proveedor | **0** (70 números únicos) |
| Recepciones nuevas del proveedor tras el corte 003 | **0** |
| `store_credit_ledger` del proveedor | 0 (es crédito de clientes) |
| Mayor `PAS_CXP_PROV` | reconocimiento C 207.256.110,57 (98 recepciones) + anulación D 960 (otra recepción) = **neto 207.255.150,57 — IDÉNTICO al corte 003** (no existe PAGO_PROVEEDOR) |
| `payment_status` FVC | **unpaid · paid_amount 0 · vencida 2026-07-31** |

**Condición de aprobación CUMPLIDA:** el importe a revertir continúa siendo parte de una deuda real 100%
pendiente. **RECT-1: D `PAS_CXP_PROV` 151.299.851,00 / C `ACT_INVENTARIO` 151.299.851,00** — sin recálculo, sin
contrapartida inventada. La deuda restante (40.739.585) solo se cancelará con pagos reales futuros.
Evidencia: `RECT004_CXP_RECONCILIATION.xlsx`.

## 5. Semántica de `reversal_of` (§6) — demostrada

Documento técnico completo: **`RECT004_REVERSAL_SEMANTICS.md`**. Síntesis:

* **La BD admite reversiones parciales** (FK sin constraints de importe/cardinalidad); **el motor de anulación
  solo genera completas** (copia 100% de movimientos invertidos). RECT-1 usa el patrón correcto: asiento
  `ajuste_manual` compensatorio **enlazado** (`reversal_of=93bb5da9`) — no fuerza el mecanismo ni elude
  restricciones.
* **No existe constraint de cardinalidad**: la protección efectiva es el índice único de tupla
  `uq_fin_entries_doc_event` (segunda parcial de la MISMA tupla RECHAZADA — demostrado), ids deterministas y
  pre-flight de importe (la BD **no** valida importes: un parcial de 9.999 sobre original de 2.000 es ACEPTADO —
  demostrado T6).
* **"Completamente revertido"** = `status='reversed'`, escrito solo por la función de anulación; los informes
  (balance/dashboard/estado de resultados) usan sumas puras de movimientos — la parcial netea correctamente.
* **TRAMPA CONFIRMADA (T12):** tras RECT-1, una futura anulación de la FVC sería SALTADA por el `EXISTS` del
  motor y el residual 40.739.585 no se compensaría automáticamente → **regla del runbook**: anulación futura
  exige asiento manual del residual. Prohibido anular la FVC sin ese paso.
* Pruebas del motor real (BD aislada): **T1–T13 TODAS PASS, net delta 0** — completa, parcial, sucesivas,
  duplicada, reintento, exceso, concurrencia, rollback, reanudación, historial, saldos, trampa, re-post.

## 6. DP-3 — Los 24 CUP de salidas sin asiento (desglosados por documento)

| Documento | SKU | Unidades | Cuenta | Evidencia de no-asiento previo |
|---|---:|---:|---|---|
| VS-000037-2026 (Orden/47) | 112 | 4 | `GAS_VALES` | 0 `fin_entries` por document_id y document_number; el vale SOLO contiene la línea 112 (uc=0) |
| VS-000138-2026 (ENERVIDA) | 112 | 1 | `GAS_VALES` | ídem |
| VS-000139-2026 (ENERVIDA) | 111 | 1 | `GAS_VALES` | ídem |
| Cuadre importación Δ−1 (2026-08-18, sku=111) | 111 | 1 | `GAS_PERDIDA_INV` | Sin documento `inventory_adjustments` (0 filas) ni `reference_id` — regularización legacy |
| Cuadre importación Δ−17 (2026-08-18, sku=112) | 112 | 17 | `GAS_PERDIDA_INV` | ídem |
| **TOTAL RECT-2** | | **24** | D 6+18 / C 24 | **Sin doble contabilización** |

* **Los 18 CUP de ajustes son efectivamente pérdidas de inventario**: salidas de regularización de la migración
  legacy (diferencia acumulada pre-corte vs Excel), sin tienda destino, sin reingreso en otro almacén, sin
  transferencia ni devolución — patrón del asiento `AJUSTE_INVENTARIO` existente (a96e09c3:
  D `GAS_PERDIDA_INV` 1 / C `ACT_INVENTARIO` 1).
* **No se duplica ninguna salida:** el COGS del motor (7 CUP en 5 asientos: 1+1+3+1+1) está INTACTO y RECT-2
  NO toca `GAS_COSTO_VENTAS`; los 6 vales con asiento (porción 111/112 = 88 CUP; VS-208 completo =
  229.862,57 CUP) quedan intactos; el par VS-000223 (salida 1 u + reingreso 1 u, ambos sin asiento) tiene neto 0
  y **no se contabiliza**.
* Los movimientos `unit_cost=0` verificados: **7 filas / 26 unidades** (2 ventas + 6 u de vales + 18 u de ajustes) —
  las 2 ventas ya tienen COGS correcto en el mayor; las 24 unidades restantes nunca llegaron al mayor.
  Evidencia: `RECT004_EXITS_RECONCILIATION.xlsx`.

## 7. Reingreso y las 119 salidas (§8) — identidades re-verificadas

* **SKU 111: 49 − 39 = 10** ✓ · **SKU 112: 100 − 81 + 1 = 20** ✓ · **conjunto: 149 − 120 + 1 = 30** ✓ —
  contra `stock_current`, `inventory` y kardex del corte ACTUAL (0 movimientos nuevos de estos SKU tras el corte 003).
* **El reingreso de 1 unidad queda explicado y conciliado:** vale VS-000223-2026 (Ferro, vale 38-26, Antonio Ye
  Batista) — `status=reversed`; salida `issue_slip_out` −1 @ uc=1 (10:00Z) y reingreso `issue_slip_reverse` +1 @
  uc=1 (11:00Z); **ambos sin asiento** (verificado) → neto contable 0; ya está incorporado en kardex y
  existencias (no se reconoce como entrada adicional ni se duplica la reversión de su salida).
* Reproducción independiente: script m050b/m050c + `RECT004_READONLY_SQL.sql` §D (re-ejecutable).
* **COGS 7 CUP conservado sin duplicación** — verificado en la implementación (regla VENTA del motor: COGS a
  `cost_average=1` por métrica `costo_productos_cup`, no al uc del kardex) y en los 5 asientos reales.

## 8. Conciliación de costo, inventario y COGS (§9)

| Concepto | Histórico (expediente 003) | Actual (corte 004) |
|---|---|---|
| Existencias 111/112 | 10 / 20 u (30 CUP) | **10 / 20 u (30 CUP)** — idénticas |
| WAC | 1 / 1 | 1 / 1 |
| COGS motor | 7 CUP | 7 CUP (5 asientos intactos) |
| GAS_VALES porción 111/112 | 88 CUP | 88 CUP |
| GAS_PERDIDA_INV | 0 | 0 |
| Deuda FVC | 192.039.436 unpaid | **idéntica** (0 pagos) |
| Mayor ACT global | 201.699.246,55 | **201.681.043,51** (−18.203,04) |

* La diferencia −18.203,04 del mayor ACT global es **actividad comercial viva posterior al corte 003** (8
  asientos: venta 53.400 anulada y re-vendida como 10.000 + 43.400 con COGS 18.203,04; 2 servicios recibidos y
  pagados 31.860 + 500) — **otros productos, sin relación con la FVC ni los SKU 111/112** (kardex de estos SKU:
  0 movimientos nuevos). Ambos cortes quedan documentados; el runbook parte del estado vigente.
* El total de la recepción 40.739.585 CUP sigue **PRELIMINAR** — no se certifica como definitivo.
* Identidad final del subconjunto (demostrada E2E P7): `149 − 7 − 94 − 18 = 30 = valor en libros`.
  Evidencia: `RECT004_ACCOUNTING_RECONCILIATION.xlsx`.

## 9. Protección de las 71 + 4 líneas (§10)

* **Regresión ejecutada:** las 101 líneas actuales comparadas contra la matriz congelada m048 (misión 003) →
  **0 CAMBIOS** en `unit_cost`/`moneda`/`tasa`; 99 líneas fuera de alcance intactas.
* Clasificación conservada: 2 corregidas (alcance) + 18 legítimas + **4 discrepancias de moneda (SKU 90, 92,
  999, 120 — intactas, sin modificar)** + **71 no verificables (intactas — exposición contingente congelada
  24.510.805 CUP)** + 6 sin problema.
* Advertencias metodológicas incorporadas: la coincidencia `uc==precio` NO es prueba de error; márgenes altos o
  costos de 1 CUP NO son imposibles. **Ninguna corrección por inferencia.**
* Control de regresión re-ejecutable: `RECT004_READONLY_SQL.sql` §E + `RECT004_MATRIX_101.xlsx` (hoja
  "Protección 75" y "4 Discrepancias").

## 10. Snapshot actual y actividad posterior (§11)

| Elemento | Valor |
|---|---|
| Corte del snapshot nuevo | 2026-11-14T19:41:47Z UTC (fecha UTC documentada; zona horaria del entorno: UTC) |
| Identificadores | hashes SHA-256 por sección en `rect004-faseDP-snapshot.json` (más hash global del expediente) |
| Secciones congeladas IDÉNTICAS al corte 003 | receipts_fvc (byte a byte) · kardex (mismos ids) · fin_entries/movements_fvc · issue_slips/items · inventory · wac_change_log · v_purchase_orders_cxp · reversal_of (0) |
| Movimientos nuevos de SKU 111/112 | **0** |
| Nuevos (post-corte 003, tienda) | 8 asientos · 3 transacciones · 5 pagos · 0 recepciones del proveedor |
| Cambios de saldo de proveedor | **NINGUNO** (mayor PAS_CXP_PROV idéntico) |

La variación de 18.203,04 CUP del snapshot 003 NO es error de misión: queda explicada y desglosada (§8).

## 11. Prototipo E2E final (§12) — TODO_PASS

`scripts/m050e-rect004-e2e-prototipo.mjs` sobre la BD aislada con el **esquema y mecanismos reales**
(migraciones, triggers, índices, RLS). Réplica fiel + 16 fases:

**P0** preflight · **P1** seed réplica · **P3** aplicación parcial (solo RECT-1) · **P4** estado intermedio
válido (RECT-1 presente / RECT-2 ausente) · **P5** idempotencia RECT-1 · **P6** reanudación (RECT-2) ·
**P7** verificación final (14 asientos D=C · COGS 7 intacto · ACT=30=CXP base · precios/existencias intactos) ·
**P8** idempotencia total · **P9** concurrencia (0 duplicados) · **P10** rollback individual RECT-2 ·
**P11** re-aplicación · **P12** rollback TOTAL byte a byte (hash idéntico al inicial) · **P13** replay ·
**P14** controles intactos (M021 sin hatch RECHAZADO · RLS FORCE · motor REVOKE · sentinela true) ·
**P15** producción intacta (re-verificación read-only) · **P16** net delta 0.

Evidencia completa: **`RECT004_E2E_EVIDENCE.md`** + `rect004-e2e-prototipo.json`.

## 12. PR #1628 y calidad del código (§13)

**Estado remoto real:** PR OPEN · head `5970107` · sin conflictos · Codex review fallido por límites de uso del
servicio (externo) · Render preview deployment fallido (externo; `deploy/render.yaml`) · commits nuevos posteriores: ninguno en la rama.

**Defectos técnicos encontrados y CORREGIDOS en la rama (dentro del alcance):**

1. **CP-INFRA-020 roto en el propio PR** (causa de CI roja real): `m042` y `m049` usaban
   `session_replication_role='replica'` sin el guard `assert-not-production` → el gate de destructivos del CI
   FALLA. **Fix:** guard añadido a m042/m049 (+ a los nuevos m050d/m050e). Gate re-ejecutado: **PASS**
   ("sin destructivos sin guard").
2. **Escritores sin declarar:** los scripts nuevos (m050a/b/d/e) no constaban en
   `scripts/lib/writers.manifest.json` → el test de regresión de escritores FALLABA (6061/6158 pasaban).
   **Fix:** 3 excepciones READ-ONLY documentadas + 2 `isolationProtected` (sentinela fail-closed); el test del
   manifiesto pasa **75/75**.

**Gates re-ejecutados LOCALMENTE sobre el código final de la rama** (SHA local posterior a los fixes — ver
registro de commits): TypeCheck `tsc --noEmit` **PASS** (0 errores) · Lint **PASS** (0 errores) ·
SEC-TS gate **PASS** · Destructive guard **PASS** · check-writers **PASS** · Suite completa de tests
(6.158: verificación final en §estado técnico) · Build: **compila** (61–72 s) pero la fase TypeScript del
`next build` excede la RAM del sandbox (4 GB; SIGKILL) — `tsc --noEmit` ya cubre esa verificación; el runner de
CI (7 GB) la completa. `bun audit`: 60 vulnerabilidades conocidas del árbol de dependencias (preexistente;
el paso de audit del CI es `continue-on-error` — fuera de alcance cambiar dependencias).

**Restricciones respetadas:** sin commits en `main`, sin fusión del PR, sin despliegues. **Push imposible**
(GITHUB_PAT redactado en el prompt de esta sesión): los commits quedan LOCALES en la rama del PR #1628,
listos para `git push` cuando el operador disponga del PAT (§E).

## 13. Control de fecha y trazabilidad (§15)

* **Investigación de la discrepancia de nomenclatura `20261115`:** el reloj del sistema NO está desviado
  (verificado: `date -u` coherente con las marcas del servidor de BD). El commit de cierre de la misión 003
  (5970107e7, 2026-11-14 19:22:38 UTC) equivale a **2026-11-14 14:22 hora local de Cuba (America/Havana,
  UTC-5)** — es decir, ni el reloj ni la zona horaria producen "15/11". La procedencia real es el **nombre
  anticipado de la misión**: los prompts de las misiones 002/003/004 FECHAN EL EXPEDIENTE en su propio texto
  (`valuation-correction-20261115`, `valuation-rectification-003-20261115`, y esta misión ordena
  `valuation-rectification-release-gate-004`) — nomenclatura documental anticipada al día probable de cierre.
* **Decisión (conforme a §15):** no se cambió ninguna fecha operacional ni registro histórico ni se
  renombraron los expedientes anteriores (reproducibilidad). Esta misión registra SIEMPRE la fecha UTC exacta
  de cada corte (19:41Z, 20:17Z) y deja claro que el entorno está en 2026-11-14 UTC. El expediente 004 usa el
  nombre exacto que ordena la misión (sin sufijo de fecha).
* Cada script/informe/evidencia tiene hash SHA-256 en `RECT004_SHA256SUMS.txt`. Worklog por fases mantenido
  (`/home/z/my-project/worklog.md`) y commits por fase en la rama.

## 14. Entregables (§16)

| # | Entregable | Archivo |
|---|---|---|
| 1 | Informe maestro | `RECT004_INFORME_MAESTRO.md` (este documento) |
| 2 | Semántica de `reversal_of` | `RECT004_REVERSAL_SEMANTICS.md` |
| 3 | Conciliación CXP | `RECT004_CXP_RECONCILIATION.xlsx` |
| 4 | Salidas + reingreso + asientos | `RECT004_EXITS_RECONCILIATION.xlsx` |
| 5 | Conciliación contable | `RECT004_ACCOUNTING_RECONCILIATION.xlsx` |
| 6 | Matriz 101 con protección | `RECT004_MATRIX_101.xlsx` |
| 7 | Evidencia E2E | `RECT004_E2E_EVIDENCE.md` + JSONs |
| 8 | SQL read-only | `RECT004_READONLY_SQL.sql` |
| 9 | Runbook de producción | `RECT004_PRODUCTION_RUNBOOK.md` |
| 10 | Manifiesto SHA-256 | `RECT004_SHA256SUMS.txt` |

Expediente: `docs/audits/valuation-rectification-release-gate-004/`. Los expedientes 001/002/003 se conservan
sin sobrescribir. Copias de los entregables para el propietario en `download/` (prefijo RECT004_).

---

# INFORME DE CIERRE (§18)

## Tabla de controles

| Control | Estado | Evidencia |
|---|---|---|
| PR #1628 y rama verificados contra el estado remoto real | **PASS** | §2 (rama @5970107e7; PR OPEN; sin conflictos; Codex/Render externos diagnosticados) |
| Costo de SKU111/112 confirmado y separado del precio de venta | **PASS** | §3 + DP-1 + `RECT004_ACCOUNTING_RECONCILIATION.xlsx` |
| Contrapartida 151.299.851 verificada contra la deuda actual | **PASS** | §4 + `RECT004_CXP_RECONCILIATION.xlsx` (12 verificaciones, 0 pagos/compensaciones) |
| Semántica de `reversal_of` demostrada y mecanismo parcial validado | **PASS** | §5 + `RECT004_REVERSAL_SEMANTICS.md` (T1–T13) |
| Los 24 CUP desglosados por documento y sin doble contabilización | **PASS** | §6 + `RECT004_EXITS_RECONCILIATION.xlsx` |
| El reingreso de 1 unidad explicado y conciliado | **PASS** | §7 (VS-000223, neto 0, sin asientos ambos sentidos) |
| Los 7 CUP de COGS conservados sin duplicación | **PASS** | §7 (5 asientos intactos; RECT-2 sin GAS_COSTO_VENTAS) |
| Conciliación de existencias históricas y actuales documentada | **PASS** | §8 (10/20=10/20; cortes y delta explicado) |
| Las 71 líneas no verificables permanecen intactas | **PASS** | §9 (regresión 0 cambios; consulta §E del SQL) |
| Las 4 discrepancias de moneda permanecen intactas | **PASS** | §9 (intactas; pendientes DP-4 del propietario) |
| E2E completo, idempotencia y rollback superados | **PASS** | §11 (TODO_PASS; P0–P16; net delta 0) |
| Los resultados de CI corresponden al SHA vigente | **PASS con salvedad** | Gates re-ejecutados localmente al código final (§12); el SHA remoto 5970107 tenía el defecto CP-INFRA-020 — CORREGIDO en la rama; push pendiente de PAT |
| Runbook actualizado y sin instrucciones de ejecución accidental | **PASS** | `RECT004_PRODUCTION_RUNBOOK.md` (precondiciones + banner de no-ejecución + permitidas/prohibidas) |
| Expediente, hashes y worklog completos | **PASS** | §14 + `RECT004_SHA256SUMS.txt` + worklog por fases |
| Producción permanece sin modificaciones | **PASS** | §F (verificación de integridad) |

**La misión NO está BLOQUEADA.** Ningún control FAIL. Las salvedades (push sin PAT; Render/Codex externos;
fase TS del build no completable en sandbox de 4 GB) no afectan la corrección de la rectificación y están
documentadas con su causa y alternativa.

## A. Estado financiero

* **Importes confirmados (verificados):** costo real SKU 111/112 = 1 CUP/u (49 + 100 = 149 CUP); exceso
  151.299.851,00 CUP; RECT-2 = 24,00 CUP (6 GAS_VALES + 18 GAS_PERDIDA_INV); COGS motor 7 CUP; existencia
  valorizada 30 CUP; deuda FVC 100% pendiente (192.039.436,00 unpaid).
* **Importes preliminares:** total corregido de la recepción 40.739.585,00 CUP (NO certificable como definitivo).
* **Exposiciones no verificables (contingentes, NO errores demostrados):** 71 líneas — 24.510.805 CUP
  (16 USD: 20.129.530; 55 CUP: 4.381.275) + 4 discrepancias de moneda — 588.217 CUP; residual global de
  ACT_INVENTARIO por salidas sub-costeadas (Fase VII de la misión 001) y defecto latente de
  `sync_product_stock()` — backlog.

## B. Rectificación propuesta (asientos y saldos antes/después)

**RECT-1** (transacción independiente; `reversal_of` → 93bb5da9; document_id → fd9d6c88):
`D PAS_CXP_PROV 151.299.851,00 / C ACT_INVENTARIO 151.299.851,00` · + corrección in-place gobernada de 2 líneas
(→1 CUP@1), cabecera (→40.739.585,00), 2 capas de compra (uc→1), wac_change_log (evento `rectificacion`).
Esperado: mayor ACT = X_act − 151.299.851 · mayor CXP = X_cxp − 151.299.851 · deuda FVC → 40.739.585,00 (unpaid).

**RECT-2** (transacción independiente; AJUSTE_INVENTARIO doc fd9d6c88):
`D GAS_VALES 6,00 + D GAS_PERDIDA_INV 18,00 / C ACT_INVENTARIO 24,00` · + revalorización kardex de las 26
unidades subvaluadas (uc 0→1; 7 filas). Esperado: GAS_VALES porción 88→94 · GAS_PERDIDA_INV 0→18 · kardex
cuadrado con el mayor. **Sin tocar** el COGS del motor (7 CUP) ni los vales ya contabilizados.

Saldos antes/después completos: `RECT004_ACCOUNTING_RECONCILIATION.xlsx` (hoja "Antes y Después") y runbook §7.
Separabilidad/idempotencia/rollback: demostrados (§11).

## C. Riesgos pendientes (pueden cambiar la corrección)

1. **Pago del proveedor antes de la ejecución** (A-1/A-10 del runbook): la contrapartida debería recalcularse.
2. **Movimiento nuevo de SKU 111/112** (A-4): re-auditar la cronología (RECT-2 podría cambiar).
3. **Anulación futura de la FVC** (trampa T12): el motor NO compensaría el residual — exige asiento manual.
4. **Decisión del propietario sobre las 71+4 líneas** (DP-3/DP-4): cambiaría el total definitivo (40.739.585
   es preliminar) — el mismo procedimiento canónico se re-ejecutaría con nuevos importes.
5. **Actividad comercial viva** entre snapshot y ejecución: el runbook re-verifica en la transacción (TOCTOU cerrado).

## D. Estado técnico

| Elemento | Estado |
|---|---|
| Rama | `fix/valuation-rectification-003-20261115` — base 5970107e7 + commits locales RECT004 (fixes CP-INFRA-020/writers + expediente) |
| PR #1628 | OPEN (sin fusionar; **sin push posible en esta sesión — PAT no disponible**; el push del operador actualizará el PR) |
| CI | Gates locales PASS (tsc/lint/tests/SEC-TS/guards; build compila — RAM sandbox insuficiente para fase TS); remoto: Codex fail por usage-limits (externo), Render preview fail (externo) |
| Suite de tests | **6063 PASSED / 0 FAILED / 95 skipped (6158) — re-run final VERDE** tras los fixes (primer run: 6061 pass + 2 fail del gate de escritores, corregidos; test del manifiesto 75/75) |
| Entregables | 10/10 en `docs/audits/valuation-rectification-release-gate-004/` + copias en `download/` |
| BD E2E aislada | Sin residuos (net delta 0 en todas las pruebas) |

## E. Autorización pendiente

**El propietario todavía debe autorizar EXPRESAMENTE la ejecución real en producción** (DP-6): importes
finales 40.739.585,00 · −151.299.851,00 · 24,00 y el procedimiento completo del
`RECT004_PRODUCTION_RUNBOOK.md`. **Ninguna aprobación anterior (tasa 680, misiones 001-003) constituye esa
autorización.** El push de los commits locales de la rama también requiere el PAT del operador.

## F. Declaración de integridad (producción sin escrituras)

Verificaciones que DEMUESTRAN que no se realizaron escrituras en producción durante esta misión:

1. **Canal único de producción:** Management API `/database/query` — todos los scripts de producción
   (m050a/m050b/m050b-preesquema) contienen EXCLUSIVAMENTE `SELECT` (cero DML/DDL); el guard de ref exige el
   proyecto de producción SOLO para lectura. Declarado en `writers.manifest.json` como READ-ONLY (exceptions).
2. **Escritores con protección:** los scripts que escriben (m050d/m050e, m042/m049) tienen `assert-not-production`
   (fail-closed, destino E2E) + sentinela `e2e_is_isolated_db()` REST+SQL — verificado en CADA ejecución.
3. **Evidencia de no-ejecución en producción:** re-verificación final read-only (m050e P15, corte 20:17Z):
   FVC total 192.039.436,00 · 101 líneas · **1 asiento** (original) · **0 reversiones** · kardex 21 · unpaid —
   más el diff §10 (secciones congeladas idénticas al corte 003). La rectificación NO se aplicó.
4. **BD aislada sin residuos:** net delta 0 en todas las tablas tocadas por las pruebas (m050d/m050e).
5. **Sin migraciones ni despliegues:** la misión no aplicó migraciones a producción ni desplegó código; los
   cambios de código quedan en commits locales de la rama del PR (sin fusión, sin push).
6. **Sin secretos:** ningún token/clave impreso, commiteado o incluido en expedientes (`.env*` gitignored;
   escaneo del diff de secretos = 0 coincidencias).

---

## Conclusión final

La rectificación de SKU 111/112 queda **técnica y contablemente cerrada**: costo real demostrado (1 CUP/u),
contrapartida verificada contra la deuda real (PAS_CXP_PROV 100% pendiente), semántica del mecanismo
compensatorio demostrada con el motor real (incluida su trampa y mitigación), importes exactos determinados
(151.299.851 + 24), prototipo E2E TODO_PASS con separabilidad/idempotencia/rollback byte a byte, defectos de CI
del PR corregidos y runbook definitivo con criterios de aborto y operaciones permitidas/prohibidas.
**Falta exclusivamente la decisión del propietario.** La producción permanece intacta.
