# 02_OF1_FORENSICS — wiring ruta→RPC lock_fiscal_period (§3)

## Firma real del RPC (raw: out_q01_forensics.txt s01/s02)
lock_fiscal_period(p_store_id uuid, p_year integer, p_month integer) RETURNS jsonb
- SECURITY DEFINER, search_path='public', owner=postgres
- ACL: postgres=X/postgres,service_role=X/postgres — EXECUTE REVOCADO a authenticated
  por 20260902200923_w9_f06_c2_hardening.sql [C2-B] (REVOKE authenticated; GRANT service_role)
- Cuerpo: check admin vía `SELECT role FROM profiles WHERE id = auth.uid()`;
  UPDATE ... SET status='locked', locked_by=auth.uid() WHERE ... status='closed';
  ERR_ADMIN_ONLY / ERR_NOT_CLOSED.

## Cómo construye la llamada la ruta (src/app/api/fiscal-close/route.ts:75-80)
```ts
const { data, error } = await supabase.rpc(rpcName, {
  p_store_id: parsed.data.store_id,
  p_user_id: session.user.id,   // ← identidad server-side (NextAuth session), NO del body
  p_year: parsed.data.year,
  p_month: parsed.data.month,
});
```
- rpcName = 'lock_fiscal_period' para action='lock' (requiere session.user.role==='admin', línea 71)
- Cliente: getSupabaseAdminSafe() (service_role) → auth.uid() = NULL dentro del RPC.
- zod closeSchema (líneas 15-20): {store_id, year 1-12, month, action} — user_id NO es campo
  aceptado; claves desconocidas se descartan → el cliente NO controla la identidad.

## Demostración del mismatch (sin supuestos)
1. Firma real: 3 parámetros (arriba).
2. Llamada ruta: 4 argumentos nombrados (p_store_id, p_user_id, p_year, p_month).
3. PostgREST no resuelve la función → HTTP 500 (reproducido: 03_OF1_PRE_HTTP).

## Cadena causal histórica (migraciones, evidencia en 05)
- v1_2 (20260726000002): lock con auth.uid() — válido bajo EXECUTE authenticated.
- w9_f06_c2 (20260902200923): EXECUTE solo service_role → auth.uid() queda estructuralmente
  NULL para el único rol con permiso → el check admin fallaría SIEMPRE incluso con firma correcta.
- El defecto OF-1 = firma insuficiente para el contexto de ejecución endurecido.

## Contrato canónico aplicable (decisión §5/§10)
Patrón anti-spoofing v2_12_9_spoofing_p_user_id.sql (aplicado a 31 RPCs del dominio,
incl. close_fiscal_period): `v_uid := CASE WHEN auth.role()='service_role' THEN
COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END` — identidad server-side inyectada
solo por código servidor; la ruta la toma de la sesión NextAuth.
