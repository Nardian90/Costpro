#!/usr/bin/env node
/**
 * DT-03 — Backfill controlado de `david9999` (Decisión B · autorización D-3)
 * Dossier de autorización: docs/audits/evidence/20261019-dt03-matriz-acceso/BACKFILL_DAVID9999_DOSSIER.md
 *
 * RECREADO (2026-10-20) fielmente desde el dossier §5 (SQL transaccional) y §6 (reversión),
 * tras la pérdida del sandbox anterior donde vivía el original (nunca commiteado).
 *
 * Modo de uso:
 *   Dry-run (por defecto, sin escrituras):
 *     SUPABASE_ACCESS_TOKEN=... node scripts/dt03_backfill_david9999_execute.js
 *   Ejecución real (doble bandera obligatoria):
 *     EXECUTE=1 I_CONFIRM_BACKFILL_DAVID9999=YES SUPABASE_ACCESS_TOKEN=... \
 *       node scripts/dt03_backfill_david9999_execute.js
 *
 * Alcance: EXACTAMENTE 1 fila de public.profiles (david9999). Los otros 10 NULL
 * NO se tocan. La escritura es UNA transacción (UPDATE + audit_log atómico).
 *
 * NOTA de fidelidad (2026-10-20): el UUID del tenant destino se tomó VIVO de la BD
 * (5364ccf8-e6cd-4c38-aea8-b167b3b5576f, 'Default Tenant', creado 2026-08-04). El
 * literal del prompt v2 y la copia local del dossier mostraban 'b167b35b5576f'
 * (13 caracteres — errata de transcripción); el valor vivo es autoritativo y la
 * errata queda documentada en la evidencia.
 */

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = 'wthkddeleylijmonclxg';
const USER_ID = '84ef824e-8066-4efa-afc7-102918c6c982';      // david9999
const TENANT_ID = '5364ccf8-e6cd-4c38-aea8-b167b3b5576f';     // Default Tenant (vivo)
const STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';      // ENERVIDA-VITALLCONS
const ACTION = 'dt03_backfill_tenant';                         // §5 del dossier
const EXECUTE = process.env.EXECUTE === '1' && process.env.I_CONFIRM_BACKFILL_DAVID9999 === 'YES';

