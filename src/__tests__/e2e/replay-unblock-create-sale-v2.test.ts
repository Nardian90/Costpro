/**
 * CP-E2E-RECONCILE-004 — Pruebas estáticas de la migración de desbloqueo
 * `20261024140000_replay_unblock_legacy_create_sale_v2.sql`.
 * ============================================================================
 * Cero red, cero bases remotas: se verifican por lectura de archivos del
 * repositorio, simulación estática del stream de firmas de `create_sale_v2`
 * y regeneración LOCAL del manifiesto oficial (que escribe en
 * `.e2e-migrations/`, gitignored, y copia byte-idéntica al manifiesto
 * versionado).
 *
 * Criterios (mandato RECONCILE-004 §6):
 *   1. Orden de la migración nueva entre las posiciones relevantes (74/75/76).
 *   2. Firmas eliminadas con listas EXACTAS derivadas de sus CREATE de
 *      origen (20261017000000 → /26; 20261024120000 → /31) y conservación
 *      de la /32 (20261024150000).
 *   3. Ausencia de CASCADE, de DML y de cambios de permisos ajenos: el
 *      archivo, sin comentarios, son EXACTAMENTE dos DROP FUNCTION IF
 *      EXISTS calificados.
 *   4. Simulación del stream con desbloqueo: ningún `COMMENT ON FUNCTION`
 *      sin calificar queda ambiguo y el estado final es la firma única /32.
 *   5. (Canario) La MISMA simulación SIN la migración nueva reproduce el
 *      bloqueo 42725 de RECONCILE-003 en la posición 75 original.
 *   6. Integridad de los archivos históricos 75/80: hashes idénticos a los
 *      auditados por RECONCILE-001/002/003 (manifiesto de 94 en main).
 *   7. Manifiesto: determinista (dos ejecuciones byte-idénticas), 96
 *      incluidas, posiciones esperadas, correspondencia total de hashes
 *      disco↔manifiesto y `--check` MATCH exit 0.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIR_MIGRACIONES = path.join(REPO, 'supabase', 'migrations');
const RUTA_MANIFIESTO = path.join(REPO, 'audit-evidence', 'INFRA-011', 'e2e-migrations-manifest.json');
const RUTA_GENERADOR = path.join(REPO, 'scripts', 'e2e', 'build-migrations-replay.mjs');

const NUEVA = '20261024140000_replay_unblock_legacy_create_sale_v2.sql';
const POS74 = '20261024120000_revision_final_caja_v2_24_1.sql';
const VIEJA75 = '20261024150000_mision_pagos_mixtos_multimoneda_v2_25_0.sql';
const VIEJA80 = '20261025120000_cp_money_002_postmerge_integrity.sql';
const ESEC_FINAL = '20260927000001_esec_final_definitive_policy.sql';
const ORIGEN26 = '20261017000000_pos_payment_incidents_negative_guard.sql';

// Hashes sha256 de ORIGEN de los archivos históricos, anclados al manifiesto
// de 94 posiciones auditado por RECONCILE-001/002/003 y fusionado en main
// (PR #1506). Inmutabilidad verificable contra el historial Git.
const SHA_VIEJA75 = '0c4970220cb0dc536c29d79e727c47c2d9814734c4632b1ad9f0559d2f6ed4d6';
const SHA_VIEJA80 = '4f5303867b686e514474c336954f2bc961d9fd9cc919e8ac136c5ed3763d7b76';
const SHA_POS74 = 'df7a1f3725d690dec21bbc051c66f53f0b788165c944de30fd629efbf549dc66';

const CORTE_TRAMO = '20260828';

const sha256 = (datos: Buffer | string): string => createHash('sha256').update(datos).digest('hex');
const leerMigracion = (nombre: string): string => fs.readFileSync(path.join(DIR_MIGRACIONES, nombre), 'utf8');

function nombresTramo(): string[] {
  return fs
    .readdirSync(DIR_MIGRACIONES)
    .filter((n) => n.endsWith('.sql') && ((n.match(/^(\d{8})/) ?? [])[1] ?? '') > CORTE_TRAMO)
    .sort();
}

// ── Parser de eventos create_sale_v2 (identidad = lista de TIPOS) ────────────
interface EventoCreate { tipo: 'create'; firmas: string[]; crudo: string; archivo: string; linea: number }
interface EventoDropCalificado { tipo: 'drop_calificado'; firmas: string[]; crudo: string; archivo: string; linea: number }
interface EventoDropTodas { tipo: 'drop_todas'; archivo: string; linea: number }
interface EventoComment { tipo: 'comment'; archivo: string; linea: number }
type Evento = EventoCreate | EventoDropCalificado | EventoDropTodas | EventoComment;

const TIPOS_COMPUESTOS = [
  'timestamp with time zone',
  'timestamp without time zone',
  'time with time zone',
  'time without time zone',
  'double precision',
  'character varying',
];
const INICIO_TIPO = new Set([
  'uuid', 'jsonb', 'text', 'numeric', 'integer', 'bigint', 'smallint', 'boolean',
  'date', 'timestamp', 'bytea', 'json', 'real', 'double', 'character', 'inet',
]);

/** Quita comentarios de línea (`--`) y de bloque (delimiter de apertura-asterisco seguido de asterisco-cierre) del SQL. */
function sinComentarios(sql: string): string {
  const sinBloque = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  return sinBloque
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

function dividirTopLevel(lista: string): string[] {
  const partes: string[] = [];
  let profundidad = 0;
  let actual = '';
  for (const ch of lista) {
    if (ch === '(') { profundidad++; actual += ch; }
    else if (ch === ')') { profundidad--; actual += ch; }
    else if (ch === ',' && profundidad === 0) { partes.push(actual); actual = ''; }
    else actual += ch;
  }
  if (actual.trim()) partes.push(actual);
  return partes;
}

/**
 * Normaliza una lista de argumentos a dos formas:
 *  - identidad: ['uuid','uuid','jsonb',…] — la identidad real de la firma
 *    en PostgreSQL (los nombres NO forman parte de la identidad);
 *  - crudo: "p_store_id uuid, p_seller_id uuid, …" — la lista EXACTA
 *    (nombres incluidos, sin cláusulas DEFAULT, espacios colapsados) para
 *    comparar el archivo nuevo contra los CREATE de origen, token a token.
 */
function normalizarArgumentos(lista: string): { identidad: string[]; crudo: string } {
  const identidad: string[] = [];
  const crudos: string[] = [];
  for (const original of dividirTopLevel(lista)) {
    let s = original.replace(/\s+/g, ' ').trim();
    const corte = s.search(/\bDEFAULT\b/i);
    if (corte >= 0) s = s.slice(0, corte).trim();
    if (!s) continue;
    crudos.push(s);
    let tipo = '';
    if (INICIO_TIPO.has(s.split(' ')[0].toLowerCase())) {
      // argumento sin nombre: solo el tipo (p. ej. el DROP de 20260927000001)
      tipo = s.toLowerCase();
    } else {
      const m = /^([a-z_][a-z0-9_]*)\s+(.+)$/i.exec(s);
      if (!m) throw new Error(`argumento no parseable: "${original}"`);
      tipo = m[2].toLowerCase();
    }
    const compuesto = TIPOS_COMPUESTOS.find((t) => tipo.startsWith(t));
    tipo = compuesto ?? tipo.replace(/\s+/g, ' ');
    identidad.push(tipo);
  }
  return { identidad, crudo: crudos.join(', ') };
}

function extraerListaArgumentos(sql: string, apertura: number): string {
  // sql[apertura] === '('; devuelve el contenido hasta el ')' correspondiente.
  let profundidad = 0;
  for (let i = apertura; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === '(') profundidad += 1;
    else if (ch === ')') {
      profundidad -= 1;
      if (profundidad === 0) return sql.slice(apertura + 1, i);
    }
  }
  throw new Error('lista de argumentos sin cerrar');
}

