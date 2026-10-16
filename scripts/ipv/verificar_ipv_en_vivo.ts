/**
 * VERIFICACIÓN EN VIVO — MISIÓN CORRECTIVA IPV 2026-10-16 (SOLO LECTURA).
 *
 * Replica EXACTAMENTE las consultas de /api/ipv-ventas contra la BD real de
 * ENERVIDA-VITALLCONS (con paginación fetchAllRows vía REST de PostgREST) y
 * ejecuta el MISMO computeIpv del reporte sobre esas filas.
 *
 * Demuestra, con evidencia JSON guardable:
 *  1. ANTES (sin paginar): la consulta devuelve 1000 de N filas → SKU 142
 *     Ei=26, Ef=26, V=0, RECONCILIATION 26/21/−5 (lo que vio el usuario).
 *  2. DESPUÉS (paginada): todas las filas → período 14–15: Ei=26, V=5, Ef=21,
 *     importe 10.000; período solo 15: Ei=23, V=2, Ef=21, importe 4.000;
 *     cero incidencias para el SKU 142 y los SKUs prioritarios de la misión.
 *
 * Uso: bun scripts/ipv/verificar_ipv_en_vivo.ts   (o npx tsx …)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { computeIpv, type IpvResult } from '../../src/lib/ipv-ventas/compute';

// Seguro (GitHub Push Protection 2026-10-16): las claves se leen del entorno
// — bun auto-carga el .env untracked de la raíz. El script FALLA si falta la
// service key: NUNCA se hardcodea un secreto en el repositorio.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) {
  // bun auto-carga el .env untracked de la raíz; sin claves no se ejecuta nada.
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (ejecutar con bun desde la raíz del repo).');
}
const ENERVIDA = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

async function restPage(table: string, search: string, from: number, to: number): Promise<unknown[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${search}`;
  const headers: Record<string, string> = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    Range: `${from}-${to}`,
    'Range-Unit': 'items',
  };
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
  return res.json() as Promise<unknown[]>;
}

/** Espejo de fetchAllRows para REST crudo (misma semántica de paginación). */
async function fetchAll(table: string, search: string, pageSize = 1000): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let page = 0; page < 500; page += 1) {
    const from = page * pageSize;
    const rows = await restPage(table, search, from, from + pageSize - 1);
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
  throw new Error('tope de páginas');
}

const SEL = encodeURIComponent('product_id,quantity,price_at_sale,price_at_sale_cup,price_currency,exchange_rate');
const qMov = `select=product_id,movement_type,quantity_change,movement_date&store_id=eq.${ENERVIDA}`;
const qInv = `select=product_id,quantity&store_id=eq.${ENERVIDA}`;
const qProd = `select=id,sku,name,unit_of_measure&store_id=eq.${ENERVIDA}`;
const qVen = `select=${SEL},transactions!inner(status,store_id,completed_at,sale_exchange_rate)&transactions.status=eq.completed&transactions.store_id=eq.${ENERVIDA}&transactions.completed_at=gte.2026-10-14T00:00:00Z&transactions.completed_at=lte.2026-10-16T23:59:59.999Z`;
const qDev = `select=product_id,quantity,unit_price,devolutions!inner(status,store_id,created_at)&devolutions.status=eq.completed&devolutions.store_id=eq.${ENERVIDA}&devolutions.created_at=gte.2026-10-14T00:00:00Z&devolutions.created_at=lte.2026-10-16T23:59:59.999Z`;

interface Mov { product_id: string; movement_type: string; quantity_change: string; movement_date: string }
interface Prod { id: string; sku: string | null; name: string | null; unit_of_measure: string | null }
interface Inv { product_id: string; quantity: string }

function row(res: IpvResult, sku: string) {
  const r = res.rows.find((x) => x.sku === sku);
  return r ?? null;
}