if (!TOKEN) {
  console.error('FATAL: falta SUPABASE_ACCESS_TOKEN');
  process.exit(2);
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Management API HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  if (Array.isArray(body) && body[0] && body[0].message && /error/i.test(String(body[0].message))) {
    throw new Error('SQL: ' + JSON.stringify(body[0]).slice(0, 300));
  }
  return Array.isArray(body) ? body : [];
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  console.log('══ DT-03 backfill david9999 — ' + (EXECUTE ? 'MODO EJECUCIÓN (doble bandera presente)' : 'DRY-RUN (sin escrituras)') + ' ══');

  // ── Las 6 precondiciones del dossier (verificación viva) ──
  const [perfil] = await query(
    `SELECT id::text, tenant_id::text, is_active, updated_at::text FROM public.profiles WHERE id='${USER_ID}'`
  );
  check('1. Perfil david9999 existe', !!perfil, perfil ? `updated_at=${perfil.updated_at}` : 'no encontrado');
  check('2. Perfil activo', perfil ? !!perfil.is_active : false);
  check('3. tenant_id AÚN NULL', perfil ? perfil.tenant_id === null : false);

  const [tenant] = await query(`SELECT id::text, name FROM public.tenants WHERE id='${TENANT_ID}'`);
  check('4. Tenant destino existe', !!tenant, tenant ? `${tenant.name} (${tenant.id})` : 'no encontrado');

  const [memb] = await query(
    `SELECT count(*)::int AS n FROM public.user_store_memberships
      WHERE user_id='${USER_ID}' AND store_id='${STORE_ID}' AND status='active'`
  );
  check('5. Membership activa demostrable en ENERVIDA-VITALLCONS', memb.n >= 1, `activas: ${memb.n}`);

  const [contradict] = await query(
    `SELECT count(*)::int AS n FROM public.user_store_memberships m
      JOIN public.stores s ON m.store_id = s.id
      WHERE m.user_id='${USER_ID}' AND m.status='active' AND s.tenant_id <> '${TENANT_ID}'`
  );
  check('6. Cero contradicciones (0 memberships activas en otros tenants)', contradict.n === 0, `otras-tenant: ${contradict.n}`);

  const [auditPrev] = await query(
    `SELECT count(*)::int AS n FROM public.audit_logs WHERE action='${ACTION}' AND record_id='${USER_ID}'`
  );
  check('7. Sin auditoría previa (idempotencia)', auditPrev.n === 0, `filas previas: ${auditPrev.n}`);

  const failed = checks.filter((c) => !c.ok);
  console.log('');
  if (failed.length > 0) {
    console.error(`❌ ${failed.length} precondición(es) FALLARON — NO se escribe nada. Detalle arriba.`);
    process.exit(1);
  }
  console.log(`✅ ${checks.length}/${checks.length} precondiciones OK`);

  if (!EXECUTE) {
    console.log('DRY-RUN COMPLETO: 0 escrituras. Para ejecutar: EXECUTE=1 I_CONFIRM_BACKFILL_DAVID9999=YES');
    process.exit(0);
  }

  // ── Transacción única §5 (UPDATE + audit_log atómicos) ──
  const TX = `BEGIN;
UPDATE public.profiles
   SET tenant_id = '${TENANT_ID}',
       updated_at = now()
 WHERE id = '${USER_ID}'
   AND tenant_id IS NULL;
SELECT (SELECT count(*)::int FROM public.profiles WHERE id='${USER_ID}' AND tenant_id='${TENANT_ID}') AS perfil_ok,
       (SELECT count(*)::int FROM public.profiles WHERE tenant_id IS NULL) AS nulls_restantes;
INSERT INTO public.audit_logs (user_id, table_name, record_id, action, old_data, new_data, metadata, created_at)
SELECT NULL, 'profiles', '${USER_ID}', '${ACTION}',
       '{"tenant_id": null}'::jsonb,
       '{"tenant_id": "${TENANT_ID}"}'::jsonb,
       '{"authorized_by":"propietario (D-3, prompt v2 2026-10-20)","evidence":"docs/audits/evidence/20261019-dt03-matriz-acceso/BACKFILL_DAVID9999_DOSSIER.md","reason":"pertenencia demostrable por membership activa en ENERVIDA-VITALLCONS (tenant Default)","scope":"exactly 1 profile","uuid_note":"tenant destino verificado vivo; literal del prompt con errata de 1 char documentada"}'::jsonb,
       now()
 WHERE NOT EXISTS (SELECT 1 FROM public.audit_logs
                   WHERE action = '${ACTION}' AND record_id = '${USER_ID}');
COMMIT;`;

  console.log('→ Ejecutando transacción (UPDATE + audit_log)…');
  const rows = await query(TX); // devuelve el SELECT intermedio
  console.log('→ Resultado en transacción:', JSON.stringify(rows));

  // ── Verificación post (persistente) ──
  const [post] = await query(
    `SELECT tenant_id::text, updated_at::text FROM public.profiles WHERE id='${USER_ID}'`
  );
  const [auditRow] = await query(
    `SELECT action, created_at::text FROM public.audit_logs WHERE action='${ACTION}' AND record_id='${USER_ID}' ORDER BY created_at DESC LIMIT 1`
  );
  const [nullCount] = await query(`SELECT count(*)::int AS n FROM public.profiles WHERE tenant_id IS NULL`);
  const okPost = post && post.tenant_id === TENANT_ID && nullCount.n === 10 && auditRow;
  console.log(`  perfil tenant_id: ${post ? post.tenant_id : '?'} (esperado ${TENANT_ID})`);
  console.log(`  perfiles NULL restantes: ${nullCount.n} (esperado 10)`);
  console.log(`  audit_log: ${auditRow ? auditRow.action + ' @ ' + auditRow.created_at : 'NO ENCONTRADO'}`);
  if (!okPost) {
    console.error('❌ Verificación post FALLÓ — revisar manualmente; reversión disponible en dossier §6.');
    process.exit(1);
  }
  console.log('✅ BACKFILL COMPLETO Y VERIFICADO (transaccional, auditado, reversible vía dossier §6).');
})().catch((e) => {
  console.error('FATAL: ' + e.message);
  process.exit(1);
});
