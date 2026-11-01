#!/usr/bin/env node
/**
 * pgrst-reload-schema.mjs — Recarga la caché de esquema de PostgREST.
 *
 * MISIÓN 2026-10-22 · Parte A. El proyecto aplica migraciones a la BD viva
 * vía Management API (scripts/apply-migration-mgmt.ts), que ejecuta SQL SIN
 * enviar `NOTIFY pgrst, 'reload schema'` — el SQL editor de Supabase sí lo
 * envía automáticamente. Una migración que cree/recree constraints deja la
 * caché de PostgREST desincronizada hasta que alguien recargue: los embeds
 * que usan hints por nombre de constraint fallan con PGRST200 («Could not
 * find a relationship … in the schema cache»).
 *
 * Uso (tras aplicar cualquier migración que toque tablas/relaciones):
 *   node scripts/pgrst-reload-schema.mjs
 *
 * Variables (de .env): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_ACCESS_TOKEN.
 *
 * CP-INFRA-019 (fix B): el destino que valida el guard es EXACTAMENTE la URL
 * leída del .env (la misma de la que se extrae el ref para la Management
 * API). Antes el guard recibía process.env.NEXT_PUBLIC_SUPABASE_URL, que
 * podía estar ausente o apuntar a otro proyecto: el destino comprobado y el
 * ejecutado podían ser diferentes.
 *
 * NOTA DOCUMENTADA (evidencia 2026-10-22): en este proyecto, el NOTIFY
 * enviado vía Management API NO llegó al listener de PostgREST (probado dos
 * veces con espera de 60 s — la caché no se actualizó). El camino fiable
 * verificado es ejecutar `NOTIFY pgrst, 'reload schema';` desde el SQL
 * editor del dashboard de Supabase (conexión directa). Este script queda
 * como procedimiento registrado para intentarlo vía API; si la caché sigue
 * desincronizada, usar el SQL editor. El código de la app usa hints por
 * COLUMNA en el embed autoreferencial (inmune a este problema), pero otros
 * embeds con hint por constraint dependen de una caché sincronizada.
 */

// GUARD (CP-INFRA-019): bloquea producción salvo doble flag explícito.
import { assertNotProduction } from './lib/assert-not-production.mjs';
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const vars = {};
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const SUPABASE_URL = vars.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = vars.SUPABASE_ACCESS_TOKEN;
if (!SUPABASE_URL || !TOKEN) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_ACCESS_TOKEN en .env');
  process.exit(1);
}

// El guard valida la URL REALMENTE LEÍDA del .env (no process.env) y devuelve
// ese mismo destino: el ref de la Management API se extrae de la URL ya
// validada — comprobado y ejecutado son el mismo proyecto por construcción.
const validatedUrl = assertNotProduction({ mode: 'write', url: SUPABASE_URL, context: 'pgrst-reload-schema.mjs' });
const ref = validatedUrl.match(/https:\/\/(.*?)\.supabase\.co/)?.[1];
if (!ref) {
  // No debería ocurrir: el guard ya rechaza destinos no identificables.
  console.error('FALLO DE GUARD: no se pudo extraer el ref del destino validado');
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: "NOTIFY pgrst, 'reload schema'; SELECT 'notificado' AS ok" }),
});
const text = await res.text();
console.log(`NOTIFY pgrst 'reload schema' → HTTP ${res.status}: ${text.slice(0, 200)}`);
if (!res.ok) process.exit(1);
console.log('Si la caché no se refresca en ~10 s, ejecuta el NOTIFY desde el SQL editor de Supabase (camino fiable verificado).');