/** Extrae, en orden, los eventos create_sale_v2 de un archivo del tramo. */
function eventosCreateSaleV2(archivo: string, sqlOriginal: string): Evento[] {
  const sql = sinComentarios(sqlOriginal);
  const eventos: Evento[] = [];
  const rx = /(CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|DROP\s+FUNCTION(?:\s+IF\s+EXISTS)?|COMMENT\s+ON\s+FUNCTION)\s+public\.create_sale_v2/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(sql)) !== null) {
    const cabeza = (m[1] ?? '').toUpperCase().replace(/\s+/g, ' ');
    const resto = sql.slice(m.index + m[0].length);
    const linea = sql.slice(0, m.index).split('\n').length;
    if (cabeza.startsWith('CREATE')) {
      const apertura = m.index + m[0].length + (resto.match(/^\s*/) ?? [''])[0].length;
      const lista = extraerListaArgumentos(sql, apertura);
      const { identidad, crudo } = normalizarArgumentos(lista);
      eventos.push({ tipo: 'create', firmas: identidad, crudo, archivo, linea });
    } else if (cabeza.startsWith('DROP')) {
      const parentesis = resto.match(/^\s*\(/);
      if (parentesis) {
        const apertura = m.index + m[0].length + (parentesis[0].length - 1);
        const lista = extraerListaArgumentos(sql, apertura);
        const { identidad, crudo } = normalizarArgumentos(lista);
        eventos.push({ tipo: 'drop_calificado', firmas: identidad, crudo, archivo, linea });
      } else {
        eventos.push({ tipo: 'drop_todas', archivo, linea });
      }
    } else {
      eventos.push({ tipo: 'comment', archivo, linea });
    }
  }
  return eventos;
}

