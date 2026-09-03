W9.4.8 — H5-B2
STATUS: CLOSED / NO ISSUE

# 1. Executive Summary

La reversión de ventas mediante `reverse_transaction_v2` (oid 138188, md5 `09dbed9a06dd6c7e55e3be90591b4fd8`) mantiene la integridad financiera del modelo contable real de CostPro. La función revierte inventario (stock + kardex vía `register_stock_movement` con `movement_type='sale_reverse'`), marca la venta `voided` (transición sancionada por la máquina de estados) y escribe audit trail completo. **No toca** `payment_transactions` ni caja, y ese comportamiento es correcto: `payment_transactions` es un ledger histórico inmutable (DELETE prohibido por trigger, `amount > 0` CHECK, `amount_cup` columna generada), donde los pagos de la venta permanecen como historia contable, mientras que todos los consumidores financieros (reporte de caja, resumen de ventas, dashboard, items-summary, libro fiscal) filtran por el estado de la venta y por tanto excluyen automáticamente venta y pagos de una venta anulada. No existe doble contabilización, no existe refund faltante ni duplicado, no existe saldo incorrecto: los 16 controles de la matriz final pasan. El gap de trazabilidad señalado en el backlog original (H5-B2 P3: "no marca payment_transactions") queda demostrado como diseño correcto, no defecto: ningún consumidor lee el marcador `[REVERSED]` (patrón cosmético del dominio AP/receipts); la trazabilidad autoritativa de la reversión vive en `transactions.status='voided'` + `audit_logs` (REVERSE_TRANSACTION_V2 + UPDATE_STATUS). Se documentan 3 observaciones nuevas fuera del alcance (OBS-1 material: doble conversión USD en `get_cash_report`; OBS-2: ledger parcial en ventas legacy; OBS-3: columnas `reversed_*` sin poblar), sin modificar producción.

# 2. Scope

- Objetivo único: H5-B2 — Payment Integrity Gap. ¿La reversión de una venta mediante `reverse_transaction_v2` mantiene la integridad financiera de la venta, sus pagos, caja, saldos y reportes?
- Dominios: `transactions`, `transaction_items`, `payment_transactions`, `payments` (inexistente como tabla separada), `cash` (cash_closures/cash_movements/sessions), `refunds` (inexistente como tabla; mecanismo = `payment_transactions.direction='refund'`), `returns` (`devolutions`), `accounts receivable` (`/api/accounts-receivable`, dominio production_orders), reportes financieros, audit logs.
- Prohibiciones respetadas: cero modificaciones a producción, RPCs, tablas, triggers, views, RLS, ventas reales; cero migraciones; cero reversiones con COMMIT.
- Out of scope (documentado, no modificado): H-3, H5-B3..B6, H5-B1-OBS-1/2, F-03, F-08, OBS-01.

# 3. Starting Checkpoint

- HEAD = `6aee29f` (origin/main == HEAD), rama `main`, worktree limpio (solo `?? audit-evidence/20260903-w9-h5b2/`).
- H5-B1 = CLOSED; `public.reverse_transaction` V1 inexistente (PGRST202 incluso con service_role).
- Producción: PostgreSQL 17.6, proyecto Supabase accesado solo por SQL de introspección + batches BEGIN/ROLLBACK vía Management API, y PostgREST para probes de seguridad.
- Evidencia: `audit-evidence/20260903-w9-h5b2/00-checkpoint/checkpoint.txt`.

# 4. Financial Model

