# AUDITORÍA INDEPENDIENTE — Nulidad compuesta y conciliación de refunds de devolución

**Fecha:** 21/10/2026 · **Repositorio:** `Nardian90/Costpro` · **Rama:** `fix/nulidad-compuesta-refunds-caja` · **Misión:** seguimiento de `docs/CERTIFICACION-CAJA-2026-10-21.md` (estado CERTIFICADO CON LIMITACIONES, defectos R4-preexistente y P1) · **Base de datos de producción: NO MODIFICADA** (consultas de solo lectura autorizadas; todas las escrituras de prueba en PostgreSQL 18 aislado y desechable).

---

## 1. Resumen ejecutivo de los defectos confirmados

La auditoría independiente **confirmó los defectos con evidencia empírica** (tablas de verdad en PostgreSQL real + datos de producción consultados en solo lectura) y cuantificó su activabilidad:

| # | Función | Expresión defectuosa | Estado al auditar | Corrección |
|---|---------|----------------------|-------------------|------------|
| D1 | `close_production_order_v2` | `IF v_existing_result->>'param_hash' != v_param_hash` | **ACTIVABLE HOY**: 3 de 5 filas reales de `audit_logs` (acción `PRODUCTION_ORDER_CLOSED`) tienen `idempotency_key` + `result` **sin** `param_hash` → un reintento con parámetros distintos devuelve el resultado legado **en silencio** (el guard `ERR_IDEMPOTENCY_KEY_REUSE` queda derrotado) | `IS DISTINCT FROM` (fail-closed) |
| D2 | `approve_transfer` | `IF v_transfer.status != 'PENDIENTE'` | **LATENTE** (`transfers.status` es NULLABLE — information_schema vivo; 0 filas hoy) → una transferencia con estado NULL se aprueba sin pasar el guard | `status IS DISTINCT FROM 'PENDIENTE'` |
| D3 | `approve_transfer` | `IF NOT v_transfer.requires_approval` | **LATENTE** (NULLABLE) → requisito de aprobación NULL ⇒ aprobación procede (fail-open) | `NOT COALESCE(v_transfer.requires_approval, false)` — patrón que `confirm_transfer` ya usa (v2.12.10) |
| D4 | `reset_store_data` (3-arg) | `IF NOT (v_validation->>'can_modify')::boolean` | **NO ACTIVABLE HOY** (la validadora es STABLE y siempre devuelve una fila con la clave) — brecha defensiva fail-open: sin fila o sin clave, el reset destructivo procede **sin validación** | Fail-closed en 2 niveles + comentario de la regla deliberada fase0 **restaurado** |
| D5 | `adjust_sale_payment` | `p_payment_method <> v_tx.payment_method::text` | **LATENTE** (`transactions.payment_method` NULLABLE; 0 filas NULL hoy) → el ajuste solicitado se descarta en silencio (bloque UPDATE omitido, audit «success», `changes=[]`) | `IS DISTINCT FROM` |
| P1 | 6 fórmulas de caja v2.21.0 | ausencia de término para `ref_type='devolution', direction='refund'` | **ACTIVO**: 2 filas reales por **239.405 CUP** salieron del cajón (ENERVIDA-VITALLCONS, NC-000014 de 40.280 y NC-000015 de 199.125, ambas reembolsadas en EFECTIVO) e **ninguna** fórmula las resta | término `cash_refunds` en `close_cash_shift` (autoritativa), `get_cash_shift_expected`, `get_cash_flow_summary`, `get_cash_report`, validaciones internas de `create_cash_flow_document` y `reverse_cash_flow_document` — fórmula v2.22.0 |

Además, la auditoría **desmintió** un falso defecto y **documentó** una regla de negocio perdida: el filtro de tipos de bloqueador de `reset_store_data` (solo `transfers_in` y `open_cash_sessions` bloquean) NO es un bug — es la **regla deliberada documentada en fase0** (20260802000001): «para reset solo bloqueamos por transfers ENTRANTEs (las salientes se borran) y cajas abiertas». El comentario se perdió en re-materializaciones posteriores y hacía indistinguible una decisión de negocio de un defecto. **El filtro NO se cambió; el comentario se restauró.**

Sobre el PR #1438 (ver §10): el informe de certificación lo listaba como «pendiente de revisión y fusión», pero el repositorio muestra que el propietario **ya lo fusionó** (merge `2d77b73f4` en `main`). Esta misión no fusionó ni tocó nada pendiente.

