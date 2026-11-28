-- ============================================================================
-- PAQUETE PREPARADO — SIN AUTORIZACIÓN DE EJECUCIÓN
-- Sincronización retroactiva del libro de migraciones (hueco N1 de la
-- revisión): registra las migraciones del repo posteriores a 20261121200100
-- (última entrada del ledger) VERIFICADAS COMO APLICADAS por marcador de
-- catálogo en producción [MEDIDO 2026-11-28].
-- Estado: 27 verificadas aplicadas (INSERT activos) ·
--         7 sin marcador distintivo (INSERT comentados,
--         aplicación inferida — decisión del propietario).
-- La ejecución es una ESCRITURA en producción no cubierta por G1/G2/G3:
-- exige autorización expresa del propietario. NO ejecutar sin ella.
-- Evidencia: audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json
-- ============================================================================
BEGIN;

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261121230000', '20261121230000_cp_fin_reconciliation_operativa_contable.sql', '88b594b4c1eccb47a7d3234fe00f1a8ad5c8c2b8e84dba295893f07cdb46744b', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: tabla:fin_reconciliation_config, tabla:fin_reconciliation_snapshots, funcion:fin_ledger_saldo, funcion:fin_cash_flows_operacional.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261121230100', '20261121230100_cp_fin_category_detail_export_fields.sql', '945b2a0cb3e141e86c4e3690add3adc5246dccd835ff9fc8eb330e0938c46326', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:fin_get_category_detail.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261122100000', '20261122100000_adn010_sr_draft_cancel_delete.sql', 'd17da745dbcd302489826f45535ffadea8c6149ef7b496a3100c116697a69d34', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:delete_received_service_draft.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261122120000', '20261122120000_cp_fin110_enervida_reconciliation_fix.sql', '182b7ecec491942adf219f7c0fb9fca551b2786f8fa53fed2b59073df1969e7b', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:fin_compute_metrics, funcion:fin_trg_payment_transactions, funcion:fin_trg_production_orders, funcion:fin_generation_build.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261122130000', '20261122130000_cp_fin111_postreview_hardening.sql', '99bef0e2d35ddcf890a75acbdf9ee4d3efb0235b42669fce20895295b0a8131a', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:fin_generation_build, funcion:fin_get_reconciliation, funcion:fin_rectification_apply.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261124120000', '20261124120000_adn011_gaceta_diario_publico.sql', '80aec1a7c0ac94a9ba98dc06d71b7462326412322bc8f521a3bbc71451435d5d', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: tabla:gaceta_posts.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261124120000', '20261124120000_cp_ops_enervida_payment_reversals.sql', '8fbf0fe7b6961c2eeaa0f363c100a0081f7a092354acb05d6fd6bb4cd8ef916d', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:update_payment_status, funcion:fin_post_payment_annulment, funcion:reverse_supplier_payment, funcion:register_supplier_payment.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261124120100', '20261124120100_cp_ops_enervida_service_void_idempotency.sql', '7e13569d15dd51e9cbcd2c63f9fee47a2c46174a041b20e53645f10679fe4603', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:void_received_service_with_reversal, funcion:set_received_service_status, funcion:create_received_service_v2, tabla:audit_logs.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261124120200', '20261124120200_cp_ops_enervida_cash_report_eligibility.sql', 'f1277bc1a20a2586930b969ece2d95e3efc880f340b268550ec044cf128f3ef8', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:get_cash_report, funcion:get_cash_currency_summary.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261124120300', '20261124120300_cp_ops_enervida_multi_settlement.sql', '3f07398873f85bbae8c6ece6023805e38efab517f1f31cdb2f9c90fdae21a084', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:register_supplier_payment_multi.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261124120400', '20261124120400_cp_ops_enervida_parties_consolidation.sql', '6ddfb3a4e2dbc7914c1d222c7586e1b791fba3eb40e51511a0bab037afe3f421', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:consolidate_local_party, funcion:delete_master_party.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261125120000', '20261125120000_cp_pos_per_item_payments.sql', '4fba2cda50c29ceaba3af667573c6998fe8099993444bf4fd6849f80ee6e4e8d', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:create_sale_v2.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261125120000', '20261125120000_cp_recep001_confirm_notes_link.sql', 'c180f11217a5cabae4f09c26e2378f496c861cab75a9d04d34feeef25c7318d5', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:confirm_pending_reception, funcion:cp_recep001_backfill_confirm_notes.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261125120100', '20261125120100_cp_recep001_master_sku_consecutivo.sql', '5b3ef59988e5aecdc4df644d88e87113aa8bc9c697058ef86855545127f8409d', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:next_master_catalog_sku, funcion:assign_next_catalog_sku, funcion:fn_classify_reception_import_row, funcion:resolve_reception_import_rows.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261125131000', '20261125131000_cp_catmaestro001_add_reception_items.sql', 'fb3692bc163b3737a14beccf88ce59eee047bded8dbd8fada38fe39285e04208', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:add_reception_items, funcion:save_pending_reception_changes.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261126120000', '20261126120000_cp_apai_payment_lifecycle_guards.sql', 'f20fc03ce23de48821365c2062e586954b2f1507d1346f2ae6409549364b8fba', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:reverse_receipt_v2, funcion:void_pending_reception, funcion:void_received_service_with_reversal, funcion:set_received_service_status.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261126120200', '20261126120200_cp_apai_void_service_payment_engine_fix.sql', 'c36cfa7a0cac0acbeb09fa1cad8e856871dffcc2be5927869dfa57c3fb8c5f90', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:prevent_received_service_edit.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261126140000', '20261126140000_cpbra_r01_r14_payment_engine.sql', '15efb4e4a8fd7a4b8da1734cd5ed117aa65bb88e4c20b2055f914e0fa3f7ffeb', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:update_payment_status, funcion:register_supplier_payment, funcion:reverse_supplier_payment.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261126150000', '20261126150000_cpbra_r11_pos_incidents_validation.sql', '3152b4ce7a0623a1cb9920d2f633001c4a05a4d92f044ae2390cdda33982022c', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:create_sale_v2.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261126160000', '20261126160000_cpbra_r15_supplier_dedup_guard.sql', 'fc97d85e4ea56c216d97633485e752b43006bb4e2499c19b75dbcc81d55d494c', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:create_supplier_local.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261126170000', '20261126170000_cpbra_r05_adjustment_confirmation_role_guard.sql', '5f5fe8a87ab0ea7e9e46b99dc093e3c44b7b31dd5fe127ea71664b0bef56e37a', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:confirm_inventory_adjustment.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261127120000', '20261127120000_cpbra_r26_batch_reversal_netting.sql', 'e6a1fc8b36ace1e7451b673150d800b72816a181cf4f4857209283887c57d9a8', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:register_supplier_payment_batch.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261127130000', '20261127130000_cpop_fix_v2_global_service_type.sql', '59909ae43081db2729d1f5d9fd2701b32c026ec08f4ba38cec8575cb6bd2595b', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:create_received_service_v2.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261127140000', '20261127140000_cpbra_r03_ot_payment_batch.sql', '2ac21b5e34b7613d8f6106ba8a05b1b57d123df0c8c6f8068e27474262008358', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:register_ot_payment_batch.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261127150000', '20261127150000_cpbra_pay_commission_encargado.sql', 'b906b5de4bfdb40ddd450df1fcdef696676ccebdd7e9e5b535b7aa18f05ae032', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:pay_commission.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261128120000', '20261128120000_cp_pos_transfer_identity_validation.sql', 'a5fcfb5d15bed6913696ee07ec955c8280dd5842db50ba31241e723e110ce87a', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:create_sale_v2.');

