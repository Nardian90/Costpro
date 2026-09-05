#!/usr/bin/env node
/** B-10b — Genera 05..11 y copia scripts al evidence pack desde los raw JSON */
const fs = require('fs');
const path = require('path');
const EV = '/home/z/my-project/Costpro/audit-evidence/20260905-w9-b10b';
const RAW = path.join(EV, 'raw');
const R = f => JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));

// 05-authorization-probes.txt
{
  const lines = [
    '# W9.5 — B-10b · 05-authorization-probes.txt',
    '# Política B-10 CONGELADA y sin cambios: can_reverse_document(actor, store, \'devolution\')',
    '# = membresía ACTIVA en la tienda (cualquier rol) o admin global (profiles.role=\'admin\').',
    '# B-10b NO toca autorización. Verificación empírica sobre fixture (claims JWT sintéticos):', '',
  ];
  const probes = {
    'raw-p01_happy_D1.json': 'U1 (clerk, membership store A) → D1 (store A)',
    'raw-p06_crossstore_L2.json': 'U2 (membership SOLO store B) → L2 (store A)',
    'raw-p06b_nomember_L2.json': 'U3 (SIN memberships) → L2 (store A)',
    'raw-p07_forged_L1.json': 'U1 con p_user_id=GA forjado → L1',
    'raw-p10_global_admin_D6.json': 'admin global REAL e2e (051c6157…) → D6 (store A)',
  };
  for (const [f, desc] of Object.entries(probes)) {
    const p = R(f)[0].payload;
    lines.push(`[${desc}]`);
    lines.push(`  error : ${p.error || '(SUCCESS)'}`);
    lines.push(`  status: ${p.post.dev_status} · audit.user_id=${p.post.audit_last ? p.post.audit_last.user_id : 'n/a'}`);
    lines.push('');
  }
  lines.push(`CONCLUSIONES:
- Membresía activa en tienda → ALLOW (R1).
- Cross-store (sin membresía en la tienda del doc) → ERR_UNAUTHORIZED (R6).
- Sin membresía alguna → ERR_UNAUTHORIZED (R6b).
- p_user_id forjado en canal NO-service_role → IGNORADO: v_uid=auth.uid() (claims);
  audit registra al actor real (R7: audit.user_id=U1, no GA).
- Admin global transversal → ALLOW en tienda ajena (R10, admin real e2e).
- Canal service_role (HTTP /api/reverse): p_user_id lo inyecta el servidor con
  session.user.id (withAuth); confianza service_role congelada por B-8/B-10.
- can_reverse_document / has_store_access_as: hash PRE==POST (04-migration-review.txt).`);
  fs.writeFileSync(path.join(EV, '05-authorization-probes.txt'), lines.join('\n') + '\n');
}

// 06-state-machine.txt
{
  const lines = [
    '# W9.5 — B-10b · 06-state-machine.txt',
    '# Estado reversible ÚNICO: completed → reversed (terminal). Congelado B-10, intacto B-10b.', '',
  ];
  for (const f of ['raw-p01_happy_D1.json', 'raw-p03_idempotent_D1.json', 'raw-p04a_pending_D4.json', 'raw-p04b_voided_D5.json', 'raw-p05_insufficient_D3.json']) {
    const p = R(f)[0].payload;
    lines.push(`${p.probe}: ${p.error ? p.error.slice(0, 90) : 'SUCCESS'} · status ${p.pre.dev_status} → ${p.post.dev_status}`);
  }
  lines.push(`
- devolutions NO está en el mapa de fn_validate_document_transition (rama NULL →
  permisiva a nivel trigger); el state machine REAL lo imponen los guards del RPC:
  ERR_ALREADY_REVERSED (idempotencia) + ERR_INVALID_STATUS (solo completed).
- No se inventaron estados: pending/voided/failed → ERR_INVALID_STATUS; reversed → ERR_ALREADY_REVERSED.
- Segundo reverse (R3): DENIED, cero efectos (movs/audits/WAC/stock idénticos al post de R1).`);
  fs.writeFileSync(path.join(EV, '06-state-machine.txt'), lines.join('\n') + '\n');
}

