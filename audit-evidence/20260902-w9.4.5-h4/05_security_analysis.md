# W9.4.5 — H-4 | FASE 5 — SEGURIDAD DE V2 (REGLA ESPECIAL: P1)

## Veredicto
**P1 CONFIRMADO** — combinación: SECURITY DEFINER (owner postgres) + EXECUTE para
PUBLIC/anon/authenticated + guard de autorización ausente en el cuerpo vivo.

## Prueba estática
1. prosrc vivo (2201 chars): CERO referencias a auth.uid(), auth.role(),
   has_store_access_as. p_user_id se usa tal cual en created_by, reversed_by y
   audit_logs.user_id.
2. proacl: {=X/postgres (PUBLIC), authenticated=X, service_role=X, postgres=X}.
3. SECURITY DEFINER owner=postgres → RLS de receipts/products/audit_logs NO aplica
   durante la ejecución (owner exemption; el caller anon/authenticated hereda el
   contexto del owner).
4. RLS de receipts (raw/pre__h4_receipts_rls.json) NO es barrera para la RPC: la
   función lee con privilegios del owner, no del caller.
→ Un usuario authenticated (o incluso anon, por el grant PUBLIC) puede invocar la
  RPC con p_receipt_id de CUALQUIER store y p_user_id arbitrario: reversión
  cross-store + auditoría falsificada.

## Prueba dinámica (no destructiva, BEGIN/ROLLBACK, receipt inexistente)
raw/post no aplica — probe en raw/pre__h4_p1_probe.json:
  SET LOCAL ROLE authenticated + JWT simulado {role:authenticated, sub:<usuario real>}
  PERFORM public.reverse_receipt_v2(<uuid inexistente>, ...) →
  verdict = "stopped-by: ERR_RECEIPT_NOT_FOUND"
→ La ejecución llegó al SELECT del cuerpo (no hubo ningún precheck de identidad/
  autorización). P1 elevado y documentado según REGLA ESPECIAL del mandato.

## Estado de la ACL
La exposición a authenticated es requerida por el consumidor legítimo del navegador
(useVoidReception → PostgREST directo; excepción documentada F-06 en W9.4.2).
La corrección correcta es el guard a nivel función (hecho), NO revocar EXECUTE
(revocaría el flujo legítimo). ACL SIN CAMBIOS en H-4.