INSERT INTO public.production_migration_ledger
  (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
VALUES
  ('20261128120000', '20261128120000_cpbra_r06_reception_authorization.sql', 'be4a4c8d77bfbfa5442e6bc31f8d1ef42071c35ec816abeac70bab301476d575', now(),
   'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
   'REGISTRO RETROACTIVO: aplicada entre 2026-11-22 y 2026-11-28 (fecha exacta no registrada en su momento). Aplicación verificada por marcador de catálogo: funcion:is_superadmin_uid, funcion:can_create_reception, funcion:can_manage_reception, funcion:register_reception.');

-- ── SIN MARCADOR DISTINTIVO (aplicación inferida, sin verificación de catálogo).
-- La decisión de registrar estas 7 es del propietario; se dejan comentadas.
-- INSERT INTO public.production_migration_ledger
--   (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
-- VALUES
--   ('20261121240000', '20261121240000_cp_nomina_superadmin_transversal.sql', '32e6b9e55354b59b0217ed33c87e3b039ad7acceb48b13e94ae25d4f2ae23f16', now(),
--    'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
--    'REGISTRO RETROACTIVO (SIN MARCADOR DE CATÁLOGO — verificación pendiente): migración de ACL/ALTER sin objeto distintivo; aplicación inferida del estado del repo/main.');

-- INSERT INTO public.production_migration_ledger
--   (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
-- VALUES
--   ('20261125130000', '20261125130000_cp_catmaestro001_renumber_enervida_auto.sql', 'f79c30a6b8f051f4bd4c18f13febe9666f5b7e1b327e0cae2f7ba882df070cd8', now(),
--    'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
--    'REGISTRO RETROACTIVO (SIN MARCADOR DE CATÁLOGO — verificación pendiente): migración de ACL/ALTER sin objeto distintivo; aplicación inferida del estado del repo/main.');

-- INSERT INTO public.production_migration_ledger
--   (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
-- VALUES
--   ('20261125132000', '20261125132000_cp_catmaestro001_reception_rpc_acl.sql', 'bfe1bc9587ba9b481312a6d0ade6996b2e66275ae80114414a0cc7a8a77f8146', now(),
--    'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
--    'REGISTRO RETROACTIVO (SIN MARCADOR DE CATÁLOGO — verificación pendiente): migración de ACL/ALTER sin objeto distintivo; aplicación inferida del estado del repo/main.');

-- INSERT INTO public.production_migration_ledger
--   (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
-- VALUES
--   ('20261125133000', '20261125133000_cp_catmaestro001_drop_renumber_tool.sql', '44015d2781b52f2f56969d9bb9a4c26106073cba30558b3aaa191f7878f60715', now(),
--    'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
--    'REGISTRO RETROACTIVO (SIN MARCADOR DE CATÁLOGO — verificación pendiente): migración de ACL/ALTER sin objeto distintivo; aplicación inferida del estado del repo/main.');

-- INSERT INTO public.production_migration_ledger
--   (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
-- VALUES
--   ('20261125153000', '20261125153000_cxap_revoke_legacy_reception_fns.sql', 'cc960246fa67e385daa554686da39b361f3cf1544bfc223de96dc447d11680ac', now(),
--    'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
--    'REGISTRO RETROACTIVO (SIN MARCADOR DE CATÁLOGO — verificación pendiente): migración de ACL/ALTER sin objeto distintivo; aplicación inferida del estado del repo/main.');

-- INSERT INTO public.production_migration_ledger
--   (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
-- VALUES
--   ('20261126120100', '20261126120100_cp_apai_tiendapueblo_supplier_link.sql', '9d2984b312a2195179238188efdda818d0ae37a1f9453b1a1d5ef34dd084ca7b', now(),
--    'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
--    'REGISTRO RETROACTIVO (SIN MARCADOR DE CATÁLOGO — verificación pendiente): migración de ACL/ALTER sin objeto distintivo; aplicación inferida del estado del repo/main.');

-- INSERT INTO public.production_migration_ledger
--   (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
-- VALUES
--   ('20261127160000', '20261127160000_cpbra_tienda_pueblo_receipts.sql', '765c41bf4c788f9410bc04a1dd68bfcf46bd2987ae5741d28fa1c495ce8699c8', now(),
--    'management_api', 'audit-evidence/CP-FIN-REVIEW-001/revalida-20261128-ledger-gap.json', 'paquete ledger-sync CP-FIN-REM-001 (autorización pendiente)', 'applied',
--    'REGISTRO RETROACTIVO (SIN MARCADOR DE CATÁLOGO — verificación pendiente): migración de ACL/ALTER sin objeto distintivo; aplicación inferida del estado del repo/main.');

-- Verificación final (read-only): total esperado 79 + 27 = 106 filas.
-- SELECT count(*) FROM public.production_migration_ledger;  -- esperado 106

COMMIT;
