# INFORME TÉCNICO-CONTABLE — Certificación de Caja e Ingresos/Egresos

**Fecha:** 21/10/2026 · **Repositorio:** `Nardian90/Costpro` · **Proyecto Supabase:** `wthkddeleylijmonclxg` (PostgreSQL 17.6, confirmado inequívocamente vía Management API como `postgres@postgres`) · **Rama de seguimiento:** `fix/caja-migracion-compat-live` (PR **#1438**) · **Migración:** `20261021000001_cash_flow_documents.sql` (aplicada en 2 pases idempotentes: 2733 ms + 3253 ms, transacción explícita BEGIN…COMMIT vía Management API — mecanismo oficial establecido del proyecto) · **Rama de respaldo del agente:** `agent/respaldo-certificacion-caja` (PR **#1436**).

---

## 1. Migración

**Estado anterior.** El PR #1435 estaba fusionado en `main` (merge `c08a4038c`, commit de contenido `766353852`), pero la migración **NO estaba aplicada** a la BD viva: la tabla `cash_flow_documents`, los RPC `create_cash_flow_document` / `reverse_cash_flow_document` / `get_cash_flow_summary` y los índices no existían; las 4 funciones modificadas estaban en su versión previa. El diff integral cadena-vs-vivo (misma maquinaria del contract-test, 480 funciones vivas / 310 de cadena) acotó el conjunto NO-aplicado a exactamente **2 migraciones**: `20261012000001` (ajustes, solo constraint+índice) y `20261021000001` (objetivo).

**Destino confirmado.** URL del proyecto, token de acceso del propietario, identidad `postgres@postgres` y versión PG 17.6 verificadas antes de toda escritura.

**Resultado de la aplicación.** La migración tal como se fusionó era **NO-APLICABLE** a la BD viva (hallazgo R1: su `ADD CONSTRAINT` habría rebotado atómicamente contra 2 filas reales `ref_type='devolution'` del release W7). Se preparó la rama `fix/caja-migracion-compat-live` con **5 correcciones documentadas (R1–R5)**, se validó con dry-run `BEGIN…ROLLBACK` y se aplicó la versión corregida (autorización §1 de la misión: «preparar, validar y aplicar»). El PR #1438 alinea el árbol con la BD real — fusionarlo no ejecuta nada contra la base.

**Objetos verificados tras la aplicación:** tabla `cash_flow_documents` (RLS activo, policy `select_own_store` para authenticated, grants: authenticated=SELECT, service_role=completo) · CHECK `ref_type` = unión reconciliada de 9 valores (incluye `devolution` + `cash_flow`) · CHECK `direction` = `('in','out','refund')` · índices `idx_payment_txn_cash_flow` y `idx_payment_txn_adjustments` · 6 funciones redefinidas con el término `cash_flow` (5 con marca v2.21.0) · ACLs: mutaciones `{postgres,service_role}`, lectura `{postgres,authenticated,service_role}` · numeración `IE-000001-2026` lista (secuencia bajo demanda, atómica por `FOR UPDATE`).

## 2. Modelo de fondo

**Definición formal de «Fondo Inicial de Efectivo»** (campo de `OPERACIÓN → Caja → Caja` al abrir turno): es el efectivo **físicamente presente en el cajón al comenzar el turno**, reconocido contablemente **una sola vez** mediante `cash_closures.opening_balance`. No genera movimiento en `payment_transactions`; es la semilla de la fórmula del arqueo.

**Relación con los documentos de constitución.** El sistema implementa un **modelo mixto con distinción explícita y fiable por campo** (no por inferencia de importe ni fecha):

- **Escenario A (fondo entregado antes de abrir):** la apertura reconoce el dinero una vez vía `opening_balance`. Registrar además una constitución por el mismo importe sería doble declaración — la UI del módulo **advierte** cuando la apertura ya declaró fondo y se registra una constitución.
- **Escenario B (fondo entregado después de abrir):** la apertura no lo incluye; la constitución es un ingreso confirmado que aumenta el efectivo **una sola vez** (una fila `payment_transactions ref_type='cash_flow' direction='in'`).

**Fondo vigente** = `opening_balance` + constituciones + reposiciones − devoluciones (documentos confirmados en la ventana del turno) — verificable en `get_cash_flow_summary.fondo_vigente`. **El mismo billete jamás se cuenta dos veces** (evidencia numérica en §3). Regla operativa: «o se declara en la apertura, o se registra como documento».

## 3. Conciliación (ejemplos numéricos reales)

**Línea base PRE-migración** (con el bug R4 del espejo vivo) vs **POST**:

| Tienda | Esperado PRE (bug) | Esperado POST (correcto) | Diferencia explicada |
|---|---|---|---|
| TIENDA CENTRAL (turno e525004e, apertura 2026-08-16, fondo 100) | 9.950 (ventana 2026-08-07 = último cierre, fondo 0) | **10.050** | Ventana = apertura real + fondo 100 reconocido |
| SUCURSAL HABANA (turno 14b65734, apertura 2026-10-06, fondo 0) | 22.300 (ventana epoch 1970 = ventas históricas) | **2.005** | Ventana = apertura real (cash 2.005 + transfer 2.020) |

**Matriz contable en PostgreSQL real (BEGIN…ROLLBACK, no destructiva, cero residuo verificado)** — SUCURSAL HABANA, base 2.005:

| Operación | Efecto contable medido |
|---|---|
| Constitución 5.000 CUP | IE-000001-2026 · fondo 0→5.000 · esperado 2.005→**7.005** (+5.000 UNA vez) · 1 fila `in` |
| Reposición 2.000 CUP | IE-000002-2026 (secuencial sin huecos) · fondo 7.000 · esperado 9.005 · 1 fila `in` |
| Anulación de la reposición | status `anulado` + fila contra `out` 2.000 con `payment_date=NOW()` · esperado vuelve a 7.005 · **neto cero** · segunda anulación → `ERR_ALREADY_ANNULLED` |
| Devolución parcial 2.000 (de un fondo de 5.000) | IE-000003-2026 · **fondo_after=3.000** (ejemplo canónico del enunciado) · esperado 5.005 · 1 fila `out` |
| Devolución total 3.000 (remanente) | IE-000004-2026 · fondo **0** (agotado) · esperado vuelve a 2.005 |
| Superdevolución 1.000 | `ERR_FUND_INSUFFICIENT: fondo vigente=0.00` |
| Egreso > efectivo | `ERR_INSUFFICIENT_CASH: disponible=2.005` |
| Reintento de confirmación (misma idempotency_key) | Devuelve IE-000001-2026 original — sin duplicar documento ni movimiento |
| USD 100 @410 (tasa server-side de tienda) | amount_cup **41.000** · esperado 43.005 · CUP y USD separados |
| Cierre/arqueo con declarado=esperado | `sist_esperado=9.025 · diferencia=0.00 · cf_in=7.000 · cf_out=2.000` — **el fondo no se suma de nuevo** |
| TIENDA CENTRAL: apertura fondo 100 + doc 1.000 | esperado **11.050** = 10.050+1.000 — el 100 de apertura NO se duplica |

## 4. Fórmulas

**Fuente de verdad:** `close_cash_shift` v2.21.0 (cierre/arqueo). **Espejos:** `get_cash_shift_expected` v2.21.0 (UI/arqueo en vivo), `get_cash_report` + `/api/cash-report` + `summary.ts` (Reporte de Entrega), `get_cash_flow_summary` (KPIs del módulo), y la fórmula interna de `create_cash_flow_document` (validación bajo advisory lock). Las cinco incorporan el **mismo término** `cash_flow` (`SUM CASE direction in/out`, `payment_method='cash'`, ventana del turno) — verificadas por lectura de código y por ejecución cruzada (S20: `in_total=48.000 = cf_in=48.000`, `out_total=7.000 = cf_out=7.000` en reporte y KPIs simultáneamente). Semántica conservada: `adjustment` solo en Reporte (precedente), ventas cash con split (soporta mixed), anticipos production/work como entradas, comisiones cash como salidas, transfer/zelle fuera del efectivo. **R4 corrigió los espejos** (FOUND vs nulidad compuesta) para que reflejen la misma ventana que la autoritativa. Cobros de ventas (`ref_type='sale'`) excluidos de los pagos (sin doble conteo). Anulados = original + contra = neto cero por fecha efectiva, cierres históricos intactos.

## 5. Seguridad

- **RLS:** `cash_flow_documents` con RLS activo; policy SELECT `has_store_access(store_id)` para authenticated; aislamiento por tienda en todos los RPC (actor-explícito con `CASE auth.role()='service_role'` + `p_user_id` de la sesión — patrón anti-spoofing V2.12.9 verificado por el contract-test).
- **ACLs:** mutaciones `service_role`-only (único llamador: las rutas `/api/cash-flow` con cliente admin); verificado en vivo por `proacl` y por REST: **anon obtiene 404** (función invisible) y las rutas API sin sesión → 401.
- **Permisos por rol:** registrar = admin/manager/encargado/clerk; anular = admin/manager/encargado. Usuario ajeno a la tienda → `ERR_UNAUTHORIZED` (S14).
- **Sin privilegios indebidos:** sin `service_role` en cliente, sin RLS desactivada, sin GRANTs amplios; allowlist del gate SQL ampliada con `get_cash_flow_summary` (REM-R2-READ, mismo patrón documentado que `get_cash_shift_expected`); contrato auto-limpio (137/137, 0 divergencias, 0 baselines) — nada de service_role expuesto, nada de escalado.
- **Controles server-side:** advisory lock por tienda, `FOR UPDATE` en turno/documento/numeración, idempotencia (registro + replay benigno + `ERR_IDEMPOTENCY_KEY_REUSE`), tasa USD resuelta server-side (jerarquía tienda→BCC→elToque, fail-closed, staleness 45 días), precisión 2 decimales, ventana de fecha del turno.

## 6. Pruebas

| Tipo | Ejecutadas | Resultado |
|---|---|---|
| Unitarias/integración (vitest, mocks) | 3546 (suite completa de la rama) | **3532 pasadas / 0 fallos / 14 saltadas** (gated por entorno, patrón preexistente) |
| **Integración REAL en PostgreSQL** (BD viva, `BEGIN…ROLLBACK` no destructivo) | Matriz contable de 21 escenarios (misión §8 completa) | **21/21** — incluidos todos los casos de rechazo con el `ERR_*` correcto y la conciliación numérica exacta |
| Cero-residuo post-matriz | censos de `cash_flow_documents`, `payment_transactions`, `document_sequences`, `audit_logs`, tasa de prueba | **0 filas residuales** · ledger 1148 intacto · 2 turnos abiertos intactos |
| Camino REST de producción | `get_cash_flow_summary` vía PostgREST (service key) | JSON completo correcto · schema recargado · mutaciones invisibles para anon |
| Rutas API locales | POST `/api/cash-flow` y `/api/cash-flow/reverse` sin sesión | 401 correcto (ni 404 ni 500) |
| Contrato de seguridad | contract-static + sql-gate offline + ts-gate | CONTRATO OK · 137/137 · 0 divergencias · 0 baselines |
| CI del PR #1438 | GitHub Actions sobre `fix/caja-migracion-compat-live` | En curso al cierre del informe (gates locales equivalentes en verde) |

**Pendientes declaradas:** navegación real autenticada (login → `OPERACIÓN → Caja → Ingresos/Egresos` → tarjetas/tabla → comprobante) — sin credenciales de usuario real; concurrencia real de peticiones paralelas (la serialización queda garantizada por advisory lock + `FOR UPDATE`, auditada en código y verificada secuencialmente); validación física en tienda.

## 7. Históricos

- Censo del ledger **idéntico** antes y después: `sale/in 1112`, `work/in 34`, `devolution/refund 2` — cero filas creadas, modificadas o borradas por la aplicación.
- Cierres históricos **congelados** con sus valores originales (e8b4abe9: decl 1.500 / sist 500 / dif 1.000; 9ae30b03; 42284930) — verificados pre y post.
- La migración no recalcula saldos almacenados ni toca registros históricos (solo DDL + funciones). Los documentos de turnos cerrados que se anulen en el futuro insertan la fila contra en la ventana ACTUAL (`payment_date=NOW()`), sin reabrir historia.
- `audit_logs`: 0 acciones `CASH_FLOW_*` en producción (ninguna escritura de prueba persistió).

## 8. Defectos

| # | Defecto | Tratamiento |
|---|---|---|
| R1 | CHECK `ref_type` del #1435 omitía `devolution` (W7 vivo, 2 filas) → migración no aplicable | **Corregido** (unión de 9 valores) — PR #1438, aplicado |
| R2 | `direction_check` vivo sin `'out'` → egresos/anulaciones rebotarían en runtime | **Corregido** (unión `'in','out','refund'` + `ADD COLUMN IF NOT EXISTS` para autocontención de la cadena) — PR #1438, aplicado |
| R3 | `20261012000001` (ajustes) no aplicado y no aplicable (mismo rebote devolution) | **Subsumido** (constraint + índice idempotente en la migración corregida) — PR #1438, aplicado |
| R4 | Trampa de nulidad compuesta en `get_cash_shift_expected` v2.18.0 **vivo** (espejo ignoraba el turno abierto desde 2026-10-10) | **Corregido** (FOUND) en v2.21.0 + `get_cash_flow_summary` — PR #1438, aplicado. **Preexistente en 4 funciones más** (`close_production_order_v2`, `approve_transfer`, `reset_store_data`, `adjust_sale_payment`) — documentado, requiere decisión del propietario (fuera de alcance) |
| R5 | `close_cash_shift` referenciaba `cash_closures.updated_at` (columna inexistente) — **cierre de turno roto en producción desde 2026-10-10** (latente) | **Corregido** (commit 92d527b10) y verificado (S21 diferencia 0) — PR #1438, aplicado |
| P1 | Refunds de devoluciones comerciales (`ref_type='devolution'`, 239.405 CUP acumulados) invisibles a las fórmulas de caja (v2.18.0 y v2.21.0) | Preexistente e independiente del cambio — documentado, sin corrección (requiere decisión de modelo) |
| P2 | Drifts W7 fuera de la cadena (`store_credit_ledger`, trigger `validate_payment_transactions_invariants`, columna direction) | La columna direction quedó capturada (R2); el resto documentado como deuda de regularización |
| P3 | Edge de anulación en cascada: anular una reposición cuya cantidad ya fue devuelta puede dejar el fondo contable negativo (los revesos componen por fecha) | Documentado — semántica de corrección por contra-fila; procedimiento operativo: anular en orden inverso |

## 9. Estado final

**CERTIFICADO CON LIMITACIONES.**

Certificado: la migración está aplicada y verificada; apertura y documentos no duplican el fondo (evidencia numérica §3); las cinco fórmulas son coherentes entre sí y con el ledger (término único `cash_flow`, una sola escritura del dinero); los movimientos solo afectan las magnitudes correspondientes (sin inflar ventas/transferencias — `cash_flow` invisible para flujos previos); los revesos no borran ni alteran historia; permisos y RLS intactos; 21/21 escenarios contables en PostgreSQL real + 3532/3532 unitarias.

Limitaciones (exactamente lo que falta): navegación autenticada real en navegador (sin credenciales), concurrencia con peticiones simultáneas reales, impresión física de comprobantes en tienda y CI del PR #1438 en curso al cierre.

## 10. Pendientes

1. **Fusionar PR #1438** (`fix/caja-migracion-compat-live`) — alinea `main` con la BD viva; la fusión no ejecuta nada contra la base.
2. Pruebas físicas/de integración en tienda: abrir turno → constituir fondo → vender → arqueo → cierre → Reporte de Entrega, e imprimir el comprobante IE en el terminal.
3. Decisión del propietario sobre los defectos preexistentes documentados (R4 en otras 4 funciones, P1 refunds invisibles, P2 regularización W7).
4. PR de respaldo del agente **#1436** — mantener vivo como mecanismo de continuidad (no fusionar).
