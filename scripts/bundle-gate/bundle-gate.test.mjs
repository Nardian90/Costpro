/**
 * Tests del Bundle Gate — casos positivos y negativos sobre fixtures
 * sintéticos con el MISMO formato que emiten los artefactos reales de
 * Next.js 16.3.3 + Turbopack (verificado contra el build de producción
 * de este repositorio).
 *
 * Cobertura (misión §5):
 *   1. Build válido → PASS
 *   2. Regresión estática controlada → FAIL
 *   3. Import dinámico legítimo → no es falso positivo (PASS)
 *   4. Imports de tipos → no son dependencias ejecutables
 *   5. Dependencia transitiva → detectada (cadena módulo→módulo→lib)
 *   6. Artefactos ausentes/inválidos → BLOCKED (jamás PASS)
 *   7. Rutas no protegidas → sin falsos positivos
 *
 * La validación final contra artefactos reales del build se ejecuta aparte
 * (`bun run gate:bundle` tras `next build`) — ver README.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { detectLibs } from './lib/fingerprints.mjs';
import { parseModuleRegistrations, parseProxies, staticRefs, moduleClosure, importChain } from './lib/chunk-graph.mjs';
import { anchorViewToChunk, extractLiterals } from './lib/anchors.mjs';
import { runGate } from './lib/core.mjs';

// ─────────────────── helpers de fixtures Turbopack ───────────────────

const PUSH_HEAD = '(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,';

/** Registra módulos en formato Turbopack real. factoryFn recibe el nombre del parámetro. */
function mod(id, factoryBody, param = 't') {
  return `${PUSH_HEAD}${id},${param}=>{${factoryBody}}]);\n`;
}

/** Fábrica proxy de import() dinámica (boundary perezoso). */
function proxyFactory(param, chunks, targetId) {
  const list = chunks.map(c => `"static/chunks/${c}"`).join(',');
  return `${PUSH_HEAD}0,${param}=>{${param}.v(t=>Promise.all([${list}].map(t=>${param}.l(t))).then(()=>t(${targetId})))}]);\n`;
}

// Código con fingerprints reales de las librerías (mismas señales que el
// build real: ver scripts/bundle-gate/lib/fingerprints.mjs y la auditoría).
const JSPDF_CODE = `var F="WinAnsiEncoding";function getCharWidthsArray(a,b){return[]}class AcroForm{}`; // jspdf
const HTML2CANVAS_CODE = `var IGNORE_ATTR="data-html2canvas-ignore";function createElementClone(n){return n.cloneNode(true)}`; // html2canvas
const AUTOTABLE_CODE = `function applyPlugin(d){d.autoTable=function(){return drawTable(this,{cellPadding:4})}}`; // jspdf-autotable
const XLSX_CODE = `function book_append_sheet(wb,sheet,name){wb.SheetNames.push(name)}function sheet_add_aoa(ws,data,opts){}`; // @e965/xlsx

function writeFixture(dir, { chunks, rscManifest, buildManifest }) {
  fs.mkdirSync(path.join(dir, '.next/static/chunks'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.next/server/app'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.next/build-manifest.json'),
    JSON.stringify(buildManifest ?? { chunkLoadingGlobal: 'TURBOPACK', rootMainFiles: ['static/chunks/runtime.js'], polyfillFiles: [] }),
  );
  fs.writeFileSync(
    path.join(dir, '.next/server/app/page_client-reference-manifest.js'),
    `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\nglobalThis.__RSC_MANIFEST["/page"] = ${JSON.stringify(rscManifest)};`,
  );
  for (const [name, code] of Object.entries(chunks)) {
    fs.writeFileSync(path.join(dir, '.next/static/chunks', name), code);
  }
}

const RSC_TEMPLATE = clientModules => ({
  moduleLoading: { prefix: '' },
  clientModules,
  ssrModuleMapping: {},
  edgeSSRModuleMapping: {},
  rscModuleMapping: {},
  edgeRSCModuleMapping: {},
  entryCSSFiles: {},
  entryJSFiles: { '[project]/src/app/page': ['static/chunks/runtime.js', 'static/chunks/shell.js'] },
});

const TEST_CONFIG = {
  route: '/',
  manifestRouteKey: '/page',
  manifestBaseName: 'page',
  pageEntry: '[project]/src/app/page',
  watchedLibs: ['jspdf', 'html2canvas', 'jspdf-autotable', '@e965/xlsx'],
  minAnchors: 3,
  protectedViews: [{ name: 'POS', viewKey: 'pos', source: 'src/views/POSView.tsx' }],
};

