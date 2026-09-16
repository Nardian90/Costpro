#!/usr/bin/env node
/**
 * f2bug-gen-migration.cjs — REM-R2-F2BUG-FIX · generador determinista
 *
 * Fuente: captura LIVE congelada de este ciclo (f2bug-pre-live.json →
 * get_transfers.def, byte-igual al congelado POST-R2 verificado por
 * drift-check 8/8).
 *
 * Único cambio: la comparación rota
 *     AND (p_status IS NULL OR t.status = p_status)          -- enum = text → 42883
 * se sustituye por
 *     AND (p_status IS NULL OR t.status::text = p_status)    -- text = text → OK
 * (fix recomendado documentado en 04_R2-REMEDIATION-EXECUTION.md §5).
 *
 * TODO lo demás queda byte-idéntico: guard REM-R2-READ (auth.role() +
 * NULL-reject + has_store_access + 42501), comentario, ACL, firma,
 * secdef, volatility, config, owner. Sin DROP/GRANT/REVOKE.
 *
 * Self-checks (exit ≠ 0 si alguno falla):
 *   S1: exactamente 1 ocurrencia de la línea rota en el def
 *   S2: el reemplazo produce exactamente 1 ocurrencia del ::text
 *   S3: guard intacto tras el reemplazo (4 sondas)
 *   S4: diff de longitud = +6 chars ('::text'), único delta
 *   S5: normalizando el ::text añadido se recupera el def original byte-a-byte
 *   S6: resto de líneas idénticas (diff línea a línea = 1 línea)
 */
const fs = require('fs');

const cap = JSON.parse(fs.readFileSync('/home/z/my-project/scripts/f2bug-pre-live.json', 'utf8'));
const src = cap.get_transfers.def.replace(/\r?\n$/, '');

const BROKEN = 'AND (p_status IS NULL OR t.status = p_status)';
const FIXED  = 'AND (p_status IS NULL OR t.status::text = p_status)';

// S1
const occ = src.split(BROKEN).length - 1;
if (occ !== 1) { console.error(`S1 FAIL: ${occ} ocurrencias de la línea rota (esperaba 1)`); process.exit(1); }
console.log('S1 PASS: exactamente 1 ocurrencia de la comparación rota');

// S2
const out = src.replace(BROKEN, FIXED);
if (out.split(FIXED).length - 1 !== 1) { console.error('S2 FAIL: reemplazo no único'); process.exit(1); }
console.log('S2 PASS: reemplazo único aplicado');

// S3
const guardProbes = ["auth.role() <> 'service_role'", 'p_store_id IS NULL', 'public.has_store_access(p_store_id)', "ERRCODE = '42501'"];
for (const p of guardProbes) {
  if (!out.includes(p)) { console.error(`S3 FAIL: guard pierde sonda ${p}`); process.exit(1); }
}
console.log('S3 PASS: guard REM-R2-READ intacto (4/4 sondas)');

// S4
if (out.length - src.length !== FIXED.length - BROKEN.length) { console.error('S4 FAIL: delta de longitud inesperado'); process.exit(1); }
console.log(`S4 PASS: delta de longitud = ${out.length - src.length} chars (solo '::text')`);

// S5
const round = out.replace(FIXED, BROKEN);
if (round !== src) { console.error('S5 FAIL: reversión no byte-idéntica'); process.exit(1); }
console.log('S5 PASS: reversión del cast recupera el def original byte-a-byte');

// S6
const a = src.split('\n'), b = out.split('\n');
const diffs = [];
for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) diffs.push(i);
if (diffs.length !== 1 || !a[diffs[0]].includes(BROKEN) || !b[diffs[0]].includes(FIXED)) {
  console.error('S6 FAIL: diffs de línea inesperados:', diffs); process.exit(1);
}
console.log(`S6 PASS: diff línea a línea = 1 (línea ${diffs[0] + 1}, solo la comparación de estado)`);
console.log('  PRE :', a[diffs[0]].trim());
console.log('  POST:', b[diffs[0]].trim());

const header = `-- 20260916000008_rem_f2bug_transfers_status_cast.sql
-- REM-R2-F2BUG-FIX · ciclo separado aprobado por el propietario
--
-- F2-BUG (preexistente, documentado en
-- audit-evidence/R2-SECDEF-READ-SURFACE/04_R2-REMEDIATION-EXECUTION.md §5):
-- get_transfers era INEJECUTABLE en producción —
--   ERROR 42883: operator does not exist: transfer_status = text
-- el cuerpo comparaba t.status (enum transfer_status) con p_status (text);
-- PostgreSQL no define el operador enum = text → fallo de planificación en
-- TODA llamada (con cualquier p_status, incluido NULL). Reproducido por SQL
-- directo y por PostgREST (service_role) en la fase R2-EXEC.
--
-- FIX (1 línea, recomendado en §5): t.status::text = p_status.
--   - p_status NULL → corta a TRUE (contrato NULL=todos los estados, intacto)
--   - p_status sin etiqueta válida → sin filas (nunca error)
--   - el guard REM-R2-READ (auth.role() + NULL-reject + has_store_access +
--     42501) queda BYTE-IDÉNTICO; firma, secdef, volatility, config, owner,
--     ACL: sin cambios. Sin DROP/GRANT/REVOKE.
--
-- Verificación: staging efímero PG17 (REPRO 42883 pre → OK post + T1-T7 +
-- filtro por estado sobre enum real byte-exacto) + verificación LIVE POST.
-- Rollback function-specific: restaurar el cuerpo PRE congelado en
-- scripts/f2bug-pre-live.json (get_transfers.def).

`;

const mig = header + out + ';\n';
const dest = '/home/z/my-project/Costpro/supabase/migrations/20260916000008_rem_f2bug_transfers_status_cast.sql';
fs.writeFileSync(dest, mig);
console.log('OK →', dest, `(${mig.length} bytes)`);
