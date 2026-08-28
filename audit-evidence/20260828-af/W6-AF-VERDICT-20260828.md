# W6-AF-VERDICT-20260828 — Casos canónicos A–F sobre costpro_audit_v2

Fecha: 2026-08-28 (UTC) · Ejecución: lab-only, `costpro_audit_v2` @ 127.0.0.1:5433 (PG 17.11)
Precondición: CHECKPOINT CERRADO (§11: 8/8 PASS) → A–F AUTORIZADO
Aislamiento (§13): por-caso `fixture → hash_inicio → ejecución → assertions → hash_fin → ROLLBACK → residuo`
F7 (concurrencia): clon efímero `costpro_audit_v2_conc` (TEMPLATE v2), destruido tras la prueba; v2 jamás mutado.
Post-verificación: **S1 fingerprint post-A-F DIFF = 0** → v2 sigue siendo espejo exacto de producción. Residuo global de fixtures: **0**.

## 1. Veredicto por caso

```text
A RECEPCIÓN ................ PASS  (5/5)  WAC inicial = unit_cost; inventario, kardex y receipt OK
B SEGUNDA RECEPCIÓN ........ PASS  (4/4)  Identidad D-01 exacta: (10×100+5×200)/15 = 133.333333
C VENTA .................... FAIL  (2/5)  DEF-AF-01: cost_at_sale lo impone el CLIENTE (7777 y 0 aceptados)
D VENTA + RECEPCIÓN ........ FAIL  (3/4)  DEF-AF-02: trigger sobrescribe WAC operativo 150 → histórico 137.5
E PRODUCCIÓN ............... FAIL  (3/7)  DEF-AF-03/04/05: costo 0 aceptado; PT a costo 0 y contaminado; close con key roto
F DEVOLUCIÓN ............... FAIL  (4/7)  DEF-AF-06/07: sin tope de sobre-devolución; race concurrente; sin contra-asiento
F7 CONCURRENCIA (clon) ..... FAIL  (R1)   2 devoluciones simultáneas aceptadas (8 devuelto > 5 vendido); R2 misma-clave: idempotente OK
```

## 2. Matriz de invariantes

| # | Invariant | Expected (canon) | Actual (ejecutado) | Result | Evidence |
|---|-----------|------------------|--------------------|--------|----------|
| A.1 | WAC inicial = unit_cost | 100 | 100 | PASS | case-A.out |
| A.2 | Inventario creado (stock 10) | 10 | 10 | PASS | case-A.out |
| A.3 | Movimiento purchase +10@100 | existe | existe | PASS | case-A.out |
| A.4 | Receipt pending→active, total 1000 | active/1000 | active/1000 | PASS | case-A.out |
| A.5 | Kardex generada | ≥1 | 1 | PASS | case-A.out |
| B.1 | Identidad D-01 (2000/15) | 133.333333 | 133.333333 | PASS | case-B.out |
| B.2 | Stock acumulado | 15 | 15 | PASS | case-B.out |
| B.3 | 2 movimientos +10@100,+5@200 | 2 | 2 | PASS | case-B.out |
| B.4 | 2ª recepción activa | 1 | 1 | PASS | case-B.out |
| C.1 | Ataque 7777 ignorado → cost_at_sale=100 | 100 | **7777** | **FAIL** | case-C.out |
| C.2 | Sin costo del cliente → 100 (no 0) | 100 | **0** | **FAIL** | case-C.out |
| C.3 | Kardex venta al costo servidor | 100 | **7777** | **FAIL** | case-C.out |
| C.4 | Venta no altera WAC | 100 | 100 | PASS | case-C.out |
| C.5 | Stock tras ventas 3+2 | 5 | 5 | PASS | case-C.out |
| D.1 | Venta no destruye WAC | 100 | 100 | PASS | case-D.out |
| D.2 | WAC tras R2 = D-01 operativo | 150 | 150 | PASS | case-D.out |
| D.3 | WAC tras R3-pendiente = 150 (canon) | 150 | **137.5** | **FAIL** | case-D.out |
| D.4 | Stock final 6+6 (R3 no suma) | 12 | 12 | PASS | case-D.out |
| E.1 | Servidor bloquea costo 0 (legacy) | rechaza | **acepta 0** | **FAIL** | case-E.out |
| E.1b | Variante server_side=true impone WAC | 50 | 50 | PASS | case-E.out |
| E.2 | PT tras ORD1 con info válida = 50 | 50 | **0** | **FAIL** | case-E.out |
| E.3 | ORD2 server-side registra 50 | 50 | 50 | PASS | case-E.out |
| E.4 | PT WAC final sin contaminación = 50 | 50 | **25** | **FAIL** | case-E.out |
| E.5 | MP WAC intacto tras withdrawals | 50 | 50 | PASS | case-E.out |
| E.7 | close CON idempotency_key funciona | closed | **ERROR uuid=text** | **FAIL** | case-E.out |
| F.1 | Reversión COGS al costo original | 100 | 100 | PASS | case-F.out |
| F.2 | Costo histórico conservado (WAC) | 100 | 100 | PASS | case-F.out |
| F.3 | Tope acumulado (Σdevuelta≤vendida) | rechaza 6>5 | **acepta** | **FAIL** | case-F.out |
| F.4 | Devolución parcial (2 de 5) | procesa | procesa | PASS | case-F.out |
| F.5 | Contra-asiento financiero | existe | **no existe** | **FAIL** | case-F.out |
| F.6 | Idempotencia misma clave | 1 sola | 1 sola | PASS | case-F.out |
| F.7 | Concurrencia (race claves distintas) | cap rechaza | **2 aceptadas** | **FAIL** | f7-race1-verdict.txt |
| F.8 | Sin sobre-devolución (stock ≤ recibido) | 10 | **13 (clon) / 11 (caso)** | **FAIL** | f7-race1-verdict.txt |