// ── Simulador del stream de firmas ──────────────────────────────────────────
interface ResultadoSimulacion {
  firmasFinales: string[];
  fallo: { archivo: string; linea: number; vivas: number } | null;
  eventos: number;
}

/**
 * Reproduce la evolución del conjunto de overloads de create_sale_v2 a lo
 * largo del tramo post-baseline, con semilla = firma pre-baseline (la que
 * retira el DROP calificado de 20260927000001 — derivada de esa migración).
 * Un `COMMENT ON FUNCTION` sin lista de argumentos exige firma ÚNICA
 * (análogo exacto del error 42725 de PostgreSQL).
 */
function simularStream(conDesbloqueo: boolean): ResultadoSimulacion {
  const nombres = nombresTramo().filter((n) => conDesbloqueo || n !== NUEVA);
  const eventosSemilla = eventosCreateSaleV2(ESEC_FINAL, leerMigracion(ESEC_FINAL));
  const dropSemilla = eventosSemilla.find((e): e is EventoDropCalificado => e.tipo === 'drop_calificado');
  if (!dropSemilla) throw new Error(`${ESEC_FINAL} no contiene el DROP calificado esperado (semilla del baseline)`);
  const vivas = new Set<string>([dropSemilla.firmas.join(',')]);
  let totalEventos = 0;
  let fallo: ResultadoSimulacion['fallo'] = null;
  for (const nombre of nombres) {
    if (fallo) break;
    for (const ev of eventosCreateSaleV2(nombre, leerMigracion(nombre))) {
      totalEventos += 1;
      if (ev.tipo === 'create' || ev.tipo === 'drop_calificado') {
        const clave = ev.firmas.join(',');
        if (ev.tipo === 'create') vivas.add(clave); // OR REPLACE con misma lista = reemplazo in place
        else vivas.delete(clave); // IF EXISTS ⇒ no-op si no existe
      } else if (ev.tipo === 'drop_todas') {
        vivas.clear();
      } else if (vivas.size !== 1) {
        fallo = { archivo: ev.archivo, linea: ev.linea, vivas: vivas.size };
        break;
      }
    }
  }
  return { firmasFinales: [...vivas], fallo, eventos: totalEventos };
}

// ── Manifiesto (regeneración local + verificación) ───────────────────────────
interface EntradaManifiesto {
  nombre: string;
  bytes: number;
  sha256_original: string;
  sha256_generado?: string;
  estado: string;
  razon: string | null;
  posicion?: number;
}
interface Manifiesto {
  total_considerados: number;
  total_incluidos: number;
  total_excluidos: number;
  digest: string;
  archivos: EntradaManifiesto[];
}

const leeryValidarManifiesto = (): Manifiesto => {
  const m = JSON.parse(fs.readFileSync(RUTA_MANIFIESTO, 'utf8')) as Manifiesto;
  expect(Array.isArray(m.archivos)).toBe(true);
  return m;
};