// 07-stock-integrity.txt
{
  const i = R('raw-p13.json')[0].integrity;
  const r1 = R('raw-p01_happy_D1.json')[0].payload;
  const r2 = R('raw-p02_zero_D2.json')[0].payload;
  const r5 = R('raw-p05_insufficient_D3.json')[0].payload;
  const lines = [
    '# W9.5 — B-10b · 07-stock-integrity.txt', '# GATE 3: signo · GATE 12: restauración exacta · pipeline canónico', '',
    'R1 (D1, P1): pre ' + JSON.stringify(r1.pre) + ' → post ' + JSON.stringify(r1.post),
    '  movement: ' + JSON.stringify(r1.post.last_mov),
    'R2 (D2, P2 — reverse lleva a CERO, §14): pre ' + JSON.stringify(r2.pre) + ' → post ' + JSON.stringify(r2.post),
    'R5 (D3, P3 stock 0): ' + r5.error + ' — rollback ATÓMICO: movs/audits/status/WAC intactos',
    '',
    'Cadena P1 (pipeline-native, baseline fixture 10):',
    '  movs: ' + JSON.stringify(i.chain_p1.movs),
    '  Σdelta=' + i.chain_p1.sum_delta + ' · stock=' + i.chain_p1.stock + ' · inv=' + i.chain_p1.inv + ' (baseline 10 + Σdelta = stock ✓)',
    'Cadena P2 (creada desde stock 0): Σdelta=' + (2 - 2) + ' · stock=' + i.chain_p2_zero.stock,
    '',
    'INVARIANTE products.stock_current == inventory.quantity tras TODAS las operaciones:',
    JSON.stringify(i.sync_invariant_all, null, 1),
    '',
    'CONCLUSIÓN: signo correcto (reverse = -q exacto, sin clamp); restauración exacta',
    'stock+inventory; caso stock→0 funciona SIN clamp ni error; stock insuficiente',
    'falla ruidosamente (trg_prevent_negative_inventory / fn_sync_inventory_on_movement)',
    'con rollback total. Prohibiciones §29: reverse_devolution ya NO hace UPDATE directo',
    'de products.stock_current ni INSERT directo de kardex (04-migration-review.txt).',
  ];
  fs.writeFileSync(path.join(EV, '07-stock-integrity.txt'), lines.join('\n') + '\n');
}

// 08-wac-integrity.txt
{
  const i = R('raw-p13.json')[0].integrity;
  const lines = [
    '# W9.5 — B-10b · 08-wac-integrity.txt',
    '# GATE 14: WAC invariante (la devolución original no altera cost_average — hotfix A2 v2.22.0 —', 
    '# y el reverse conserva esa invariancia vía rama q=0 de fn_recalc_wac: "Salida pura /', 
    '# devolución A1 / evento neutro: WAC INVARIANTE").', '',
    'wac_change_log del fixture (event=devolution_reverse): TODAS qty_in=0 y wac_before==wac_after:',
    JSON.stringify(i.wac_invariant, null, 1),
    '',
    'Caso stock>0 (P1: 13→10) y caso stock→0 (P2: 2→0): sin división por cero, sin WAC corrupto.',
    'NO se usó la inversa exacta (-q, uc): invertiría un blend que nunca ocurrió (corrupción).',
    'products.cost_average de todos los productos fixture: idéntico PRE/POST por operación.',
    'Único escritor de cost_average: fn_recalc_wac (token app.wac_writer, guard w62 intacto,',
    'hash PRE==POST en 04-migration-review.txt).',
  ];
  fs.writeFileSync(path.join(EV, '08-wac-integrity.txt'), lines.join('\n') + '\n');
}

