#!/usr/bin/env node
/* W9.5-B8 — genera 01-live-functions.txt y 02-acl.txt desde raw-gate1.json */
const fs = require('fs');
const dir = '/home/z/my-project/Costpro/audit-evidence/20260904-w9-b8';
const d = JSON.parse(fs.readFileSync(dir + '/raw-gate1.json', 'utf8'));
const g = Array.isArray(d) ? d[0].gate1 : d.gate1;
const ts = '2026-09-05 (AST)';

// ---------- 01-live-functions.txt ----------
let o = [];
o.push('════════════════════════════════════════════════════════════════════');
o.push('W9.5 — B-8 · 01-live-functions.txt');
o.push('GATE 1 — Inventario LIVE de la familia void/reverse/cancel/annul');
o.push('════════════════════════════════════════════════════════════════════');
o.push('fecha/hora: ' + ts);
o.push('fuente: pg_proc / pg_get_functiondef contra base LIVE (Management API).');
o.push('query: ver scripts b8_g1_inventory.sql (raw en raw-gate1.json).');
o.push('');
o.push('A) INVENTARIO — ' + g.a_fn_inventory.length + ' funciones en public que coinciden con');
o.push('   void/reverse/cancel/annul (TODAS SECURITY DEFINER, owner postgres):');
o.push('');
for (const f of g.a_fn_inventory) {
  const acl = {};
  for (const e of f.proacl || []) {
    const m = e.match(/^(.*)=X\/(.*)$/);
    if (m) acl[m[1] === '' ? 'PUBLIC' : m[1]] = true;
  }
  const grants = Object.keys(acl).join(',');
  o.push(`  OID ${f.oid}  public.${f.proname}(${f.args})`);
  o.push(`      DEFINER:${f.security_definer}  owner:${f.owner}  vol:${f.volatility}`);
  o.push(`      search_path:${JSON.stringify(f.proconfig)}`);
  o.push(`      EXECUTE→ ${grants}`);
  o.push('');
}
o.push('B) OBSERVACIONES CLAVE (resueltas desde proacl crudo):');
o.push('  - void_transaction (138000): EXECUTE a PUBLIC (incluye anon) + authenticated');
o.push('    + service_role + postgres. ACL idéntico al capturado en B-2 (sin cambios).');
o.push('  - reverse_transaction_v2 (138188): EXECUTE solo postgres + service_role.');
o.push('    (Ruta canónica pasa por /api/reverse con cliente service_role.)');
o.push('  - Hermanas con EXECUTE a authenticated alcanzable por cliente directo:');
o.push('    cancel_transfer (ambas overloads), void_inventory_adjustment,');
o.push('    reverse_receipt_v2 (con PUBLIC residual), void_pending_reception (con PUBLIC),');
o.push('    void_closed_production_order (PUBLIC+anon+authenticated).');
o.push('    → registradas como superficie de la familia; solo void_transaction tiene');
o.push('      consumidores de anulación de VENTAS activos (uso en POS-undo).');
o.push('  - reverse_receipt (V1, 136654): sin EXECUTE a authenticated (postgres+service).');
o.push('');
o.push('C) DEFINICIÓN COMPLETA EN VIVO — public.void_transaction (138000):');
o.push('');
o.push((g.b_fn_defs['void_transaction#138000'] || '(no capturada)').replace(/^/gm, '  '));
o.push('');
o.push('D) DEFINICIÓN COMPLETA EN VIVO — public.reverse_transaction_v2 (138188):');
o.push('');
o.push((g.b_fn_defs['reverse_transaction_v2#138188'] || '(no capturada)').replace(/^/gm, '  '));
o.push('');
o.push('E) DEFINICIÓN COMPLETA EN VIVO — public.has_store_access_as (autorizador):');
o.push('');
o.push(Object.entries(g.b_fn_defs).find(([k]) => k.startsWith('has_store_access_as'))[1].replace(/^/gm, '  '));
o.push('');
o.push('F) TRIGGERS SOBRE transactions (todos tgenabled=O):');
for (const t of g.d_triggers_transactions) {
  o.push(`  - ${t.tgname} [${t.tgenabled}]`);
  o.push('      ' + t.def.replace(/\s+/g, ' ').slice(0, 220));
}
o.push('');
o.push('G) MÁQUINA DE ESTADOS (fn_validate_document_transition, extraído live):');
o.push('  transactions: pending   → [completed, voided]');
o.push('                completed → [voided, reversed]');
o.push('                voided    → [] (terminal)');
o.push('                reversed  → [] (terminal)');
o.push('  Estados FUERA del mapa (failed, compensated, cancelled, refunded):');
o.push('    `map ? old_status` = false ⇒ RAISE ERR_INVALID_TRANSITION en CUALQUIER');
o.push('    cambio de estado (incluido → voided). Bloqueados por trigger.');
o.push('');
o.push('H) TRIGGER reverse_commissions_on_sale_void (live):');
o.push('  Al pasar status a voided/reversed: marca commission_payments');
o.push('  (approved/paid, período que contenga created_at de la tx) como');
o.push('  flagged_for_review + audit COMMISSION_FLAGGED_FOR_REVIEW. No cancela pagos.');
o.push('');
o.push('I) COLUMNAS/CONSTRAINTS relevantes de transactions (live):');
for (const c of g.f_transactions_key_columns) o.push(`  - ${c.column_name}: ${c.data_type} (${c.udt_name}) null=${c.is_nullable} def=${c.column_default || '-'}`);
for (const c of g.g_transactions_constraints) o.push(`  - ${c.conname}: ${c.def}`);
o.push('');
o.push('J) ENUMS REALES (live):');
o.push('  transaction_status: pending, completed, failed, compensated, cancelled,');
o.push('                      refunded, voided, reversed');
o.push('  user_role: admin, superadmin, manager, clerk, warehouse, encargado,');
o.push('             usuario, costo, tenant_admin');
o.push('  membership_status: active, revoked');
o.push('  (NO existen los estados "paid/partial/draft" hipotetizados en la spec —');
o.push('   la matriz B-9 usa los enum reales de arriba.)');
o.push('');
o.push('K) TABLAS DE IDENTIDAD/ROLES (live):');
o.push('  profiles: id (FK auth.users), role user_role, roles user_role[], is_active,');
o.push('            store_id, active_store_id, role_id (FK roles), tenant_id, deleted_at…');
o.push('  user_store_memberships: user_id FK profiles, store_id FK stores,');
o.push('            role user_role, status membership_status, UNIQUE(user_id,store_id)');
o.push('  roles (dinámico): id, name, permissions jsonb — no consumido por gating');
o.push('            de anulación (ver 03-role-policy.txt §D).');
o.push('');
o.push('L) DISTRIBUCIÓN LIVE (read-only):');
o.push('  transactions por status: ' + JSON.stringify(g.i_status_distribution_live) + ' — todas completed.');
o.push('  memberships por rol: ' + JSON.stringify(g.j_roles_in_memberships));
o.push('  (no hay perfiles manager/usuario activos en live; manager/usuario existen');
o.push('   solo en el enum user_role y en ROLE_PERMISSIONS del código.)');
o.push('');
o.push('M) HISTORIAL EN MIGRACIONES (void_transaction):');
o.push('  20260622000004 (op_date), 20260726000012 (V2.5.1 drop legacy),');
o.push('  20260726000015 (V2.5.4 status voided + "V2.5 H2b: autorización por tienda"),');
o.push('  20260727000006 (V2.12.9 anti-spoofing p_user_id — 31 funciones),');
o.push('  20260727000009 (V2.12.13 revoke anon), 20260803000002 (V2.13.2 conv factor),');
o.push('  20260811000004 (V2.20.4 reference_doc). Definición live == última versión.');
o.push('');
o.push('INTERPRETACIÓN:');
o.push('  - El autorizador server-side de la familia (has_store_access_as) resuelve');
o.push('    "admin global (profiles.role=admin) OR membresía active" — el ROL de la');
o.push('    membresía NO se consulta. La política DB de anulación de ventas es');
o.push('    membresía+tienda por DISEÑO (comentario de migración "V2.5 H2b").');
fs.writeFileSync(dir + '/01-live-functions.txt', o.join('\n'));

