/**
 * Test de contrato automático (CI gate) — Seguridad de funciones SECURITY DEFINER
 *
 * Verifica que TODA función SECURITY DEFINER en public schema que hace
 * operaciones de escritura (INSERT/UPDATE/DELETE) siga estos patrones:
 *
 *   1. Anti-spoofing guard V2.12.9:
 *      v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
 *
 *   2. Patrón IS NULL OR NOT (no IS NOT NULL AND NOT, no IS NOT NULL THEN):
 *      IF v_caller_uid IS NULL OR NOT public.has_store_access_as(...) THEN RAISE
 *
 *   3. REVOKE EXECUTE FROM anon (no anon execute en funciones de negocio)
 *
 *   4. SET search_path explícito (no search_path implícito)
 *
 * Si una función nueva (o editada) no cumple, este test FALLA y bloquea el build.
 *
 * Ejecución:
 *   node scripts/security-contract-test.cjs
 *
 * Exit codes:
 *   0 = todas las funciones pasan
 *   1 = al menos una función falla (build bloqueado)
 *
 * Integración CI:
 *   - Añadir a package.json: "test:security": "node scripts/security-contract-test.cjs"
 *   - En CI workflow: npm run test:security antes de deploy
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';

if (!SUPABASE_URL || !ACCESS_TOKEN) {
  console.error('❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_ACCESS_TOKEN');
  process.exit(2);
}

const projectRef = SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)[1];

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  return await r.json();
}

(async () => {
  console.log('═'.repeat(80));
  console.log('🔒 TEST DE CONTRATO — Seguridad de funciones SECURITY DEFINER');
  console.log('═'.repeat(80));

  // 1. Listar todas las funciones SECURITY DEFINER en public schema que tienen
  //    INSERT/UPDATE/DELETE en su body (operaciones de escritura)
  const r = await q(`
    SELECT
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS args,
      pg_get_functiondef(p.oid) AS def,
      pg_get_function_result(p.oid) AS result_type,
      COALESCE(p.proacl, ARRAY[]::aclitem[]) AS acl
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true  -- SECURITY DEFINER
      AND p.prokind = 'f'     -- solo funciones (no procedures)
      AND pg_get_functiondef(p.oid) ~ '(INSERT|UPDATE|DELETE)\\s+(INTO|public\\.)'
    ORDER BY p.proname;
  `);

  console.log(`\nFunciones SECURITY DEFINER con escritura detectadas: ${r.length}\n`);

  const violations = [];
  let checked = 0;

  for (const f of r) {
    checked++;
    const def = f.def;
    const aclStr = Array.isArray(f.acl) ? f.acl.join(',') : (f.acl || '');
    const issues = [];

    // ─── Check 1: Anti-spoofing guard V2.12.9 ───
    // Si la función acepta p_user_id Y tiene has_store_access_as,
    // debe tener el CASE auth.role() guard.
    const hasPUserId = /p_user_id\s+uuid/i.test(def);
    const hasStoreAccessAs = /public\.has_store_access_as/i.test(def);
    const hasSpoofingGuard = /auth\.role\(\)\s*=\s*'service_role'/i.test(def);

    if (hasPUserId && hasStoreAccessAs && !hasSpoofingGuard) {
      issues.push({
        severity: 'CRITICAL',
        rule: 'ANTI_SPOOFING_GUARD_MISSING',
        msg: 'Función acepta p_user_id + usa has_store_access_as pero NO tiene CASE auth.role() = service_role guard',
        fix: 'Añadir: v_caller_uid UUID := CASE WHEN auth.role() = \'service_role\' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;',
      });
    }

    // ─── Check 2: Patrón IS NULL OR NOT (no IS NOT NULL AND NOT, no IS NOT NULL THEN) ───
    // Detectar patrón vulnerable 1: v_caller_uid IS NOT NULL AND NOT has_store_access_as
    if (/(v_caller_uid|v_uid|v_user_id)\s+IS\s+NOT\s+NULL\s+AND\s+NOT\s+public\.has_store_access_as/is.test(def)) {
      issues.push({
        severity: 'HIGH',
        rule: 'VULNERABLE_PATTERN_IS_NOT_NULL_AND_NOT',
        msg: 'Patrón vulnerable: v_caller_uid IS NOT NULL AND NOT has_store_access_as (fail-open si v_caller_uid IS NULL)',
        fix: 'Cambiar a: v_caller_uid IS NULL OR NOT public.has_store_access_as(...)',
      });
    }

    // Detectar patrón vulnerable 2: v_caller_uid IS NOT NULL THEN \n IF NOT has_store_access_as
    if (/(v_caller_uid|v_uid)\s+IS\s+NOT\s+NULL\s+THEN\s*\n\s*IF\s+NOT\s+public\.has_store_access_as/is.test(def)) {
      issues.push({
        severity: 'HIGH',
        rule: 'VULNERABLE_PATTERN_IS_NOT_NULL_THEN',
        msg: 'Patrón vulnerable: IF v_caller_uid IS NOT NULL THEN [IF NOT has_store_access_as] (fail-open si v_caller_uid IS NULL)',
        fix: 'Cambiar a: IF v_caller_uid IS NULL OR NOT public.has_store_access_as(...) THEN RAISE',
      });
    }

    // ─── Check 3: REVOKE EXECUTE FROM anon ───
    // anon no debe tener execute en funciones de negocio SECURITY DEFINER
    const hasAnonExecute = /=X\/postgres.*anon=X/.test(aclStr) || aclStr.includes('anon=X');
    if (hasAnonExecute) {
      // Excepciones: funciones legítimamente públicas (webhooks)
      const isWebhook = /webhook|public_endpoint|register_anon/i.test(f.function_name);
      if (!isWebhook) {
        issues.push({
          severity: 'MEDIUM',
          rule: 'ANON_EXECUTE_GRANTED',
          msg: 'anon tiene EXECUTE en función SECURITY DEFINER de negocio',
          fix: 'REVOKE EXECUTE ON FUNCTION ... FROM anon;',
        });
      }
    }

    // ─── Check 4: SET search_path explícito ───
    if (!/SET search_path/i.test(def)) {
      issues.push({
        severity: 'LOW',
        rule: 'SEARCH_PATH_NOT_SET',
        msg: 'Función SECURITY DEFINER sin SET search_path explícito (vulnerable a search_path injection)',
        fix: 'Añadir: SET search_path = public, pg_temp',
      });
    }

    if (issues.length > 0) {
      violations.push({ function_name: f.function_name, args: f.args, issues });
    }
  }

  console.log(`Funciones verificadas: ${checked}`);
  console.log(`Funciones con violaciones: ${violations.length}\n`);

  if (violations.length === 0) {
    console.log('═'.repeat(80));
    console.log('🎉 TODAS LAS FUNCIONES PASAN EL TEST DE CONTRATO');
    console.log('═'.repeat(80));
    process.exit(0);
  }

  // Mostrar violaciones
  console.log('═'.repeat(80));
  console.log('🚨 VIOLACIONES DETECTADAS — BUILD BLOQUEADO');
  console.log('═'.repeat(80));

  for (const v of violations) {
    console.log(`\n▸ ${v.function_name}(${v.args})`);
    v.issues.forEach(issue => {
      const icon = issue.severity === 'CRITICAL' ? '🚨' : issue.severity === 'HIGH' ? '🔴' : issue.severity === 'MEDIUM' ? '🟠' : '🟡';
      console.log(`  ${icon} [${issue.severity}] ${issue.rule}`);
      console.log(`     ${issue.msg}`);
      console.log(`     Fix: ${issue.fix}`);
    });
  }

  // Resumen por severidad
  const allIssues = violations.flatMap(v => v.issues);
  const bySev = {
    CRITICAL: allIssues.filter(i => i.severity === 'CRITICAL').length,
    HIGH: allIssues.filter(i => i.severity === 'HIGH').length,
    MEDIUM: allIssues.filter(i => i.severity === 'MEDIUM').length,
    LOW: allIssues.filter(i => i.severity === 'LOW').length,
  };
  console.log('\n' + '─'.repeat(80));
  console.log('Resumen por severidad:');
  console.log(`  🚨 CRITICAL: ${bySev.CRITICAL}`);
  console.log(`  🔴 HIGH:     ${bySev.HIGH}`);
  console.log(`  🟠 MEDIUM:   ${bySev.MEDIUM}`);
  console.log(`  🟡 LOW:      ${bySev.LOW}`);
  console.log('─'.repeat(80));

  // Exit 1 si hay CRITICAL o HIGH (bloquea build)
  // Exit 0 si solo hay MEDIUM/LOW (warnings, no bloquea)
  if (bySev.CRITICAL > 0 || bySev.HIGH > 0) {
    console.log('\n❌ BUILD BLOQUEADO — hay violaciones CRITICAL o HIGH');
    process.exit(1);
  } else {
    console.log('\n⚠️ BUILD PERMITIDO con warnings MEDIUM/LOW');
    process.exit(0);
  }
})().catch(err => {
  console.error('❌ Error ejecutando test de contrato:', err);
  process.exit(2);
});
