#!/usr/bin/env node
/**
 * r2-gen-migrations.cjs — REM-R2-READ-EXEC · Generador determinista de migraciones
 *
 * Genera, desde la captura LIVE CONGELADA de prep (03_prep-live-capture.json):
 *   20260916000005_rem_r2_a_high_read_guards.sql   (F1 get_cash_closures, F2 get_transfers)
 *   20260916000006_rem_r2_b_medium_read_guards.sql (F3a-e)
 *   20260916000007_rem_r2_c_low_read_guards.sql    (F4a, F4b)
 *
 * Reglas (02_REMEDIATION-PREP.md ROLLBACK PLAN):
 *   - cuerpo = LIVE byte-a-byte + guard insertado tras el primer BEGIN
 *   - EOL del cuerpo preservado (get_low_stock_count es CRLF/mixto; resto LF)
 *   - sin DROP, sin ALTER OWNER, sin GRANT/REVOKE, sin tocar has_store_access
 *   - ACL/firma/owner/volatilidad/search_path SIN CAMBIOS
 *
 * Ajuste estructural documentado (PREP->EXEC):
 *   - F4b get_low_stock_count es LANGUAGE sql (el prep lo asumió plpgsql).
 *     Un guard con RAISE exige plpgsql → conversión LANGUAGE sql→plpgsql con
 *     el SELECT original byte-idéntico (CRLF incluido) envuelto en RETURN (...).
 *
 * Self-checks:
 *   S1 guard presente exactamente 1 vez por función
 *   S2 plpgsql: generado menos bloque guard == def original byte-a-byte
 *      sql->plpgsql: SELECT interno del RETURN == SELECT original byte-a-byte (trim)
 *   S3 prólogo idéntico (salvo LANGUAGE sql→plpgsql en F4b)
 *   S4 cabecera CREATE OR REPLACE FUNCTION public.<fn>( intacta
 * Exit 1 si cualquier check falla.
 */
const fs = require('fs');

const CAP = JSON.parse(fs.readFileSync(
  '/home/z/my-project/Costpro/audit-evidence/R2-SECDEF-READ-SURFACE/03_prep-live-capture.json', 'utf8'));

const GUARD_LINES = [
  '-- REM-R2-READ: authorization barrier (RLS is bypassed by SECURITY DEFINER).',
  '-- service_role keeps its trusted internal capability; human callers must',
  '-- hold active access (membership or global admin) on the requested store.',
  '-- NULL p_store_id is rejected: the legacy NULL=ALL-STORES path is not a',
  '-- legitimate capability (REM-R2-READ-PREP FASE 4, decision A).',
  "IF auth.role() <> 'service_role' THEN",
  '  IF p_store_id IS NULL THEN',
  "    RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: NULL' USING ERRCODE = '42501';",
  '  END IF;',
  '  IF NOT public.has_store_access(p_store_id) THEN',
  "    RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: %', p_store_id USING ERRCODE = '42501';",
  '  END IF;',
  'END IF;',
];
function guardBlock(indent) {
  return GUARD_LINES.map(s => ' '.repeat(indent) + s).join('\n');
}

// primer BEGIN a nivel de sentencia (EOL-agnóstico, indent arbitrario)
function firstBodyBegin(def) {
  const marker = 'AS $function$';
  const markerEnd = def.indexOf(marker) + marker.length;
  const re = /\r?\n([ ]*)BEGIN\r?\n/g;
  re.lastIndex = markerEnd;
  const m = re.exec(def);
  if (!m) throw new Error('main BEGIN not found');
  return { markerEnd, insertAt: m.index + m[0].length, indent: m[1].length };
}

function transformPlpgsql(name) {
  const def = CAP.funcs[name][0].def;
  const { insertAt, indent } = firstBodyBegin(def);
  const injection = guardBlock(indent + 2);
  const generated = def.slice(0, insertAt) + injection + '\n' + def.slice(insertAt);
  return { original: def, generated, kind: 'plpgsql', injected: injection };
}

function transformSqlToPlpgsql(name) {
  const def = CAP.funcs[name][0].def;
  if (!/^ LANGUAGE sql\r?$/m.test(def)) throw new Error(name + ': expected LANGUAGE sql');
  const first$ = def.indexOf('$function$');
  const last$ = def.lastIndexOf('$function$');
  if (first$ < 0 || last$ <= first$) throw new Error(name + ': dollar-quote markers not found');
  const afterFirst = first$ + '$function$'.length;
  const eolAfterMarker = def.slice(afterFirst).match(/^\r?\n/);
  if (!eolAfterMarker) throw new Error(name + ': unexpected content after first $function$');
  const bodyStart = afterFirst + eolAfterMarker[0].length;
  const origInner = def.slice(bodyStart, last$).replace(/[;\s]+$/, ''); // sin ';' final ni whitespace de cola (indent original preservado)

  let header = def.slice(0, bodyStart).replace(/^ LANGUAGE sql\r?$/m, ' LANGUAGE plpgsql');
  const generated =
    header +
    'BEGIN\n' +
    guardBlock(2) +
    '\n\n  RETURN (\n' + origInner + '\n  );\nEND\n$function$';
  return { original: def, generated, kind: 'sql->plpgsql', origInner };
}