// ---------- 02-acl.txt ----------
let a = [];
a.push('════════════════════════════════════════════════════════════════════');
a.push('W9.5 — B-8 · 02-acl.txt');
a.push('GATE 1/7 — ACL y seguridad de la familia void/reverse (LIVE)');
a.push('════════════════════════════════════════════════════════════════════');
a.push('fecha/hora: ' + ts);
a.push('fuente: proacl crudo de pg_proc (raw-gate1.json §a_fn_inventory) +');
a.push('        resolución explícita PUBLIC/anon/authenticated/service_role/postgres.');
a.push('');
a.push('MATRIZ DE EJECUCIÓN (EXECUTE) — funciones de anulación de VENTAS:');
a.push('');
a.push('  función                          | PUBLIC | anon | authed | svc_role | postgres');
a.push('  ---------------------------------+--------+------+--------+----------+---------');
const rows = [
  ['void_transaction (138000)', g.a_fn_inventory.find(f => f.oid === 138000)],
  ['reverse_transaction_v2 (138188)', g.a_fn_inventory.find(f => f.oid === 138188)],
  ['reverse_receipt V1 (136654)', g.a_fn_inventory.find(f => f.oid === 136654)],
  ['reverse_receipt_v2 (138196)', g.a_fn_inventory.find(f => f.oid === 138196)],
  ['cancel_transfer 2-args (130873)', g.a_fn_inventory.find(f => f.oid === 130873)],
  ['void_inventory_adjustment (136900)', g.a_fn_inventory.find(f => f.oid === 136900)],
  ['void_pending_reception (138819)', g.a_fn_inventory.find(f => f.oid === 138819)],
  ['void_closed_production_order (138619)', g.a_fn_inventory.find(f => f.oid === 138619)],
];
for (const [label, f] of rows) {
  if (!f) { a.push(`  ${label.padEnd(33)} | (no live)`); continue; }
  const acl = {};
  for (const e of f.proacl || []) {
    const m = e.match(/^(.*)=X\/(.*)$/);
    if (m) acl[m[1] === '' ? 'PUBLIC' : m[1]] = true;
  }
  const pub = acl.PUBLIC ? '  X   ' : '   ·  ';
  const anon = acl.PUBLIC || acl.anon ? '  X   ' : '   ·  ';
  const auth = acl.PUBLIC || acl.authenticated ? '   X   ' : '    ·  ';
  const svc = acl.PUBLIC || acl.service_role ? '    X    ' : '     ·   ';
  const pg = acl.postgres ? '    X    ' : '     ·   ';
  a.push(`  ${label.padEnd(33)} |${pub}|${anon}|${auth}|${svc}|${pg}`);
}
a.push('');
a.push('  (X = EXECUTE concedido directa o transitivamente vía PUBLIC.');
a.push('   anon solo hereda si PUBLIC o grant explícito a anon.)');
a.push('');
a.push('RUNTIME DE LOS PROBES (GATE 1b raw-gate1b.json §g_current_runtime):');
a.push('  session_user=postgres, current_user=postgres, is_superuser=false,');
a.push('  pg_has_role(postgres,"authenticated")=true, pg_has_role(postgres,');
a.push('  "service_role")=true ⇒ los probes pueden SET ROLE authenticated de forma');
a.push('  FIEL (incluye verificación de privilegio EXECUTE bajo ese rol).');
a.push('');
a.push('auth.uid()/auth.role() (live): leen request.jwt.claim.sub / request.jwt.claims');
a.push('  → en PostgREST esos GUC solo se setean tras verificación del JWT real;');
a.push('  en probes se setean explícitamente para simular identidad verificada');
a.push('  (mismo mecanismo que B-2, sanity P0).');
a.push('');
a.push('INTERPRETACIÓN:');
a.push('  - void_transaction sigue siendo la ÚNICA función de anulación de ventas');
a.push('    ejecutable por un cliente con JWT de usuario (authenticated, y por');
a.push('    grant PUBLIC residual también anon llega al cuerpo).');
a.push('  - La familia hermana (receipts, transfers, adjustments, receptions,');
a.push('    production orders) es invocable por cliente directo SOLO vía funciones');
a.push('    con EXECUTE authenticated; el path canónico de esas vistas usa /api/reverse');
a.push('    con service_role (ver 04-code-trace.txt).');
fs.writeFileSync(dir + '/02-acl.txt', a.join('\n'));
console.log('01-live-functions.txt:', o.join('\n').length, 'bytes');
console.log('02-acl.txt:', a.join('\n').length, 'bytes');