---

## 2. Análisis individual de las cuatro funciones

### 2.1 `close_production_order_v2` (linaje: REM-PO1 20260911000100 — verbatim en vivo)

**Expresión SQL actual (bloque 0, idempotencia):**
```sql
SELECT metadata->>'result' INTO v_existing_result
FROM audit_logs
WHERE action = 'PRODUCTION_ORDER_CLOSED' AND record_id = p_order_id
  AND metadata->>'idempotency_key' = p_idempotency_key LIMIT 1;
IF v_existing_result IS NOT NULL THEN
  IF v_existing_result->>'param_hash' != v_param_hash THEN
    RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE';
  END IF;
  RETURN v_existing_result;
END IF;
```

**Valores que activan el defecto:** una fila de `audit_logs` que case por (`action`, `record_id`, `metadata->>'idempotency_key'`) cuyo `metadata->result` exista pero `metadata->result.param_hash` sea NULL — filas legadas escritas por las versiones v2.26-g8/hotfix1 (20260810000008/10, anteriores al hotfix2 «param_hash exhaustive»). **Censo vivo (solo lectura): 5 filas totales de la acción, 5 con `idempotency_key`, 3 con `result` SIN `param_hash`, 0 con hash completo.**

**Resultado lógico esperado:** con parámetros no verificables, el guard debe fallar-closed → `ERR_IDEMPOTENCY_KEY_REUSE`.
**Resultado real de PostgreSQL:** `NULL != '<hash-md5>'` → `NULL` → el `IF` no se ejecuta → se devuelve `v_existing_result` (replay silencioso).

**Efecto potencial:** el mecanismo anti-reuso de idempotency keys queda derrotado sobre filas legadas — un reintento con parámetros distintos (p. ej. otro importe final u otra cantidad de salida) obtiene la respuesta antigua sin error ni detección. No mueve dinero por sí mismo (el `RETURN` evita la doble ejecución), pero degrada la garantía de idempotencia y la trazabilidad. La ruta `/api/production-orders/[id]` genera una key nueva por intento (`close-${orderId}-${uuid}`), por lo que el vector práctico son llamadores directos del RPC (scripts/importaciones).

**Corrección mínima:** `IS DISTINCT FROM` — para operandos no nulos es idéntico a `!=` (verdad demostrada §3); con hash ausente ⇒ distinto ⇒ rebota. Es la misma doctrina que ya aplica `create_cash_flow_document` (`IF v_param_hash IS NULL OR v_idem IS NULL THEN RAISE 'ERR_IDEMPOTENCY_KEY_REUSE'`).

### 2.2 `approve_transfer` (linaje: v2_12_12/rem_inv_6 — verbatim en vivo)

**Expresiones SQL actuales:**
```sql
IF v_transfer.status != 'PENDIENTE' THEN
  RAISE EXCEPTION 'ERR_NOT_PENDING: solo se pueden aprobar transferencias PENDIENTE';
END IF;

IF NOT v_transfer.requires_approval THEN
  RAISE EXCEPTION 'ERR_NO_APPROVAL_REQUIRED';
END IF;
```

**Valores que activan el defecto:** `transfers.status` y `transfers.requires_approval` son **NULLABLES** (information_schema de la BD viva; el DDL original 20260726000021 declara `requires_approval BOOLEAN DEFAULT FALSE` sin NOT NULL y `status transfer_status DEFAULT 'PENDIENTE'` sin NOT NULL). Censo vivo: 0 filas (el módulo de transferencias no tiene datos aún) — defecto **latente** pero real: cualquier INSERT explícito con NULL abre la puerta.

**Resultado lógico esperado:** estado o requisito desconocidos ⇒ NO aprobar (fail-closed).
**Resultado real de PostgreSQL:** `NULL != 'PENDIENTE'` → NULL → guard saltado; `NOT NULL` → NULL → guard saltado. En ambos casos la transferencia se aprueba y se marca `approved_by`.

**Efecto potencial:** integridad del flujo de aprobación de transferencias (permisos): una transferencia de estado desconocido o sin requisito de aprobación verificable entra al flujo de aprobación. Consistencia: `confirm_transfer` (v2.12.10, 20260727000007) **ya trata** `requires_approval` con `COALESCE(v_transfer.requires_approval, false)` — la semántica NULL⇒false existe en el mismo flujo; `approve_transfer` divergía.