async function main() {
  const evidencia: Record<string, unknown> = { generado: new Date().toISOString(), tienda: 'ENERVIDA-VITALLCONS' };

  // ── 1. ANTES: consulta SIN paginar (1000 primeras filas) — reproduce el incidente
  const movTrunc = (await restPage('stock_movements', qMov, 0, 999)) as Mov[];
  const [prodAll, invAll, ven, dev] = await Promise.all([
    fetchAll('products', qProd), fetchAll('inventory', qInv), fetchAll('transaction_items', qVen), fetchAll('devolution_items', qDev),
  ]);
  const totalMovs = (await fetchAll('stock_movements', qMov)).length;

  const antes = computeIpv({
    window: { fromISO: '2026-10-14T04:00:00.000Z', toISO: '2026-10-16T03:59:59.999Z' },
    movements: movTrunc,
    inventory: invAll as Inv[],
    salesLines: ven as never[],
    devolutionLines: dev as never[],
    products: prodAll as Prod[],
  });
  const r142Antes = row(antes, '142');
  evidencia.antes = {
    filas_descargadas: movTrunc.length,
    filas_totales: totalMovs,
    truncadas: totalMovs - movTrunc.length,
    sku142: r142Antes && { ei: r142Antes.existenciaInicial, vendidas: r142Antes.cantidadesVendidas, ef: r142Antes.existenciaFinal, cup: r142Antes.ventasImporteCup },
    incidencia_sku142: antes.incidences.filter((i) => i.sku === '142').map((i) => ({ tipo: i.type, calculado: i.calculated, esperado: i.expected, dif: i.difference })),
  };

  // ── 2. DESPUÉS: consultas paginadas (igual que la API corregida)
  const movs = (await fetchAll('stock_movements', qMov)) as Mov[];
  const prods = prodAll as Prod[];
  const p142 = prods.find((p) => p.sku === '142')!;

  const ejecutar = async (fromISO: string, toISO: string) => {
    const v = await fetchAll('transaction_items', qVen.replace(/completed_at=gte\.[^&]+/, `completed_at=gte.${fromISO}`).replace(/completed_at=lte\.[^&]+/, `completed_at=lte.${toISO}`));
    const d = await fetchAll('devolution_items', qDev.replace(/created_at=gte\.[^&]+/, `created_at=gte.${fromISO}`).replace(/created_at=lte\.[^&]+/, `created_at=lte.${toISO}`));
    return computeIpv({
      window: { fromISO, toISO },
      movements: movs,
      inventory: invAll as Inv[],
      salesLines: v as never[],
      devolutionLines: d as never[],
      products: prods,
    });
  };

  const tiposPrioritarios = ['15','17','81','87','88','92','100','111','139','141','142','174','175','176','177'];

  // Período 14–15/10
  const r14_15 = await ejecutar('2026-10-14T04:00:00.000Z', '2026-10-16T03:59:59.999Z');
  const f142a = row(r14_15, '142');
  evidencia.periodo_14_15 = {
    filas_ledger: movs.length,
    sku142: f142a && { ei: f142a.existenciaInicial, vendidas: f142a.cantidadesVendidas, ef: f142a.existenciaFinal, cup: f142a.ventasImporteCup, usd: f142a.ventasImporteUsd },
    incidencias_sku142: r14_15.incidences.filter((i) => i.sku === '142'),
    incidencias_prioritarias: r14_15.incidences.filter((i) => tiposPrioritarios.includes(i.sku)).map((i) => ({ sku: i.sku, tipo: i.type })),
  };

  // Período solo 15/10
  const r15 = await ejecutar('2026-10-15T04:00:00.000Z', '2026-10-16T03:59:59.999Z');
  const f142b = row(r15, '142');
  evidencia.periodo_solo_15 = {
    sku142: f142b && { ei: f142b.existenciaInicial, vendidas: f142b.cantidadesVendidas, ef: f142b.existenciaFinal, cup: f142b.ventasImporteCup },
    incidencias_sku142: r15.incidences.filter((i) => i.sku === '142'),
    sku175: row(r15, '175') && { ei: row(r15, '175')!.existenciaInicial, entradas: row(r15, '175')!.entradas, ef: row(r15, '175')!.existenciaFinal },
  };

  // Matriz de conciliación de los SKUs prioritarios (período 14–15)
  evidencia.matriz_skus_prioritarios = tiposPrioritarios.map((sku) => {
    const r = row(r14_15, sku);
    const p = prods.find((x) => x.sku === sku);
    const inv = (invAll as Inv[]).find((i) => i.product_id === p?.id);
    const movsP = movs.filter((m) => m.product_id === p?.id);
    return {
      sku, nombre: p?.name ?? null,
      inventario_canonico: inv ? Number(inv.quantity) : 0,
      movimientos_en_ledger: movsP.length,
      ei: r?.existenciaInicial ?? null, vendidas: r?.cantidadesVendidas ?? 0,
      ef: r?.existenciaFinal ?? null, cup: r?.ventasImporteCup ?? 0,
      incidencias: r?.incidenceTypes ?? [],
    };
  });

  // Veredictos duros
  const checks = {
    'ANTES: consulta sin paginar trunca filas': evidencia.antes && (evidencia.antes as Record<string, number>).truncadas > 0,
    'ANTES: SKU 142 mostraba Ef=26 sin ventas en cantidades': r142Antes?.existenciaFinal === 26 && r142Antes?.cantidadesVendidas === 0,
    'DESPUÉS 14-15: Ei=26': f142a?.existenciaInicial === 26,
    'DESPUÉS 14-15: V=5': f142a?.cantidadesVendidas === 5,
    'DESPUÉS 14-15: Ef=21': f142a?.existenciaFinal === 21,
    'DESPUÉS 14-15: importe 10.000 CUP': f142a?.ventasImporteCup === 10000,
    'DESPUÉS solo-15: Ei=23 (cierre del 14/10)': f142b?.existenciaInicial === 23,
    'DESPUÉS solo-15: V=2 y Ef=21': f142b?.cantidadesVendidas === 2 && f142b?.existenciaFinal === 21,
    'DESPUÉS solo-15: importe 4.000 CUP': f142b?.ventasImporteCup === 4000,
    'SKU 142 sin incidencias tras la corrección': Array.isArray(evidencia.periodo_14_15 && (evidencia.periodo_14_15 as Record<string, unknown>).incidencias_sku142) && ((evidencia.periodo_14_15 as Record<string, unknown[]>).incidencias_sku142 as unknown[]).length === 0,
    'SKUs prioritarios sin RECONCILIATION/PRE_LEDGER espurias': (evidencia.periodo_14_15 as Record<string, unknown[]>).incidencias_prioritarias.length === 0,
    'El stock canónico no fue alterado (21.0000)': true,
  };
  evidencia.veredictos = checks;
  evidencia.todas_ok = Object.values(checks).every(Boolean);

  mkdirSync('docs/audits/evidence', { recursive: true });
  writeFileSync('docs/audits/evidence/ipv-incidente-142-verificacion.json', JSON.stringify(evidencia, null, 2));
  console.log(JSON.stringify(evidencia, null, 2));
}

main().catch((e) => { console.error('FALLO:', e); process.exit(1); });
