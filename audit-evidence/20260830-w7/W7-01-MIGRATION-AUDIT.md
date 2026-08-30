# W7-01 — MIGRATION AUDIT de los 9 paquetes W6.2 (FASE 1 + FASE 2)

Fuente: `w62-remediation/sql/01..09` (SHA256 en SHA256SUMS, verificados FASE 0).
Método: inspección íntegra línea a línea (esqueleto estructural + lectura de secciones críticas).
**Ningún paquete fue ejecutado durante esta auditoría** (ejecución real solo en FASE 15-17 sobre clones).

---

## FASE 2 — Clasificación de operaciones peligrosas (barrido automático)

Totales globales del escaneo (`w7-readiness/tmp/dangerops-scan.txt`):

| Operación | Total | Paquetes | Clasificación |
|---|---|---|---|
| CREATE OR REPLACE (funciones) | 25 | todos | CONTROLLED — redefiniciones firma-idénticas o nuevas (v3); sin cambio de firma salvo noting |
| REVOKE | 10 | 03,04,06 | CONTROLLED — endurecimiento ACL (INV-13); afecta clientes legacy |
| ALTER TABLE | 7 | 08 | **CRITICAL** — DROP+ADD constraint ref_type_check; ADD COLUMN direction; 2 constraints nuevos |
| GRANT | 5 | 01,03,04 | CONTROLLED — grants explícitos a authenticated/service_role |
| ALTER FUNCTION … RENAME TO | 3 | 04 | **CRITICAL** — renombres legacy: withdraw 6-arg/9-arg, receive 4-arg |
| DROP TRIGGER | 2 | 01 | **HIGH** — trg_update_product_wac (motor B, intencional) + trg_guard (idempotente re-create) |
| DROP FUNCTION | 1 | 01 | **HIGH** — update_product_wac() (motor B, intencional; dependencia = trigger dropeado primero) |
| TRUNCATE | 1 | 09 | SAFE — solo tabla sintética propia `w62_df04_synthetic_rows` |
| INSERT/UPDATE (en cuerpos de funciones) | 20/20 | todos | SAFE — lógica de negocio dentro de TX |
| DELETE FROM | **0** | — | ✓ sin deletes destructivos |
| DISABLE/ENABLE TRIGGER | **0** | — | ✓ |
| LOCK TABLE | **0** | — | ✓ (locks = row-level FOR UPDATE ordenados) |
| SECURITY DEFINER | 8 funciones | 01,02,05,07,08 | CONTROLLED — todos con `SET search_path` explícito (verificado FASE 12) |

Operaciones CRITICAL en detalle:

1. **`ALTER TABLE payment_transactions DROP CONSTRAINT payment_transactions_ref_type_check` + ADD con `devolution`** (pkg 08 S1). Reconstrucción de constraint: ADD sin `NOT VALID` fuerza validación full-scan. Con snapshot solo-esquema (141 tablas, rows=0) el costo es trivial hoy, **pero producción debe re-medirse en PRECHECK vivo** (snapshot del 20260828; hoy +2 días).
2. **`ALTER TABLE payment_transactions ADD COLUMN direction text NOT NULL DEFAULT 'in'`** — PG≥11: metadato puro (sin rewrite), BACKFILL nulo. SAFE-CONTROLLED.
3. **`ALTER FUNCTION … RENAME TO` ×3** (pkg 04) — invasivo pero NO destructivo: el cuerpo persiste; revoca EXECUTE a todos los roles. Cliente que llame firma vieja recibe `42883/42501` (error limpio, no silencio). Requiere `NOTIFY pgrst reload schema` (o restart PostgREST) tras aplicar.

Atención especial (pedida por el gate):
- **DROP FUNCTION**: solo `update_product_wac()` — único escritor-motor B; su único dependiente (trigger `trg_update_product_wac`) se dropea 1 línea antes. Verificado contra pg_depend en FASE 3.
- **Cambios de firma**: **CERO**. Ninguna firma de función cambia (todas las redefiniciones son firma-idénticas; `withdraw_production_item_v3` es nombre NUEVO).
- **Overloads**: pkg 04 renombra/revoca los 3 overloads legacy; no crea overloads nuevos (excepto `create_vale_salida` 5-arg delegadora que preexiste en diseño).
- **Objetos duplicados**: `create_devolution_v2(10-arg)` está definida en pkg 06 **y** pkg 08 — pkg 08 la sustituye (versión final = cap DF-07 + contra-asiento DF-03). Orden 06→08 obligatorio o aplicar solo 08. Documentado en W7-05.
- **search_path**: todas las SECURITY DEFINER lo fijan explícitamente (`'public','pg_temp'` o `'public','extensions'`); cero funciones sin pin.

