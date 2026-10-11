#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════
 * Bundle Gate — regresión de carga inicial (W2/W3) en POS y Catálogo
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Verifica, contra los ARTEFACTOS REALES del build de producción de este
 * commit, que las librerías pesadas de exportación (jspdf, html2canvas,
 * jspdf-autotable, @e965/xlsx) NO entren en:
 *
 *   A. La carga inicial del shell (ruta `/`): chunks de entryJSFiles +
 *      rootMainFiles + polyfill + chunks de clientModules async:false.
 *   B. La carga inicial de cada vista protegida: los chunks que Turbopack
 *      descarga al abrir la vista (boundary del next/dynamic) + el cierre
 *      estático a nivel módulo desde el módulo de entrada de la vista.
 *
 * Los imports dinámicos legítimos (clic de exportación) cortan el recorrido:
 * el gate NO sigue boundaries `import()` — así un `import('jspdf')` dentro
 * de un handler de exportación no es regresión (carga diferida legítima).
 *
 * `import type` y `import { type X }` se borran en compilación: no generan
 * aristas `x.i()` ni registros de módulo, por lo que nunca son regresión.
 *
 * Resultados:
 *   PASS     — se inspeccionaron los artefactos y se cumplen las reglas.
 *   FAIL     — regresión confirmada (código de librería vigilada en carga
 *              inicial o alcanzable estáticamente desde ella).
 *   BLOCKED  — faltan artefactos, el formato cambió o no puede determinarse
 *              el grafo de forma fiable. NUNCA es PASS.
 *
 * En CI, FAIL y BLOCKED fallan el check (códigos de salida 1 y 2).
 *
 * Uso:
 *   node scripts/bundle-gate/check-bundle-gate.mjs [--next-dir .next]
 *        [--config scripts/bundle-gate/bundle-gate.config.json]
 *        [--json] [--verbose]
 *
 * La lógica vive en ./lib/core.mjs (runGate) — este archivo es el CLI.
 */

import fs from 'node:fs';
import path from 'node:path';
import { runGate } from './lib/core.mjs';

const DEFAULT_CONFIG = 'scripts/bundle-gate/bundle-gate.config.json';

// ────────────────────────────── CLI ──────────────────────────────
function parseArgs(argv) {
  const args = { nextDir: '.next', config: DEFAULT_CONFIG, json: false, verbose: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--next-dir') args.nextDir = argv[++i];
    else if (a === '--config') args.config = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--verbose') args.verbose = true;
    else if (a === '--help' || a === '-h') {
      console.log('Uso: check-bundle-gate.mjs [--next-dir .next] [--config <json>] [--json] [--verbose]');
      process.exit(0);
    } else {
      console.error(`Argumento desconocido: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

const io = {
  readFile: p => fs.readFileSync(p, 'utf8'),
  exists: p => fs.existsSync(p),
  listChunks: dir => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.js') && !f.endsWith('.map')).sort() : []),
};

function emit(result, { json }) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const line = '─'.repeat(70);
  console.log(line);
  console.log('BUNDLE GATE — regresión de carga inicial (W2/W3)');
  console.log(line);
  if (result.build) {
    console.log(`Artefactos: ${result.build.nextDir} · chunks=${result.build.chunksScanned ?? '?'} · módulos=${result.build.modulesParsed ?? '?'} · boundaries=${result.build.proxiesParsed ?? '?'}`);
    if (result.build.libChunks && Object.keys(result.build.libChunks).length) {
      for (const [c, ls] of Object.entries(result.build.libChunks)) {
        console.log(`  · código vigilado en chunk asíncrono ${c}: ${ls.join(', ')} (legítimo si solo se alcanza vía import() de exportación)`);
      }
    }
  }
  if (result.shell) {
    console.log(`Shell (${result.shell.initialChunks} chunks iniciales): ${result.shell.clean ? 'limpio' : 'CONTIENE LIBRERÍAS'}`);
  }
  for (const v of result.views) {
    if (v.chunk) {
      console.log(`Vista ${v.name}: chunk=${v.chunk} · boundary=${(v.boundaries || []).join(',')} · cierre=${v.closureModules ?? '?'} módulos / ${v.closureChunks ?? '?'} chunks`);
    } else {
      console.log(`Vista ${v.name}: NO VERIFICADA`);
    }
  }
  if (result.notes.length) {
    console.log('\nNotas:');
    for (const n of result.notes) console.log(`  ! ${n}`);
  }
  if (result.violations.length) {
    console.log(`\n✗ FAIL — ${result.violations.length} regresión(es) confirmada(s):`);
    for (const v of result.violations) {
      console.log(`\n  [${v.scope}] ${v.lib} en "${v.chunk}" (vista: ${v.view})`);
      console.log(`    ${v.how}`);
      console.log(`    Dónde investigar: ${v.detail}`);
    }
  }
  if (result.blocked.length) {
    console.log(`\n⚠ BLOCKED — el gate NO pudo verificar la propiedad (${result.blocked.length}):`);
    for (const b of result.blocked) console.log(`  · ${b}`);
  }
  console.log('\n' + line);
  console.log(`RESULTADO: ${result.status}${result.status === 'PASS' ? ' — la carga inicial del POS/catálogo no incluye librerías de exportación' : ''}`);
  console.log(line);
}

function main() {
  const args = parseArgs(process.argv);
  const configPath = path.resolve(process.cwd(), args.config);
  const result = {
    status: 'BLOCKED',
    checkedAt: new Date().toISOString(),
    build: null,
    shell: null,
    views: [],
    violations: [],
    blocked: [],
    notes: [],
  };

  if (!io.exists(configPath)) {
    result.blocked.push(`No existe el archivo de configuración ${configPath}.`);
    emit(result, args);
    process.exit(2);
  }
  let cfg;
  try {
    cfg = JSON.parse(io.readFile(configPath));
  } catch (e) {
    result.blocked.push(`Configuración inválida (${args.config}): ${e.message}`);
    emit(result, args);
    process.exit(2);
  }
  const required = ['route', 'manifestRouteKey', 'manifestBaseName', 'pageEntry', 'watchedLibs', 'protectedViews'];
  const missing = required.filter(k => cfg[k] === undefined);
  if (missing.length) {
    result.blocked.push(`Configuración incompleta: faltan claves ${missing.join(', ')} en ${args.config}.`);
    emit(result, args);
    process.exit(2);
  }

  const res = runGate({ nextDir: args.nextDir, repoRoot: process.cwd(), config: cfg, io });
  emit(res, args);
  process.exit(res.status === 'PASS' ? 0 : res.status === 'FAIL' ? 1 : 2);
}

main();
