/**
 * CP-DOC-SC-DATA-MAPPING-006 — Evidencias visuales (§13.D) — PDFs REALES
 * generados con los generadores productivos del repo (jsPDF) desde:
 *   · datos de prueba CONTROLADOS (caso PUERTO PADRE / Almacen Lari), y
 *   · la recepción REAL creada en el proyecto AISLADO E2E
 *     (/home/z/my-project/sc006-recepcion-real.json, ENT-000001-2026).
 *
 * Ejecutar: bun scripts/sc006-evidencias.ts
 * Salida:   /home/z/my-project/download/evidencias_sc006/
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { assertNotProduction } from './lib/assert-not-production.mjs';

// ── Credenciales E2E (solo LECTURA) ──
const envText = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
for (const l of envText.split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim();
}
const URL = (process.env.E2E_SUPABASE_URL || '').trim().replace(/\/$/, '');
const SRK = (process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || '').trim();
assertNotProduction({ mode: 'read', url: URL, context: 'scripts/sc006-evidencias.ts' });
const sb = createClient(URL, SRK, { auth: { persistSession: false } });

import {
  buildSc204ModelData,
  renderSc204Pdf,
  type Sc204SourceData,
  type Sc204SourceItem,
} from '../src/lib/legal/sc204';
import { buildSc208ModelData, renderSc208Pdf } from '../src/lib/legal/sc208';
import { buildSc209ModelData, renderSc209Pdf } from '../src/lib/legal/sc209';
import { buildSc216ModelData, renderSc216Pdf } from '../src/lib/legal/sc216';

const OUT = '/home/z/my-project/download/evidencias_sc006';
mkdirSync(OUT, { recursive: true });

// ── PNG mínimo (sin dependencias): marca abstracta de tienda para la
//    evidencia «con logo real» (96×96, marco + rombo negro sobre blanco) ──
function pngMarca(): string {
  const W = 96, H = 96;
  const raw: number[] = [];
  for (let y = 0; y < H; y++) {
    raw.push(0);
    for (let x = 0; x < W; x++) {
      const borde = x < 6 || x >= W - 6 || y < 6 || y >= H - 6;
      const dx = Math.abs(x - W / 2), dy = Math.abs(y - H / 2);
      const rombo = dx + dy < 30;
      const centro = rombo && !(dx + dy < 12);
      const negro = borde || centro;
      raw.push(negro ? 20 : 245, negro ? 40 : 247, negro ? 90 : 250);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (tipo: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(tipo), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bit RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from(raw))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

const LOGO_TIENDA = pngMarca();

// ── Recepción REAL (E2E) + saldos reales del ledger ──
const real = JSON.parse(readFileSync('/home/z/my-project/sc006-recepcion-real.json', 'utf8'));
const saldos: Record<string, { saldoPosterior: number; fuente: string }> = {};
for (const item of real.items) {
  const { data: mov } = await sb
    .from('stock_movements')
    .select('balance_after, created_at')
    .eq('store_id', real.store.id)
    .eq('product_id', item.product_id)
    .order('created_at', { ascending: false })
    .limit(1);
  saldos[item.product_id] = {
    saldoPosterior: mov?.[0]?.balance_after ?? null,
    fuente: mov?.[0] ? 'ledger' : 'sin-datos',
  } as never;
}

const mkItem = (o: Partial<Sc204SourceItem> = {}): Sc204SourceItem => ({
  quantity: 10,
  unit_cost: 25,
  moneda_recepcion: 'CUP',
  products: { name: 'Cerveza Bucanero 350ml', sku: 'BUC-350', unit_of_measure: 'unidades' },
  ...o,
});

// ── Caso CONTROLADO de la misión (§12): PUERTO PADRE / Almacen Lari ──
const fuenteControlada = (overrides: Partial<Sc204SourceData> = {}): Sc204SourceData => ({
  entidadNombre: 'PUERTO PADRE',
  entidadCodigo: '1',
  receipt: {
    id: 'bbbbbbbb-3333-4333-8333-333333333333',
    reference_doc: 'Almacen Lari', // el DEFECTO observado: nombre del proveedor capturado como referencia
    document_number: 'ENT-000001-2026',
    supplier: 'Almacen Lari',
    supplier_tax_id: 'J-31015873-2',
    reception_date: '2026-11-05T09:00:00-05:00',
    status: 'active',
    store_id: 'store-a',
  },
  items: [
    mkItem({ quantity: 24, unit_cost: 12.5, products: { name: 'Cemento Portland P-35 TBV', sku: '141', unit_of_measure: 'saco' } }),
    mkItem({ quantity: 8, unit_cost: 64, products: { name: 'Clavo de 2 pulgadas (libra)', sku: 'CL-02', unit_of_measure: 'libra' } }),
  ],
  transportador: {
    nombre: 'Juan Rodríguez Pérez',
    carne: '91020511234',
    chapa: 'P-123456',
    casilla: '45',
    guiaAerea: 'GA-778812',
  },
  emissionDate: new Date('2026-11-08T15:30:00-05:00'),
  ...overrides,
});

async function guardar(nombre: string, render: () => Promise<{ output: (t: 'arraybuffer') => ArrayBuffer }>) {
  const doc = await render();
  writeFileSync(`${OUT}/${nombre}`, Buffer.from(doc.output('arraybuffer')));
  console.log('PDF generado:', nombre);
}

// 1 · SC-2-04 con logo propio de la tienda
await guardar('01_sc204_logo_real_tienda.pdf', () => renderSc204Pdf(buildSc204ModelData(fuenteControlada({ logoUrl: LOGO_TIENDA }))));

// 2 · SC-2-04 SIN logo → identificador monocromático CP
await guardar('02_sc204_sin_logo_identificador_cp.pdf', () => renderSc204Pdf(buildSc204ModelData(fuenteControlada({ logoUrl: null }))));

// 3–8 · Secciones del caso controlado (mismo PDF que 01/02; los recortes PNG
//       se generan después con pdftoppm + PIL desde 01 y 02)

// REAL · SC-2-04 desde la recepción REAL del E2E (datos 100 % del sistema)
const realItems: Sc204SourceItem[] = real.items.map((it: {
  product_id: string; quantity: number; unit_cost: number; moneda_recepcion: string;
  products: { name: string; sku: string; unit_of_measure: string | null };
}) => ({
  product_id: it.product_id,
  quantity: Number(it.quantity),
  unit_cost: Number(it.unit_cost),
  moneda_recepcion: it.moneda_recepcion,
  products: { name: it.products.name, sku: it.products.sku, unit_of_measure: it.products.unit_of_measure ?? 'unidades' },
}));
const modeloReal = buildSc204ModelData({
  entidadNombre: real.store.name,
  entidadCodigo: String(real.store.store_code),
  logoUrl: null, // la tienda E2E no tiene logo → identificador CP (regla §9)
  receipt: {
    id: real.receipt.id,
    reference_doc: real.receipt.reference_doc,
    document_number: real.receipt.document_number,
    supplier: real.receipt.supplier,
    supplier_tax_id: real.receipt.supplier_tax_id,
    reception_date: real.receipt.reception_date,
    status: real.receipt.status,
    store_id: real.store.id,
  },
  items: realItems,
  saldosPorProducto: saldos,
  emissionDate: new Date(),
});
await guardar('10_sc204_REAL_e2e_tienda_qa_correcciones.pdf', () => renderSc204Pdf(modeloReal));

// 9 · Otros modelos SC afectados (códigos documentales + CP)
await guardar('09a_sc208_vale_codigo_tienda.pdf', () =>
  renderSc208Pdf(buildSc208ModelData({
    vale: {
      id: 'dddddddd-5555-4555-8555-555555555555',
      slip_number: 'VS-000012-2026',
      status: 'completed',
      notes: 'Entrega a obra: repaso del local',
      total_cost: 415.5,
      created_at: '2026-11-07T10:00:00-05:00',
      voided_at: null,
      void_reason: null,
      items: [
        { quantity: 5, unit_cost: 38.5, total_cost: 192.5, products: { name: 'Cemento P-350 saco 50 kg', sku: 'MT-1000', unit_of_measure: 'saco' } },
        { quantity: 10, unit_cost: 22.3, total_cost: 223, products: { name: 'Pintura epoxi blanca (L)', sku: 'PT-330', unit_of_measure: 'litro' } },
      ],
      creator: { full_name: 'María González' },
      voider: null,
      production_orders: null,
    },
    entidadNombre: 'PUERTO PADRE',
    entidadCodigo: '1',
    logoUrl: null,
  }) as never));

await guardar('09b_sc209_transferencia_codigos_almacenes.pdf', () =>
  renderSc209Pdf(buildSc209ModelData({
    transfer: {
      id: 'eeeeeeee-6666-4666-8666-666666666666',
      origin_store_id: 's1',
      destination_store_id: 's2',
      confirmed_by: 'u1',
      status: 'CONFIRMADA',
      notes: 'Traslado de excedente a Las Tunas',
      created_at: '2026-11-06T09:00:00-05:00',
      confirmed_at: '2026-11-06T14:00:00-05:00',
      origin_store: { name: 'PUERTO PADRE', logo_url: null, store_code: 1 },
      destination_store: { name: 'LAS TUNAS', logo_url: null, store_code: 2 },
      creator: { full_name: 'María González' },
      confirmer: { full_name: 'Luis Álvarez' },
      items: [
        { quantity: 6, unit_cost: 12.5, products: { name: 'Cemento Portland P-35 TBV', sku: '141', unit_of_measure: 'saco' } },
      ],
    },
  }) as never));

await guardar('09c_sc216_ajuste_codigo_tienda.pdf', () =>
  renderSc216Pdf(buildSc216ModelData({
    adjustment: {
      id: 'ffffffff-7777-4777-8777-777777777777',
      status: 'confirmed',
      reason: 'STOCKTAKE_SHRINKAGE',
      notes: 'Ajuste por conteo físico de noviembre',
      created_at: '2026-11-05T16:00:00-05:00',
      source_physical_inventory: { pi_number: 'IF-2026-11', cutoff_date: '2026-11-04' },
      items: [
        { products: { sku: '141', name: 'Cemento Portland P-35 TBV', unit_of_measure: 'saco' }, counted_quantity: 96, expected_quantity: 100 },
        { products: { sku: 'CL-02', name: 'Clavo de 2 pulgadas (libra)', unit_of_measure: 'libra' }, counted_quantity: 40, expected_quantity: 40 },
      ],
      creator: { full_name: 'María González' },
    },
    entidadNombre: 'PUERTO PADRE',
    entidadCodigo: '1',
    logoUrl: null,
  }) as never));

console.log('\nEvidencias en', OUT);