**Corrección mínima:** `status IS DISTINCT FROM 'PENDIENTE'` y `NOT COALESCE(requires_approval, false)` (patrón confirm_transfer). Ambas preservan el comportamiento para todos los valores no nulos (verdad §3).

### 2.3 `reset_store_data` (overload 3-arg — el activo; linaje: rem_inv_6 — verbatim en vivo)

**Expresión SQL actual:**
```sql
SELECT * INTO v_validation FROM public.validate_store_can_be_modified(target_store_id, 'reset');
IF NOT (v_validation->>'can_modify')::boolean THEN
  SELECT string_agg(blocker->>'message', '; ') INTO v_blockers
  FROM jsonb_array_elements(v_validation->'blockers') AS blocker
  WHERE blocker->>'type' IN ('transfers_in', 'open_cash_sessions');
  IF v_blockers IS NOT NULL AND v_blockers != '' THEN
    RAISE EXCEPTION 'ERR_STORE_HAS_DEPENDENCIES: %', v_blockers;
  END IF;
END IF;
```

**Valores que activan el defecto:** (a) `v_validation` NULL — la función validadora no devolvió fila (hoy imposible: `RETURNS JSONB` PL/pgSQL con RETURN incondicional ⇒ siempre exactamente 1 fila); (b) la clave `can_modify` ausente del JSON retornado — `(NULL)::boolean` → NULL → `NOT NULL` → NULL → IF saltado; (c) bloqueador del tipo permitido con `message` NULL — `string_agg` devuelve NULL → `v_blockers IS NOT NULL AND ...` → falso → no rebota.

**Resultado lógico esperado:** una operación DESTRUCTIVA (borra ~50 tablas de la tienda) no puede ejecutarse sin validación verificada (fail-closed).
**Resultado real:** con (a) o (b), el reset procede sin ninguna validación de dependencias; con (c), un bloqueador real del tipo permitido no bloquea.

**Efecto potencial:** destrucción de datos de una tienda con transferencias entrantes pendientes o cajas abiertas. **No alcanzable hoy** por el contrato actual de la validadora — la corrección es endurecimiento defensivo de una guarda de seguridad que no debe depender de un invariante de callee.

**NO-defecto documentado (importante):** el filtro de tipos (`transfers_in`, `open_cash_sessions`) es la **regla deliberada de fase0** — las transfers salientes, OTs abiertas y recibos pendientes son internas de la tienda que se resetea y se borran con ella; las entrantes rompen a la tienda ORIGEN ajena. **La corrección conserva el filtro exacto** y restaura el comentario que lo documenta.

**Corrección mínima (2 niveles fail-closed):** (1) `v_validation IS NULL OR (v_validation->>'can_modify') IS NULL` → `ERR_STORE_VALIDATION_UNAVAILABLE`; (2) dentro de `can_modify=false`, bloquear por **EXISTENCIA** de bloqueadores de los tipos permitidos (`EXISTS`) en lugar de por el mensaje agregado — un bloqueador con message NULL también bloquea. El overload 2-arg (legacy, sin llamadores, service_role-only) quedó intacto: su única condición nullable-dependiente (`NOT has_management_access_as(...)`) es NULL-safe porque esa función es LANGUAGE SQL con CASE/ELSE+EXISTS ⇒ nunca devuelve NULL.

### 2.4 `adjust_sale_payment` (linaje: v2.12.17 — verbatim en vivo)

**Expresión SQL actual (paso 1):**
```sql
IF p_payment_method IS NOT NULL AND p_payment_method <> v_tx.payment_method::text THEN
  v_payment_changed := TRUE;
  v_changes := array_append(v_changes, 'payment_method');
END IF;
```

**Valores que activan el defecto:** `transactions.payment_method` es **NULLABLE** (USER-DEFINED enum con default `'cash'`, sin NOT NULL — information_schema vivo; 0 filas NULL hoy). La venta a ajustar tiene `payment_method = NULL` y el caller pide `p_payment_method = 'cash'` como único cambio.

**Resultado lógico esperado:** el cambio solicitado se detecta, se aplica el UPDATE y queda en `changes`.
**Resultado real de PostgreSQL:** `'cash' <> NULL` → NULL → `AND` compuesto → NULL → IF no se ejecuta → `v_payment_changed` queda false → el **bloque UPDATE completo (paso 5) se omite** → la venta sigue con `payment_method=NULL`, el audit registra `SALE_PAYMENT_ADJUST` con `changes=[]` y la respuesta es `status: success`. El ajuste se descarta en silencio.

