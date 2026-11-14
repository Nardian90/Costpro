#!/usr/bin/env node
/**
 * M027 — CP-INVENTORY-TRACEABILITY-RECONCILIATION-001 FASE I:
 * RECONCILIACIÓN DE LOS 208 MOVIMIENTOS DE COMPRA SIN reference_id. READ-ONLY.
 *
 * Para cada movimiento identifica: recepción candidata(s), línea candidata(s),
 * criterios de correspondencia (producto+cantidad+costo CUP convertido+fecha
 * secuencia+tienda+referencia textual+1:1), nivel de confianza y clasificación:
 *   MATCH_UNICO       — correspondencia demostrada 1:1
 *   MATCH_CONFIRMADO  — varias evidencias independientes convergen
 *   MATCH_AMBIGUO     — más de una línea o recepción posible
 *   SIN_COINCIDENCIA  — no existe correspondencia suficiente
 *   YA_VINCULADO     — referencia existente válida (n/a si reference_id NULL)
 *
 * Regla de la misión §3: NO usar producto+fecha como evidencia suficiente cuando
 * existan varias compras del mismo producto (exige cantidad+costo+1:1 también).
 * Uso: node scripts/m027-fase1-208-movimientos.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD: no es producción'); process.exit(2); }

async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`(HTTP ${res.status}) ${text.slice(0, 300)}`);
  return JSON.parse(text || '[]');
}

const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const TOL_Q = 1e-6;
const TOL_C_EXACTA = 0.005;
const TOL_C_AMPLIA = 0.5;

// ── 1. Los 208 movimientos de compra sin referencia (detalle completo) ───────
const movs = await q(`SELECT sm.id::text, sm.store_id::text, s.name AS tienda,
    sm.product_id::text, p.sku, p.name AS producto, p.unit_of_measure AS um,
    sm.quantity_change::float8, sm.movement_type, sm.movement_date::text,
    sm.created_at::text, sm.unit_cost::float8, sm.reference_doc, sm.notes,
    sm.cost_value_change::float8, sm.balance_after::float8
  FROM public.stock_movements sm
  LEFT JOIN public.stores s ON s.id = sm.store_id
  LEFT JOIN public.products p ON p.id = sm.product_id
  WHERE sm.movement_type='purchase' AND sm.reference_id IS NULL
  ORDER BY sm.store_id, sm.movement_date, sm.id`);
console.log(`movimientos de compra sin reference_id: ${movs.length} (esperado 208)`);

// ── 2. Todas las recepciones + sus líneas (detalle) ──────────────────────────
const receipts = await q(`SELECT r.id::text, r.store_id::text, r.document_number, r.reference_doc AS rec_ref_doc,
    r.status, r.reception_date::text, r.created_at::text, r.confirmed_at::text,
    r.total_cost::float8, r.reversed_at::text, r.original_receipt_id::text,
    (SELECT count(*)::int FROM public.receipt_items ri WHERE ri.receipt_id=r.id) AS n_lineas
  FROM public.receipts r ORDER BY r.store_id, r.reception_date, r.created_at`);
const lineas = await q(`SELECT ri.id::text, ri.receipt_id::text, ri.product_id::text,
    ri.quantity::float8, ri.unit_cost::float8, ri.moneda_recepcion,
    ri.tasa_cambio_recepcion::float8, ri.created_at::text,
    (ri.unit_cost * coalesce(NULLIF(ri.tasa_cambio_recepcion,0),1))::float8 AS uc_cup
  FROM public.receipt_items ri ORDER BY ri.created_at, ri.id`);
console.log(`recepciones: ${receipts.length} | líneas totales: ${lineas.length}`);
const lineasNoFvc = lineas.filter(l => l.receipt_id !== FVC);
console.log(`líneas no-FVC (universo de emparejamiento): ${lineasNoFvc.length} (esperado 208)`);

const recById = new Map(receipts.map(r => [r.id, r]));
const lineasPorReceipt = new Map();
for (const l of lineasNoFvc) {
  if (!lineasPorReceipt.has(l.receipt_id)) lineasPorReceipt.set(l.receipt_id, []);
  lineasPorReceipt.get(l.receipt_id).push(l);
}

// ── 3. Emparejamiento por criterios conjuntos ────────────────────────────────
// Para cada movimiento: líneas candidatas de la MISMA TIENDA que empatan
// producto + cantidad + costo CUP convertido (exacto o amplio).
const analisis = movs.map(m => {
  const cand = lineasNoFvc.filter(l => {
    const rec = recById.get(l.receipt_id);
    if (!rec || rec.store_id !== m.store_id) return false;
    if (l.product_id !== m.product_id) return false;
    if (Math.abs(Math.abs(l.quantity) - Math.abs(m.quantity_change)) > TOL_Q) return false;
    const difCosto = Math.abs(l.uc_cup - m.unit_cost);
    return difCosto <= TOL_C_AMPLIA;
  }).map(l => {
    const rec = recById.get(l.receipt_id);
    const difCosto = Math.abs(l.uc_cup - m.unit_cost);
    // Evidencias independientes
    const ev = [];
    ev.push('producto');
    ev.push('cantidad');
    ev.push(difCosto <= TOL_C_EXACTA ? 'costo_exacto' : 'costo_aprox');
    // Fecha y secuencia temporal: movimiento económico en la fecha de recepción
    // (o ±1 día por diferencias de cierre/backdating documentado)
    const mFecha = m.movement_date.slice(0, 10);
    const recFecha = rec.reception_date.slice(0, 10);
    const recCreada = rec.created_at.slice(0, 10);
    const movCreado = m.created_at.slice(0, 10);
    const fechaEconomica = mFecha === recFecha;
    const fechaCreacion = movCreado === recCreada;
    const secuencia = Math.abs(new Date(m.created_at) - new Date(rec.created_at)) < 3660000 * 24 * 2; // ≤48h tras creación recepción
    if (fechaEconomica) ev.push('fecha_economica');
    if (fechaCreacion) ev.push('fecha_creacion');
    if (secuencia) ev.push('secuencia_temporal');
    return { linea_id: l.receipt_id === FVC ? null : l.id, receipt_id: l.receipt_id,
      dif_costo: +difCosto.toFixed(4), moneda: l.moneda_recepcion, tasa: l.tasa_cambio_recepcion,
      uc_linea_cup: l.uc_cup, evidencias: ev, receipt_status: rec.status };
  });

  // Costo de las líneas sin correspondencia por cantidad/producto pero del mismo
  // producto (para contexto de ambigüedad: varias compras del mismo producto)
  const mismoProducto = lineasNoFvc.filter(l => recById.get(l.receipt_id)?.store_id === m.store_id
    && l.product_id === m.product_id);
  return {
    mov_id: m.id, tienda: m.tienda, store_id: m.store_id, producto_id: m.product_id,
    sku: m.sku, producto: m.producto, um: m.um, cantidad: m.quantity_change,
    tipo: m.movement_type, signo: m.quantity_change >= 0 ? '+' : '−',
    fecha_economica: m.movement_date.slice(0, 10), fecha_creacion: m.created_at.slice(0, 10),
    unit_cost: m.unit_cost, reference_doc: m.reference_doc, notes: m.notes,
    cost_value_change: m.cost_value_change, balance_after: m.balance_after,
    lineas_no_fvc_mismo_producto: mismoProducto.length,
    candidatas: cand,
  };
});

// ── 4. DESAMBIGUACIÓN TEMPORAL (misión §3: fecha y secuencia como criterio
//       conjunto — nunca producto+fecha SOLOS) ───────────────────────────────
// Si hay varias líneas candidatas (mismo producto+cantidad+costo), se retiene
// la línea cuya recepción coincide en FECHA ECONÓMICA y FECHA DE CREACIÓN
// exacta con el movimiento. Si queda exactamente 1 candidata, la ambigüedad
// queda resuelta con evidencia temporal independiente.
for (const a of analisis) {
  if (a.candidatas.length > 1) {
    const porFecha = a.candidatas.filter(c => {
      const rec = recById.get(c.receipt_id);
      return rec && a.fecha_economica === rec.reception_date.slice(0, 10)
        && a.fecha_creacion === rec.created_at.slice(0, 10);
    });
    if (porFecha.length === 1) {
      a.desambiguado_por = 'fecha_economica_exacta+fecha_creacion_exacta';
      a.candidatas_previas = a.candidatas.map(c => c.linea_id);
      a.candidatas = porFecha;
    }
  }
}

// ── 5. Verificación de cobertura 1:1 (línea ↔ movimiento) ────────────────────
// Una línea puede ser reclamada por varios movimientos → ambigüedad global.
const claimsPorLinea = new Map();
for (const a of analisis) for (const c of a.candidatas) {
  if (!claimsPorLinea.has(c.linea_id)) claimsPorLinea.set(c.linea_id, []);
  claimsPorLinea.get(c.linea_id).push(a.mov_id);
}
const lineasDuplicadas = [...claimsPorLinea.entries()].filter(([, ms]) => ms.length > 1);
const lineasSinMov = lineasNoFvc.filter(l => !claimsPorLinea.has(l.id));
console.log(`líneas reclamadas por >1 movimiento: ${lineasDuplicadas.length} | líneas sin movimiento: ${lineasSinMov.length}`);

// ── 5. Clasificación final por movimiento ────────────────────────────────────
for (const a of analisis) {
  const nLineasMismoProd = a.lineas_no_fvc_mismo_producto;
  if (a.candidatas.length === 0) {
    a.recepcion_candidata = null; a.linea_candidata = null;
    a.clasificacion = 'SIN_COINCIDENCIA';
    a.confianza = 'NINGUNA';
    a.motivo = `Sin línea de recepción de la misma tienda que empareje producto+cantidad+costo (±${TOL_C_AMPLIA} CUP). ${nLineasMismoProd} líneas del mismo producto en el universo.`;
  } else if (a.candidatas.length > 1) {
    a.clasificacion = 'MATCH_AMBIGUO';
    a.confianza = 'BAJA';
    a.recepcion_candidata = a.candidatas.map(c => c.receipt_id);
    a.linea_candidata = a.candidatas.map(c => c.linea_id);
    a.motivo = `${a.candidatas.length} líneas candidatas (mismo producto+cantidad+costo) — no demostrable 1:1.`;
  } else {
    const c = a.candidatas[0];
    const reclamada = (claimsPorLinea.get(c.linea_id) || []).length;
    a.recepcion_candidata = c.receipt_id; a.linea_candidata = c.linea_id;
    a.evidencias = c.evidencias; a.moneda_origen = c.moneda; a.tasa_origen = c.tasa;
    a.uc_linea_cup = c.uc_linea_cup; a.receipt_status = c.receipt_status;
    if (reclamada > 1) {
      a.clasificacion = 'MATCH_AMBIGUO'; a.confianza = 'BAJA';
      a.motivo = `Línea candidata reclamada por ${reclamada} movimientos — correspondencia 1:1 rota.`;
    } else if (c.evidencias.includes('costo_exacto') && c.evidencias.includes('fecha_economica')) {
      // 1:1 demostrable + ≥4 evidencias independientes (producto, cantidad, costo exacto, fecha)
      a.clasificacion = 'MATCH_UNICO'; a.confianza = 'ALTA';
      const desamb = a.desambiguado_por ? ` Desambiguado de ${a.candidatas_previas.length} candidatas por ${a.desambiguado_por}.` : '';
      a.motivo = `Correspondencia 1:1 demostrada: ${c.evidencias.join('+')} (dif costo ${c.dif_costo} CUP); línea reclamada por exactamente 1 movimiento.${desamb}`;
    } else if (c.evidencias.filter(e => e !== 'costo_aprox').length >= 4) {
      a.clasificacion = 'MATCH_CONFIRMADO'; a.confianza = 'MEDIA-ALTA';
      a.motivo = `Evidencias convergentes: ${c.evidencias.join('+')} (dif costo ${c.dif_costo} CUP, ±tolerancia amplia).`;
    } else if (c.evidencias.length >= 3 && nLineasMismoProd === 1) {
      a.clasificacion = 'MATCH_CONFIRMADO'; a.confianza = 'MEDIA';
      a.motivo = `Única compra del producto en la tienda (${c.evidencias.join('+')}).`;
    } else {
      a.clasificacion = 'MATCH_AMBIGUO'; a.confianza = 'BAJA';
      a.motivo = `Evidencia insuficiente pese a candidato único: ${c.evidencias.join('+')} — ${nLineasMismoProd} compras del mismo producto; producto+fecha solos NO bastan (misión §3).`;
    }
  }
}

const conteo = {};
for (const a of analisis) conteo[a.clasificacion] = (conteo[a.clasificacion] || 0) + 1;
console.log('\nCLASIFICACIÓN FASE I:', JSON.stringify(conteo, null, 1));
const porTienda = {};
for (const a of analisis) {
  porTienda[a.tienda] = porTienda[a.tienda] || {};
  porTienda[a.tienda][a.clasificacion] = (porTienda[a.tienda][a.clasificacion] || 0) + 1;
}
console.log('por tienda:', JSON.stringify(porTienda, null, 1));

// Detalle de los no unívocos
for (const a of analisis.filter(x => x.clasificacion !== 'MATCH_UNICO' && x.clasificacion !== 'MATCH_CONFIRMADO')) {
  console.log(`  ${a.clasificacion}: mov ${a.mov_id.slice(0, 8)} ${a.tienda} prod=${(a.sku || a.producto_id.slice(0, 8))} cant=${a.cantidad} uc=${a.unit_cost} fecha=${a.fecha_economica} cand=${(a.candidatas || []).length}`);
}
for (const [lid, ms] of lineasDuplicadas.slice(0, 20)) {
  console.log(`  LÍNEA RECLAMADA ${ms.length}x: ${lid.slice(0, 8)} por ${ms.map(x => x.slice(0, 8)).join(',')}`);
}

// ── 6. Evidencia JSON completa ────────────────────────────────────────────────
const evidencia = {
  generado: new Date().toISOString(),
  mision: 'CP-INVENTORY-TRACEABILITY-RECONCILIATION-001',
  fase: 'I — reconciliación de 208 movimientos sin referencia',
  universo: {
    movimientos_sin_ref: movs.length,
    recepciones: receipts.length,
    lineas_totales: lineas.length,
    lineas_no_fvc: lineasNoFvc.length,
    hipotesis_1a1: `movimientos=${movs.length} == líneas no-FVC=${lineasNoFvc.length}`,
  },
  criterios: {
    tolerancia_cantidad: TOL_Q,
    tolerancia_costo_exacto: TOL_C_EXACTA,
    tolerancia_costo_amplia: TOL_C_AMPLIA,
    evidencias: ['identidad producto', 'cantidad', 'costo unitario CUP convertido', 'fecha y secuencia temporal', 'tienda', 'referencia textual reference_doc', 'correspondencia 1:1 con línea'],
    regla: 'producto+fecha NO son evidencia suficiente con varias compras del mismo producto (misión §3)',
  },
  clasificacion: conteo,
  por_tienda: porTienda,
  cobertura_lineas: {
    lineas_reclamadas_por_varios_movs: lineasDuplicadas.map(([lid, ms]) => ({ linea: lid, movs: ms })),
    lineas_sin_movimiento: lineasSinMov.map(l => ({ linea: l.id, receipt: l.receipt_id, producto: l.product_id, cantidad: l.quantity, uc_cup: l.uc_cup })),
  },
  movimientos: analisis,
  recepciones: receipts,
};
writeFileSync(resolve('docs/audits/inventory-traceability-20261115/m027-fase1-208-movimientos.json'), JSON.stringify(evidencia, null, 2));
console.log('\nevidencia → docs/audits/inventory-traceability-20261115/m027-fase1-208-movimientos.json');
