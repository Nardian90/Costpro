// ============================================================================
// CP-RECEIPT-INTEGRITY-001 — FASE 5: MATRIZ DE RECONCILIACIÓN DE RECEPCIONES
// Read-only sobre producción (REST). Recalcula cada recepción de forma
// independiente (client-side, sin usar las funciones de la app) y clasifica.
// ============================================================================
import fs from 'node:fs';

const BASE = 'https://wthkddeleylijmonclxg.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) throw new Error('Requiere SUPABASE_SERVICE_ROLE_KEY en el entorno (nunca commiteada)');
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };

async function get(path) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { headers: H });
  const txt = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${txt.slice(0, 200)}`);
  return JSON.parse(txt);
}

// ── 1. Catálogos base ───────────────────────────────────────────────────────
const stores = await get('stores?select=id,name');
const storeMap = Object.fromEntries(stores.map((s) => [s.id, s.name]));

// ── 2. Todas las recepciones ────────────────────────────────────────────────
const receipts = await get('receipts?select=*&order=created_at.asc&limit=1000');
console.log('Recepciones:', receipts.length);

// ── 3. Todas las líneas (en trozos por receipt_id) ──────────────────────────
const receiptIds = receipts.map((r) => r.id);
const items = [];
for (let i = 0; i < receiptIds.length; i += 25) {
  const chunk = receiptIds.slice(i, i + 25).join(',');
  items.push(...(await get(`receipt_items?receipt_id=in.(${chunk})&select=*&order=created_at.asc&limit=5000`)));
}
console.log('Líneas totales:', items.length);
const itemsByReceipt = {};
for (const it of items) (itemsByReceipt[it.receipt_id] ??= []).push(it);

// ── 4. Movimientos de stock vinculados (purchase / reverse) ────────────────
// El flujo canónico (register_reception) enlaza por NOTES = uuid de la recepción;
// otras vías usan reference_id. Se agrupa por AMBOS.
const smPurchase = await get(`stock_movements?movement_type=in.(purchase,purchase_reverse)&select=id,store_id,product_id,reference_id,quantity_change,unit_cost,movement_date,created_at,notes&limit=5000`);
console.log('Movimientos purchase/reverse:', smPurchase.length);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const smByRef = {};
let smOrphans = 0;
for (const m of smPurchase) {
  const ref = m.reference_id || (typeof m.notes === 'string' && UUID_RE.test(m.notes.trim()) ? m.notes.trim() : null);
  if (ref) (smByRef[ref] ??= []).push(m); else smOrphans++;
}
console.log('Movimientos sin vínculo a recepción (huérfanos):', smOrphans);

// ── 5. Kardex por referencia (todos los tipos) ────────────────────────────────
const kardexAll = await get(`kardex_entries?select=id,reference_id,reference_type,movement_type,product_id,quantity,unit_cost&limit=5000`);
console.log('Kardex total:', kardexAll.length, '| tipos:', JSON.stringify([...new Set(kardexAll.map((k) => k.movement_type))]));
const kardexByRef = {};
for (const k of kardexAll) if (k.reference_id) (kardexByRef[k.reference_id] ??= []).push(k);

// ── 6. CP-FIN por documento ────────────────────────────────────────────────
const finE = await get(`fin_entries?document_type=eq.RECEPCION&select=id,document_id,event,economic_date,posted_at,status,movements_snapshot&limit=2000`);
const finByDoc = {};
for (const f of finE) (finByDoc[f.document_id] ??= []).push(f);
const finErr = await get(`fin_posting_errors?select=*&limit=2000`);
const finErrByDoc = {};
for (const e of finErr) (finErrByDoc[e.document_id] ??= []).push(e);
console.log('fin_entries RECEPCION:', finE.length, '| errores posting:', finErr.length);

// ── 7. Auditoría de tasas (mutaciones de líneas) ──────────────────────────
const tasaAudit = await get(`receipt_tasa_audit?select=*&order=modificado_at.asc&limit=5000`);
const tasaAuditByItem = {};
for (const a of tasaAudit) (tasaAuditByItem[a.receipt_item_id] ??= []).push(a);
console.log('receipt_tasa_audit:', tasaAudit.length);

// ── 8. Pagos a proveedores por recepción ────────────────────────────────────
const pays = await get(`payment_transactions?ref_type=eq.receipt&select=ref_id,amount_cup,direction,payment_date&limit=5000`);
const paysByRef = {};
for (const p of pays) (paysByRef[p.ref_id] ??= []).push(p);

// ── 9. Tasas oficiales por fecha (para validar tasa usada) ──────────────────
const erates = await get(`exchange_rates?currency=eq.USD&select=rate_date,source,segment,rate&order=rate_date.asc&limit=5000`);
const rateByDate = {};
for (const r of erates) {
  (rateByDate[String(r.rate_date).slice(0, 10)] ??= []).push({ src: r.source, seg: r.segment, rate: Number(r.rate) });
}

// ── 10. Recomputo independiente + clasificación por recepción ───────────────
const rows = [];
for (const r of receipts) {
  const its = itemsByReceipt[r.id] || [];
  const total = Number(r.total_cost ?? 0);
  const perCurrency = {};
  let sumCUP = 0, sumMixed = 0, fxLines = 0, cupLines = 0;
  const rates = new Set();
  let cupTasaWrong = 0, fxBadTasa = 0;
  let mutatedItems = 0;
  const createdRef = new Date(r.created_at).getTime();
  for (const it of its) {
    const q = Number(it.quantity), uc = Number(it.unit_cost), tasa = Number(it.tasa_cambio_recepcion ?? 1);
    const mon = it.moneda_recepcion || 'CUP';
    perCurrency[mon] = (perCurrency[mon] || 0) + q * uc;
    sumMixed += q * uc;
    sumCUP += q * uc * tasa;
    rates.add(`${mon}@${tasa}`);
    if (mon === 'CUP') { cupLines++; if (tasa !== 1) cupTasaWrong++; }
    else { fxLines++; if (!(tasa > 1.5)) fxBadTasa++; }
    if (tasaAuditByItem[it.id]) mutatedItems++;
    if (r.status !== 'pending' && new Date(it.updated_at).getTime() > createdRef + 2000) mutatedItems++;
  }
  const diffCUP = +(sumCUP - total).toFixed(2);
  const diffMixed = +(total - sumMixed).toFixed(2);
  const currencies = Object.keys(perCurrency).sort();
  const hasFX = currencies.some((c) => c !== 'CUP');

  // tasa oficial en la fecha del documento (BCC seg 3 y Diviza)
  const d = String(r.reception_date).slice(0, 10);
  let rateOfficial = null;
  if (hasFX && rateByDate[d]) {
    const seg3 = rateByDate[d].filter((x) => x.seg === '3').map((x) => x.rate);
    if (seg3.length) rateOfficial = { min: Math.min(...seg3), max: Math.max(...seg3) };
  }
  const fxRates = [...new Set(its.filter((i) => (i.moneda_recepcion || 'CUP') !== 'CUP').map((i) => Number(i.tasa_cambio_recepcion)))];
  let rateOffMatch = null;
  if (hasFX && rateOfficial) {
    rateOffMatch = fxRates.every((rt) => rt >= rateOfficial.min - 1 && rt <= rateOfficial.max + 1);
  }

  // movimientos vinculados (reference_id o notes)
  const mv = smByRef[r.id] || [];
  const mvQty = mv.reduce((s, m) => s + Number(m.quantity_change), 0);
  const kd = kardexByRef[r.id] || [];
  const itsQty = its.reduce((s, i) => s + Number(i.quantity), 0);
  const invState = its.length === 0 ? 'n/d (sin líneas)'
    : mv.length === 0 ? 'SIN movimientos vinculados'
    : (Math.abs(mvQty - itsQty) <= 0.01 && mv.length === its.length ? 'Vinculado consistente'
      : `Vinculado INCONSISTENTE (${mv.length} mov vs ${its.length} líneas; Δqty=${(mvQty - itsQty).toFixed(1)})`);

  // CP-FIN
  const fins = finByDoc[r.id] || [];
  const recog = fins.find((f) => f.event === 'reconocimiento');
  const finAmount = recog?.movements_snapshot?.[0]?.amount ?? null;
  const finState = fins.length === 0 ? 'Sin contabilizar'
    : (finErrByDoc[r.id]?.length ? `ERROR posting (${finErrByDoc[r.id].length})`
      : `${recog ? 'reconocimiento' : fins.map((f) => f.event).join('+')} ${recog?.status ?? ''}`);

  // fechas
  const createdVsDoc = (createdRef - new Date(r.reception_date).getTime()) / 86400000;
  const forgedUpdated = new Date(r.updated_at).getTime() < createdRef - 1000;

  // pagos
  const pp = paysByRef[r.id] || [];
  const paidCUP = pp.filter((x) => x.direction !== 'out').reduce((s, x) => s + Number(x.amount_cup || 0), 0);

  // ── clasificación (precedencia de hallazgo más grave) ────────────────────
  const flags = [];
  if (its.length === 0) flags.push('sin líneas');
  if (Math.abs(diffCUP) > 1) flags.push('cabecera≠ΣCUP');
  else if (Math.abs(diffCUP) > 0.01) flags.push('redondeo');
  if (cupTasaWrong) flags.push(`CUP con tasa≠1 (${cupTasaWrong})`);
  if (fxBadTasa) flags.push(`FX tasa≤1,5 (${fxBadTasa})`);
  if (mutatedItems) flags.push(`mutación post-confirmación (${mutatedItems})`);
  if (forgedUpdated) flags.push('updated_at anterior a created_at');
  if (Math.abs(createdVsDoc) > 30) flags.push(`backdated ${Math.abs(createdVsDoc).toFixed(0)}d`);
  if (hasFX && diffMixed !== 0) flags.push('presentación mezcla monedas');
  if (hasFX && rateOffMatch === false) flags.push('tasa no oficial de la fecha');
  if (invState.startsWith('SIN') && its.length && ['active', 'reversed'].includes(r.status)) flags.push('sin trazabilidad inventario');
  if (finAmount !== null && Math.abs(Number(finAmount) - sumCUP) > 1) flags.push('CP-FIN≠ΣCUP');

  let cls;
  if (its.length === 0) cls = 'Datos incompletos';
  else if (Math.abs(diffCUP) > 1) cls = 'Diferencia de cabecera';
  else if (mutatedItems > 0 && r.status !== 'pending') cls = 'Documento modificado después de confirmarse';
  else if (cupTasaWrong || fxBadTasa) cls = 'Posible conversión duplicada o tasa inválida';
  else if (Math.abs(diffCUP) > 0.01) cls = 'Diferencia de redondeo justificada';
  else if (hasFX) cls = 'Diferencia monetaria (presentación)';
  else cls = 'Correcta';
  if (r.id === 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63') cls = 'Caso principal — requiere intervención del propietario';
  else if (flags.includes('tasa no oficial de la fecha') || (flags.includes('sin trazabilidad inventario') && r.status === 'active')) cls += ' + requiere intervención del propietario';

  rows.push({
    id: r.id,
    numero_documental: r.document_number || r.reference_doc || '',
    factura_proveedor: r.reference_doc || '',
    tienda: storeMap[r.store_id] || r.store_id,
    fecha_documento: String(r.reception_date).slice(0, 10),
    fecha_real_creacion: String(r.created_at).slice(0, 19),
    estado: r.status,
    estado_ui: r.status === 'active' ? 'Confirmada' : r.status === 'pending' ? 'Pendiente' : r.status === 'voided' ? 'Anulada' : r.status === 'reversed' ? 'Revertida' : r.status,
    monedas: currencies.join('+') + (currencies.length > 1 ? ` (${currencies.map((c) => c + ':' + its.filter((i) => (i.moneda_recepcion || 'CUP') === c).length).join(',')})` : ''),
    tasas_aplicadas: [...rates].join(' / '),
    n_lineas: its.length,
    n_monedas: currencies.length,
    subtotal_por_moneda: Object.entries(perCurrency).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' | '),
    suma_independiente_cup: +sumCUP.toFixed(2),
    suma_mezcla_sin_convertir: +sumMixed.toFixed(2),
    total_cabecera: total,
    diferencia_cup: diffCUP,
    diferencia_vs_mezcla: diffMixed,
    inventario: invState,
    contabilizacion_cpfin: finState,
    importe_cpfin: finAmount,
    pagos: pp.length ? `${pp.length} pagos / ${paidCUP.toFixed(2)} CUP` : 'sin pagos',
    tasa_oficial_fecha: rateOfficial ? `${rateOfficial.min}-${rateOfficial.max}` : (hasFX ? 'sin dato' : 'n/d'),
    clasificacion: cls,
    flags: flags.join('; ') || '—',
  });
}

// ── 11. Resumen ──────────────────────────────────────────────────────────────
const summary = {};
for (const row of rows) summary[row.clasificacion] = (summary[row.clasificacion] || 0) + 1;
console.log('\n=== RESUMEN DE CLASIFICACIÓN ===');
console.log(JSON.stringify(summary, null, 1));
const byStore = {};
for (const row of rows) byStore[row.tienda] ??= 0;
fs.writeFileSync('/home/z/my-project/scripts/out/matriz-recepciones.json', JSON.stringify({ generado: new Date().toISOString(), rows, resumen: summary }, null, 2));
console.log('\nMatriz escrita → scripts/out/matriz-recepciones.json');
// CSV de inspección rápida
const cols = Object.keys(rows[0]);
const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => `"${String(r[c]).replace(/"/g, '""')}"`).join(','))].join('\n');
fs.writeFileSync('/home/z/my-project/scripts/out/matriz-recepciones.csv', csv);
console.log('CSV de trabajo → scripts/out/matriz-recepciones.csv');
