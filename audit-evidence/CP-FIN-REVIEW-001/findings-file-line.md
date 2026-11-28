# CP-FIN-REVIEW-001 · Hallazgos archivo:línea (revalidados 2026-11-23, solo lectura)

Convención: `archivo | línea | defecto | evidencia | corrección propuesta`.
Evidencia "EN VIVO" = consultado el catálogo real de producción (wthkddeleylijmonclxg) el 2026-11-23.
Las líneas señalan la migración que CREÓ el defecto (el estado vigente se confirma en pg_policies/pg_proc).

## F1 — Cobertura (solo documentación + PR-B)
- supabase/migrations/20261113120100_cp_fin_partida_doble_motor.sql | 559-573 | el trigger fin_trg_transactions SOLO contabiliza INSERT-completed o transición a completed | EN VIVO: prosrc del trigger + corte temporal [MEDIDO] (todas las ventas de las 2 tiendas terminan ≤ 2026-11-07/11-04, antes de la instalación del motor 2026-11-13); sin pg_cron (extensión no instalada) ni cola | PR-B: monitor fin_coverage_report() + instrumentación; reconstrucción SOLO con G2 (generaciones canónicas, nunca fin_backfill desde monitor)
- (ausencia) | sin línea | NO existió recorrido histórico al instalar el motor para las tiendas 43a4dabc… y 899d2503… | [MEDIDO] 282/1013 ventas completed sin asiento en generación activa; 0 filas en fin_posting_errors | decisión del propietario con G2

## F2 — Lectura excesiva del libro
- supabase/migrations/20261113120000_cp_fin_partida_doble_base.sql | 557-560 | fin_entries_select: USING `is_admin() OR has_store_access(store_id)` → cualquier miembro (clerk incluido) lee el libro | EN VIVO pg_policies (qual idéntico) | reemplazar por `is_admin() OR has_store_role(store_id, ARRAY['admin','manager','encargado'])`
- ídem | 562-565 | fin_movements_select con el mismo predicado amplio | EN VIVO | ídem
- ídem | 569-572 | fin_opening_select amplio | EN VIVO | ídem
- ídem | 585-588 | fin_post_err_select: `(store_id IS NULL) OR is_admin() OR has_store_access(...)` → cualquier miembro ve incluso errores GLOBALES (peor que lo descrito en la misión) | EN VIVO | `(store_id IS NULL) AND is_admin()` para globales; por tienda solo gestión
- ídem | 590-594 (fin_post_err_update) | UPDATE de errores con `(store_id IS NULL) OR …` → cualquier miembro actualiza errores globales | EN VIVO | `(store_id IS NULL) AND is_admin()` para globales; por tienda admin de tienda
- supabase/migrations/20261120120000_cp_fin003_generations_canonical_mapping.sql | 1394-1403 y 1470-1479 (patrón repetido en las 6 RPC) | fin_get_*: `v_caller := CASE WHEN service_role THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END` + `IF v_caller IS NOT NULL AND NOT (is_admin_check(v_caller) OR has_store_access_as(v_caller, p_store_id))` → (a) helper débil = cualquier membresía activa (clerk pasa); (b) si v_caller es NULL la comprobación SALTA | EN VIVO: prosrc de las 6 RPC con el patrón literal | en cada RPC: v_caller = p_user_id para service_role (obligatorio, NULL→ERR_UNAUTHORIZED) y auth.uid() para el resto; comprobación incondicional con can_manage_store_as
- (nota ACL) | — | fin_get_category_detail y fin_get_reconciliation SOLO tienen EXECUTE para service_role; las otras 4 para authenticated+service_role | EN VIVO proacl | NO se amplía EXECUTE (misión 5.1)
- (hallazgo nuevo N2) fin_reconciliation_snapshots_select (creada en 20261121230000, ~línea de creación en esa migración) | USING `is_admin_check(auth.uid()) OR has_store_access_as(auth.uid(), store_id)` → cualquier membresía activa lee SNAPSHOTS de conciliación (contienen importes) | EN VIVO pg_policies | REPORTADO (no enumerado por la misión; no se corrige en CP-FIN-REM-001 salvo autorización expresa)
- (hallazgo nuevo N3) fin_posting_generations_select con roles {public} y has_store_access_as | cualquier miembro ve metadatos de generaciones (sin importes) | EN VIVO | REPORTADO (severidad baja)