| Entidad | Tabla real | Relación con venta | Relación con pago | Mutabilidad |
|---|---|---|---|---|
| Venta | `transactions` | — | 1:N vía `payment_transactions.transaction_id` (FK RESTRICT) + denormalizado `cash_amount/transfer_amount/zelle_amount` | status mutable (máquina de estados); `total_amount` inmutable (trigger `protect_transactions_total_amount`, solo `costpro_transaction_adjuster`) |
| Item | `transaction_items` | FK CASCADE | — | histórico |
| Pago | `payment_transactions` | FK `transaction_id` RESTRICT + `ref_type='sale'` fuerza `ref_id=transaction_id` | — | **ledger inmutable**: DELETE prohibido (`ERR_PAYMENT_DELETE_FORBIDDEN` PT007); `direction ∈ ('in','refund')` |
| Caja | `cash_closures` (11 rows; snapshots de cierre), `cash_movements` (0 rows en producción de ventas; solo devoluciones crean `out`), `cash_register_sessions`/`cash_sessions` (0 rows) | agregación on-the-fly | — | snapshots |
| Refund | sin tabla; contra-asiento `payment_transactions.direction='refund'` creado por `create_devolution_v2` (ref_type='devolution', idempotency `dev-<id>-refund`) | FK al `original_transaction_id` | contra-asiento | inmutable |
| Return | `devolutions` + `devolution_items` | FK `original_transaction_id` (SET NULL) | `payment_method ∈ (cash,transfer,zelle,store_credit)` | status pending/completed/voided/reversed |
| Crédito | `store_credit_ledger` | `origin_transaction_id` | pasivo por devolución store_credit | inmutable (idempotency_key UNIQUE) |
| AR | sin tabla; `/api/accounts-receivable` sobre `production_orders.paid_amount/budget_total` | — | ref_type production_order/work | n/a |

# 5. Transaction Model

- `status transaction_status`: pending/completed/failed/compensated/cancelled/refunded/voided/reversed. Producción: 520 completed, 0 de cualquier otro estado.
- `total_amount` numeric NOT NULL CHECK >= 0 — **inmutable** por trigger (ERR_TOTAL_AMOUNT_IMMUTABLE PT008).
- **No existen** `paid_amount`, `total_cost`, ni `payment_status` en `transactions`: el saldo se deriva dinámicamente del ledger. El patrón `paid_amount/payment_status` existe en receipts/received_services/production_orders (documentos de compra/servicio), sincronizado por el trigger `update_payment_status()` — que **no tiene rama para `ref_type='sale'`** (correcto: las ventas no tienen esos campos).
- Denormalizado de split: `cash_amount`, `transfer_amount`, `zelle_amount` (CUP), CHECK `chk_mixed_payment_consistency` (|split−total| ≤ 1.00 para mixed).
- Metadata de reversión disponible: `void_reason`, `reversed_at`, `reversed_by`, `reversal_reason`, `original_transaction_id` (auto-FK para venta reemplazada).
- Momento de escritura: `create_sale_v2` inserta la venta `completed` + items + pagos del ledger en la misma transacción (idempotencia por `idempotency_key` y por llaves `pay-cash|transfer-<tx_id>`).

# 6. Payment Model

`payment_transactions` (366 filas): ledger transaccional append-only.

| Campo | Clasificación |
|---|---|
| id, store_id, ref_type, ref_id, transaction_id, amount, currency, exchange_rate, amount_cup, payment_date, payment_method, direction, paid_by, created_at, idempotency_key | historical (inmutables de facto: DELETE prohibido; UPDATE solo notas/monitoreo — ningún writer financiero modifica amount) |
| amount_cup | derived: **GENERATED ALWAYS** `CASE WHEN currency='CUP' THEN amount ELSE amount*exchange_rate END` — la conversión es a nivel DB, imposible el drift |
| notes, updated_at | mutable (marcador `[REVERSED]` en dominio receipts) |

