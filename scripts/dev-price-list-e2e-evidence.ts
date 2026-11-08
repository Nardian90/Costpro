/**
 * CP-SALES-PRICE-LIST-001 · Evidencias desde la BD E2E REAL.
 *
 * Reproduce con el MISMO builder de producción (buildPriceListModel +
 * renderPriceListPdf, logo real de la app) el documento exacto que la vista
 * previsualiza sobre los datos reales de «Tienda QA Correcciones» (BD E2E
 * aislada): consulta el RPC get_products_for_pos (la misma fuente del POS).
 * Unit test: contenido dibujado idéntico entre construcciones del mismo
 * modelo — lo renderizado aquí = lo previsualizado/exportado en la UI.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { buildPriceListModel, type PriceListSourceItem } from '../src/lib/price-list/model';
import { renderPriceListPdf } from '../src/lib/price-list/pdf';

const BASE = 'https://lguovmvrozxgssupkwpf.supabase.co';
const SRK = (process.env.E2E_SRK ?? '').trim();
const STORE = '11111111-aaaa-4bbb-8ccc-00000000e2e1';
const OUT = '/home/z/my-project/download/evidencias_price_list';

async function rest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { apikey: SRK, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : [];
}

/** El RPC get_products_for_pos usa auth.uid() bajo RLS: hace falta un JWT de usuario real (como la app). */
let token = '';
async function login(): Promise<void> {
  const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SRK, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login: ${res.status}`);
  token = (await res.json() as { access_token: string }).access_token;
}

async function main() {
  await login();
  const [store] = await rest<{ id: string; name: string; logo_url: string | null; reeup: string | null }[]>(
    'GET', `/rest/v1/stores?select=id,name,logo_url,reeup&id=eq.${STORE}`,
  );
  const rows = await rest<Record<string, unknown>[]>(
    'POST', '/rest/v1/rpc/get_products_for_pos',
    { p_store_id: STORE, p_search_term: '', p_category: '', p_limit: 5000, p_offset: 0 },
  );
  const items: PriceListSourceItem[] = rows.map((r) => ({
    id: String(r.id),
    sku: (r.sku as string) ?? null,
    name: String(r.name),
    description: (r.description as string) ?? null,
    price: Number(r.price),
    price_currency: (r.price_currency as string) ?? null,
    stock_current: Number(r.stock_current),
    is_active: Boolean(r.is_active),
    is_service: Boolean(r.is_service),
  }));
  console.log(`tienda: ${store.name} | filas RPC: ${items.length} | con stock>0: ${items.filter(i => (i.stock_current ?? 0) > 0).length}`);

  mkdirSync(OUT, { recursive: true });
  const generatedAt = new Date();

  // Caso A: SIN rango (22 productos: numéricos por valor + AB12/COD-9/X-2 al final).
  const modelA = buildPriceListModel({
    items, store: { id: store.id, name: store.name, logoUrl: store.logo_url, reeup: store.reeup },
    range: null, generatedAt,
  });
  const docA = await renderPriceListPdf(modelA); // logo real de la app (fallback como en la UI)
  writeFileSync(`${OUT}/e2e-sin-rango.pdf`, Buffer.from(docA.output('arraybuffer') as ArrayBuffer));
  console.log(`✓ e2e-sin-rango.pdf páginas=${docA.getNumberOfPages()} filas=${modelA.meta.totalProducts}`);

  // Caso B: rango 1–50 (18 numéricos; 176 y alfanuméricos excluidos).
  const modelB = buildPriceListModel({
    items, store: { id: store.id, name: store.name, logoUrl: store.logo_url, reeup: store.reeup },
    range: { from: BigInt(1), to: BigInt(50) }, generatedAt,
  });
  const docB = await renderPriceListPdf(modelB);
  writeFileSync(`${OUT}/e2e-rango-1-50.pdf`, Buffer.from(docB.output('arraybuffer') as ArrayBuffer));
  console.log(`✓ e2e-rango-1-50.pdf páginas=${docB.getNumberOfPages()} filas=${modelB.meta.totalProducts}`);
  console.log('orden A:', modelA.rows.map(r => r.skuLabel).join(', '));
}

main().catch((e) => { console.error(e); process.exit(1); });