// Literales ancla de la vista — presentes en el fuente y SOLO en posview.js
const VIEW_LITERALS = ['Activar modo Cajero Express en POS', 'Carrito vacío del POS — agrega productos', 'Ir al Historial de Ventas del POS'];
const VIEW_SOURCE = `export default function POSView() {
  const a = "${VIEW_LITERALS[0]}";
  const b = "${VIEW_LITERALS[1]}";
  const c = "${VIEW_LITERALS[2]}";
  return a + b + c;
}`;

function baseChunks({ viewRefs = [], extraViewCode = '' } = {}) {
  return {
    'runtime.js': mod(1001, '"use strict";module.exports={};'),
    'shell.js':
      mod(1002, '"use strict";t.i(1001);var shell="HomeShell";') +
      proxyFactory('s', ['posview.js'], 2001),
    'posview.js':
      `${VIEW_LITERALS.map(l => `var x${Math.abs(l.length)}=${JSON.stringify(l)};`).join('')}${extraViewCode}` +
      mod(2001, `"use strict";${viewRefs.map(r => `t.i(${r});`).join('')}var pos="view";`) +
      proxyFactory('s', ['jspdf-chunk.js'], 3001), // boundary de exportación (dinámico, legítimo)
    'jspdf-chunk.js': `${JSPDF_CODE}\n` + mod(3001, '"use strict";var pdf="jspdf module";'),
  };
}

const baseRsc = () =>
  RSC_TEMPLATE({
    '[project]/src/app/HomePageClient.tsx': { id: 1002, name: '*', chunks: ['/_next/static/chunks/shell.js'], async: false },
  });

const testIO = root => ({
  readFile: p => fs.readFileSync(p, 'utf8'),
  exists: p => fs.existsSync(p),
  listChunks: dir => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.js') && !f.endsWith('.map')).sort() : []),
});

// ─────────────────────────── contexto ───────────────────────────
let tmp;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-gate-test-'));
  fs.mkdirSync(path.join(tmp, 'src/views'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'src/views/POSView.tsx'), VIEW_SOURCE);
});
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function runFixture(chunks, { rsc, config, buildManifest } = {}) {
  const dir = fs.mkdtempSync(path.join(tmp, 'fx-'));
  writeFixture(dir, { chunks, rscManifest: rsc ?? baseRsc(), buildManifest });
  return runGate({
    nextDir: path.join(dir, '.next'),
    repoRoot: tmp,
    config: config ?? TEST_CONFIG,
    io: testIO(dir),
  });
}

// ─────────────────── 1. build válido → PASS ───────────────────
describe('Caso 1 — build válido (librerías fuera de la carga inicial protegida)', () => {
  it('PASS con shell limpio y vista que solo referencia la lib vía boundary dinámico', () => {
    const res = runFixture(baseChunks());
    expect(res.status).toBe('PASS');
    expect(res.violations).toHaveLength(0);
    expect(res.shell.clean).toBe(true);
    expect(res.views[0].chunk).toBe('posview.js');
    // la lib vive en su chunk asíncrono y se reporta como tal
    expect(Object.keys(res.build.libChunks)).toEqual(['jspdf-chunk.js']);
  });
});

// ─────────────────── 2. regresión estática → FAIL ───────────────────
describe('Caso 2 — regresión estática controlada → FAIL', () => {
  it('un import estático reintroducido en la vista hace fallar el gate con la lib y el chunk culpable', () => {
    // el módulo de la vista referencia estáticamente el módulo 3001 (jspdf)
    const res = runFixture(baseChunks({ viewRefs: [3001] }));
    expect(res.status).toBe('FAIL');
    expect(res.violations.length).toBeGreaterThan(0);
    const v = res.violations.find(x => x.scope === 'view-closure');
    expect(v).toBeDefined();
    expect(v.lib).toBe('jspdf');
    expect(v.chunk).toBe('jspdf-chunk.js');
    // la cadena debe pasar por el módulo de la vista
    expect(v.detail).toContain('posview.js');
  });

  it('la librería fusionada DENTRO del chunk de la vista también falla (fingerprint)', () => {
    const chunks = baseChunks();
    chunks['posview.js'] += `\n${JSPDF_CODE}\n`; // el bundler puso jspdf en el chunk de la vista
    const res = runFixture(chunks);
    expect(res.status).toBe('FAIL');
    const v = res.violations.find(x => x.scope === 'view' && x.lib === 'jspdf');
    expect(v).toBeDefined(); // el boundary de la vista descarga su propio chunk con jspdf dentro
  });
});

