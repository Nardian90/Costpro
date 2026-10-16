# CORRECCIÓN Y VERIFICACIÓN E2E — REPORTE ENTREGA DE COMISIONES (15/10/2026)

**Sistema:** COSTPRO 4 Multitienda · **Tienda:** ENERVIDA-VITALLCONS (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`)
**Vista:** `Inicio → OPERACIÓN → Ventas → Reporte Entrega` (`CashReportView`)
**Ejecución:** 16/10/2026 · **Rama:** `fix/reporte-entrega-comisiones-1510` · **PR:** #1412
**Estado final: ✅ CORREGIDA Y VERIFICADA** (criterio de aceptación cumplido en la interfaz real)

---

## 1. Causa raíz demostrada

**Hipótesis confirmada — #2 del brief: «La fecha almacenada es correcta, pero el reporte utiliza otro campo de fecha».**

La cadena del reporte (RPC `get_cash_report` → `/api/cash-report` → `/api/cash-report/details` → `/api/cash-report/commissions-summary`) atribuía cada comisión al instante de **confirmación del pago** (`commission_payments.paid_at`), cuando el negocio las atribuye al **periodo de ventas al que corresponden** (`period_start`/`period_end` — la misma convención de fecha económico que `transactions.sale_date` y el motor de comisiones). El registro investigado lleva explícitamente `period_start = period_end = 2026-10-15`, pero se pagó el 16/10 a las 10:25 de la mañana (Habana) → el reporte lo mostraba el 16 y no el 15.

**Hipótesis descartadas con evidencia:**

| Hipótesis | Veredicto | Evidencia |
|---|---|---|
| Pago registrado erróneamente con fecha 16/10 | **DESCARTADA** | `created_at=2026-10-16T14:24:37Z`, `approved_at=14:24:55Z`, `paid_at=14:25:10Z` — coherentes entre sí (33 s de flujo), la fila no existió el 15; alterar la confirmación está prohibido por las reglas de la misión |
| Defecto de límites / zona horaria / conversión en el filtro | **DESCARTADA como causa de este caso** | `paid_at` = 10:25 AM Habana del 16 — día 16 en UTC y en Habana (sin ambigüedad de medianoche); las ventanas que envía el navegador en TZ Habana (`[16T04:00Z, 17T03:59Z]`) son correctas |
| Inclusión de registros de días anteriores (OR/unión) | **DESCARTADA** | Consultas revisadas: filtro simple `paid_at >= start AND <= end`, sin `OR` que incorpore días ajenos |
| Frontend conserva filtros anteriores | **DESCARTADA** | Cada consulta se regenera con las fechas aplicadas (`isReportStale` + `handleGenerate`) |

**Defecto secundario corregido (misma misión):** la vista convertía los días calendario con la TZ del **navegador** (`new Date(day + 'T00:00:00')`) — un navegador en UTC producía ventanas distintas que uno en Habana (no determinista). La plantilla PDF Diario además pasaba cadenas date-only a `commissions-summary` (ventana UTC por cast de PostgREST). Ambos puntos ahora usan la **zona horaria de negocio** (`America/Havana`) de forma determinista.

**Nota de arquitectura:** el RPC `get_cash_report` conserva internamente su criterio `paid_at`; el criterio por periodo se aplica en la capa API (mismo patrón de post-procesamiento que `sales_split` y `adjustments` del D4 2026-10), sin migración contra producción. Si el negocio quiere el criterio canónico en BD, es una migración RPC para una misión con autorización de despliegue.

## 2. Pago investigado — ficha de evidencia

| Campo | Valor |
|---|---|
| ID del pago | `7374dfad-b01b-477a-b2b0-4175f2dd2bfe` |
| Trabajador | `f840a881-2e61-47d1-9661-f67fbd1acf4b` («Dependiente 1 Pueblo») |
| Tienda | ENERVIDA-VITALLCONS `5e6fe821-5465-48b1-b3f1-3aa3182edc38` |
| Importe / moneda / método | 300.00 CUP · cash · status `paid` |
| Periodo de la comisión | **2026-10-15 → 2026-10-15** (las ventas del 15/10) |
| Composición (auditada en `calculated_breakdown`) | Mortero ×1 → 100 · Cemento TBV 50 Kg ×1 → 200 · Cemento Blanco 2 Kg ×2 → 0 (= ops 29–31 del 15/10) |
| `created_at` / `approved_at` / `paid_at` | 2026-10-16T14:24:37Z / 14:24:55Z / **14:25:10Z** (= 16/10 10:24–10:25 Habana, UTC−4 DST) |
| Creado/aprobado/pagado por | `a1111111-1111-1111-1111-111111111111` (admin@demo.com) |
| Vencimiento | `due_date` 2026-10-22 |
| Único pago de comisión | Es la **única** fila `commission_payments` de la tienda y del mes en toda la base |

## 3. Campo exacto usado por el reporte

- **Antes:** `commission_payments.paid_at` (instante de confirmación) en las tres consultas.
- **Ahora:** solapamiento del periodo `[period_start, period_end]` con los **días de negocio** del rango consultado (Habana), con fallback a `paid_at` solo para registros legacy con `period NULL` (sin cambiar su significado contable). Total del grupo y detalle por fila comparten **el mismo criterio** (comprobación FASE C #8).

## 4. Archivos y funciones modificados

| Archivo | Cambio |
|---|---|
| `src/lib/cash-report/period-attribution.ts` | **NUEVO** — módulo puro: `BUSINESS_TIMEZONE`, `tzOffsetMinutes`, `businessDayWindow` (día→ventana Habana determinista), `businessDayOf`, `commissionPeriodOrFilter` (filtro PostgREST por periodo + fallback) |
| `src/app/api/cash-report/route.ts` | Override del grupo `commissions` y de `totals.commissions_total_cup`/`balance_cup` con atribución por periodo, ANTES de `computeDailySummary` (pantalla, desglose y PDF heredan el criterio) |
| `src/app/api/cash-report/details/route.ts` | Rama `ref_type=commission`: filtro por periodo (antes `paid_at`) |
| `src/app/api/cash-report/commissions-summary/route.ts` | Mismo criterio (acepta date-only del PDF Diario) |
| `src/components/views/terminal/views/cash/CashReportView.tsx` | Las 3 conversiones `new Date(day+'T00:00:00')` (generar + acordeón detalle) sustituidas por `businessDayWindow` — ventana determinista Habana |
| `src/__tests__/lib/cash-report-period-attribution.test.ts` | **NUEVO** — 12 pruebas unitarias de la lógica de fechas |
| `e2e/cash-report-commissions-period.spec.ts` | **NUEVO** — E2E/integración (días 15/16, rango, totales vs detalle) |
| `tsconfig.mision-1510.json`, `scripts/fasea_*.mjs`, `scripts/captura_*.mjs` | Tooling de verificación y captura de la misión |

## 5. Rectificación de datos

**NINGUNA — cero escrituras sobre datos operativos.** La evidencia demostró que las fechas almacenadas son correctas (Caso 2 del brief: corregir el filtro/consulta, no el dato). El pago no se tocó: mismo `id`, `paid_at`, `created_at`, monto, moneda, método y relaciones. Las escrituras E2E se realizaron en tiendas piloto dedicadas del framework y fueron eliminadas en el teardown (net zero).

## 6. Pruebas ejecutadas y resultado individual

| Prueba | Resultado |
|---|---|
| Unitarias `cash-report-period-attribution.test.ts` (lógica de fechas, ventanas Habana, solapamiento, fallback, date-only) | **12/12 ✓** |
| E2E «día 15/10: el detalle incluye el pago del periodo 15» | ✓ (falla con el código defectuoso: el pago estaba fuera de la ventana por `paid_at`) |
| E2E «día 16/10 exclusivo: el detalle NO incluye el pago del periodo 15» | ✓ |
| E2E «rango 15–16: el pago aparece EXACTAMENTE una vez» | ✓ |
| E2E «grupo del reporte y detalle comparten el mismo criterio» | ✓ |
| E2E «regresión: suma(15)+suma(16)==suma(rango), sin ids duplicados» | ✓ (**5/5**) |
| Regresión suites existentes del reporte (`cash-report-view`, `dedicated-view`, `icon-variant`) | **30/30 ✓** |
| TypeScript (scoped `tsconfig.mision-1510.json`: módulo + rutas + tests) | 0 errores |
| ESLint (archivos de la misión) | 0 errores |

**Bloqueo de entorno (no de la misión):** `tsc --noEmit` del repo completo se queda sin memoria en este host (exit 137, verificado con 4/6/8 GB heap); el gate completo debe confirmarlo CI. Lint y pruebas locales quedan en verde.

## 7. Capturas reales (interfaz, TZ Habana, datos reales ENERVIDA)

Directorio `audit-evidence/20261016-reporte-entrega-1510/`:

**ANTES de la corrección (reproducción del problema):**
- `test-A-15-15-reporte.png` — 15|15: **sin** comisiones (esperado $32,000 sin restar)
- `test-B-16-16-reporte.png` — 16|16: **«Comisiones pagadas en efectivo −$300.00»** (el problema reportado)
- `test-C-15-16-reporte.png`, `fasea_evidencia.json` (con las URLs exactas que envió el navegador)

**DESPUÉS de la corrección:**
- `post-fix/test-A-15-15-reporte.png` — 15|15: **«Comisiones pagadas en efectivo −$300.00»**, esperado a entregar $31,700
- `post-fix/test-B-16-16-reporte.png` — 16|16: **sin comisiones**, esperado $0
- `post-fix/test-C-15-16-reporte.png` — 15–16: la comisión aparece **una vez**, esperado $31,700
- `post-fix/detalle-comision-dia15-scroll.png` — acordeón expandido: fila con FECHA `2026-10-16 14:25` (cuándo se pagó), REFERENCIA **«Periodo 2026-10-15 → 2026-10-15»**, −$300.00, TOTAL (1 DOCS)
- `post-fix/post_fix_evidencia.json`, `post-fix/detalle_comision_15.txt`

## 8. Totales verificados en la interfaz (post-corrección)

| Consulta | Comisiones en efectivo | Ventas en efectivo | EFECTIVO ESPERADO A ENTREGAR |
|---|---|---|---|
| 15/10/2026 → 15/10/2026 | **−$300.00** | $32,000.00 | **$31,700.00** |
| 16/10/2026 → 16/10/2026 | **$0.00** | $0.00 | **$0.00** |
| 15/10/2026 → 16/10/2026 | **−$300.00 (1 vez)** | $32,000.00 | **$31,700.00** |

Identidad: suma(día 15) + suma(día 16) = suma(rango 15–16) = −$300.00, sin duplicaciones (verificado por E2E y en la UI).

## 9. Verificación de integridad (post-corrección)

- Pago `7374dfad…`: **1 fila**, `paid_at`/`created_at`/monto/moneda/método/relaciones **intactos** (comparados contra la captura previa a cualquier cambio).
- Sin duplicados: `commission_payments` de la tienda = 1 fila (la original).
- Otras tiendas: 0 filas de comisiones pagadas en octubre fuera de ENERVIDA — ninguna afectada.
- Ningún registro histórico modificado; la corrección es exclusivamente de código.
- Reversible por el procedimiento admitido: revertir el commit de la rama (sin dependencia de datos).

## 10. Rama y commit de la solución

- Rama: `fix/reporte-entrega-comisiones-1510` (base `77f1448ad`) · PR #1412 (sin merge — pendiente de autorización).
- Commits: plan (`1bc5bfd01`), solución + pruebas + evidencia + informe (ver historial de la rama).

## 11. Pendientes y bloqueos reales

1. **Gate completo de TypeScript en CI** — verificación local imposible por OOM del host (detalle en §6). No bloquea la verificación funcional (compilación dev + suites + E2E + UI reales en verde).
2. **Mensaje preexistente en el teardown E2E** («E2E DATA CONTAMINATION … users=4», tiendas=0) — ajeno a esta misión (medición posterior al teardown; el run E2E fue net zero). Queda referenciado para su propia limpieza según `docs/audits/E2E-DATA-HYGIENE.md`.
3. **Criterio canónico en BD (opcional):** el RPC `get_cash_report` mantiene `paid_at` en su interior; el criterio por periodo vive en la capa API. Si se desea moverlo a la BD, preparar migración RPC en una misión con autorización de despliegue.
4. La columna FECHA del detalle muestra el `paid_at` original (16/10 14:25 UTC) — dato informativo de cuándo se pagó; la atribución del día la define el periodo mostrado en REFERENCIA.

---

# ADENDA 2026-10-16 (mismo día) — Criterio canónico del negocio: FECHA DEL PAGO

## A1. Directivas del negocio que motivan esta adenda

1. **Corregir el dato del pago investigado:** «cambia la fecha del pago de ejecución para el día 15/10/2026 a las 5:00 PM». El pago se ejecutó realmente el 15/10 a las 5:00 PM; la UI no daba a escoger la fecha del pago y el sistema asumió la fecha actual (16/10).
2. **Feature de UI en Trabajadores y Comisiones → tab «Pagos»:** antes de confirmar el pago debe poder escogerse **la fecha del pago**. Reglas: ningún pago puede ser **inferior a la fecha del último pago realizado** ni **superior al día actual**.
3. **Criterio canónico del reporte (textual):** «en el reporte siempre mostrará la fecha en que se confirmó el pago, porque puede ser que aunque la comisión corresponde al día 15/octubre/2026 no se haya pagado ese día sino el día 16 — y sí sería correcto que se refleje en el reporte de ese día 16 el pago».

La directiva 3 **sustituye** el criterio por periodo de la §3 de este informe (que era correcto como análisis pero atribuía por un campo que el negocio no considera la fecha contable del pago). Con el dato corregido (directiva 1) y la fecha elegible (directiva 2), el criterio «fecha de confirmación del pago» produce el resultado correcto por construcción: un pago del periodo 15/10 confirmado el 16/10 se refleja en el reporte del 16; el pago investigado, ejecutado realmente el 15/10 17:00, se refleja en el reporte del 15.

## A2. Rectificación de datos (directiva 1) — con auditoría completa

| Campo | Valor |
|---|---|
| Pago | `7374dfad-b01b-477a-b2b0-4175f2dd2bfe` (300.00 CUP · cash · ENERVIDA · worker `f840a881…` · periodo 2026-10-15 → 2026-10-15) |
| `paid_at` ANTES | `2026-10-16T14:25:10Z` (16/10 10:25 AM Habana — asumido por el sistema al no existir selector de fecha) |
| `paid_at` DESPUÉS | **`2026-10-15T21:00:00Z` = 15/10/2026 17:00:00 Habana (UTC−4 DST)** — orden expresa del negocio |
| Canal | PATCH PostgREST con JWT del operador admin@costpro.com (idéntico al `.update()` de la app) — script `scripts/fix_pago_comision_1510.py`, evidencia `scripts/fix_pago_comision_1510.json` |
| Integridad verificada post-PATCH | `created_at` (2026-10-16T14:24:37Z) y `approved_at` (14:24:55Z) **intactos** (marcas de auditoría del sistema); monto, moneda, método, trabajador, periodo y relaciones **intactos**; la tienda sigue teniendo **exactamente 1** pago de comisión (sin duplicados); 0 filas en otras tiendas |
| Reversibilidad | El valor previo queda registrado arriba y en el JSON de evidencia; un PATCH inverso restablece el estado original |

## A3. Feature de UI (directiva 2) — fecha del pago elegible

| Archivo | Cambio |
|---|---|
| `src/app/api/commissions/payments/[id]/route.ts` | Acción `pay` acepta `payment_date` (YYYY-MM-DD, Zod). Reglas server-side: (1) no posterior a HOY en zona de negocio; (2) no anterior al día de negocio del último `paid_at` pagado del trabajador (excluyendo el pago en curso). `paid_at` resultante: hoy → instante actual (compatibilidad); día pasado → ese día de negocio a la hora de registro. Sin fecha → asume HOY (comportamiento histórico). |
| `src/lib/cash-report/period-attribution.ts` | Nuevas utilidades `todayBusinessDay()` e `instantForBusinessDay()` (día de negocio + hora de registro, convergencia determinista de offset) |
| `src/components/views/terminal/views/workers/WorkersView.tsx` | Tab «Pagos»: campo **«Fecha del pago»** (móvil y escritorio) con `min` = último pago realizado del trabajador, `max` = hoy, default HOY; validación cliente con toast (defense in depth, el servidor revalida); `payment_date` viaja en el PATCH |
| `e2e/commissions-payment-date-picker.spec.ts` | **NUEVO** — E2E de UI (tienda piloto aislada, net zero): campo visible con default hoy y max hoy, rechazo de fecha futura SIN pagar, pago con fecha pasada válida atribuido a ese día |

La regla del negocio se interpreta **por trabajador** («ningún pago puede ser inferior a la fecha del último pago realizado» — orden cronológico de los pagos de cada trabajador); el servidor la aplica a TODOS los caminos de pago (también a los que no envían fecha, que asumen hoy y siempre la cumplen).

## A4. Criterio del reporte realineado al canónico (directiva 3)

| Archivo | Cambio |
|---|---|
| `src/lib/cash-report/period-attribution.ts` | `commissionPeriodOrFilter` (periodo+fallback) sustituido por `commissionPaidAtFilter` — atribución por `paid_at` en **ventana de negocio determinista (Habana)**; acepta ISO de la vista y date-only del PDF Diario (ventana UTC corregida) |
| `src/app/api/cash-report/route.ts` · `details/route.ts` · `commissions-summary/route.ts` | Los 3 consumidores usan el mismo filtro por fecha de pago (criterio único total↔detalle) |
| `src/__tests__/lib/cash-report-period-attribution.test.ts` | Reescrito: 16 pruebas (ventanas, días de negocio, instante de día pasado, filtro paid_at con casos 15/16/rango) |
| `e2e/cash-report-commissions-period.spec.ts` | Reescrito: 8 E2E — pago pagado HOY aparece HOY y NO en su día de periodo (D−2); pago con `payment_date` retroactiva aparece en el día elegido; rango una sola vez; total==detalle; regresión de suma; fecha futura → 400; fecha anterior al último pago → 400 |

**Nota de arquitectura actualizada (sustituye §3 y §11.3):** el RPC `get_cash_report` ya agrupaba por `paid_at` — con esta adenda, capa API y RPC quedan **alineados al mismo criterio canónico** (la capa API añade la ventana de negocio determinista). Ya no hay criterio mixto ni migración pendiente por este motivo.

## A5. Pruebas ejecutadas (adenda) y resultado individual

| Prueba | Resultado |
|---|---|
| Unitarias `cash-report-period-attribution.test.ts` (v2) | **16/16 ✓** |
| E2E `cash-report-commissions-period.spec.ts` (v2): HOY presente / D−2 ausente / payment_date retroactiva en su día / rango 1 vez / total==detalle / regresión / futura 400 / anterior-al-último 400 | **8/8 ✓** |
| E2E de UI `commissions-payment-date-picker.spec.ts` (login real → tab Pagos → picker → rechazo → pago confirmado) | **1/1 ✓** |
| Regresión suites existentes (`commissions-payments` + `reports`) | **21 ✓ / 1 skip preexistente** |
| Regresión unitarias relacionadas (`cash-report-summary`, `cash-report-view`, `commissions-manage-modal`, `workers-return-navigation`, `workers-commissions-transfers`, `cash-arqueo`, `confcomisiones`) | **102/102 ✓** |
| TypeScript scoped (`tsconfig.mision-1510.json`) | 0 errores |
| ESLint (archivos de la adenda) | 0 errores |

## A6. Capturas reales (adenda) — `audit-evidence/20261016-reporte-entrega-1510/adenda-postfix/`

- `adenda-dia15-con-pago.png` / `adenda-dia15-detalle-extendido.png` — 15|15: «Comisiones pagadas en efectivo **−$300.00**», efectivo esperado **$31,700.00**, fila «Periodo 2026-10-15 → 2026-10-15» (atribuida por su **fecha de pago** 15/10 17:00).
- `adenda-dia16-sin-comision.png` — 16|16 exclusivo: **sin comisiones** (el pago ya no aparece: su fecha de pago es el 15).
- `ui-date-picker-default-hoy.png` — tab Pagos con el nuevo campo «Fecha del pago» (default HOY, máx. hoy).
- `ui-date-picker-rechazo-futura.png` — rechazo visible: «La fecha del pago (2026-10-17) no puede ser posterior al día actual (2026-10-16)».
- `ui-date-picker-pago-confirmado.png` — pago confirmado desde la UI con fecha elegida.

## A7. Totales verificados en la interfaz (adenda, tras dato + criterio)

| Consulta | Comisiones en efectivo | EFECTIVO ESPERADO A ENTREGAR |
|---|---|---|
| 15/10/2026 → 15/10/2026 | **−$300.00** (fecha de pago 15/10 17:00) | **$31,700.00** |
| 16/10/2026 → 16/10/2026 | **$0.00** | **$0.00** |
| 15–16/10/2026 | −$300.00 (1 vez, sin duplicación — E2E) | $31,700.00 |

Semántica canónica verificada además por E2E: una comisión del periodo 15/10 **pagada el 16** se reflejaría en el reporte del 16 (caso B1 del spec: `payment_date` retroactiva → aparece en el día elegido; caso A1: pago de hoy → aparece hoy y no en su día de periodo).

## A8. Estado

**CORREGIDA Y VERIFICADA (adenda incluida).** Dato rectificado por canal oficial con auditoría, feature de fecha del pago operativa en la UI con las dos reglas del negocio, criterio canónico del reporte alineado en los 3 consumidores, pruebas unitarias/E2E/UI en verde y capturas reales. Sin merge a main (pendiente de autorización del negocio, PR #1412).