## 3. DEFECT REGISTER (sin corregir — fase posterior)

### DEF-AF-01 · CRITICAL · C — cost_at_sale determinado por el cliente
```text
case:        C (venta)
severity:    CRITICAL
function:    public.create_sale_v2 (línea ~112/214)
SQL:         v_cost := COALESCE((v_item->>'cost_at_sale')::numeric, (v_item->>'cost')::numeric, 0);
expected:    servidor impone cost_at_sale = products.cost_average (WAC) — cliente NO puede imponer 0/7777
actual:      cliente impone 7777 → transaction_items.cost_at_sale=7777, stock_movements.unit_cost=7777, kardex a 7777;
             sin claves de costo → 0 (COGS silencioso a cero)
evidence:    case-C.out (C.1=7777, C.2=0, C.3=7777)
reproduction: create_sale_v2(items=[{product_id, quantity, price, cost_at_sale:7777}], p_total_amount=Σqty×price)
```

### DEF-AF-02 · HIGH · D — sobrescritura silenciosa WAC operativo → promedio histórico
```text
case:        D (venta + recepción)
severity:    HIGH
function:    trigger trg_update_product_wac ON receipt_items (AFTER INSERT) → update_product_wac()
SQL:         UPDATE products SET cost_average = (Σ recepciones activas + servicios)/Σcantidades  -- histórico
expected:    WAC operativo D-01 persiste (150) hasta que una recepción real lo recalcule
actual:      INSERT de receipt_item (aunque la recepción esté PENDIENTE y no confirme) dispara el trigger
             y reescribe WAC 150 → 137.5 (promedio histórico de adquisiciones)
evidence:    case-D.out (D.3: actual=137.5; divergencia operativo-vs-histórico documentada)
reproduction: R1 10@100 → venta 4 → R2 6@200 (WAC=150) → INSERT receipt pending 1@150 → WAC=137.5
```

### DEF-AF-03 · CRITICAL · E — withdraw acepta costo 0 del cliente (semántica legacy)
```text
case:        E (producción)
severity:    CRITICAL
function:    public.withdraw_production_item (6-arg legacy / 9-arg con p_server_side_cost=false)
SQL:         ELSE v_real_unit_cost := p_unit_cost;  -- sin validación contra cost_average
expected:    bloquear costo 0 silencioso cuando existe información válida (MP WAC=50)
actual:      acepta 0 → production_order_items.actual_unit_cost=0; stock_movements(production_out).unit_cost=0
evidence:    case-E.out (E.1: actual_unit_cost=0.00; production_out unit_cost=0)
reproduction: withdraw_production_item(item, 5, 0, store, user, key, NULL, 'AF', server_side_cost=>false)
```

### DEF-AF-04 · HIGH · E — PT valuado a costo 0 y contaminación propagada
```text
case:        E (cierre de producción)
severity:    HIGH
function:    public.receive_production_output (vía close_production_order_v2)
SQL:         v_total_materials_cost := SUM(actual_qty × COALESCE(actual_unit_cost,0))
expected:    PT = 50 (costo real de MP con información válida)
actual:      PT cost_average = 0 tras ORD1 (MP a costo 0); tras ORD2 correcta: blend 25 ≠ 50 (contaminación)
evidence:    case-E.out (E.2: PT=0; E.4: PT=25; production_in unit_cost=0 y 25)
reproduction: withdraw costo 0 → close con output → PT=0; segunda orden correcta → blend arrastrado
```