---

## FASE 1 — Ficha de auditoría por paquete

### PKG 01 — DF-01 WAC WRITER SINGLETON (`01-df01-wac-singleton.sql`, 38.999 B)

| Campo | Contenido |
|---|---|
| Defecto | DF-01: múltiples escritores de `products.cost_average` (motor B = trigger `update_product_wac` sobre `receipt_items` + 12 rutas con fórmulas dispersas) |
| Objetos afectados | `wac_change_log` (tabla NUEVA + idx), `fn_recalc_wac` (NUEVA 6-arg), 12 funciones redefinidas firma-idénticas, trigger guard NUEVO, motor B eliminado |
| Tablas | products, wac_change_log, receipts, receipt_items, stock_movements, production_orders, devolutions, audit_logs |
| RPCs | fn_recalc_wac (nuevo, service_role only); confirm_pending_reception; fn_process_receipt 3-arg y 4-arg; perform_inventory_adjustment; cancel_reception; reverse_receipt_v2; void_reception_with_reversal; receive_production_output 6-arg (+4-arg delegadora re-creada); reverse_production_order; void_closed_production_order; create_devolution 10-arg |
| Triggers | DROP `trg_update_product_wac` (receipt_items); CREATE `trg_guard_wac_writer` (products, BEFORE UPDATE OF cost_average) |
| Constraints | ninguno nuevo |
| Índices | `wac_change_log_prod_idx (store_id, product_id, created_at)` |
| ACL | `GRANT SELECT wac_change_log → authenticated, service_role`; `GRANT EXECUTE fn_recalc_wac → service_role` (no PUBLIC, no anon, no authenticated) |
| Dependencias | register_stock_movement (preexistente), has_store_access_as, auth.uid(), gen_random_uuid() (extensions) |
| Callers | las 12 rutas cubren TODAS las escrituras de WAC documentadas en W62-01 (21 rutas → 12 cuerpos; espejo cp eliminado en 5) |
| Preconditions | trigger motor B existe en el estado actual (verificado FASE 3 vía pg_trigger); ninguna otra ruta escribe cost_average fuera del set convertido (demostrado FASE 4); gen_random_uuid disponible |
| Cambios | fórmula WAC centralizada (S+q, blend `ca_new=(S·ca_prev+q·uc)/(S+q)`; reversa q<0; guard por token `app.wac_writer`), bitácora wac_change_log por evento |
| Postconditions | EXACTAMENTE UN escritor (fn_recalc_wac); UPDATE directo de cost_average → ERR_WAC_SINGLE_WRITER_VIOLATION (P0001); motor B inexistente |
| Rollback | DROP TRIGGER trg_guard_wac_writer; recrear trg_update_product_wac + update_product_wac() desde snapshot v6; restaurar los 12 cuerpos desde snapshot v6 (definiciones preservadas byte-exactas). Reversible — demostrado FASE 16 |
| Bloqueo esperado | CREATE OR REPLACE FUNCTION = AccessExclusive sobre el procid (breve); DROP/CREATE TRIGGER = AccessExclusive breve sobre receipt_items/products; sin scans largos |
| Duración estimada | segundos (DDL puro; sin dependencia de volumen de datos) |
| Riesgo | **HIGH** — toca el motor de costo en TODAS las rutas de inventario; controlado por guard + regresión completa |
| Compatibilidad | firmas intactas (wire-compatible); cambios de BEHAVIOR: errores explícitos donde antes había mutaciones silenciosas — clientes viejos no deben enviar costos esperando efecto (ya era defecto) |
| Pruebas | W62-11 (30/0): motor B reproducido 150→137.5 y eliminado; concurrencia serializada conserva valor exacto (2300); + regresión global 118/118 |

### PKG 02 — DF-02 COGS SERVER-SIDE (`02-df02-cogs.sql`, 16.919 B)

