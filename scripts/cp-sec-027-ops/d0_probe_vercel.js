#!/usr/bin/env node
/**
 * D0 — SONDEO HTTP DE SOLO LECTURA contra la vitrina pública (Vercel).
 * Incidencia ENER-VIDA + CP-SEC-027. 2026-10-19.
 *
 * NATURALEZA: exclusivamente GET públicos, tipo navegador. Cero escrituras,
 * cero cabeceras autenticadas, cero POST. Bajo el rate-limit de la API
 * (60/min por IP): este script hace ~8 GET en total.
 *
 * Salida: resumen estructurado por consola + cuerpos crudos (sanitizados:
 * páginas públicas) en download/d0-enervida-20261019/raw/
 */
const BASE = 'https://costpro4.vercel.app';
const OUT = '/home/z/my-project/download/d0-enervida-20261019';
const fs = require('fs');
const path = require('path');

const targets = [
  { id: 'tienda_enervida', path: '/tienda/enervida-vitallcons', kind: 'page' },
  { id: 'tienda_puerto_padre', path: '/tienda/puerto-padre-vitallcons', kind: 'page' },
  { id: 'tienda_control_404', path: '/tienda/slug-inexistente-d0-control', kind: 'page' },
  { id: 'api_enervida', path: '/api/storefront/enervida-vitallcons', kind: 'api' },
  { id: 'api_puerto_padre', path: '/api/storefront/puerto-padre-vitallcons', kind: 'api' },
  { id: 'raiz', path: '/', kind: 'page' },
];

// Marcadores del not-found.tsx (r1) y del StorefrontErrorBoundary (r2) — verbatim del código
const PAGE_MARKERS = [
  'Error al cargar el catálogo',
  'No se pudo cargar el catálogo de productos',
  'text-6xl font-black',            // h1 "404" del not-found.tsx (estilo construcción)
  'Volver',                          // texto del enlace errorGoBack
  'ENERVIDA', 'Puerto Padre', 'VITALLCONS',
];
const SENSITIVE_FIELDS = ['cost_average', 'cost_price', 'tenant_id', 'precio_empresa', 'min_stock', 'barcode'];

function hdr(res, name) {
  const v = res.headers.get(name);
  return v === null ? null : v.split(',').slice(0, 1).join(',');
}

async function probe(t, round) {
  const sep = t.path.includes('?') ? '&' : '?';
  const url = BASE + t.path + (round === 2 ? `${sep}d0cb=${Date.now()}` : '');
  const t0 = Date.now();
  let res, body, ms;
  try {
    res = await fetch(url, { redirect: 'manual' });
    body = await res.text();
    ms = Date.now() - t0;
  } catch (e) {
    return { id: t.id, round, error: String(e).slice(0, 200) };
  }

  // Guardar crudo (página pública / API pública)
  const ext = t.kind === 'api' ? 'json' : 'html';
  const rawDir = path.join(OUT, 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(path.join(rawDir, `${t.id}_r${round}.${ext}`), body);

  const summary = {
    id: t.id, round,
    http: res.status,
    ms,
    redirect_location: hdr(res, 'location'),
    content_type: hdr(res, 'content-type'),
    x_vercel_cache: hdr(res, 'x-vercel-cache'),
    age: hdr(res, 'age'),
    x_vercel_region: (hdr(res, 'x-vercel-id') || '').split('::')[0] || null,
    x_matched_path: hdr(res, 'x-matched-path'),
    cache_control: hdr(res, 'cache-control'),
    bytes: body.length,
  };

  const title = body.match(/<title>([^<]*)<\/title>/);
  const ogTitle = body.match(/property=["']og:title["'][^>]*content=["']([^"']*)["']/);
  if (title) summary.title = title[1].slice(0, 120);
  if (ogTitle) summary.og_title = ogTitle[1].slice(0, 120);

  if (t.kind === 'page') {
    summary.markers = {};
    for (const m of PAGE_MARKERS) summary.markers[m] = body.includes(m);
    const supa = body.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
    if (supa) summary.supabase_ref_en_html = supa[1];
  } else {
    try {
      const j = JSON.parse(body);
      if (j && j.error) {
        summary.api_error = { code: j.error.code ?? j.error.type ?? null, message_keys: Object.keys(j.error) };
      }
      if (j && j.store) {
        summary.store_found = true;
        summary.store_slug_db = j.store.slug ?? null;
        summary.store_name = j.store.name ? String(j.store.name).slice(0, 40) : null;
        summary.products_count = Array.isArray(j.products) ? j.products.length : null;
        if (Array.isArray(j.products) && j.products.length > 0) {
          summary.product_field_names = Object.keys(j.products[0]).sort();
          const allKeys = new Set();
          for (const p of j.products) Object.keys(p).forEach(k => allKeys.add(k));
          summary.sensitive_present = SENSITIVE_FIELDS.filter(f => allKeys.has(f) || (j.store && f in j.store));
        } else {
          summary.sensitive_present = SENSITIVE_FIELDS.filter(f => j.store && f in j.store);
        }
        summary.store_field_names = Object.keys(j.store).sort();
      } else if (j) {
        summary.json_top_keys = Object.keys(j).sort();
      }
    } catch {
      summary.api_body_not_json = body.slice(0, 120);
    }
  }
  return summary;
}

(async () => {
  const results = [];
  for (const t of targets) results.push(await probe(t, 1));
  await new Promise(r => setTimeout(r, 800));
  for (const t of targets.filter(x => x.kind === 'page')) results.push(await probe(t, 2));

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'd0_sondeo_readonly.json'), JSON.stringify({ ts: new Date().toISOString(), base: BASE, results }, null, 2));
  console.log(JSON.stringify(results, (k, v) => (k === 'markers' && v ? Object.fromEntries(Object.entries(v).filter(([, x]) => x)) : v), 1));
  console.log(`\nEvidencia: ${OUT}/d0_sondeo_readonly.json + raw/`);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