const GROUPS = [
  {
    file: '20260916000005_rem_r2_a_high_read_guards.sql',
    title: 'R2-A — HIGH: row-level financial reads (NULL=ALL stores eliminated)',
    funcs: ['get_cash_closures', 'get_transfers'],
  },
  {
    file: '20260916000006_rem_r2_b_medium_read_guards.sql',
    title: 'R2-B — MEDIUM: per-store reads (cross-store UUID probe eliminated)',
    funcs: [
      'get_store_analytics_advanced',
      'get_sales_since_last_closure',
      'get_paginated_products',
      'get_products_for_reception',
      'get_product_stock_ledger_paginated',
    ],
  },
  {
    file: '20260916000007_rem_r2_c_low_read_guards.sql',
    title: 'R2-C — LOW: global aggregates (NULL=ALL stores eliminated)',
    funcs: ['get_daily_expenses_aggregated', 'get_low_stock_count'],
  },
];

const OUTDIR = '/home/z/my-project/Costpro/supabase/migrations';
let failures = 0;
const summary = {};

for (const g of GROUPS) {
  const parts = [
    `-- =====================================================================`,
    `-- REM-R2-READ-EXEC — ${g.title}`,
    `--`,
    `-- Findings: audit-evidence/R2-SECDEF-READ-SURFACE/01_FINDINGS.md`,
    `-- Design:   audit-evidence/R2-SECDEF-READ-SURFACE/02_REMEDIATION-PREP.md`,
    `--           (FASE 3: Modelo A uniforme · FASE 7: guard spec · FASE 4: NULL -> 42501)`,
    `--`,
    `-- Each function is SECURITY DEFINER (RLS bypass) with EXECUTE granted to`,
    `-- authenticated and NO in-body authorization: any authenticated user could`,
    `-- pass an arbitrary store UUID (or NULL = ALL stores) and read cross-tenant`,
    `-- data. Guard = precedent 20260916000004 (get_batch_store_daily_kpis):`,
    `-- auth.role() <> 'service_role' -> NULL reject + public.has_store_access(p_store_id)`,
    `-- -> SQLSTATE 42501 ERR_UNAUTHORIZED_STORE. Bodies are byte-identical to`,
    `-- LIVE (frozen in 03_prep-live-capture.json) except the inserted guard.`,
    `-- No ACL, signature, owner, volatility or search_path changes. No GRANT/REVOKE.`,
    `-- Exception (documented): get_low_stock_count LANGUAGE sql -> plpgsql to host`,
    `-- the guard; its SELECT is preserved byte-identical inside RETURN (...).`,
    `-- =====================================================================`,
    ``,
  ];
  for (const f of g.funcs) {
    const t = f === 'get_low_stock_count' ? transformSqlToPlpgsql(f) : transformPlpgsql(f);
    const meta = CAP.funcs[f][0];
    parts.push(`-- ---- ${f} (${meta.signature}) · transform: ${t.kind} ----`);
    parts.push(t.generated.replace(/\r?\n$/, '') + ';');
    parts.push('');

    // ── Self-checks ──
    let ok = true;
    // S1
    const nGuards = (t.generated.match(/REM-R2-READ: authorization barrier/g) || []).length;
    if (nGuards !== 1) { console.error(`  S1 FAIL ${f}: ${nGuards} guards`); ok = false; }
    // S2
    if (t.kind === 'plpgsql') {
      const rebuilt = t.generated.slice(0, t.generated.lastIndexOf('$function$'));
      const stripped = rebuilt.replace(guardBlock(firstBodyBegin(rebuilt).indent + 2) + '\n', '');
      const origNoTail = t.original.slice(0, t.original.lastIndexOf('$function$'));
      if (stripped !== origNoTail) { console.error(`  S2 FAIL ${f}: generado-guard != original`); ok = false; }
    } else {
      const m2 = t.generated.match(/RETURN \(\n([\s\S]*)\n  \);\nEND/);
      if (!m2 || m2[1] !== t.origInner) { console.error(`  S2 FAIL ${f}: SELECT interno != original`); ok = false; }
    }
    // S3 prólogo
    const protoO = t.original.split('$function$')[0];
    const protoG = t.generated.split('$function$')[0];
    if (t.kind === 'plpgsql' && protoO !== protoG) { console.error(`  S3 FAIL ${f}: prólogo alterado`); ok = false; }
    if (t.kind === 'sql->plpgsql' && protoO.replace(/^ LANGUAGE sql\r?$/m, ' LANGUAGE plpgsql') !== protoG) {
      console.error(`  S3 FAIL ${f}: prólogo alterado más allá de LANGUAGE`); ok = false;
    }
    // S4 cabecera
    if (!t.generated.startsWith(`CREATE OR REPLACE FUNCTION public.${f}(`)) {
      console.error(`  S4 FAIL ${f}: cabecera inesperada`); ok = false;
    }
    if (!ok) failures++;
    summary[f] = { kind: t.kind, bytes_before: t.original.length, bytes_after: t.generated.length, selfcheck: ok ? 'PASS' : 'FAIL' };
    console.log(`  ${f}: ${t.kind} · ${t.original.length}B → ${t.generated.length}B · selfcheck ${ok ? 'PASS' : 'FAIL'}`);
  }
  const out = parts.join('\n');
  fs.writeFileSync(`${OUTDIR}/${g.file}`, out);
  console.log(`✅ ${g.file} (${out.length} bytes)`);
}

fs.writeFileSync('/home/z/my-project/scripts/r2-gen-summary.json', JSON.stringify(summary, null, 1));
console.log('\nSELF-CHECK FAILURES:', failures);
if (failures > 0) process.exit(1);
console.log('Generación OK — migraciones en', OUTDIR);