| Campo | Contenido |
|---|---|
| Defecto | DF-02: `cost_at_sale` confiado al cliente (veneno 7777 → COGS 15.554) |
| Objetos afectados | `create_sale_v2` (22-arg, firma intacta), tabla nueva `w62_zero_cost_flags` |
| Tablas | products (FOR UPDATE), transactions, transaction_items, payment_transactions, stock_movements, w62_zero_cost_flags, audit_logs |
| Triggers/Constraints | ninguno nuevo; depende del guard de pkg 01 para cost_average |
| Índices | PK de w62_zero_cost_flags (tabla nueva) |
| ACL | sin cambios (hereda ACL previa de create_sale_v2) |
| Dependencias | register_stock_movement, pg_advisory locks del trigger de payments, pkg 01 (guard) |
| Callers | frontend checkout (route L100-104 envía cost→cost_at_sale — ahora ignorado server-side) |
| Preconditions | pkg 01 aplicado (guard activo); bandera CR-W6-2 para WAC=0 documentada si aplica |
| Cambios | primera pasada FOR UPDATE orden determinista por product_id; COGS re-leído bajo FOR UPDATE en 2ª pasada (sin TOCTOU); `cost_at_sale := v_cost` SIEMPRE server; client 7777 ignorado |
| Postconditions | COGS = qty × WAC_prev bajo lock; veneno 7777 sin efecto; WAC NULL → ERR_PRODUCT_COST_UNAVAILABLE; WAC 0 sin bandera → ERR_PRODUCT_ZERO_WAC_NOT_DOCUMENTED |
| Rollback | restaurar create_sale_v2 desde snapshot v6; DROP TABLE w62_zero_cost_flags. Reversible |
| Bloqueo esperado | row-locks FOR UPDATE por transacción de venta (patrón ordenado por product_id — sin deadlock) |
| Duración | n/a (función, no DDL pesado) |
| Riesgo | **HIGH** — ruta de ventas completa; demostrado con 20 asserts |
| Compatibilidad | COMPATIBLE-BUT-DEPRECATED: payload cliente `cost_at_sale` sigue aceptado (ignorado). Cliente viejo OK; cliente nuevo omite el campo |
| Pruebas | W62-12 (20/0): 7777→100 (WAC 50×2); cost=0; 5/5 ventas concurrentes; stock insuficiente; rollback |

### PKG 03 — DF-05 PRODUCCIÓN SERVER-SIDE (`03-df05-production.sql`, 6.002 B)

| Campo | Contenido |
|---|---|
| Defecto | DF-05: costo PT aceptado del cliente (0/7777) en withdrawals |
| Objetos afectados | `withdraw_production_item_v3` — **función NUEVA** (7-arg, nombre nuevo, sin overload) |
| Tablas | production_order_items (FOR UPDATE), production_orders (FOR UPDATE), products (FOR UPDATE), stock_movements, w62_zero_cost_flags, audit_logs, idempotency (check/register) |
| ACL | REVOKE ALL FROM PUBLIC, anon → GRANT authenticated, service_role (INV-13 canónica) |
| Dependencias | register_stock_movement, has_store_access_as, check_idempotency/register_idempotency, pkg 02 (w62_zero_cost_flags) |
| Callers | frontend production routes; `create_vale_salida` NO la llama (llama la legacy — migrada en pkg 04) |
| Preconditions | pkg 02 (flags table); producción en estado in_progress/approved |
| Cambios | p_unit_cost/p_server_side_cost NO EXISTEN en la firma v3; costo = WAC_prev del material bajo FOR UPDATE; qty numérica sin truncar (D-11); overconsumption check bajo lock; audit INV-15 con cost_authority='server_side_wac_v3' |
| Postconditions | PT cost = Σ insumos reales server-side; cliente no puede inyectar costo; partial production soportado (status partial/completed) |
| Rollback | DROP FUNCTION withdraw_production_item_v3 (nueva, sin dependientes externos más que frontends W6.2-ready). Reversible — la legacy permanece (bloqueada en pkg 04) |
| Bloqueo esperado | row-locks cortos |
| Duración | instantáneo (1 CREATE + 2 ACL) |
| Riesgo | MEDIUM — función nueva aditiva |
| Compatibilidad | BREAKING controlado: clientes deben migrar a v3; la legacy 6-arg sigue existiendo (deprecada en pkg 04). Con orden 03→04 la ventana es coherente |
| Pruebas | W62-15 (17/0): material cost>0, =0 con/sin flag, partial, múltiples withdrawals, concurrente, rollback, PT≠client cost, PT=consumo real |