**Efecto potencial:** correcciones de medio de pago imposibles de aplicar sobre ventas legadas con `payment_method` NULL (fiabilidad de los desgloses de venta/arqueo que dependen del campo). Latente hoy (0 filas NULL), pero el patrón es el mismo de la familia.

**Corrección mínima:** `p_payment_method IS DISTINCT FROM v_tx.payment_method::text`. **Disciplina de cambio mínimo demostrada:** las comparaciones hermanas NO se tocaron porque son seguras por esquema — `sale_currency` y `sale_exchange_rate` son **NOT NULL** (verificado en vivo) y `cash/transfer/zelle_amount` usan `COALESCE`. Cambiarlas habría sido sustitución cosmética sin defecto que la justifique.

---

## 3. Tablas de verdad (PostgreSQL 18 real — ejecutadas, no deducidas)

### 3.1 Semántica compuesta de `IS NULL` / `IS NOT NULL`

| Expresión | Resultado | Lectura |
|---|---|---|
| `ROW(1,2) IS NULL` | `false` | fila completa ⇒ no es NULL |
| `ROW(1,2) IS NOT NULL` | `true` | todos los campos no-nulos ⇒ sí es NOT NULL |
| `ROW(1,NULL) IS NULL` | `false` | |
| **`ROW(1,NULL) IS NOT NULL`** | **`false`** | **UN solo campo NULL derrota `IS NOT NULL`** — una fila encontrada se trata como ausente |
| `ROW(NULL,NULL) IS NULL` | `true` | fila todo-NULL indistinguible de «sin fila» |
| `ROW(NULL,NULL) IS NOT NULL` | `false` | |

**RECORD tras `SELECT INTO` (PL/pgSQL, medido):**

| Caso | `FOUND` | `rec IS NULL` | `rec IS NOT NULL` |
|---|---|---|---|
| A · fila con un campo NULL | `t` | `f` | **`f`** ← la trampa R4 original |
| B · sin fila | `f` | `t` | `f` (acceso a campo → NULL, sin error) |
| C · fila con campos NULL y PK no-nulo | `t` | `f` | `f` |

Esto es el mecanismo exacto del R4 corregido en `get_cash_shift_expected` (cash_closures.session_reference NULL ⇒ `<record> IS NOT NULL` siempre falso ⇒ el espejo ignoraba el turno abierto): **`rec IS NOT NULL` exige TODOS los campos no-nulos**. En las cuatro funciones auditadas el patrón se presentó en su variante de **comparación escalar nullable** (`!=`, `NOT`, `AND`), no en la variante RECORD — por eso las correcciones son `IS DISTINCT FROM` / `COALESCE` / `IS NOT TRUE`-equivalentes y no reemplazos de FOUND (que ya usan correctamente donde corresponde).

### 3.2 Lógica trivaluada de guardas compuestas

| Expresión | a | b | Resultado | Efecto en `IF` |
|---|---|---|---|---|
| `a != b` | `'x'` | `NULL` | `NULL` | guard **saltado** |
| `a IS NOT NULL AND a != b` | `'x'` | `NULL` | `NULL` (true AND null) | guard **saltado** ← D1/D5 |
| `NOT b` (b boolean) | — | `NULL` | `NULL` | guard **saltado** ← D3/D4 |
| `b IS NOT TRUE` | — | `NULL` | **`true`** | guard **ejecuta** (fail-closed) |
| `a IS DISTINCT FROM b` | `'x'` | `NULL` | **`true`** | guard **ejecuta** (fail-closed) |
| `a IS DISTINCT FROM b` | `'x'` | `'x'` | `false` | ≡ `<>` para no-nulos |
| `a IS DISTINCT FROM b` | `'x'` | `'y'` | `true` | ≡ `<>` para no-nulos |
| `FALSE AND NULL` | | | `false` | (AND con falso propaga falso — los guards con AND solo fallan cuando TODAS las ramas son no-falsas) |

La equivalencia `IS DISTINCT FROM ≡ <>` para operandos no nulos (dos últimas filas) es la demostración de que las sustituciones **conservan** el comportamiento previsto para todos los casos válidos actuales; solo cambian los casos NULL, exactamente de «guard derrotado» a «guard fail-closed».

---

## 4. Diagnóstico de refunds y medios de pago