// ─────────────────── 3. import dinámico legítimo → PASS ───────────────────
describe('Caso 3 — import dinámico legítimo (clic de exportación) no es falso positivo', () => {
  it('el boundary import() de exportación NO se sigue: PASS', () => {
    const res = runFixture(baseChunks());
    expect(res.status).toBe('PASS');
    // evidencia de que el boundary existía y no se siguió
    expect(res.build.libChunks['jspdf-chunk.js']).toEqual(['jspdf']);
    expect(res.views[0].closureChunks).not.toContain('jspdf-chunk.js');
  });

  it('un import dinámico múltiple (varios chunks en el array) tampoco dispara FAIL', () => {
    const chunks = baseChunks();
    chunks['posview.js'] += proxyFactory('s', ['jspdf-chunk.js', 'html2canvas-chunk.js'], 3002);
    chunks['html2canvas-chunk.js'] = `${HTML2CANVAS_CODE}\n` + mod(3002, '"use strict";var h="h2c";');
    const res = runFixture(chunks);
    expect(res.status).toBe('PASS');
  });
});

// ─────────────────── 4. imports de tipos ───────────────────
describe('Caso 4 — imports de tipos no son dependencias ejecutables', () => {
  it('una mención textual de "jspdf" en un chunk (sin código) NO clasifica como dependencia', () => {
    const code = `var msg="error de jspdf al generar";/* ver docs de jspdf */`; // solo texto
    expect(detectLibs(code)).toEqual([]);
  });

  it('el gate pasa cuando la vista solo tiene import type (borrado en compilación, sin arista runtime)', () => {
    // Simula el output compilado de un archivo con `import type {jsPDF} from 'jspdf'`:
    // el tipo se borra — el módulo de la vista NO tiene t.i(3001) ni código de lib.
    const chunks = baseChunks({ extraViewCode: '/* type-only import erased by compiler: import type { jsPDF } from "jspdf" */' });
    const res = runFixture(chunks);
    expect(res.status).toBe('PASS');
  });
});

// ─────────────────── 5. dependencia transitiva ───────────────────
describe('Caso 5 — dependencia transitiva a través de otro módulo → detectada', () => {
  it('vista → helper → librería: FAIL con cadena de 3 módulos', () => {
    const chunks = baseChunks();
    chunks['helpers.js'] = mod(2004, '"use strict";t.i(3001);var helper="uses jspdf indirectly";');
    // la vista referencia el helper (que no está en su chunk)
    chunks['posview.js'] = chunks['posview.js'].replace('var pos="view";', 'var pos="view";t.i(2004);');
    const res = runFixture(chunks);
    expect(res.status).toBe('FAIL');
    const v = res.violations.find(x => x.scope === 'view-closure' && x.lib === 'jspdf');
    expect(v).toBeDefined();
    // la cadena reconstruida pasa por la vista y el helper, y termina en el chunk de la lib
    expect(v.detail).toMatch(/2001@posview\.js.*2004@helpers\.js/s);
    expect(v.detail).toContain('3001@jspdf-chunk.js');
  });
});

