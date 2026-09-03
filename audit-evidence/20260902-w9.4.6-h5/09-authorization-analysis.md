# W9.4.6 — H-5 · FASES 7.A/7.B/7.C + 9 + 10 · Análisis de autorización

## 1. Identidad y confianza en `p_user_id`

Patrón compartido por ambas versiones (desde V2.12.9):

```sql
v_uid := CASE WHEN auth.role() = 'service_role'
              THEN COALESCE(p_user_id, auth.uid())
              ELSE auth.uid() END;
```

- **`p_user_id != auth.uid()` NO es permitido para callers no-service_role**: la función lo ignora y usa `auth.uid()` del JWT. Demostrado en vivo (P4, `raw/probes/p4_forged_v2.txt`): caller con claims `authenticated` y `p_user_id` forjado al outsider → el actor efectivo fue el uid real del claim; la reversión se atribuyó al miembro legítimo.
- **service_role + p_user_id**: patrón "act-as" intencional. La ruta runtime (`/api/reverse`) fija `p_user_id = session.user.id` desde el JWT verificado — el cliente no controla ese campo. Aun en el peor caso (service_role pasando un uuid arbitrario), el guard `has_store_access_as(p_user_id, v_tx.store_id)` rechaza si ese uuid no tiene membresía → la delegación no concede acceso cross-store (P5: tenant_admin de otra tienda → ERR_UNAUTHORIZED).
- Nota (hallazgo menor, fuera del par auditado): `auth.role()` resuelve desde claims; un cliente PostgREST no puede fabricar claims service_role sin la service key. La service key ES el límite de confianza del backend — modelo estándar Supabase.

## 2. Scope de store (7.B)

- Guard sobre `v_tx.store_id` leído de la fila de `transactions` (FIX V2.3 vigente en producción — verificado en cuerpo live, línea "-- 2. Validar acceso a la tienda").
- P5: usuario con membresía activa SOLO en tienda distinta → ERR_UNAUTHORIZED en v1 y v2. Cross-store **denegado**.
- `has_store_access_as`: admin (profiles.role='admin') → true global; si no, membresía activa. El outsider probado era `tenant_admin` (≠'admin') → correctamente tratado como no-miembro.

## 3. Tenant (7.C)

- `transactions.tenant_id` es NULL en producción (dato observado en tx objetivo) y ninguna versión lo consulta. El aislamiento real es por `store_id` vía `has_store_access_as`. No se identificó vía de cross-tenant: para afectar otra tienda se requeriría membresía activa en ella (o ser admin global, que es el rol de mayor privilegio por diseño). Sin RLS bypass explotable desde el exterior: la función es SECURITY DEFINER pero su primer acto tras leer la fila es validar membresía del caller real.
- **Conclusión: sin bypass de autorización, sin cross-store, sin actor falsificable ⇒ no procede P1.**

## 4. Superficie residual

| Superficie | Estado | Mitigación existente |
|---|---|---|
| EXECUTE anon/PUBLIC | 0 (REVOKE C2) | ACL probada (P1/P2) |
| EXECUTE authenticated | 0 (REVOKE C2) | ACL probada (P2) |
| EXECUTE service_role | concedido | necesario para /api/reverse; guard interno |
| p_user_id forjado desde browser | imposible (ruta fija session.user.id; ACL bloquea llamada directa) | conAuth + server-injected param |
| p_user_id arbitrario desde service_role | validado por guard de membresía | has_store_access_as |