- CHECK: `amount > 0`; `currency ∈ (CUP,USD,EUR,MLC)`; `payment_method ∈ (cash,transfer,zelle)`; `direction ∈ (in,refund)`; zelle nunca CUP; `ref_type='sale'` ⇒ `ref_id=transaction_id`.
- Triggers: `validate_payment_transactions_invariants` (BEFORE): overpay guard — la suma de pagos `direction='in'` por venta no puede exceder `total_amount + 0.01` (ERR_PAYMENT_EXCEEDS_TOTAL); tasa única por método+moneda (ERR_MULTIPLE_EXCHANGE_RATES); **DF-03: los refunds NO suman como pago**. `update_payment_status` (AFTER): recalcula paid_amount/payment_status SOLO para receipt/service/production_order — las ventas quedan exentas por diseño. `audit_payment_transactions_changes` (AFTER): SUPPLIER_PAYMENT_REGISTERED / PAYMENT_TRANSACTION_UPDATED.
- Perfil: 240 cash CUP (8,083,965 CUP), 124 zelle USD (24,768.5 USD → 16,842,580 CUP), 2 transfer CUP (11,300). 0 refunds en producción (mecanismo existe, usado por devoluciones cuando ocurren: 26 DEVOLUTION_CREATED_V2 en audit).

# 7. Currency Model

- Moneda base contable: **CUP**. `transactions.total_amount` y los splits `cash/transfer/zelle_amount` están en CUP-equivalente (verificado en datos: las 14 ventas USD tienen total == suma del split CUP; 0 ventas USD con total < 1000, i.e. ninguna en USD crudo).
- `sale_currency`/`sale_exchange_rate` son contexto de venta (precio de cara al cliente), no unidad de `total_amount`.
- Por pago: `amount` en moneda propia + `exchange_rate` + `amount_cup` generado (CUP). Invariantes de tasa: CUP⇒rate=1 (PT003); no-CUP⇒rate>1 (PT004); una sola tasa por método+moneda (PT006). Tasa observada estable: 680 CUP/USD.
- Comparaciones entre `total_cost` (receipts, CUP) y `amount_cup` (CUP) son unit-consistentes. La fórmula `update_payment_status` compara receipt.total_cost (CUP) vs SUM(amount_cup) (CUP) — válido.
- **Defecto latente fuera de alcance (OBS-1)**: `get_cash_report` multiplica `total_amount * sale_exchange_rate` para `sale_currency != 'CUP'`, pero `total_amount` ya es CUP-equivalente ⇒ doble conversión (680x). Ver sección 11 y 18.

# 8. Trigger Analysis

| Trigger | Tabla | Evento | Función | Efecto financiero |
|---|---|---|---|---|
| trg_validate_tx_transition | transactions | BEFORE UPDATE OF status | fn_validate_document_transition('transactions') | máquina de estados: completed→voided/reversed; voided/reversed terminales |
| trg_protect_transactions_total_amount | transactions | BEFORE UPDATE | protect_transactions_total_amount | total_amount inmutable (PT008) |
| trg_check_active_user | transactions | BEFORE INSERT/UPDATE | check_active_user | vendedor debe estar activo |
| reverse_commissions_on_sale_void | transactions | AFTER UPDATE OF status | reverse_commissions_on_sale_void | status→voided/reversed ⇒ commission_payments del período → flagged_for_review + audit COMMISSION_FLAGGED_FOR_REVIEW |
| trg_audit_transaction_changes | transactions | AFTER UPDATE | log_transaction_changes | audit UPDATE_STATUS old/new en cambio de status |
| trg_validate_payment_invariants | payment_transactions | BEFORE I/D/U | validate_payment_transactions_invariants | DELETE prohibido; tasas; overpay guard; DF-03 refunds |
| trg_update_payment_status | payment_transactions | AFTER I/D/U | update_payment_status | recalcula paid_amount/payment_status de receipts/services/production_orders (NO ventas) |
| trg_audit_payment_transactions | payment_transactions | AFTER I/U | audit_payment_transactions_changes | audit del ledger |
| trg_sync_has_movements_sale | transaction_items | AFTER INSERT | sync_product_has_movements | flag has_movements |
| trg_check_cash_session_closed | cash_register_sessions | BEFORE UPDATE | check_cash_session_open | no cierra sesión cerrada |
| trg_validate_devolution_transition | devolutions | BEFORE UPDATE OF status | fn_validate_document_transition | máquina de estados devoluciones |