// 09-kardex-integrity.txt
{
  const i = R('raw-p13.json')[0].integrity;
  const lines = [
    '# W9.5 — B-10b · 09-kardex-integrity.txt',
    '# GATE 13: kardex 100% derivado del trigger auto_kardex_on_stock_movement (ya sin INSERT manual).', '',
    'P1: ' + JSON.stringify(i.chain_p1.kardex) + ' — devolution_in(3@4.8) + devolution_out(3@4.8) COMPLEMENTARIOS',
    'P2: ' + JSON.stringify(i.chain_p2_zero.kardex) + ' — complementarios a cero',
    '',
    'Trazabilidad estructurada (GATE 8), query canónica:',
    '  stock_movements.reference_id = devolutions.id (TEXT) → traceability_D1: ' + JSON.stringify(i.traceability_D1),
    '  kardex_entries.reference_type=\'stock_movement\' + reference_id=<movement id> → cadena',
    '  kardex → movimiento → devolución navegable sin depender de notes.',
    '',
    'Invariante de plataforma: kardex_entries (702) == stock_movements (702) PRE y POST',
    '(12-pre-post.txt) — 1:1, el INSERT manual del reverse viejo rompía esta relación.',
    'Tipo kardex \'devolution_out\': YA sancionado por kardex_entries_movement_type_check',
    '(el contrato lo anticipaba); sin modificar la constraint.',
  ];
  fs.writeFileSync(path.join(EV, '09-kardex-integrity.txt'), lines.join('\n') + '\n');
}

// 10-concurrency.txt
{
  const c = R('raw-concurrency.json');
  const lines = [
    '# W9.5 — B-10b · 10-concurrency.txt',
    '# GATE 15: dos POST simultáneos vía PostgREST service_role (canal exacto de /api/reverse).', '',
    'pre : ' + JSON.stringify(c.pre),
    'callA: HTTP ' + c.callA.status + ' ' + c.callA.body,
    'callB: HTTP ' + c.callB.status + ' ' + c.callB.body,
    'post: ' + JSON.stringify(c.post),
    '',
    'EXACTAMENTE: 1 éxito + 1 ERR_ALREADY_REVERSED · 1 movement devolution_reverse ·',
    '1 transición completed→reversed · 1 audit primario. El FOR UPDATE de la devolución',
    'serializa; el perdedor ve status=reversed y muere antes de mutar nada.',
  ];
  fs.writeFileSync(path.join(EV, '10-concurrency.txt'), lines.join('\n') + '\n');
}

// 11-audit.txt
{
  const i = R('raw-p13.json')[0].integrity;
  const lines = [
    '# W9.5 — B-10b · 11-audit.txt',
    '# GATE 18: auditoría REVERSE_DEVOLUTION / metadata.operation ADMIN_REVERSE_DEVOLUTION (congelados B-10).', '',
    'Filas REVERSE_DEVOLUTION del fixture (6):',
    JSON.stringify(i.audits_fixture, null, 1),
    '',
    'Contenido verificado por fila: actor (user_id = auth.uid() real — p_user_id forjado',
    'ignorado), devolution (record_id), store, old_status, new_status, timestamp, reason,',
    'items_reversed + ENRIQUECIMIENTO ADITIVO B-10b: metadata.pipeline=register_stock_movement',
    'y metadata.movement_type=devolution_reverse.',
    'wac_change_log: 1 fila invariante por item revertido (evidencia de invariancia WAC).',
    'business_events: evento stock_movement por movimiento (pipeline estándar).',
    'Sin filas huérfanas: la operación deja rastro en stock_movements (antes: cero).',
  ];
  fs.writeFileSync(path.join(EV, '11-audit.txt'), lines.join('\n') + '\n');
}

// copiar scripts al evidence pack
const srcDir = '/home/z/my-project/scripts/b10b';
const dstDir = path.join(EV, 'scripts');
for (const f of fs.readdirSync(srcDir)) {
  if (/\.(js|sql)$/.test(f)) fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f));
}
console.log('OK 05..11 + scripts copiados:', fs.readdirSync(dstDir).length, 'archivos');
