#!/usr/bin/env node
/**
 * CP-INFRA-020 T1 — Aplica el guard destructivo a un script SQL legacy.
 *
 * Uso: node scripts/infra/guard-legacy-sql.cjs <archivo.sql> "<razón de obsolescencia>"
 *
 * Envuelve TODO el contenido original del script dentro de una transacción con
 * guard (BEGIN; DO $guard$ ... $guard$; ... COMMIT;) y añade cabecera visible
 * en español + marcador -- COSTPRO-GUARD-DESTRUCTIVO v1. El contenido original
 * se conserva intacto (sangrado 4 espacios) para que quede como referencia
 * histórica; lo destructivo ya no puede ejecutarse fuera de una BD desechable.
 *
 * NOTA: los scripts legacy usan `SET session_replication_role = ...` (nivel
 * sesión, no SET LOCAL). Dentro de la transacción sigue funcionando igual; al
 * hacer ROLLBACK por el guard, el SET también se revierte (SET es
 * transaccional). Si un legacy usara sentencias no transaccionales (VACUUM,
 * CREATE INDEX CONCURRENTLY), este script aborta: esas sentencias exigen
 * tratamiento manual y no se auto-envuelven (fail-closed).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const [file, motivo] = process.argv.slice(2);
if (!file || !motivo) {
  console.error('Uso: node guard-legacy-sql.cjs <archivo.sql> "<motivo de obsolescencia>"');
  process.exit(2);
}
const abs = path.resolve(file);
const original = fs.readFileSync(abs, 'utf8');

// Fail-closed: nada de sentencias no envolubles dentro del legacy. Excepción
// documentada: `NOTIFY pgrst, 'reload schema'` (recarga de caché de PostgREST)
// no puede ir en transacción — se extrae del cuerpo y se deja TRAS el COMMIT
// como sentencia independiente, de modo que solo se emite si el guard pasó y
// la transacción confirmó. Cualquier otra sentencia no transaccional aborta.
const noTransaccional = original.match(/^\s*(VACUUM|REINDEX|CLUSTER|CREATE INDEX CONCURRENTLY|DROP INDEX CONCURRENTLY|DISCARD|LISTEN|UNLISTEN)\b/im);
if (noTransaccional) {
  console.error(`GUARD-ABORT: ${path.basename(abs)} contiene "${noTransaccional[1]}", que no puede ir dentro de una transacción. Requiere tratamiento manual.`);
  process.exit(1);
}
const NOTIFY_RE = /^(\s*NOTIFY\s+pgrst\s*,\s*'reload schema'\s*;.*)$/im;
const notifyMatch = original.match(NOTIFY_RE);
let cuerpoBase = notifyMatch ? original.replace(NOTIFY_RE, '-- [CP-INFRA-020] NOTIFY extraído: no es transaccional; se ejecuta tras COMMIT si el guard pasó') : original;
const colaNotify = notifyMatch ? `\n-- Recarga de caché de PostgREST (no transaccional): solo llega aquí si el guard pasó.\n${notifyMatch[1].trim()}\n` : '\n';

const GUARD = `DO $guard$
DECLARE
    v_centinela regprocedure;
    v_ledger regclass;
    v_es_aislada boolean;
BEGIN
    -- Fail-closed: ante cualquier duda se aborta. Comprueba, en orden:
    -- (a) existe la centinela; (b) devuelve true; (c) NO existe el libro de
    -- migraciones de producción.
    BEGIN
        v_centinela := to_regprocedure('public.e2e_is_isolated_db()');
    EXCEPTION WHEN OTHERS THEN
        v_centinela := NULL;
    END;

    IF v_centinela IS NULL THEN
        RAISE EXCEPTION 'GUARD_DESTRUCTIVO: esta BD no está marcada como desechable (no existe public.e2e_is_isolated_db). ESTE SCRIPT BORRA TODOS LOS DATOS: ejectútalo solo en una BD desechable. Cómo prepararla: supabase/scripts/README.md (sección centinela de supabase/e2e-bootstrap.sql). Producción (CostproBD) y CostproE2E quedan bloqueadas por diseño.'
            USING HINT = 'Verificar con: select to_regprocedure(''public.e2e_is_isolated_db()''); — debe devolver una función, no NULL.';
    END IF;

    BEGIN
        EXECUTE 'SELECT public.e2e_is_isolated_db()' INTO v_es_aislada;
    EXCEPTION WHEN OTHERS THEN
        v_es_aislada := NULL;
    END;

    IF v_es_aislada IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'GUARD_DESTRUCTIVO: la centinela public.e2e_is_isolated_db() no devolvió true (devolvió %). Solo una BD desechable puede ejecutar este script. Ver supabase/scripts/README.md.', v_es_aislada;
    END IF;

    BEGIN
        v_ledger := to_regclass('public.production_migration_ledger');
    EXCEPTION WHEN OTHERS THEN
        v_ledger := NULL;
    END;

    IF v_ledger IS NOT NULL THEN
        RAISE EXCEPTION 'GUARD_DESTRUCTIVO: existe public.production_migration_ledger — esta BD es PRODUCCIÓN. Abortado sin tocar una sola fila. Si crees que es un error, revisa la identidad del proyecto antes de cualquier otra cosa.'
            USING HINT = 'Producción NO es banco de pruebas: docs/OPERATIONS/REGLA_PRODUCCION_NO_ES_BANCO_DE_PRUEBAS.md';
    END IF;
END
$guard$;`;

const cuerpo = cuerpoBase
  .split('\n')
  .map((l) => (l.length ? `    ${l}` : ''))
  .join('\n')
  .replace(/\s+$/, '');

const banner = (nombre, mot) => `-- ============================================================================
-- ⚠️ ESTE SCRIPT BORRA TODOS LOS DATOS. SOLO PARA UNA BD DESECHABLE. ⚠️
-- ⚠️ NUNCA EN PRODUCCIÓN. NUNCA EN CostproBD NI EN CostproE2E.           ⚠️
-- ============================================================================
-- OBSOLETO — NO EJECUTAR.
-- ${nombre} fue retirado de servicio por CP-INFRA-020.
-- Motivo: ${mot}
-- Se conserva solo como referencia histórica. El script mantenido es
-- supabase/scripts/reset_demo_data_pro.sql.
-- El guard de abajo bloquea su ejecución fuera de una BD desechable.
-- ============================================================================
-- COSTPRO-GUARD-DESTRUCTIVO v1
BEGIN;

${GUARD}

-- ══════════════ CONTENIDO ORIGINAL (OBSOLETO, REFERENCIA HISTÓRICA) ════════
BEGIN;
${cuerpo}
COMMIT;
-- ══════════════ FIN DEL CONTENIDO ORIGINAL ═════════════════════════════════

COMMIT;${colaNotify}`;

fs.writeFileSync(abs, banner(path.basename(abs), motivo), 'utf8');
console.log(`GUARD aplicado: ${abs} (${original.length} → ${banner(path.basename(abs), motivo).length} bytes)`);
