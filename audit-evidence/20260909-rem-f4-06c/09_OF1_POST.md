# 09_OF1_POST — estado POST del lock (§13) (raw: out_q03_post_state.txt)

- Firma: lock_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid) — 4 args
- secdef=true, owner=postgres, cfg=[search_path=public]
- ACL: postgres=X/postgres,service_role=X/postgres (SIN PUBLIC — verificado; authenticated
  denegado 42501 en vivo: 12_SECURITY S3)
- Comment: documenta patrón v2_12_9 + REM-F4-06c
- Cuerpo: v_admin_id (service_role ← p_user_id server-side; else auth.uid()), check admin,
  UPDATE status='locked', locked_by=v_admin_id, ERR_ADMIN_ONLY/ERR_NOT_CLOSED intactos
- Triggers y tipos uuid intactos; fiscal_period_closures inexistente

## Verificación funcional HTTP (detalle en 11_FUNCTIONAL)
- lock HTTP sobre periodo closed → 200 {status:'success', message:'Periodo bloqueado'}
- DB: status='locked', locked_by = uid del admin real (corrige herencia NULL)
- Audit: FISCAL_CLOSING_UPDATED con record_id=uuid y user_id=actor (§19)
- Spoofing (user_id ajeno en body): IGNORADO — locked_by = sesión real (t1 P5)
