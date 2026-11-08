/**
 * DATA-INTEGRITY-REMEDIATION-001 — Verificador de reconciliación Storage
 * (post-despliegue de la migración 20261108140100).
 *
 * La Storage API solo lista objetos con ARCHIVO físico: una fila fantasma de
 * storage.objects es invisible para su list. Por eso este verificador cruza
 * TRES fuentes:
 *   1. Referencias vivas: stores.logo_url/banner_url/signature_url/stamp_url/
 *      promo_images (via REST, autoritative para la UI).
 *   2. Existencia física: HEAD por cada ruta referenciada (como la renderiza
 *      un navegador: /object/public/...).
 *   3. Filas del bucket: RPC reconcile_storage_metadata() (migración C) para
 *      filas sin referencia viva que pudieran quedar.
 *
 * Salida: estado por referencia + resumen; exit 1 si hay referencias vivas
 * con imagen rota (lo que la UI ya mitiga con placeholder, pero debe ser 0
 * tras la remediación).
 *
 * Uso: bun scripts/reconcile-storage.mjs   (read-only, sin --apply ya: la
 * eliminación R3 la ejecuta la migración 20261108140100 en la BD).
 *
 * GUARD (CP-INFRA-019): verificador READ-ONLY — el guard valida el destino
 * REAL de las peticiciones en modo 'read': E2E/localhost pasa libre;
 * producción exige ALLOW_PROD=read-only. Ningún método de escritura aquí
 * (HEAD/GET + RPC STABLE de solo lectura vía POST).
 */
import { assertNotProduction } from './lib/assert-not-production.mjs';

const BASE = assertNotProduction({
  mode: 'read',
  url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  context: 'reconcile-storage',
});
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!BASE || !KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const extractPath = (url) => {
  const m = (url || '').match(/\/object\/public\/stores\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};

(async () => {
  // 1) Referencias vivas desde la BD
  const res = await fetch(`${BASE}/rest/v1/stores?select=id,name,logo_url,banner_url,signature_url,stamp_url,promo_images`, { headers: H });
  const stores = await res.json();
  if (!Array.isArray(stores)) {
    console.error('No se pudo leer stores:', JSON.stringify(stores).slice(0, 200));
    process.exit(2);
  }

  const refs = [];
  for (const s of stores) {
    for (const col of ['logo_url', 'banner_url', 'signature_url', 'stamp_url']) {
      const p = extractPath(s[col]);
      if (p) refs.push({ store: s.name, col, path: p });
    }
    for (const [i, img] of (s.promo_images || []).entries()) {
      const p = extractPath(img.url);
      if (p) refs.push({ store: s.name, col: `promo_images[${i}]`, path: p });
    }
  }

  // 2) HEAD físico por referencia (como el navegador)
  let rotas = 0;
  console.log(`Referencias vivas: ${refs.length}`);
  for (const r of refs) {
    const head = await fetch(`${BASE}/storage/v1/object/public/stores/${encodeURIComponent(r.path)}`, { method: 'HEAD' });
    const ok = head.ok;
    if (!ok) rotas++;
    console.log(`  ${ok ? 'OK      ' : 'ROTA ✗  '} ${r.store} · ${r.col} · ${r.path}`);
  }

  // 3) Filas del bucket sin referencia viva (RPC de la migración C)
  const rpc = await fetch(`${BASE}/rest/v1/rpc/reconcile_storage_metadata`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: '{}',
  });
  let sinRef = [];
  if (rpc.ok) {
    const j = await rpc.json();
    sinRef = j.rows_without_reference || [];
    console.log(`\nFilas del bucket stores sin referencia viva: ${sinRef.length}${sinRef.length ? '\n  ' + sinRef.join('\n  ') : ''}`);
    const missingRows = j.live_refs_missing_row || [];
    if (missingRows.length) console.log(`Referencias vivas SIN fila en storage.objects: ${missingRows.length}\n  ${missingRows.join('\n  ')}`);
  } else {
    console.log('\n[AVISO] RPC reconcile_storage_metadata no disponible aún (¿migración 20261108140200 aplicada?):', rpc.status);
  }

  console.log(`\nRESUMEN: ${refs.length} referencias vivas · ${refs.length - rotas} OK · ${rotas} rotas`);
  if (rotas > 0) {
    console.log('Las referencias rotas renderizan placeholder (UI DATA-INTEGRITY-REMEDIATION-001), pero deben re-subirse desde Gestión de Tiendas.');
    process.exit(1);
  }
  console.log('Reconciliación OK.');
})();