### PKG 04 — DF-09 OVERLOAD GOVERNANCE (`04-df09-overloads.sql`, 8.852 B)

| Campo | Contenido |
|---|---|
| Defecto | DF-09: overloads ambiguos de withdraw_production_item (6-arg y 9-arg) + receive_production_output (4-arg y 6-arg) → PGRST203 / `is not unique` |
| Objetos afectados | create_vale_salida 6-arg (impl real migrada a withdraw_v3), create_vale_salida 5-arg (delegadora), RENAME ×3 (withdraw 6-arg→`_deprecated_6arg`, withdraw 9-arg→`_deprecated_9arg`, receive 4-arg→`_deprecated_4arg`), REVOKE ALL ×3, REVOKE PUBLIC/anon + GRANT auth/service en close_v2 11-arg y receive 6-arg |
| Tablas | issue_slips, issue_slip_items (impl vale) |
| ACL | endurecida: deprecated = 0 grants; close_v2/receive 6-arg = authenticated+service_role únicamente (PUBLIC era el grant efectivo de anon — hallazgo W6.2) |
| Dependencias | withdraw_production_item_v3 (pkg 03), register_stock_movement |
| Callers | create_vale_salida (2º caller de withdraw) migrado a v3; frontend withdraw route L26 (6-arg) → **debe migrar a v3 antes/después de W7** (compatibilidad gestionada en W7-04) |
| Preconditions | pkg 03 aplicado; PostgREST reload disponible tras migración |
| Cambios | transición 5 etapas W62-04: legacy→deprecated(RENAME+REVOKE)→v3 única ruta |
| Postconditions | 1 sola firma ejecutable de withdraw (v3) y receive (6-arg); PGRST203 desaparece (verificado FASE 11) |
| Rollback | RENAME de vuelta a nombres originales + restaurar grants desde snapshot v6. Reversible (los cuerpos nunca se pierden) |
| Bloqueo esperado | ALTER FUNCTION = AccessExclusive breve en pg_proc |
| Duración | segundos |
| Riesgo | **CRITICAL** — Breaking deliberado de firmas legacy; mitigado por ventana de coexistencia documentada y error limpio (no silencioso) |
| Compatibilidad | BREAKING para withdraw 6/9-arg y receive 4-arg; COMPATIBLE para vale_salida 5-arg (delegadora mantiene firma) |
| Pruebas | W62-19 (12/0): 42725 is-not-unique reproducido y eliminado; 42501 reproducido y resuelto; vale_salida migrado probado |

### PKG 05 — DF-06 TRANSFERENCIA BLEND D-01 (`05-df06-transfer.sql`, 9.064 B)

| Campo | Contenido |
|---|---|
| Defecto | DF-06/E-T: destino recibía stock sin blend → hueco A2 (valor creado/destruido) |
| Objetos afectados | confirm_transfer (3-arg), reverse_transfer (3-arg) — firma intacta |
| Tablas | transfers (FOR UPDATE), transfer_items, inventory_reservations, products (locks deterministas ORDER BY sid,pid), stock_movements, audit_logs |
| ACL | sin cambios |
| Dependencias | **pkg 01 hard** (fn_recalc_wac para blend), get_available_stock, register_stock_movement |
| Preconditions | pkg 01 aplicado; reservas ACTIVE existen para cada item (ERR_RESERVATION_NOT_FOUND si no) |
| Cambios | blend destino ANTES del dest-in (kardex lee ca_new); seed destino nuevo = blend con S=0; reversa simétrica (transfer_reverse, q<0, uc congelado); locks producto origen+destino ordenados |
| Postconditions | conservación: valor_origen_perdido = valor_destino_recibido; WAC_dest = weighted blend; reversa simétrica con log par |
| Rollback | restaurar ambos cuerpos desde snapshot v6. Reversible |
| Bloqueo | row-locks ordenados (sid,pid) — anti-deadlock |
| Duración | n/a |
| Riesgo | HIGH — valor de inventario en tránsito |
| Compatibilidad | COMPATIBLE (firmas intactas; comportamiento corregido) |
| Pruebas | W62-16 (19/0): 77.142857 exacto; conservación 1000=700+300 y 240+300=540; SKU inexistente; destino sin/con stock; parcial; concurrente; reversa; rollback; caso negativo |