## F3 — Ámbito de reglas
- supabase/migrations/20261113120000_cp_fin_partida_doble_base.sql | 546-555 | fin_rules_update: USING `(store_id IS NULL) OR has_store_access(store_id)` con WITH CHECK estricto; un admin de tienda puede tomar una regla GLOBAL y reasignarla a su tienda (USING pasa por NULL, WITH CHECK pasa por su membresía admin) → la altera para todas | EN VIVO pg_policies + lógica verificada; riesgo [INFERIDO] de la misión queda CONFIRMADO a nivel de política | USING y WITH CHECK idénticos y estrictos (global→is_admin(); tienda→has_store_role(admin))
- (ausencia) | sin línea | NO existe trigger que impida cambiar store_id en fin_rule_versions | EN VIVO pg_trigger (0 triggers en la tabla) | trigger BEFORE UPDATE `NEW.store_id IS DISTINCT FROM OLD.store_id` → ERR_FIN_RULE_SCOPE_IMMUTABLE
- compatibilidad verificada: fin_activate_rule_version / fin_deactivate_rule_version solo actualizan status/deactivated_at (no store_id) | EN VIVO prosrc

## F4 — Inmutabilidad (ausencia de solo-adición)
- (ausencia) | sin línea | fin_entries y fin_movements SIN triggers de solo-adición | EN VIVO pg_trigger: solo fin_trg_entries_generation_default (INSERT) en fin_entries | triggers BEFORE UPDATE/DELETE ENABLE ALWAYS con excepciones explícitas
- supabase/migrations/20261122120000_cp_fin110_enervida_reconciliation_fix.sql | (fin_rectification_apply, bloque reparación ~109-112 en prosrc) | DML legítimo: DELETE fin_movements + UPDATE fin_entries SET movements_snapshot, description | EN VIVO prosrc | excepción de mantenimiento controlado acotada a esas columnas/filas
- supabase/migrations/20261113120100_cp_fin_partida_doble_motor.sql | (fin_post_document_annulment ~53 en prosrc) | DML legítimo: UPDATE fin_entries SET status='reversed' con contraasiento reversal_of insertado en la MISMA transacción | EN VIVO prosrc | excepción A del trigger (posted→reversed con contraasiento)
- fin_generation_build / fin_apply_opening_balance | — | SOLO INSERT (compatibles) | EN VIVO prosrc | sin excepción necesaria
- reset_store_data (ambas firmas) | — | NO toca fin_entries/fin_movements (confirmado la misión) | EN VIVO prosrc | sin excepción necesaria
- (hallazgo nuevo N4) FKs ON DELETE CASCADE stores→fin_entries y fin_entries→fin_movements | el borrado duro de una tienda con asientos quedaría bloqueado por el trigger (fail-closed) — comportamiento documentado y probado | esquema | documentación; soft_delete_store no borra filas

## F5 — Reversión
- supabase/migrations/20261115100000_cp_fin_t12_partial_reversal_guard.sql | (fin_entry_reversal_residual, definida aquí y re-declarada en 20261116120000) | suma `m.amount` (moneda original) en las 2 comparaciones → residual mal calculado con multimoneda | EN VIVO prosrc: `sum(m.amount) FROM public.fin_movements` | sumar `m.amount_cup` en las 4 sumas, manteniendo sentidos, tolerancia 0,01 CUP, semántica total/parcial e idempotencia
- ídem 20261115100000 | (fin_t12_block_receipt_annulment, bloque SELECT principal) | no filtra por generación → bloquea anulación por reversión parcial existente SOLO en generación superseded | EN VIVO prosrc | filtrar `e.generation_id IS NOT DISTINCT FROM public.fin_active_generation(NEW.store_id)` (tratamiento documentado de generación NULL)

## TR — Freno de TRUNCATE
- supabase/migrations/20261114180300_cp_infra_020_breaker_v2.sql | (función block_truncate + instalación) | el freno cubre 34 tablas y NINGUNA de las 16 fin_*/payroll*/worker_salary_rates | EN VIVO pg_trigger: 34 triggers block_truncate tgenabled='A'; 0 sobre fin/payroll; service_role tiene TRUNCATE sobre fin_movements (ACL en vivo) | migración nueva que extiende el freno a las 16 (guard: aborta si falta alguna; verificación final del número exacto de triggers tgenabled='A')

## Hallazgos nuevos (fuera del alcance de corrección; se REPORTAN)
- N1: producción_migration_ledger desactualizado (migraciones 20261121230000→20261122130000 aplicadas y ausentes del ledger) | evidencia: catálogo en vivo vs ledger | acción: registrar retroactivamente con autorización del propietario (fuera de esta misión)
- N2: fin_reconciliation_snapshots_select amplio (membresía activa lee importes de conciliación) | acción: propuesto para una misión posterior
- N3: fin_posting_generations_select con roles {public} y helper débil | severidad baja (metadatos) | acción: reportado
- N4: cascada de borrado de tienda bloqueada por los nuevos triggers (comportamiento seguro) | acción: documentado y probado
- N5: fin_posting_errors almacena error_code=substr(SQLERRM,1,80) con identificadores de documento (tensiona la regla 0.12); la instrumentación nueva usa códigos estables; el cambio del formato EXISTENTE se deja fuera de alcance
- N6: ruta src/app/api/fin/opening-balances/route.ts POST usa cliente admin SIN gate de rol (create/void eluden RLS); GET usa cliente de sesión | corrección en PR-A (consumidores 5.1): gate canManageStore