### 4.1 Qué es un «refund» en COSTPRO (desambiguación)

| Concepto | Representación en datos | ¿Afecta efectivo de caja? |
|---|---|---|
| **Devolución física de mercancía** | `devolutions` + `devolution_items` + `stock_movements('return')` | No por sí misma |
| **Reembolso monetario al cliente** | `payment_transactions(ref_type='devolution', direction='refund', payment_method=, ref_id=devolutions.id, transaction_id=venta original)` — insertado por `create_devolution_v2` (DF-03) | **Solo si `payment_method='cash'`** |
| **Anulación de una operación** | `void_transaction` (venta → status voided + stock) | No genera fila refund |
| **Reverso de un pago** | No existe como género: los revesos del sistema son contra-filas (cash_flow) o anulaciones de documento | — |
| **Reverso de una comisión** | `commission_payments` status pendiente/paid | No (se gestiona por `paid_at`) |
| **Ajuste/compensación contable** | `ref_type='adjustment'` (in/out) | Sí si cash (precedente del Reporte) |
| **Crédito de tienda** | `store_credit_ledger` (create_devolution_v2 con `p_payment_method='store_credit'`) — **no genera fila en payment_transactions** | **No** (el dinero no sale) |

**Regla financiera nueva (documentada y migrada como fórmula v2.22.0):**

```
cash_refunds = SUM(amount_cup) WHERE ref_type='devolution'
               AND direction='refund' AND payment_method='cash'
               AND payment_date ∈ (ventana del turno, ahora]
efectivo_esperado = fondo + entradas − salidas − cash_refunds
```

- **SOLO el medio por el que salió REALMENTE el dinero reduce el efectivo físico.** Un reembolso por transferencia/zelle NO toca el cajón (queda como detalle informativo en el reporte); el crédito de tienda ni siquiera genera fila.
- **Sin doble conteo:** la devolución NO modifica la venta original (`create_devolution_v2` inserta solo la fila contra DF-03; `transactions.cash_amount` intacto) y los cobros `ref_type='sale'` siguen excluidos de los términos de pagos. Un refund se cuenta UNA vez (idempotencia estructural `dev-<id>-refund`).
- **Trazabilidad conservada:** la fila refund mantiene `ref_id` (devolución) + `transaction_id` (venta original).
- **Cierres históricos congelados:** ventana por `payment_date` efectiva — un refund de un turno CERRADO quedó absorbido en ese cierre y jamás se recalcula hacia atrás (verificado: B6l).

### 4.2 Evidencia viva (solo lectura)

- **2 filas** `devolution/refund/cash` por **239.405 CUP**: NC-000015-2026 (199.125, 2026-09-18, reembolso en EFECTIVO de una venta mixed cash 197.650 + zelle 200.600) y NC-000014-2026 (40.280, 2026-09-10, reembolso en EFECTIVO de una venta 100% zelle). Ambas en ENERVIDA-VITALLCONS — tienda **sin ningún cierre de caja** ⇒ con la ventana fallback epoch, el esperado que la UI calcularía para esa tienda está **sobreestimado en 239.405 CUP**.
- 14 devoluciones completadas (592.905 CUP) + 1 reversada — solo 2 tienen fila refund (el contra-asiento DF-03 llegó con versiones posteriores; las 12 restantes son devoluciones legadas sin registro financiero).
- Universo del ledger: `sale/in` (809 cash + 62 transfer + 241 zelle), `work/in` (34), `devolution/refund` (2). Ninguna otra dirección `refund` existe.

### 4.3 Cobertura de los escenarios exigidos