describe('CP-E2E-RECONCILE-004 — migración de desbloqueo 20261024140000 (stream create_sale_v2)', () => {
  it('1. orden: la migración nueva queda estrictamente entre 20261024120000 (pos 74) y 20261024150000 (antigua 75)', () => {
    const nombres = nombresTramo();
    const i74 = nombres.indexOf(POS74);
    const iNueva = nombres.indexOf(NUEVA);
    const i75 = nombres.indexOf(VIEJA75);
    const i80 = nombres.indexOf(VIEJA80);
    expect(i74).toBeGreaterThan(-1);
    expect(iNueva).toBeGreaterThan(-1);
    expect(i75).toBeGreaterThan(-1);
    expect(i80).toBeGreaterThan(-1);
    // orden lexicográfico del runner oficial: 74 < nueva < antigua 75 < … < antigua 80
    expect(iNueva).toBe(i74 + 1);
    expect(iNueva).toBeLessThan(i75);
    expect(i75).toBeLessThan(i80);
    // y el nombre del archivo declara el orden temporal esperado
    expect(NUEVA.startsWith('20261024140000')).toBe(true);
    expect('20261024120000' < '20261024140000').toBe(true);
    expect('20261024140000' < '20261024150000').toBe(true);
  });

  it('2. firmas eliminadas: listas EXACTAS de /26 y /31 (derivadas de sus CREATE de origen); /32 conservada', () => {
    const sqlNueva = leerMigracion(NUEVA);
    const eventosNueva = eventosCreateSaleV2(NUEVA, sqlNueva);
    const drops = eventosNueva.filter((e): e is EventoDropCalificado => e.tipo === 'drop_calificado');
    expect(drops.length).toBe(2);

    // CREATE de origen de la /26 (20261017000000) — único create del archivo
    const ev26 = eventosCreateSaleV2(ORIGEN26, leerMigracion(ORIGEN26)).filter((e): e is EventoCreate => e.tipo === 'create');
    expect(ev26.length).toBe(1);
    // CREATE de origen de la /31 final (20261024120000 v2.24.1)
    const ev31 = eventosCreateSaleV2(POS74, leerMigracion(POS74)).filter((e): e is EventoCreate => e.tipo === 'create');
    expect(ev31.length).toBe(1);
    // CREATE de la /32 (20261024150000, antigua 75)
    const ev32 = eventosCreateSaleV2(VIEJA75, leerMigracion(VIEJA75)).filter((e): e is EventoCreate => e.tipo === 'create');
    expect(ev32.length).toBe(1);

    const f26 = ev26[0];
    const f31 = ev31[0];
    const f32 = ev32[0];
    expect(f26.firmas.length).toBe(26);
    expect(f31.firmas.length).toBe(31);
    expect(f32.firmas.length).toBe(32);

    // drops[0] == /26 y drops[1] == /31: identidad EXACTA por tipos
    expect(drops[0].firmas).toEqual(f26.firmas);
    expect(drops[1].firmas).toEqual(f31.firmas);
    // y listas EXACTAS token a token (nombres de argumentos incluidos)
    expect(drops[0].crudo).toBe(f26.crudo);
    expect(drops[1].crudo).toBe(f31.crudo);
    // ninguna de las firmas eliminadas es la /32
    expect(drops[0].firmas.join(',')).not.toBe(f32.firmas.join(','));
    expect(drops[1].firmas.join(',')).not.toBe(f32.firmas.join(','));
    // los nombres de la /31 calzan con los de la /26 en los primeros 26 argumentos
    expect(f31.firmas.slice(0, 26)).toEqual(f26.firmas);
    expect(f31.firmas.slice(26)).toEqual([
      'numeric', 'numeric', 'numeric', 'numeric', 'text',
    ]);
  });

  it('3. contenido: sin CASCADE, sin DML ni permisos ajenos — solo dos DROP FUNCTION IF EXISTS calificados', () => {
    const sql = sinComentarios(leerMigracion(NUEVA));
    expect(/\bcascade\b/i.test(sql)).toBe(false);
    // sentencias efectivas = fragmentos no vacíos separados por ';'
    const sentencias = sql.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
    expect(sentencias.length).toBe(2);
    for (const s of sentencias) {
      expect(/^DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.create_sale_v2\(/i.test(s)).toBe(true);
      expect(s.endsWith(')')).toBe(true);
    }
    // cero DML / DDL ajeno / ACL fuera de los dos DROP (los GRANT/REVOKE de las
    // firmas retiradas mueren con ellas; nada se añade aquí)
    const prohibidos = /\b(INSERT|UPDATE|DELETE|MERGE|GRANT|REVOKE|CREATE|ALTER|POLICY|ROLE|TRIGGER|TABLE|NOTIFY)\b/i;
    expect(prohibidos.test(sql)).toBe(false);
  });

  it('4. simulación con desbloqueo: ningún COMMENT ambiguo; estado final = firma única /32', () => {
    const r = simularStream(true);
    expect(r.fallo).toBeNull();
    expect(r.firmasFinales.length).toBe(1);
    const ev32 = eventosCreateSaleV2(VIEJA75, leerMigracion(VIEJA75)).filter((e) => e.tipo === 'create');
    const f32 = ev32[0] as EventoCreate;
    expect(r.firmasFinales[0]).toBe(f32.firmas.join(','));
    expect(r.eventos).toBeGreaterThanOrEqual(15);
  });

  it('5. canario: sin la migración nueva, la simulación reproduce el 42725 en la antigua posición 75', () => {
    const r = simularStream(false);
    expect(r.fallo).not.toBeNull();
    expect(r.fallo?.archivo).toBe(VIEJA75);
    // con /26 + /31 vivas, el CREATE de la /32 produce TRES firmas → COMMENT ambiguo
    expect(r.fallo?.vivas).toBe(3);
  });

  it('6. integridad histórica: los archivos 75/80 (y el 74) conservan sus hashes auditados', () => {
    expect(sha256(leerMigracion(VIEJA75))).toBe(SHA_VIEJA75);
    expect(sha256(leerMigracion(VIEJA80))).toBe(SHA_VIEJA80);
    expect(sha256(leerMigracion(POS74))).toBe(SHA_POS74);
    // y el manifiesto versionado registra exactamente esos hashes de origen
    const m = leeryValidarManifiesto();
    const h = (nombre: string): string => {
      const e = m.archivos.find((x) => x.nombre === nombre);
      expect(e).toBeDefined();
      return (e as EntradaManifiesto).sha256_original;
    };
    expect(h(VIEJA75)).toBe(SHA_VIEJA75);
    expect(h(VIEJA80)).toBe(SHA_VIEJA80);
  });

  it('7. manifiesto: determinista (2 ejecuciones byte-idénticas), 107 incluidas, posiciones y hashes consistentes, --check MATCH', () => {
    const ejecutarGenerador = (args: string[]): string =>
      String(execFileSync(process.execPath, [RUTA_GENERADOR, ...args], { cwd: REPO, encoding: 'utf8' }));
    // determinismo: dos ejecuciones → mismo manifiesto byte a byte
    ejecutarGenerador([]);
    const run1 = fs.readFileSync(RUTA_MANIFIESTO);
    ejecutarGenerador([]);
    const run2 = fs.readFileSync(RUTA_MANIFIESTO);
    expect(run1.equals(run2)).toBe(true);
    // --check contra el manifiesto commiteado: MATCH, exit 0
    const salida = ejecutarGenerador(['--check']);
    expect(salida).toContain('MATCH');
    // verificación del contenido
    const m = leeryValidarManifiesto();
    expect(m.total_incluidos).toBe(107);
    const incluidos = m.archivos.filter((e) => e.estado === 'incluido');
    expect(incluidos.length).toBe(107);
    const pos = (nombre: string): number => {
      const e = incluidos.find((x) => x.nombre === nombre);
      expect(e).toBeDefined();
      return (e as EntradaManifiesto).posicion as number;
    };
    expect(pos(POS74)).toBe(74);
    expect(pos(NUEVA)).toBe(75);
    expect(pos(VIEJA75)).toBe(76);
    expect(pos(VIEJA80)).toBe(81);
    // correspondencia total disco ↔ manifiesto (hashes de ORIGEN de las 98)
    // (IC-DIVIZA-003: la posición 96 = 20261027020000_retire_eltoque_active_source.sql)
    // (MISIÓN PI-SUPERADMIN: la posición 97 = 20261027030000_pi_superadmin_rpc_authorization.sql)
    // (MISIÓN HSAA-SUPERADMIN: la posición 98 = 20261027120000_has_store_access_as_superadmin_policy.sql)
    // (MISIÓN CICLO DE VIDA PI: la posición 99 = 20261027150000_pi_lifecycle_ciclo_vida.sql)
    // (MISIÓN RECEPCIONES: la posición 100 = 20261027180000_recepciones_borradores_transaccional.sql)
    // (MISIÓN CATÁLOGO MAESTRO PR 1: posiciones 101-102 = 20261028090000_cierre_fallback_create_sale_v2 + 20261028091000_bucket_product_images_policies)
    // (MISIÓN CATÁLOGO MAESTRO PR 2 · ETAPA 0: la posición 103 = 20261028100000_backfill_products_tenant_id)
    // (MISIÓN CATÁLOGO MAESTRO PR 3 · ETAPA 1: posiciones 104-107 = modelo maestro + RPCs + ACL)
    for (const e of incluidos) {
      expect(sha256(fs.readFileSync(path.join(DIR_MIGRACIONES, e.nombre)))).toBe(e.sha256_original);
    }
    // la única transformación documentada del tramo sigue siendo la histórica
    const transformadas = incluidos.filter((e) => e.sha256_generado !== e.sha256_original);
    expect(transformadas.map((e) => e.nombre)).toEqual(['20261020000002_sec_definer_hardening.sql']);
  });
});