### DEF-AF-05 · HIGH · E — close_production_order_v2 roto con idempotency_key (drift uuid/text)
```text
case:        E (cierre con idempotencia)
severity:    HIGH
function:    public.close_production_order_v2 (línea 18, pre-check de idempotencia)
SQL:         ... AND record_id = p_order_id::text   -- audit_logs.record_id es uuid
expected:    idempotencia soportada (segunda llamada → already_closed / idempotent)
actual:      ERROR: operator does not exist: uuid = text → la llamada con p_idempotency_key SIEMPRE falla;
             la orden queda in_progress (no cerrable por esta vía)
evidence:    case-E.out (E.7: estado_orden3=in_progress)
reproduction: close_production_order_v2(..., p_idempotency_key=>'cualquiera')
```

### DEF-AF-06 · CRITICAL · F — sin tope acumulado de devolución; race concurrente
```text
case:        F (devolución) + F7 (concurrencia sobre clon efímero)
severity:    CRITICAL
function:    public.create_devolution_v2
SQL:         — inexistente: no hay validación Σ devuelta(item) ≤ vendida(original) —
expected:    rechazar devolución acumulada > vendida; en carrera, serializar y rechazar exceso
actual:      secuencial: 2ª devolución aceptada (acumulado 6 > vendida 5; stock 11 > 10 recibidos);
             concurrente (clon): K1 y K2 (4+4) ambas success → stock 13 > 10 recibidos
evidence:    case-F.out (F.3, F.8) + f7-race1-verdict.txt (devoluciones_creadas=2, stock_final=13)
reproduction: venta 5 → devolución 2 → devolución 4 (acepta) | dos sesiones simultáneas 4+4 con claves distintas
```

### DEF-AF-07 · MEDIUM · F — devolución sin contra-asiento financiero
```text
case:        F (devolución)
severity:    MEDIUM
function:    public.create_devolution_v2
SQL:         — no existe INSERT en cash_movements ni registro de reembolso —
expected:    contra-asiento financiero (reembolso/reversal) acoplado a la devolución
actual:      solo devolutions + devolution_items + stock_movements(return) + audit_logs; 0 cash_movements
evidence:    case-F.out (F.5: cash_movements reason ILIKE '%devol%' = 0)
reproduction: create_devolution_v2 válida → SELECT count(*) FROM cash_movements WHERE reason ILIKE '%devol%' → 0
```

## 4. Observaciones (no defectos de caso; relevantes para W6.1)

```text
OBS-AF-01  sync_product_stock ordena por (movement_date, created_at): movimientos con idéntico
           timestamp (misma TX multi-línea) resuelven el último balance de forma ambigua →
           riesgo de desync de stock_current en operaciones masivas intra-transacción.
OBS-AF-02  withdraw_production_item tiene DOS overloads (6-arg legacy y 9-arg endurecida) →
           llamadas con argumentos nombrados y solo los 6 comunes fallan "function is not unique".
OBS-AF-03  La variante endurecida 9-arg (V-01 tope de sobreconsumo + C-03/C-04 costo server-side
           sin fallback) ESTÁ desplegada y funciona (E.1b: 50) — remedio disponible, pero no es
           la semántica del camino legacy.
OBS-AF-04  POSITIVO: create_sale_v2 valida el total calculado por el servidor (ERR_TOTAL_MISMATCH) —
           el total NO es manipulable por el cliente (contraste con DEF-AF-01 en costo).
OBS-AF-05  POSITIVO: el índice único devolutions.idempotency_key_key resiste la carrera misma-clave
           (F7 R2: exactamente 1 devolución; segunda → idempotent).
```

## 5. Estado final (criterio §19)

```text
CHECKPOINT ........ PASS  (f628e5e7, remoto verificado, 8/8 §11)
A–F ............... COMPLETE  (27 invariantes + F7; evidencia ejecutada, residuo 0, S1 post-A-F = 0)
Defects ........... OPEN  (7 defectos: 3 CRITICAL, 3 HIGH, 1 MEDIUM + 5 observaciones)
W6.1 .............. BLOCKED (no se inicia automáticamente — requiere decisión del dueño)
W7 ................ BLOCKED (inalterado)
Producción ........ READ-ONLY (cero mutaciones en toda la operación)
```

## 6. Procedencia

Evidencia generada por ejecución directa contra `costpro_audit_v2` (espejo S1≡prod, snapshot
PRODUCTION-SCHEMA-SNAPSHOT-RECOVERY congelado). F7 ejecutado sobre clon efímero destruido.
Los casos usan EXACTAMENTE las definiciones canónicas del dueño (§14 W6.0) — sin reinterpretación,
sin correcciones durante la prueba. Los defectos se registran, no se corrigen.
