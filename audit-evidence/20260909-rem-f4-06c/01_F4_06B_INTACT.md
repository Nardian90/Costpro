# 01_F4_06B_INTACT — verificación viva §2 (raw: out_q02_f406b_intact.txt)

## audit_fiscal_closings_changes (objeto F4-06b)
- secdef=true, owner=postgres, cfg=[search_path=public, pg_temp]
- has_text_cast=**false**, has_new_id_text=**false** (remediación F4-06b intacta)
- ACL: postgres=X/postgres,service_role=X/postgres (sin PUBLIC, sin authenticated)

## Triggers sobre fiscal_closings
- prevent_fiscal_closing_edit: BEFORE DELETE OR UPDATE, tgenabled='O' (v2_19_5, intacto)
- trg_audit_fiscal_closings: AFTER INSERT OR UPDATE, tgenabled='O' (intacto)

## Tipos canónicos
- fiscal_closings.id = uuid · audit_logs.record_id = uuid (uuid=uuid, sin cambio de esquema)

## REM-F4-06 sin regresión
- audit_commission_payments_changes: secdef=true, owner=postgres, cfg intacto,
  has_text_cast=false, has_new_id_text=false, ACL intacta.

## Estado fixtures AUDIT STORE A (pre-gate)
- F1 17558101 (2026-08) locked · F2 a2592dd4 (2026-09) closed
- Filas 2026-10/11/12 y 2027-01 creadas 22:54 (artefactos F4-06b, ANTES de este gate 23:27)
- n_audit_fiscal = 10 antes del gate (baseline de auditoría)

RESULTADO: F4-06b y F4-06 INTACTOS → gate autorizado a continuar (§2 sin STOP).
