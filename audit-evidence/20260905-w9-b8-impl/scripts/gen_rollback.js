#!/usr/bin/env node
/**
 * W9.5-B8 MODELO C — Genera el script de ROLLBACK desde las definiciones
 * live PRE-capturadas (out_c01.json) + DROP de los helpers nuevos.
 * El rollback restaura EXACTAMENTE el estado c57e8de1.
 */
const fs = require('fs');
const live = JSON.parse(fs.readFileSync('/home/z/my-project/scripts/b8c/out_c01.json', 'utf8'));
const defs = Object.fromEntries(live.map(r => [r.fn, r.def]));

const header = `-- ============================================================================
-- W9.5 — B-8 · MODELO C — ROLLBACK (restaura estado c57e8de1 exacto)
-- NO ejecutar salvo reversión explícita de la implementación.
-- Restaura los cuerpos PRE (capturados live antes de la migración) y
-- elimina los helpers normativos. ACLs de los RPC nunca fueron tocadas
-- por la migración (CREATE OR REPLACE preserva ACL), por lo que no se
-- requieren sentencias GRANT/REVOKE aquí.
-- ============================================================================

`;

const dropHelpers = `DROP FUNCTION IF EXISTS public.can_pos_undo_transaction(uuid, uuid);
DROP FUNCTION IF EXISTS public.can_admin_reverse_transaction(uuid, uuid);

`;

const out = header + dropHelpers + defs['void_transaction'] + ';\n\n' + defs['reverse_transaction_v2'] + ';\n';
fs.writeFileSync('/home/z/my-project/Costpro/audit-evidence/20260905-w9-b8-impl/rollback_b8_modelo_c.sql', out);
console.log('OK rollback generado (' + out.length + ' bytes)');
