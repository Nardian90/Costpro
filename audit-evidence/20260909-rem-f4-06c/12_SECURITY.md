# 12_SECURITY — §18/§10 (raw: t4_security_out.txt) — ALL PASS

- S1 anon POST/GET /api/fiscal-close → 401/401 DENY
- S2 non-member (ctx authenticated, sub=00000000-…): SELECT fiscal_closings = 0 filas (RLS);
  UPDATE = 0 filas (RLS update policy)
- S3 EXECUTE denegado a authenticated (42501 permission denied) para AMBOS RPCs —
  CRÍTICO: el lock RECREADO (DROP+CREATE) no hereda EXECUTE de PUBLIC
  (REVOKE ALL FROM PUBLIC en migración, verificado en vivo)
- S4 cross-store: has_store_access_as(non-member, STORE_B)=false; close RPC sobre STORE_B
  sin membresía → ERR_UNAUTHORIZED y 0 filas creadas en STORE_B (0 estado)
- S5 propiedades POST:
  - ambos RPCs: SECDEF=true, owner=postgres, ACL postgres+service_role (sin PUBLIC)
  - search_path preservados: lock=[public], close=[public, pg_temp]
  - NINGÚN RPC referencia fiscal_period_closures
  - RLS fiscal_closings: on / no-force; triggers audit + prevent habilitados ('O')
  - tipos uuid intactos (fiscal_closings.id, audit_logs.record_id)
  - F4-06b sin regresión (audit trigger sin ::text)
- S6 identidad server-side (§10): p_user_id = session.user.id (NextAuth, servidor); el
  cliente NO puede inyectarlo (zod descarta claves desconocidas — t1 P4/P5); el RPC
  re-verifica rol admin del actor resuelto (defensa en profundidad).