| # | Escenario | Resultado (batería aislada) |
|---|---|---|
| 1 | Reembolso en efectivo | resta UNA vez: 100+1000−300=800 ✓ |
| 2 | Reembolso por transferencia | NO reduce el efectivo (esperado sigue 800) ✓ |
| 3 | Reembolso en moneda distinta | el modelo registra refunds en CUP canónico (`amount_cup` GENERATED); hojas USD del reporte cuentan solo refunds USD ✓ (unit) |
| 4 | Devolución parcial | 200 resta 200 ✓ |
| 5 | Devolución total (+ parcial previa) | 300+200+100=600 acumulan ✓ |
| 6 | Refund anulado/revertido | `reverse_devolution` NO toca el ledger financiero: el refund queda (el dinero salió físicamente en su ventana). **R-DEV2 residual documentado**: el reingreso del dinero del cliente se registra como documento de Ingreso de caja (cash_flow 'in') — procedimiento operativo, sin auto-contra para no duplicar efectos |
| 7 | Refund sin sesión de caja vigente | `payment_date` fuera de toda ventana ⇒ invisible para turnos futuros (la apertura siguiente parte de su propio `created_at`) ✓ |
| 8 | Refund asociado a turno cerrado | congelado en ese cierre (B6l: valores almacenados intactos tras operaciones posteriores) ✓ |
| 9 | Reintento idempotente | idempotencia estructural `dev-<id>-refund` (única); ajustes sin cambios efectivos no duplican detección (B5d) ✓ |
| 10 | Venta con varios medios de pago | el MEDIO DEL REEMBOLSO decide (no el de la venta): NC-000015 real lo demuestra (venta mixed → refund cash → resta cash) ✓ |

**Clasificación del defecto:** estaba en la **consulta** (las fórmulas), no en el modelo de datos ni en la clasificación de operaciones: el ledger ya registra todo lo necesario (`ref_type`+`direction`+`payment_method`+`payment_date`), y `create_devolution_v2` ya clasifica correctamente por medio. Las fórmulas v2.18.0/v2.21.0 simplemente no consumían el término.

---

## 5. Cambios realizados y justificación

**Migración `supabase/migrations/20261021120000_nulidad_compuesta_refunds_devolucion.sql`** (2.223 líneas, DDL-only sobre funciones, sin cambios de esquema, sin recálculo de saldos, ACLs re-declaradas idénticas a las certificadas vivas):

| Parte | Cambio | Justificación |
|---|---|---|
| 1 | `close_production_order_v2`: guard idempotencia `IS DISTINCT FROM` | D1 — fail-closed sobre 3/5 filas reales |
| 2 | `approve_transfer`: `status IS DISTINCT FROM 'PENDIENTE'` + `NOT COALESCE(requires_approval,false)` | D2/D3 — fail-closed, patrón existente de `confirm_transfer` |
| 3 | `reset_store_data`(3-arg): fail-closed 2 niveles + EXISTS + comentario fase0 restaurado | D4 — endurecimiento defensivo SIN cambiar la regla de negocio |
| 4 | `adjust_sale_payment`: `payment_method IS DISTINCT FROM` | D5 — solo la comparación nullable; las seguras por esquema intactas |
| 5a | `close_cash_shift` v2.22.0: término `cash_refunds` + audit | P1 — autoritativa |
| 5b | `get_cash_shift_expected` v2.22.0: término + campo `cash_refunds` en respuesta | P1 — espejo UI |
| 5c | `get_cash_flow_summary` v2.22.0: término + campo | P1 — KPIs del módulo |
| 5d | `get_cash_report` v2.22.0: grupo `refunds` (por método) + `refunds_cash_total_cup` + término en balance | P1 — Reporte de Entrega |
| 5e | `create_cash_flow_document`: validación de egreso con v2.22.0 | P1 — `ERR_INSUFFICIENT_CASH` con el disponible real |
| 5f | `reverse_cash_flow_document`: validación de anulación con v2.22.0 | P1 — coherencia de la misma fórmula |