# 9. reverse_transaction_v2 Analysis

OID 138188; SECURITY DEFINER; `search_path=public, pg_temp`; owner postgres; ACL {postgres, service_role}; firma `(p_transaction_id uuid, p_reason text, p_user_id uuid) → jsonb`; md5 prosrc `09dbed9a06dd6c7e55e3be90591b4fd8` (src_len 2251) — byte-a-byte idéntica al cierre de H5-B1.

Flujo: SELECT FOR UPDATE → ERR_TRANSACTION_NOT_FOUND → si ya voided: `{status:'idempotent'}` → solo completed es reversible (ERR_INVALID_STATUS) → autorización `has_store_access_as(v_caller_uid, store)` (para service_role `COALESCE(p_user_id, auth.uid())`; para otros roles `auth.uid()` pin — p_user_id no falsificable) → por cada item: `register_stock_movement(movement_type='sale_reverse', unit_cost=cost_at_sale)` → UPDATE status='voided' → audit REVERSE_TRANSACTION_V2 (reason, units_restored) → `{status:'success', units_restored}`.

| Entidad | SELECT | INSERT | UPDATE | DELETE | Efecto |
|---|---|---|---|---|---|
| transactions | ✓ FOR UPDATE | — | ✓ status→voided, updated_at | — | anulación lógica |
| transaction_items | ✓ | — | — | — | lectura |
| payment_transactions | **—** | **—** | **—** | **—** | **intacto (ledger histórico)** |
| cash (closures/movements/sessions) | — | — | — | — | **intacto** |
| stock_movements | — | ✓ sale_reverse | — | — | restauración de stock |
| inventory/products | — | — | ✓ stock_current (via register_stock_movement) | — | stock; **WAC no se recalcula** (hotfix A2: escritor único WAC es trg_update_product_wac de receipt_items; cost_at_sale solo kardex) |
| products (flag) | — | — | ✓ has_movements (trigger) | — | flag |
| audit_logs | — | ✓ REVERSE_TRANSACTION_V2 + UPDATE_STATUS (trigger) | — | — | trazabilidad |
| commission_payments | — | — | ✓ flagged_for_review (trigger) | — | comisiones a revisión |

La venta voided queda terminal (máquina de estados): imposible doble reversión a nivel trigger además del early-return idempotente.

# 10. API Analysis

`POST /api/reverse` (src/app/api/reverse/route.ts): zod schema (type/id/reason 3..500) → CSRF `validateOrigin` → rate limit 5/min → `withAuth` (session real) → cliente **service_role** → `RPC_MAP_V2.transaction = reverse_transaction_v2` con `p_transaction_id=id`, `p_reason=reason`, `p_user_id=session.user.id` (actor real de servidor; un usuario no puede forjarlo) → mapeo de errores ERR_* a 403/404/409/422/500. Ambos mapas (V1/V2) resuelven a V2 desde H5-B1. Sin manipulación de pagos/refund/cash en la capa API — correcto: la reversión de venta no es una operación de dinero.

# 11. Report Analysis