// ─────────────────── 6. artefactos ausentes/inválidos → BLOCKED ───────────────────
describe('Caso 6 — artefactos ausentes o inválidos → BLOCKED (nunca PASS)', () => {
  it('sin .next no hay PASS', () => {
    const res = runGate({ nextDir: path.join(tmp, 'no-existe'), repoRoot: tmp, config: TEST_CONFIG, io: testIO(tmp) });
    expect(res.status).toBe('BLOCKED');
    expect(res.violations).toHaveLength(0);
  });

  it('sin build-manifest.json → BLOCKED', () => {
    const dir = fs.mkdtempSync(path.join(tmp, 'fx-'));
    writeFixture(dir, { chunks: baseChunks(), rscManifest: baseRsc() });
    fs.rmSync(path.join(dir, '.next/build-manifest.json'));
    const res = runGate({ nextDir: path.join(dir, '.next'), repoRoot: tmp, config: TEST_CONFIG, io: testIO(dir) });
    expect(res.status).toBe('BLOCKED');
  });

  it('build-manifest.json corrupto → BLOCKED', () => {
    const dir = fs.mkdtempSync(path.join(tmp, 'fx-'));
    writeFixture(dir, { chunks: baseChunks(), rscManifest: baseRsc() });
    fs.writeFileSync(path.join(dir, '.next/build-manifest.json'), '{esto no es json');
    const res = runGate({ nextDir: path.join(dir, '.next'), repoRoot: tmp, config: TEST_CONFIG, io: testIO(dir) });
    expect(res.status).toBe('BLOCKED');
  });

  it('chunkLoadingGlobal distinto de TURBOPACK (formato/bundler cambiado) → BLOCKED', () => {
    const dir = fs.mkdtempSync(path.join(tmp, 'fx-'));
    writeFixture(dir, {
      chunks: baseChunks(),
      rscManifest: baseRsc(),
      buildManifest: { chunkLoadingGlobal: 'WEBPACK', rootMainFiles: [], polyfillFiles: [] },
    });
    const res = runGate({ nextDir: path.join(dir, '.next'), repoRoot: tmp, config: TEST_CONFIG, io: testIO(dir) });
    expect(res.status).toBe('BLOCKED');
    expect(res.blocked.join(' ')).toContain('Turbopack');
  });

  it('entryJSFiles sin la entrada del shell → BLOCKED', () => {
    const dir = fs.mkdtempSync(path.join(tmp, 'fx-'));
    writeFixture(dir, {
      chunks: baseChunks(),
      rscManifest: { ...baseRsc(), entryJSFiles: { '[project]/src/app/otro': ['static/chunks/runtime.js'] } },
    });
    const res = runGate({ nextDir: path.join(dir, '.next'), repoRoot: tmp, config: TEST_CONFIG, io: testIO(dir) });
    expect(res.status).toBe('BLOCKED');
  });

  it('chunks iniciales listados pero ausentes en disco → BLOCKED', () => {
    const dir = fs.mkdtempSync(path.join(tmp, 'fx-'));
    writeFixture(dir, {
      chunks: { 'shell.js': mod(1002, 'var x=1;') },
      rscManifest: baseRsc(), // lista runtime.js + shell.js en entryJSFiles
    });
    const res = runGate({ nextDir: path.join(dir, '.next'), repoRoot: tmp, config: TEST_CONFIG, io: testIO(dir) });
    expect(res.status).toBe('BLOCKED');
    expect(res.blocked.join(' ')).toContain('runtime.js');
  });

  it('vista cuyo anclaje es imposible → BLOCKED (no PASS silencioso)', () => {
    const dir = fs.mkdtempSync(path.join(tmp, 'fx-'));
    fs.writeFileSync(path.join(dir, 'noview.tsx'), 'export const NO_UNIQUE_LITERALS_HERE = 1;');
    writeFixture(dir, { chunks: baseChunks(), rscManifest: baseRsc() });
    const res = runGate({
      nextDir: path.join(dir, '.next'),
      repoRoot: dir,
      config: { ...TEST_CONFIG, protectedViews: [{ name: 'POS', viewKey: 'pos', source: 'noview.tsx' }] },
      io: testIO(dir),
    });
    expect(res.status).toBe('BLOCKED');
    expect(res.blocked.join(' ')).toContain('POS');
  });
});

// ─────────────────── 7. rutas no protegidas → sin falsos positivos ───────────────────
describe('Caso 7 — librerías legítimas de vistas NO protegidas no generan fallos', () => {
  it('otra vista (no configurada) con jspdf estático no afecta el resultado del gate', () => {
    const chunks = baseChunks();
    chunks['inventoryview.js'] =
      `var otro="Vista de inventario no protegida literal uno";\n` +
      `${JSPDF_CODE}\n` +
      mod(4001, '"use strict";t.i(3001);var inv="inventory view";'); // jspdf estático en vista NO protegida
    const res = runFixture(chunks);
    // el gate solo protege shell + vistas configuradas; inventoryview no está en config
    expect(res.status).toBe('PASS');
    // y jspdf sigue reportado como presente en el build (en chunks asíncronos)
    expect(res.build.libChunks['jspdf-chunk.js']).toEqual(['jspdf']);
  });

  it('el shell no se contamina por literales compartidos de otras vistas', () => {
    // un literal de la vista protegida NO debe aparecer en el shell de la fixture
    const chunks = baseChunks();
    for (const lit of VIEW_LITERALS) {
      expect(chunks['shell.js'].includes(lit)).toBe(false);
    }
    const res = runFixture(chunks);
    expect(res.views[0].chunk).toBe('posview.js');
  });
});