**Espejos TypeScript** (misma fórmula, una sola fuente de verdad):
- `src/lib/cash-arqueo.ts` — `cash_refunds` en `CashShiftBreakdown` + fórmula v2.22.0
- `src/hooks/api/useCashClosures.ts` + `src/types/index.ts` — tipos con `cash_refunds`, grupo `refunds`, `refunds_cash_total_cup`
- `src/lib/cash-report/summary.ts` — `RefundRow`/`refund_rows` (filas del ledger, nombre distinto de los grupos RPC — convención cash_flows/cash_flow_groups) + `reembolsosCash` en `DailySummary` + fórmula; convención por moneda nativa alineada a cash_flows
- `src/app/api/cash-report/route.ts` — enriquecimiento `refund_rows` (todos los métodos; degradación limpia)
- `CashClosureView.tsx` (línea «Reembolsos de Devoluciones (Efectivo)» en el desglose reconstruible), `cash-report-pdf.ts` (fila del reporte), `CashReportView.tsx`
- `ci-gate-allowlist.json` — 7 entradas `source_of_truth_baseline` (drift cadena-vs-vivo esperado mientras el propietario no aplique la migración; patrón #1422, expiry 2026-11-30)

**NO hecho (explícito):** no se cambió el significado de `ref_type`; no se añadieron excepciones por tienda/documento; no se duplicaron efectos devolución/refund/reverso; no se tocaron cierres históricos; no se introdujeron privilegios ni se eludió RLS; no se modificó la migración aplicada 20261021000001; el overload 2-arg de reset quedó intacto; `confirm_transfer`/`apply_physical_count` y otras expresiones auditadas sin defecto práctico quedaron documentadas y sin cambios.

---

## 6. Pruebas ejecutadas y resultados reales

| Tipo | Ejecutadas | Resultado real |
|---|---|---|
| **Batería empírica PostgreSQL 18 aislado** (embedded-postgres desechable, fixture con nulabilidad IDÉNTICA a la viva; versiones VIVAS vs migración corregida) | 41 escenarios: tablas de verdad + D1–D5 en vivo + controles + correcciones + regresión no-nula + 10 escenarios de refunds | **41/41** — 13 defectos LIVE demostrados + 27 verificaciones FIXED (`pgtest/audit-results.json`) |
| **Suite de integración gated** (`src/__tests__/integration/null-trap-sql-scenarios.test.ts`) ejecutada contra PG aislado real | 14 pruebas | **14/14** (`NULL_TRAP_INTEGRATION_DB=1` + URL de BD desechable; en CI queda auto-skip como `cash-flow-sql-scenarios` — patrón preexistente) |
| Unitarias (vitest, suite completa) | 220 archivos | **3541 pasadas / 0 fallos / 45 saltadas** (gated por entorno — 14 de cash-flow + 14 de null-trap + resto preexistente) |
| Tests estáticos del contrato de la migración | `null-trap-refunds-migration.test.ts` | **12/12** (guardas, término en 6 fórmulas, ACLs, no-doble-conteo, cierres congelados) |
| Unitarias de fórmulas | cash-arqueo (+8 refunds) + cash-report-summary (+6 refunds) | **53/53** |
| Typecheck | `tsc --noEmit` | **0 errores** |
| Lint | eslint (archivos tocados) | **0 errores** (38 warnings de la familia preexistente `<button>`) |
| Contrato de seguridad | `security-contract-test-static.cjs` | **CONTRATO OK — Capa A 137/137 · Capa B 200, 0 nuevas · Capa C 137/137 representadas, 0 divergencias** (con las 7 baselines documentadas) |
| Gates CI | `ci-gate-ts-checks.js` / `ci-gate-sql-checks.js` | **PASSED / exit 0** |

**Distinción explícita:** lo ÚNICO no ejecutado aquí es la suite contra una BD de pruebas *Supabase* real con datos de usuario (no existe tal entorno de pruebas) y la navegación autenticada en navegador (sin credenciales — limitación heredada del informe de certificación). Todo lo listado arriba son resultados reales de ejecución, no omitidos.

---

## 7. Riesgos residuales

1. **R-DEV2 (diseño):** `reverse_devolution` revierte stock/estado pero NO el efecto financiero del refund (la fila `devolution/refund` permanece). Correcto por fecha efectiva (el dinero salió en su ventana), pero el **reingreso** del dinero del cliente no queda registrado automáticamente: procedimiento operativo documentado — registrar un **Ingreso de caja** (documento cash_flow 'in') al reversar una devolución reembolsada en efectivo. Alternativa (auto-contra) rechazada para no duplicar efectos.
2. **Refunds de vouchers:** un reembolso por transferencia/zelle no reduce `expected_vouchers` (la expectativa de banco/zelle cuenta solo las ventas). Los 2 refunds vivos son cash, así que el caso no se materializa hoy; extender el término a vouchers es una decisión de política de arqueo (¿el cajero declara vales brutos o netos?) que corresponde al propietario. Documentado, no implementado.
3. **12 devoluciones legadas sin fila refund** (pre-DF-03): su efecto financiero no existe en el ledger; si el negocio decide reconocerlas, requiere una decisión de datos (no de código).
4. **Latentes no corregidos fuera de alcance (familia del mismo patrón, documentados):** `confirm_transfer` usa `v_transfer.status <> 'PENDIENTE'` (status nullable — mismo fail-open latente que D2); `apply_physical_count` usa `IF v_count IS NULL` (seguro en la práctica: la tabla tiene PK NOT NULL); `close_production_order_v2`:`IF p_final_amount > 0` con NULL explícito omite el pago final en silencio (la ruta API envía `final_amount || 0` — seguro por caller). Ninguno tiene datos NULL hoy; se dejan para una decisión del propietario de endurecimiento general.
5. **Drift cadena-vs-vivo intencional:** hasta que el propietario aplique `20261021120000`, el árbol va por delante de la BD (7 baselines con expiry 2026-11-30). El riesgo de olvidarlo es acotado por la expiración del gate.
6. **Impacto de la fórmula v2.22.0 al aplicarse:** los arqueos en curso reflejarán los refunds de devolución de su ventana — para las ventanas abiertas de TIENDA CENTRAL y Sucursal Habana el censo vivo muestra **0 refunds en ventana** (los 239.405 CUP son de ENERVIDA, sin cierres), así que la transición no cambia ningún arqueo abierto hoy; ENERVIDA, al abrir caja por primera vez, verá el esperado correcto desde su apertura.

---

## 8. Confirmación de no modificación de producción

- La BD viva se consultó **exclusivamente en modo de solo lectura** (Management API `database/query`; SELECT sobre `information_schema`, censos de `payment_transactions`/`devolutions`/`audit_logs`/`cash_closures`/`transfers` y `pg_proc`/`pg_trigger`/`pg_attribute`). Cero `INSERT`/`UPDATE`/`DELETE`/`DDL` ejecutados contra producción en toda la misión.
- Todas las escrituras de prueba se ejecutaron en **PostgreSQL 18 local, aislado y desechable** (embedded-postgres en `127.0.0.1:5434/5435`, datos bajo `/home/z/my-project/pgtest/`, destruidos al terminar cada corrida).
- No se fusionó ningún PR, no se desplegó nada, no se aplicó ninguna migración. El PR #1438 ya estaba fusionado por el propietario antes de esta misión (hallazgo documentado, no acción propia).

---

## 9. Instrucciones de despliegue (cuando el propietario lo autorice)

1. **Revisar** este PR (análisis, tablas de verdad, regla P1, pruebas).
2. **Dry-run no destructivo** (recomendado, mismo mecanismo oficial Management API):
   ```sql
   BEGIN;
   -- aplicar supabase/migrations/20261021120000_nulidad_compuesta_refunds_devolucion.sql
   ROLLBACK;
   ```
3. **Aplicar** `20261021120000_nulidad_compuesta_refunds_devolucion.sql` vía Management API (transacción explícita BEGIN…COMMIT — mecanismo establecido del proyecto). Solo redefine funciones + ACLs idénticas + comentarios + NOTIFY: sin cambios de esquema, sin datos.
4. **Re-exportar el contract-surface** (`scripts/export-contract-surface.cjs`) y **retirar las 7 entradas** `source_of_truth_baseline` de `ci-gate-allowlist.json` (patrón #1422/#1438): el contrato queda auto-limpio con la fórmula v2.22.0 viva.
5. **Verificación post-aplicación** (solo lectura): `get_cash_shift_expected('ENERVIDA…')` debe exponer `cash_refunds` y, para ENERVIDA, un esperado que descuenta los refunds de su ventana; censo de cierres históricos intactos.
6. **Plan de recuperación:** reaplicar las definiciones previas (20260911000100, 20260727000008, 20260916000001, 20260727000011 y 20261021000001 para las seis de caja) — DDL reversible sin tocar datos; el DOWN está documentado en la propia migración.

---

## 10. Relación con el PR #1438

- El PR **#1438** (`fix/caja-migracion-compat-live`) fue **fusionado por el propietario** (merge `2d77b73f4` en `main`) antes de esta misión — el informe de certificación lo describía como pendiente, pero el estado del repositorio lo muestra fusionado. Esta misión **no lo fusionó ni lo modificó**.
- Este PR (`fix/nulidad-compuesta-refunds-caja`) es **independiente y posterior**: parte de `main` (que ya incluye #1438), ataca los defectos que #1438 dejó documentados como fuera de alcance (R4-preexistente en 4 funciones + P1 refunds invisibles) y **no asume ninguna aplicación a la BD viva** — la migración queda pendiente de la autorización del propietario, con baselines temporales y expiración como red de seguridad del contrato.
- Orden operativo sugerido: fusionar este PR (alinea el árbol) → dry-run → aplicar migración → re-exportar surface y retirar baselines (un solo commit de recertificación, igual que `4e22bc115` hizo para #1438).
