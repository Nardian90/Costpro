#!/usr/bin/env node
/**
 * IC-DIVIZA-003 — Construye la migración de retiro de elToque como fuente
 * activa a partir de las definiciones VIVAS de producción (live-funcs/*.sql,
 * extraídas por diagnostico-read-only.js vía pg_get_functiondef).
 *
 * Reemplazos (semántica IC-DIVIZA-003 §1 — "no basta con cambiar la
 * prioridad de ordenación; la fuente antigua debe quedar excluida
 * EXPRESAMENTE"):
 *   1. er.source IN ('elToque', 'Diviza')  →  er.source = 'Diviza'   (6×)
 *      El paso informal de la jerarquía contable (tienda → BCC seg3 →
 *      informal → fail-closed) resuelve EXCLUSIVAMENTE con la fuente ACTIVA.
 *   2. Mensajes de usuario «jerarquía tienda→BCC→elToque» → «…→Diviza» (2×).
 *   3. Comentarios internos de jerarquía (2×).
 *
 * INTACTO (verificado por el script):
 *   - Cero cambios de datos: ni DELETE ni UPDATE de exchange_rates. El
 *     archivo elToque (498 filas, 2025-12-25 → 2026-07-28) se conserva.
 *   - CHECK de source (permite 'elToque' como archivo) sin tocar.
 *   - Resto del cuerpo VERBATIM de las 4 funciones (solo los reemplazos
 *     listados; staleness 45d y fail-closed intactos).
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const OUT = '/home/z/my-project/costpro/supabase/migrations/20261027020000_retire_eltoque_active_source.sql';

const HEADER = `-- ============================================================================
-- 20261027020000_retire_eltoque_active_source.sql
-- MISIÓN IC-DIVIZA-003 (2026-10-26): retirar elToque como fuente informal
-- ACTIVA y cerrar la corrección en producción.
--
-- CONTRATO (misión §1): CostPro usa Diviza (cubadivisas.com) como ÚNICA fuente
-- informal activa. elToque (serie congelada 2025-12-25 → 2026-07-28, su
-- proveedor real solucionescuba.com está caído) NO debe participar en:
--   - La selección de la tasa informal vigente.
--   - La resolución del proveedor más reciente.
--   - Los mecanismos de fallback (este archivo) y carry-forward (API).
--   - El cálculo de la tasa actual, brecha cambiaria, indicadores y
--     simuladores (vista/POS/costeo — cambios en el código de la app).
--
-- CAMBIO (generado desde las definiciones VIVAS de producción):
--   Las 4 funciones que resuelven «la tasa informal más reciente» en la
--   jerarquía contable (tienda → BCC seg3 → informal → fail-closed) estrechan
--   el paso informal de
--       er.source IN ('elToque', 'Diviza')
--   a
--       er.source = 'Diviza'
--   (6 ocurrencias: 3 en create_sale_v2, 1 en create_cash_flow_document,
--    1 en get_cash_balances_by_currency, 1 en open_cash_shift).
--   La exclusión es EXPRESA en el WHERE — no un cambio de prioridad de
--   ordenación: una fila futura o re-capturada de elToque jamás volverá a
--   ganar el paso informal. El staleness de 45 días y el fail-closed quedan
--   INTACTOS (defensa en profundidad: Diviza sin tasa fresca → ERR_RATE_STALE
--   / ERR_EXCHANGE_RATE_UNAVAILABLE, nunca un regreso silencioso al archivo).
--   Los mensajes de error de usuario citan la jerarquía real (…→Diviza).
--
-- INTEGRIDAD HISTÓRICA (misión §3):
--   - CERO cambios de datos: ni DELETE ni UPDATE sobre exchange_rates. Las
--     498 filas del archivo elToque se conservan con su procedencia y fechas
--     originales (verificación post-migración incluida en la misión).
--   - El CHECK exchange_rates_source_check ('BCC','elToque','Diviza') NO se
--     toca: elToque sigue siendo un valor VÁLIDO de archivo (lectura
--     histórica vía source=elToque e importación Excel bulk-upload).
--   - Ninguna fila elToque se re-atribuye a Diviza ni se proyecta al presente.
--
-- SEGURIDAD:
--   - CREATE OR REPLACE de funciones existentes (idempotente por naturaleza);
--     firmas, ACL, SECURITY DEFINER, search_path y volatilidad SIN CAMBIO
--     (los cuerpos provienen de pg_get_functiondef de las funciones VIVAS).
--   - El contract surface (supabase/security-contract/contract-surface.sql)
--     se re-exporta desde LIVE tras aplicar esta migración (mismo PR).
--   - La superficie certificada de PR #1500 sigue siendo el punto de partida;
--     este archivo es la continuación auditada del stream de migraciones.
-- ============================================================================

`;

const REPLACEMENTS = [
  // 1. La exclusión EXPRESA (semántica).
  [/er\.source IN \('elToque', 'Diviza'\)/g, "er.source = 'Diviza'"],
  // 2. Mensajes de error de usuario: jerarquía real.
  [/jerarquía tienda→BCC→elToque/g, 'jerarquía tienda→BCC→Diviza'],
  // 3. Comentarios internos de jerarquía.
  [/→ exchange_rates elToque \(rate_date\) → fail-closed/g, '→ exchange_rates Diviza informal (rate_date) → fail-closed'],
  [/\(tienda → BCC seg3 → elToque, fail-closed, staleness 45 días\)/g, '(tienda → BCC seg3 → Diviza informal, fail-closed, staleness 45 días)'],
];

const FUNCS = [
  'create_sale_v2',
  'create_cash_flow_document',
  'get_cash_balances_by_currency',
  'open_cash_shift',
];

let totalAll = 0;
const parts = [HEADER];

for (const fn of FUNCS) {
  const file = path.join(DIR, 'live-funcs', `${fn}.sql`);
  let body = fs.readFileSync(file, 'utf8');

  // Sanity: la definición viva debe contener el patrón a reemplazar.
  const before = (body.match(/IN \('elToque', 'Diviza'\)/g) || []).length;
  if (before === 0) {
    throw new Error(`${fn}: la definición viva NO contiene "IN ('elToque', 'Diviza')" — ¿ya migrada o extraída incorrectamente?`);
  }

  for (const [re, to] of REPLACEMENTS) {
    body = body.replace(re, to);
  }

  // Verificación post-reemplazo.
  const leftover = (body.match(/elToque/g) || []).length;
  const after = (body.match(/er\.source = 'Diviza'/g) || []).length;
  totalAll += before;

  // Prohibiciones duras del contrato de la misión:
  if (/DELETE\s+FROM\s+public\.exchange_rates/i.test(body)) {
    throw new Error(`${fn}: el cuerpo contiene DELETE sobre exchange_rates (prohibido)`);
  }
  if (/UPDATE\s+public\.exchange_rates/i.test(body)) {
    throw new Error(`${fn}: el cuerpo contiene UPDATE sobre exchange_rates (prohibido)`);
  }
  if (leftover > 0) {
    throw new Error(`${fn}: quedan ${leftover} menciones de "elToque" tras los reemplazos — revisar`);
  }

  console.log(`${fn.padEnd(32)} IN→'Diviza': ${before}→${after} · menciones elToque restantes: ${leftover}`);
  // pg_get_functiondef NO incluye el ';' final de la sentencia — se añade
  // para que el stream SQL sea ejecutable (el error 42601 «syntax error at
  // or near CREATE» era exactamente esto: la sentencia previa sin terminar).
  parts.push(`-- ════════════════════════════════════════════════════════════════════\n-- ${fn}: paso informal EXCLUSIVAMENTE Diviza (IC-DIVIZA-003)\n-- ════════════════════════════════════════════════════════════════════\n\n${body.trim()};\n\n`);
}

fs.writeFileSync(OUT, parts.join(''));
console.log(`\n✅ Migración escrita: ${OUT}`);
console.log(`   Ocurrencias IN ('elToque','Diviza') reemplazadas: ${totalAll} (esperadas: 6)`);
console.log(`   Tamaño: ${fs.statSync(OUT).size} bytes`);

// Validación final del archivo completo (solo líneas NO comentadas — el
// header documenta el cambio y menciona el patrón antiguo intencionalmente).
const final = fs.readFileSync(OUT, 'utf8');
const codeLines = final.split('\n').filter(l => !l.trim().startsWith('--'));
const codeOnly = codeLines.join('\n');
if (/IN \('elToque', 'Diviza'\)/.test(codeOnly)) throw new Error('El código final aún contiene el patrón IN (elToque, Diviza)');
if (/exchange_rates_source_check/.test(codeOnly)) throw new Error('El archivo toca el CHECK de source (debe permanecer intacto)');
const creates = (codeOnly.match(/CREATE OR REPLACE FUNCTION public\./g) || []).length;
console.log(`   CREATE OR REPLACE FUNCTION: ${creates} (esperados: 4)`);
if (creates !== 4) throw new Error(`Se esperaban 4 funciones, hay ${creates}`);