// ─────────────────── shell: regresiones propias ───────────────────
describe('Shell — regresiones de la carga inicial de la ruta', () => {
  it('código de jspdf dentro de un chunk inicial del shell → FAIL (scope shell)', () => {
    const chunks = baseChunks();
    chunks['shell.js'] += `\n${JSPDF_CODE}\n`;
    const res = runFixture(chunks);
    expect(res.status).toBe('FAIL');
    const v = res.violations.find(x => x.scope === 'shell' && x.lib === 'jspdf');
    expect(v).toBeDefined();
    expect(v.chunk).toBe('shell.js');
  });

  it('clientModule async:false que alcanza la lib estáticamente → FAIL (scope shell-reachability)', () => {
    const chunks = baseChunks();
    chunks['shell.js'] = chunks['shell.js'].replace('var shell="HomeShell";', 'var shell="HomeShell";t.i(3001);');
    const res = runFixture(chunks);
    expect(res.status).toBe('FAIL');
    const v = res.violations.find(x => x.scope === 'shell-reachability' && x.lib === 'jspdf');
    expect(v).toBeDefined();
  });
});

// ─────────────────── unit: parsers ───────────────────
describe('unit — parseModuleRegistrations', () => {
  it('extrae ids y fábricas con strings/templates anidados', () => {
    const code =
      mod(111, 'var s="hola, mundo";var tpl=`a${1+1}b`;') +
      mod(222, 't.i(333);') +
      mod(333, 'function(){return "x,y"}');
    const mods = parseModuleRegistrations(code);
    expect(mods.map(m => m.id)).toEqual([111, 222, 333]);
    expect(mods[0].code).toContain('hola, mundo');
  });

  it('staticRefs ignora .i(N) dentro de strings pero cuenta el código real', () => {
    const factory = `var s="texto .i(999) dentro";t.i(1234);`;
    expect(staticRefs(factory)).toEqual([1234]);
  });
});

describe('unit — parseProxies', () => {
  it('extrae proxy id, chunks y target', () => {
    const code = proxyFactory('s', ['a.js', 'b.js'], 4242);
    const px = parseProxies(code);
    expect(px).toHaveLength(1);
    expect(px[0]).toMatchObject({ proxyId: 0, chunks: ['a.js', 'b.js'], targetId: 4242 });
  });
});

describe('unit — moduleClosure / importChain', () => {
  it('BFS estático sigue t.i() y reconstruye la cadena', () => {
    const moduleChunk = new Map([
      [1, 'a.js'],
      [2, 'b.js'],
      [3, 'c.js'],
    ]);
    const moduleRefs = new Map([
      [1, [2]],
      [2, [3]],
      [3, []],
    ]);
    const cl = moduleClosure(1, moduleChunk, moduleRefs);
    expect([...cl.modules]).toEqual([1, 2, 3]);
    expect([...cl.chunks]).toEqual(['a.js', 'b.js', 'c.js']);
    const chain = importChain(1, 3, cl.parents);
    expect(chain).toEqual([1, 2, 3]);
  });
});

describe('unit — anchors', () => {
  it('ancla con suficientes literales únicos y falla con insuficientes', () => {
    const chunks = { 'posview.js': VIEW_LITERALS.map(l => JSON.stringify(l)).join('\n'), 'other.js': 'otra cosa' };
    const files = Object.keys(chunks);
    const read = f => chunks[f];
    const ok = anchorViewToChunk(VIEW_SOURCE, files, read, { minAnchors: 3 });
    expect(ok.ok).toBe(true);
    expect(ok.chunk).toBe('posview.js');
    const few = anchorViewToChunk('const a="literal corto unico";const b="x";', files, read, { minAnchors: 3 });
    expect(few.ok).toBe(false);
  });

  it('extractLiterals no devuelven literales duplicados', () => {
    const lits = extractLiterals(`const a="mismo literal aquí xx";const b="mismo literal aquí xx";`);
    expect(lits.filter(l => l === 'mismo literal aquí xx')).toHaveLength(1);
  });
});

describe('unit — detectLibs matriz de señales', () => {
  it('requiere señal primaria + secundaria (multi-señal)', () => {
    expect(detectLibs(JSPDF_CODE)).toEqual(['jspdf']);
    expect(detectLibs(HTML2CANVAS_CODE)).toEqual(['html2canvas']);
    expect(detectLibs(AUTOTABLE_CODE)).toEqual(['jspdf-autotable']);
    expect(detectLibs(XLSX_CODE)).toEqual(['@e965/xlsx']);
    // solo primaria sin secundaria → no match
    expect(detectLibs('var F="WinAnsiEncoding";')).toEqual([]);
    // solo secundaria sin primaria → no match
    expect(detectLibs('function getCharWidthsArray(){} class AcroForm{}')).toEqual([]);
  });
});
