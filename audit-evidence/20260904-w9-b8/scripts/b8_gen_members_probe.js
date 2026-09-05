#!/usr/bin/env node
/* W9.5-B8 — genera b8_probes_members.sql: P1/P2/P3 para 7 roles (una request) */
const fs = require('fs');

const U = {
  admin:     'b8b00000-0000-4000-8000-000000000001',
  manager:   'b8b00000-0000-4000-8000-000000000002',
  encargado: 'b8b00000-0000-4000-8000-000000000003',
  clerk:     'b8b00000-0000-4000-8000-000000000004',
  warehouse: 'b8b00000-0000-4000-8000-000000000005',
  usuario:   'b8b00000-0000-4000-8000-000000000006',
  costo:     'b8b00000-0000-4000-8000-000000000007',
};
const roles = Object.keys(U).filter(r => r !== 'admin'); // admin global se prueba en request aparte (P5)
const TX_OWN   = r => `b8d00000-0000-4000-8000-00000000a00${{manager:2,encargado:3,clerk:4,warehouse:5,usuario:6,costo:7}[r]}`;
const TX_OTHER = r => `b8d00000-0000-4000-8000-00000000b00${{manager:2,encargado:3,clerk:4,warehouse:5,usuario:6,costo:7}[r]}`;
const TX_B     = 'b8d00000-0000-4000-8000-00000000b010';

let s = [];
s.push(`-- W9.5-B8 · GATE 7 — Probes P1/P2/P3 por rol (miembros de STORE_A, admin global excluido)
-- Identidad simulada: SET ROLE authenticated + request.jwt.claims (mismo mecanismo B-2).
CREATE TEMP TABLE b8_log(probe text, outcome text, detail jsonb);
GRANT INSERT, SELECT ON b8_log TO authenticated;
`);

for (const r of roles) {
  s.push(`-- ══════ ROL ${r} (uid ${U[r]}) ══════`);
  s.push(`SET ROLE authenticated;`);
  s.push(`SET request.jwt.claims = '{"sub":"${U[r]}","role":"authenticated"}';`);
  s.push(`SET request.jwt.claim.sub = '${U[r]}';`);
  s.push(`SET request.jwt.claim.role = 'authenticated';`);
  // P1 propia venta
  s.push(`DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('${TX_OWN(r)}', 'b8-P1-${r}', now(), NULL);
  INSERT INTO b8_log VALUES('P1_${r}','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P1_${r}','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;`);
  // P2 venta ajena misma tienda
  s.push(`DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('${TX_OTHER(r)}', 'b8-P2-${r}', now(), NULL);
  INSERT INTO b8_log VALUES('P2_${r}','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P2_${r}','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;`);
  // P3 otra tienda
  s.push(`DO $p$
DECLARE v jsonb;
BEGIN
  v := public.void_transaction('${TX_B}', 'b8-P3-${r}', now(), NULL);
  INSERT INTO b8_log VALUES('P3_${r}','SUCCESS', to_jsonb(v));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO b8_log VALUES('P3_${r}','DENIED', jsonb_build_object('err', SQLERRM, 'code', SQLSTATE));
END $p$;`);
  s.push(`RESET ROLE;`);
  // Captura post-estado como postgres (RLS bypass) para las 3 txs del rol
  for (const [pn, tx] of [['P1', TX_OWN(r)], ['P2', TX_OTHER(r)], ['P3', TX_B]]) {
    s.push(`INSERT INTO b8_log
SELECT '${pn}_${r}_POST','STATE', jsonb_build_object(
  'tx_status', t.status,
  'void_reason', t.void_reason,
  'movements_of_tx', (SELECT count(*) FROM public.stock_movements m WHERE m.notes = '${tx}'),
  'audit', (SELECT jsonb_build_object('user_id', a.user_id, 'metadata', a.metadata)
            FROM public.audit_logs a WHERE a.record_id = '${tx}' AND a.action='VOID_SALE'
            ORDER BY a.created_at DESC LIMIT 1))
FROM public.transactions t WHERE t.id = '${tx}';`);
  }
}
s.push(`SELECT coalesce(jsonb_agg(row_to_json(b8_log) ORDER BY probe), '[]'::jsonb) AS log FROM b8_log;`);
fs.writeFileSync('/home/z/my-project/scripts/b8_probes_members.sql', s.join('\n'));
console.log('generado b8_probes_members.sql,', s.length, 'líneas');