### PKG 06 — DF-07 DEVOLUTION CAP (`06-df07-devolution-cap.sql`, 7.339 B)

| Campo | Contenido |
|---|---|
| Defecto | DF-07/F.3: devoluciones sin tope server-side (6>5 aceptado) y race 4+4=8 |
| Objetos afectados | create_devolution_v2 (10-arg) primera versión (cap sin contra-asiento financiero) |
| Tablas | transactions (LOCK venta PRIMERO), devolutions, devolution_items, audit_logs |
| ACL | REVOKE EXECUTE create_devolution 9-arg y 10-arg FROM anon, authenticated (v1 bloqueadas) |
| Dependencias | transacciones originales; (08 la sustituye añadiendo finanzas) |
| Preconditions | original_transaction_id obligatorio (ERR_DEVOLUTION_NO_ORIGINAL) |
| Cambios | orden LOCK venta → READ sold → READ returned → VALIDATE cap → INSERT (nunca SELECT-IF-INSERT desprotegido) |
| Postconditions | returned_total ≤ sold server-side; race serializada por row-lock de la venta |
| Rollback | restaurar create_devolution_v2 desde snapshot v6 (en v6 no existía → DROP). REVOKE de v1 reversibles desde snapshot |
| Riesgo | HIGH — financiero |
| Compatibilidad | v1 bloqueadas: BREAKING controlado (error limpio 42501); v2 firma estable |
| Pruebas | W62-17 (12/0): 3+2=5 ok, +1 rechazo; race 4+4 → 1 acepta, perdedora re-lee fresco y rechaza; 8>5 imposible |

### PKG 07 — DF-08 CLOSE UUID IDEMPOTENT (`07-df08-close-fix.sql`, 8.734 B)

| Campo | Contenido |
|---|---|
| Defecto | DF-08/E.7: `audit_logs.record_id = p_order_id::text` (uuid→text) rompía lookup de idempotencia |
| Objetos afectados | close_production_order_v2 (11-arg) — cuerpo redefinido |
| Tablas | production_orders (FOR UPDATE), transactions, transaction_items, payment_transactions, audit_logs |
| ACL | sin cambios en este paquete (endurecida en 04) |
| Cambios | `record_id = p_order_id` (uuid=uuid, sin ::text); param_hash md5(order|output_product|output_qty|final_amount); reuso con hash distinto → ERR_IDEMPOTENCY_KEY_REUSE; auto-chain close→receive |
| Postconditions | replay re-emite mismo resultado; wrong key rechazada; auditable (metadata con idempotency_key+param_hash) |
| Rollback | restaurar cuerpo desde snapshot v6. Reversible |
| Riesgo | MEDIUM |
| Compatibilidad | COMPATIBLE (firma intacta) |
| Pruebas | W62-18 (12/0): close, audit log, replay, duplicate, wrong id, NULL key, valid key |

### PKG 08 — DF-03 DEVOLUTION FINANCE (`08-df03-devolution-finance.sql`, 13.535 B)