| Reporte | Venta voided | Pago asociado | Caja | Riesgo |
|---|---|---|---|---|
| Cash (`get_cash_report` + /api/cash-report) | excluida (`status != 'voided'`) | pagos ref_type='sale' **nunca se contabilizan** en caja (solo receipt/service/production/work) | balance = ventas+producción−proveedores−comisiones | ninguno para reversión (TEST-6B: ventas 1000→0 al voidar) |
| Sales (`/api/sales/summary`) | excluida (`status='completed'` con join a ledger) | ledger autoritativo con fallback denormalizado cuando no hay filas | — | ninguno |
| Payments drill-down (`/api/cash-report/details`) | type=sale: `.neq('status','voided')` | type=payment lista ledger sin join de status (solo drill-down de grupos receipt/service/commission; los totales los calcula `get_cash_report`, que excluye sale) | — | cosmético, sin efecto en totales |
| Items summary (`/api/cash-report/items-summary`) | excluida (join con `.neq('transactions.status','voided')`) | — | — | ninguno |
| Dashboard multi-tienda (`useMultiStoreDashboard`) | excluida (`.eq('status','completed')`) | — | — | ninguno |
| Payment totals (`/api/cash-report/payment-totals`) | excluida (`.eq('status','completed')`) | — | — | ninguno |
| Libro fiscal (`get_sales_book`) | incluida con columna status (práctica fiscal correcta: anulación visible) | n/a | n/a | ninguno |
| AR (`/api/accounts-receivable`) | dominio production_orders (no ventas) | ref_type production_order/work | — | n/a |

# 12. Forensic Data

- Estados: 520 completed / 0 voided / 0 pending / 0 reversed / 0 cancelled / 0 refunded. `total_amount` sum = 28,100,955 CUP.
- Pagos: 366 (366 'in', 0 'refund'); ventas con pagos 347, sin pagos 173 (ventas legacy cash pre-ledger, julio-agosto 2026), múltiples 18; fully paid 347, partial 0, overpaid 0.
- voided+payment / voided+cash / voided+transfer / voided+multiples: 0/0/0/0 (no existen ventas voided en producción; las 10 filas audit REVERSE_TRANSACTION_V2 corresponden a tests PR4-T2 de 2026-08-10 cuyas transacciones de prueba fueron eliminadas después — el audit trail retiene la historia correctamente).
- Integridad matemática (10-financial-integrity/integrity-checks.json): 0 overpaid, 0 huérfanos, 0 ref_id mismatch, 0 violaciones mixed-check, 0 violaciones multi-tasa, 0 direcciones inválidas, 0 montos ≤ 0.
- Muestras (08-forensic-data/): CASH (total==cash_amount==ledger), ZELLE (45 USD×680=30,600 CUP exacto), MULTI (cash 13,600 + zelle 450×680=306,000 = 319,600), NO_PAYMENTS (legacy, fallback denormalizado).

# 13. Dynamic Tests

