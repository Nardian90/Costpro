#!/usr/bin/env node
/**
 * GUARD DE PRODUCCIÓN — scripts/lib/assert-not-production.mjs
 * ─────────────────────────────────────────────────────────────
 * MISIÓN LIMITES-SUPABASE T1b. Bloquea que un script automatizado toque
 * producción (ref wthkddeleylijmonclxg) por accidente.
 *
 * Regla (docs/OPERATIONS/REGLA_PRODUCCION_NO_ES_BANCO_DE_PRUEBAS.md):
 *   · Producción se bloquea SIEMPRE por defecto (lectura y escritura).
 *   · Lectura de producción: exige ALLOW_PROD=read-only en el entorno.
 *   · Escritura de producción: exige ADEMÁS ALLOW_PROD_WRITE=I_UNDERSTAND
 *     (doble flag explícito). Queda registrado en stderr con contexto.
 *   · CostproE2E, local y cualquier otra URL: paso libre.
 *
 * Uso (ESM):
 *   import { assertNotProduction } from './lib/assert-not-production.mjs';
 *   const url = assertNotProduction({ mode: 'write', url: process.env.NEXT_PUBLIC_SUPABASE_URL, context: 'seed-pick3-history' });
 *
 * Uso (CLI, mismo contrato que las versiones .py/.sh):
 *   node scripts/lib/assert-not-production.mjs --mode write --url "$SUPA_URL" --context mi-script
 *   → exit 0 si pasa; exit 1 con mensaje claro si bloquea.
 *
 * Sin PII y sin secretos en mensajes: la URL solo se muestra enmascarada
 * (se imprime el ref del proyecto, que es público en el cliente de la app,
 * nunca keys ni tokens).
 */

const PROD_REFS = ['wthkddeleylijmonclxg']; // CostproBD (producción)

function isProduction(url) {
  if (!url) return false;
  return PROD_REFS.some(ref => String(url).includes(ref));
}

function maskUrl(url) {
  const s = String(url);
  const m = s.match(/https:\/\/([a-z0-9]+)\./i);
  return m ? `https://${m[1]}.supabase.co` : s.split('?')[0];
}

/**
 * @param {object} opts
 * @param {'read'|'write'} [opts.mode='write']  'read' = el script solo lee.
 * @param {string|undefined} [opts.url]         URL de Supabase a validar. Si
 *        no se pasa, se deduce del entorno en este orden: E2E_SUPABASE_URL,
 *        NEXT_PUBLIC_SUPABASE_URL, SUPABASE_URL.
 * @param {string} [opts.context]               Nombre del script/operación
 *        (para el mensaje de bloqueo).
 * @returns {string} La URL validada (para que el script use exactamente la
 *          que pasó el guard).
 * @throws {Error} Si la URL es producción y faltan los flags exigidos.
 */
export function assertNotProduction({ mode = 'write', url, context = 'script' } = {}) {
  const envUrl =
    (process.env.E2E_SUPABASE_URL || '') ||
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '') ||
    (process.env.SUPABASE_URL || '');
  const target = url || envUrl;

  if (!isProduction(target)) return target;

  const allowReadOnly = process.env.ALLOW_PROD === 'read-only';
  const allowWrite = process.env.ALLOW_PROD_WRITE === 'I_UNDERSTAND';

  if (!allowReadOnly) {
    throw new Error(
      `[${context}] BLOQUEADO: ${maskUrl(target)} es PRODUCCIÓN (CostproBD).\n` +
      `  Producción no es banco de pruebas (docs/OPERATIONS/REGLA_PRODUCCION_NO_ES_BANCO_DE_PRUEBAS.md).\n` +
      `  · Para SOLO LECTURA:    export ALLOW_PROD=read-only\n` +
      `  · Para ESCRITURA:       export ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND\n` +
      `  · Alternativa correcta: apunta el script a CostproE2E (E2E_SUPABASE_URL) o a Supabase local.`
    );
  }

  if (mode === 'write' && !allowWrite) {
    throw new Error(
      `[${context}] BLOQUEADO: escritura contra PRODUCCIÓN (${maskUrl(target)}) requiere el doble flag:\n` +
      `  export ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND\n` +
      `  Si esto es una operación productiva legítima, documéntala en docs/audits/ antes de ejecutarla.`
    );
  }

  if (mode === 'write' && allowWrite) {
    // Registro visible de la autorización explícita (no es un error).
    console.error(`[${context}] AUTORIZADO (explícito): escritura contra producción ${maskUrl(target)} — ALLOW_PROD_WRITE=I_UNDERSTAND presente.`);
  }
  return target;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
// Contrato idéntico al de assert-not-production.py/.sh para que cualquier
// tipo de script use la misma interfaz.
if (process.argv[1] && process.argv[1].endsWith('assert-not-production.mjs')) {
  const args = process.argv.slice(2);
  const get = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
  const mode = get('mode') === 'read' ? 'read' : 'write';
  const url = get('url');
  const context = get('context') ?? 'cli';
  try {
    assertNotProduction({ mode, url, context });
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