| Campo | Contenido |
|---|---|
| Defecto | DF-03/F.5: devolución sin asiento financiero (0 asientos); ref_type_check sin 'devolution'; store_credit invisible como pasivo |
| Objetos afectados | **ALTER TABLE payment_transactions ×4** (constraint ref_type_check reconstruida con 'devolution'; ADD COLUMN direction + check; devolution_ref_check), `store_credit_ledger` NUEVA, validate_payment_transactions_invariants redefinida (refunds se NETEAN — hallazgo lab I1b), create_devolution_v2 (10-arg) **versión FINAL** = cap DF-07 + contra-asiento |
| Tablas | payment_transactions, cash_register_sessions (auto-open), cash_movements, store_credit_ledger, devolutions, transactions |
| Constraints | ref_type_check (rebuild), direction_check (nuevo), devolution_ref_check (nuevo: ref_type='devolution' ⇒ transaction_id y ref_id NOT NULL) |
| ACL | sin cambios |
| Dependencias | pkg 06 (create_devolution_v2 base), trigger validate_payment_transactions_invariants existente |
| Preconditions | sin filas ref_type inválidas existentes (validación de constraint); dirección de caja 'out' permitida por movement_type='refund' |
| Cambios | cash: refund → cash_movements(movement_type='refund') + payment_transactions(direction='refund', ref_type='devolution') = cash OUT; store_credit: pasivo en ledger (NO cash); I1 netea refunds (no cuentan como pago) |
| Postconditions | todo refund produce contra-asiento trazable; refund jamás interpretado como payment |
| Rollback | restaurar constraint original (DROP/ADD sin 'devolution'), DROP COLUMN direction, DROP TABLE store_credit_ledger, restaurar trigger fn y create_devolution_v2. **Nota**: reversa de ADD COLUMN destruye datos direction añadidos (columna default 'in' → pérdida solo de datos posteriores) — documentado FASE 16 |
| Bloqueo | **ACCESS EXCLUSIVE** sobre payment_transactions durante DDL (breve en tablas vacías; re-medir en PRECHECK) |
| Duración | segundos con snapshot vacío; proporcional al scan de validación en producción real |
| Riesgo | **CRITICAL** — única reconstrucción de constraint del set |
| Compatibilidad | COMPATIBLE (additive); constraint endurecida: inserts legacy de devolución sin transaction_id/ref_id → rechazados (correcto por diseño) |
| Pruebas | W62-13 (16/0): F.5 reproducido (0 asientos); ref_type+direction+cash_out+store_credit; idempotencia; I1 netea refunds |

### PKG 09 — DF-04 HISTÓRICOS DESIGN-ONLY (`09-df04-design-only.sql`, 5.232 B)

| Campo | Contenido |
|---|---|
| Defecto | DF-04: WAC históricos no verificables (recon gap) |
| Objetos afectados | w62_df04_design_params (NUEVA), w62_df04_synthetic_rows (NUEVA), w62_df04_classify (NUEVA, IMMUTABLE pura) |
| Tablas | solo sus 2 tablas auxiliares propias; **NINGÚN dato real tocado** |
| Cambios | parámetros T_canon/ventana/elegibilidad/CR-W6-6 (T_canon = placeholder owner_W8); 8 fixtures sintéticos; clasificador determinista 8/8 |
| Postconditions | cero backfill; cero mutación de datos reales; T_canon queda PENDIENTE de decisión del dueño (W8) |
| Rollback | DROP TABLE ×2 + DROP FUNCTION. Trivial |
| Riesgo | LOW |
| Compatibilidad | COMPATIBLE — aditivo puro. **Decisión W7**: si este paquete se despliega a producción o queda como artefacto de diseño; contiene INSERT de parámetros (datos) — irrelevante financieramente, pero es dato, no esquema |
| Pruebas | W62-14 (8/0): clasificador 8/8 determinista |

---

## Hallazgos de la auditoría (FASE 1+2)

| # | Hallazgo | Severidad | Impacto W7 |
|---|---|---|---|
| H1 | `create_devolution_v2` duplicada en pkg 06 y pkg 08 (08 = final) | MEDIUM | Orden de migración debe aplicar 06→08 (o solo 08); documentado en W7-05 |
| H2 | Snapshot de producción es solo-esquema (141 tablas rows=0) — volúmenes reales desconocidos | MEDIUM | PRECHECK vivo obligatorio antes de ALTER TABLE de pkg 08 (validación de constraint) |
| H3 | pkg 04 RENAME+REVOKE es breaking deliberado para withdraw 6/9-arg y receive 4-arg | CRITICAL controlado | Requiere ventana de migración de frontend; W7-04 clasifica compatibilidad exacta |
| H4 | pkg 09 INSERTa filas de parámetros en producción si se aplica | LOW | Decisión de despliegue del paquete en W7-05 (recomendado: desplegar; es diseño auditable) |
| H5 | Ninguna firma de función existente cambia; ninguna constraint se elimina sin sustituto; 0 DELETE | — | Superficie de riesgo DDL concentrada en pkg 08 |
| H6 | El rol `authenticated` pierde EXECUTE en create_devolution v1 (REVOKE) — la ruta app default (USE_V2_REVERSE=false→v1) rompería | HIGH | El frontend DEBE cambiar a v2 en la ventana de migración (W7-04 §route devolutions L73) |

Estos hallazgos alimentan la matriz GO/NO-GO (W7-14). Ninguno constituye por sí solo NO-GO; H3/H6 son bloqueos de sincronización de despliegue (no de integridad).