Método: batches SQL BEGIN → escenario sintético → `reverse_transaction_v2` → verificación → **ROLLBACK** (cero persistencia; contextos JWT service_role simulados con set_config local). Evidencia: 09-dynamic-tests/*.json.

- **TEST1_FULL_PAID_CASH** (Caso B/E): BEFORE stock=320/0 pagos → reverse `{success, units_restored:2}` → AFTER status=voided, pagos cnt=1 sum=1000 sum_refund=0 (ledger intacto, sin refund entry), stock=322 (+2 exactos), WAC inalterado (9644.76439790576), sale_reverse_mv=1, audit reverse=1 + update_status=1, cash_movements=0, items=1. Segunda llamada → `{status:'idempotent'}`.
- **TEST2_UNPAID** (Caso A): reversión exitosa; pagos 0; stock +1; voided.
- **TEST3_PARTIAL_400** (Caso C): pago 400 permanece intacto ('in'), venta voided, stock +1; sin refund ni zeroing.
- **TEST4_MULTI_PAYMENT** (Caso D): 3 pagos (cash 400 CUP, transfer 300 CUP, zelle 0.44 USD@680→299.2 CUP) permanecen; venta voided; audit payment=3; stock +1.
- **TEST5_TRANSFER_IDEMPOTENCE** (Caso F): transfer-only; doble reversión → segunda llamada `idempotent`; sale_reverse_mv sigue 1 (sin doble restauración de stock), audit reverse=1.
- **TEST6B_CASH_BEFORE_AFTER** (FASE 23): `get_cash_report` totals ANTES: sales_total_cup=1000, balance=1000 → DESPUÉS: sales_total_cup=0, balance=0; ledger: 1 pago (1000 CUP) permanece pero `payments_total_cup=0` (caja no cuenta ref_type='sale'). Exclusión limpia sin doble conteo.

# 14. Financial Integrity

Casos contables reconstruidos contra el modelo real (estado venta / pago / saldo / caja / reportes / ledger):
- **Caso A (unpaid)**: voided / — / — (la venta muere sin deuda ni pago) / sin cambio / excluida de todos los reportes / ledger vacío. Correcto.
- **Caso B/E (full cash)**: voided / pago 'in' permanece como historia / saldo histórico sin efecto contable / caja: la venta sale de la ventana del reporte (el efectivo físico real ya cobrado se concilia en cash_closures del día) / excluida / ledger intacto. Correcto.
- **Caso C (partial 400/1000)**: voided / pago 'in' 400 permanece / el "saldo" de la venta desaparece con la venta (no hay cuenta por cobrar de ventas; AR es dominio de production_orders) / caja: 400 cobrados físicos conciliados en cierre del día / excluida de reportes / ledger intacto. Correcto: el dinero realmente cobrado queda trazado; la venta anulada no genera deuda fantasma.
- **Caso D (multi 400/300/300)**: los tres pagos permanecen 'in'; anulación por status; sin doble conteo (reportes no leen pagos de venta). Correcto.
- **Caso F (transfer 1000)**: idéntico a B con transfer; sin movimiento bancario inverso requerido por el modelo (el modelo de devolución existe para devolver dinero cuando el negocio decide hacerlo — ver FASE 12). Correcto.

Reconciliación del contrato: paid_amount = SUM(payments) **no aplica a ventas** (campo inexistente); la fórmula real es `balance = total_amount − SUM(payment_transactions.amount_cup WHERE direction='in' AND transaction_id=X)`, derivable en cualquier momento y consistente (0 overpaid, 0 orphans). Para receipts/services/production_orders, `paid_amount` es columna denormalizada mantenida por trigger — y la reversión de receipt resetea (patrón H-4) porque allí SÍ existe el campo.

**Void vs Refund vs Return (FASE 12)**: el sistema distingue claramente — VOID = `reverse_transaction_v2` (anulación lógica + inventario, **sin movimiento de dinero**); REFUND/RETURN = `create_devolution_v2` (devolución al cliente: `cash_movements` tipo 'out' + `payment_transactions.direction='refund'` ref_type='devolution' + idempotencia `dev-<id>-refund`; o `store_credit_ledger` para crédito). La respuesta a la pregunta crítica: **`reverse_transaction_v2` NO pretende devolver dinero — únicamente invalida la venta y revierte su impacto de inventario**; la devolución de dinero es el canal separado de devoluciones. Modelar el void como refund sería doble canal contable; el diseño evita exactamente eso.

**Ledger (FASE 24)**: `payment_transactions` ES ledger histórico. El diseño correcto exige: mantener el pago histórico + exclusión por estado de la venta en reportes — que es lo implementado. No exige refund entry (eso es devolución, canal aparte) ni zeroing (prohibido por invariantes). El marcador `[REVERSED]` del dominio receipts es cosmético: **ningún consumidor** (código TS ni SQL) lee ese notes marker; la trazabilidad de la reversión de venta vive en `transactions.status/void_reason/reversed_*` + audit_logs.

# 15. Security

| Prueba | Resultado |
|---|---|
| anon → EXECUTE | DENIED: 42501 permission denied (ACL sin grant anon) |
| authenticated no autorizado | DENIED: sin EXECUTE (ACL solo postgres+service_role); vía API, withAuth + store check |
| authenticated autorizado (miembro) | ALLOWED (tests dinámicos: admin miembro OK) |
| service_role | ALLOWED (probe: ERR_TRANSACTION_NOT_FOUND en id inexistente) |
| p_user_id forjado | neutralizado: para no-service_role `v_caller_uid := auth.uid()`; desde /api/reverse p_user_id es `session.user.id` de servidor |
| cross-store | DENIED: ERR_UNAUTHORIZED (probe dinámico: encargado no-miembro sobre venta sintética en tienda ajena) |
| Regresión H-4/H5-B1 | V2 intacta (hash idéntico), V1 inexistente, ACL y search_path preservados |

SECURITY = PASS.

# 16. Audit Trail

Eventos generados por una reversión de venta: (1) `REVERSE_TRANSACTION_V2` (RPC: actor, reason, units_restored), (2) `UPDATE_STATUS` (trigger log_transaction_changes: old=completed, new=voided), (3) `COMMISSION_FLAGGED_FOR_REVIEW` si hubo comisión del período (trigger). Producción: 10 REVERSE_TRANSACTION_V2 (tests PR4-T2), 250 UPDATE_STATUS, catálogo completo en 12-conclusion/audit-actions-catalog.json. Deficiencia menor documentada (OBS-3): el UPDATE del RPC no llena `reversed_at/reversed_by/reversal_reason` de la fila (quedan NULL); no existe consumidor financiero de esas columnas (solo tipos TS) y la trazabilidad autoritativa está en audit_logs.

# 17. Root Cause

No existe defecto. La decisión de diseño (pagos intactos como ledger + exclusión por estado en reportes + refund solo por devoluciones) es coherente en todas las capas verificadas: schema (CHECK/FK/generated), triggers (invariantes + DF-03), RPC, API, hooks, reportes y datos reales.

# 18. Financial Impact

De la reversión: cero. No hay pago contabilizado incorrectamente, no hay caja mal calculada, no hay saldo incorrecto, no hay refund faltante/duplicado, no hay pago duplicado, no hay ledger inconsistente, no hay reporte incorrecto por causa de la reversión (demostrado con TEST-6B: la única alteración reportable de voidar es la correcta salida de la venta de las ventanas de agregación).

Hallazgo nuevo fuera de alcance (OBS-1, material): `get_cash_report` infla `sales_total_cup`/`balance_cup` en ~680x para ventas con `sale_currency='USD'` (doble conversión: `total_amount` ya es CUP-equivalente). Cuantificado: 14 ventas USD en producción ⇒ 1,355,520 CUP correcto vs 921,753,600 CUP si entran en ventana (delta 920,398,080). **No es causado ni agravado por la reversión** (afecta igual a ventas completed) — clasificado como hallazgo nuevo para backlog (severidad sugerida P2, dominio reporte-caja/moneda), NO corregido en esta fase.

# 19. Remediation

No requiere (NO ISSUE). Backlog recomendado (documentado, no ejecutado):
- **NUEVO H5-B2-OBS-1 (P2)**: corregir `get_cash_report` — la sección sales debe usar `total_amount` directo (o sumar `payment_transactions.amount_cup` por venta) sin multiplicar por `sale_exchange_rate` cuando sale_currency≠CUP. Minimal: reemplazar `total_amount * COALESCE(sale_exchange_rate,1)` por `total_amount` en ambas consultas del RPC. Con tests de regresión de caja con ventas USD.
- **H5-B2-OBS-2 (P3)**: ledger parcial — 165 ventas (148 cash legacy, 23 transfer, 4 zelle) sin filas en payment_transactions (julio-agosto 2026). Sin impacto financiero hoy (fallbacks denormalizados en sales/summary; get_cash_report usa transactions). Higiene: decidir si backfill o declarar ledger best-effort para ventas.
- **H5-B2-OBS-3 (P3)**: poblar `reversed_at/reversed_by/reversal_reason` en el UPDATE de reverse_transaction_v2 (1 línea) para paridad con el contrato documentado en route.ts; trazabilidad hoy garantizada por audit_logs.

# 20. Regression

No hubo código modificado ni DDL aplicado ⇒ regresión de aplicación NO APLICABLE (regla §39 condicionada a "si existe código modificado"). Verificación estructural de producción: hash de reverse_transaction_v2 idéntico al cierre H5-B1 (09dbed9a…); catálogo sin nuevos objetos; baseline PRE == POST en 21 métricas incluidos fingerprints MD5 de transactions y payment_transactions (10-financial-integrity/baseline-post.json); 6 batches dinámicos terminados en ROLLBACK; cero filas nuevas.

# 21. Evidence

`audit-evidence/20260903-w9-h5b2/` (00-checkpoint … 12-conclusion), SHA256SUMS.txt con 34 archivos. Sin secretos, tokens, ni PII (IDs UUID y agregados; sin nombres de clientes ni CI).

# 22. Git

- Sin modificaciones de código ni migraciones: HEAD permanece `6aee29f`.
- Commit de evidencia (convención W9.4.6/W9.4.7): solo `audit-evidence/20260903-w9-h5b2/` — ver registro de commit; push verificado `LOCAL HEAD == origin/main`.
- `git diff --check`: limpio; worktree limpio tras el commit.

# 23. Final Verdict

| Control | Resultado | Evidencia |
|---|---|---|
| Transaction/payment relationship | PASS | FK RESTRICT + ref_id=transaction_id CHECK; 0 orphans, 0 mismatch |
| paid_amount consistency | PASS/N-A | ventas no tienen paid_amount (modelo ledger); receipts/POs sincronizados por trigger |
| Payment ledger | PASS | append-only: DELETE prohibido PT007; amount>0; 0 refunds huérfanos |
| Payment status | PASS | update_payment_status sin rama sale (correcto); DF-03 refunds no suman |
| Void semantics | PASS | completed→voided sancionado; terminal; anulación lógica |
| Refund semantics | PASS | refund = devoluciones (cash out + direction='refund' + store_credit), canal separado |
| Cash | PASS | caja no toca pagos de venta; TEST-6B exclusión exacta (1000→0) |
| Partial payments | PASS | TEST3: pago 'in' intacto, sin deuda fantasma |
| Multiple payments | PASS | TEST4: 3 pagos intactos, audit por fila |
| Currency | PASS | amount_cup GENERATED; CUP base; 0 violaciones de tasa |
| Exchange rate | PASS | PT003/004/006; 0 violaciones multi-tasa (OBS-1: bug de reporte fuera de alcance) |
| Reports | PASS | todos filtran voided/completed; libro fiscal conserva status |
| Audit trail | PASS | REVERSE_TRANSACTION_V2 + UPDATE_STATUS (+comisiones flag); OBS-3 cosmético |
| Idempotence | PASS | 2ª llamada `{status:'idempotent'}`; 1 sale_reverse_mv; 1 audit |
| Security | PASS | anon 42501; cross-store ERR_UNAUTHORIZED; forja p_user_id neutralizada |
| Data integrity | PASS | PRE==POST 21 métricas + fingerprints; 6 ROLLBACKs verificados |

GATES: FINANCIAL CONTRACT = RECONSTRUCTED · PAYMENT BEHAVIOR = VERIFIED · CASH BEHAVIOR = VERIFIED · REPORT BEHAVIOR = VERIFIED · LEDGER BEHAVIOR = VERIFIED · DATA INTEGRITY = VERIFIED · SECURITY = VERIFIED.

```text
W9.4.8 — H5-B2
FINAL VERDICT: CLOSED / NO ISSUE
```

La pregunta de cierre queda demostrada: cuando CostPro revierte una venta mediante `reverse_transaction_v2`, la venta queda `voided` (terminal), sus pagos permanecen como ledger histórico inmutable invisible para todas las agregaciones financieras, la caja no se altera más allá de la salida correcta de la venta de los reportes, el inventario se restaura con exactitud sin tocar WAC, y todo queda auditado — coherente con el modelo contable real del sistema, que reserva la devolución de dinero al canal de devoluciones (`create_devolution_v2`).
