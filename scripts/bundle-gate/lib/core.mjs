/**
 * Bundle Gate — núcleo de análisis (usable desde el CLI y desde tests).
 *
 * `runGate()` ejecuta todas las comprobaciones y devuelve el objeto de
 * resultado sin efectos secundarios sobre el proceso (el CLI decide cómo
 * reportar y con qué código salir).
 */

import path from 'node:path';
import { detectLibs, signaturesFor } from './fingerprints.mjs';
import { buildChunkGraph, moduleClosure, importChain } from './chunk-graph.mjs';
import { anchorViewToChunk } from './anchors.mjs';
import { loadManifests as loadManifestsImpl } from './manifests.mjs';

/**
 * @param {{
 *   nextDir: string,
 *   repoRoot: string,
 *   config: object,
 *   io?: {readFile, exists, listChunks},
 * }} params
 */
export function runGate({ nextDir, repoRoot, config, io }) {
  const result = {
    status: 'BLOCKED', // fail-safe: solo pasa a PASS/FAIL tras verificación
    checkedAt: new Date().toISOString(),
    build: null,
    shell: null,
    views: [],
    violations: [],
    blocked: [],
    notes: [],
  };

  const fail = violation => {
    result.status = 'FAIL';
    result.violations.push(violation);
  };

  try {
    analyzeInto(result, { nextDir, repoRoot, config, io }, fail);
  } catch (e) {
    result.blocked.push(`Error inesperado durante el análisis: ${e.stack || e.message}`);
  }

  const viewsBlocked = result.views.some(v => !v.chunk);
  if (result.violations.length > 0) result.status = 'FAIL';
  else if (result.blocked.length > 0 || viewsBlocked) result.status = 'BLOCKED';
  else result.status = 'PASS';
  return result;
}

function analyzeInto(result, { nextDir, repoRoot, config: cfg, io }, fail) {
  result.build = { nextDir };

  // 0. Librerías vigiladas
  let sigs;
  try {
    sigs = signaturesFor(cfg.watchedLibs);
  } catch (e) {
    result.blocked.push(e.message);
    return;
  }

  // 1. Artefactos y manifiestos
  const loaded = loadManifestsImpl(nextDir, io, cfg);
  if (!loaded.ok) {
    result.blocked.push(...loaded.reasons);
    return;
  }
  const { initialChunks, asyncFalseModuleIds, chunksDir, chunkFiles, clientModules } = loaded.data;
  result.build.chunksScanned = chunkFiles.length;
  result.build.initialChunkCount = initialChunks.length;

  // 2. Grafo de chunks/módulos
  const graph = buildChunkGraph(chunksDir, io);
  result.notes.push(...graph.anomalies);
  if (graph.moduleChunk.size === 0) {
    result.blocked.push('No se pudo parsear ningún registro de módulo de los chunks — formato de Turbopack no reconocido. Actualizar el gate (README §"Si cambia el formato").');
    return;
  }
  result.build.modulesParsed = graph.moduleChunk.size;
  result.build.proxiesParsed = graph.proxies.length;

  // 3. Fingerprints: chunk → librerías con código ejecutable dentro
  const chunkLibs = new Map(); // chunk -> string[]
  for (const f of graph.chunkFiles) {
    let code;
    try {
      code = io.readFile(`${chunksDir}/${f}`);
    } catch (e) {
      result.blocked.push(`No se pudo leer el chunk ${f}: ${e.message}`);
      return;
    }
    const libs = detectLibs(code);
    if (libs.length) chunkLibs.set(f, libs);
  }
  result.build.libChunks = Object.fromEntries([...chunkLibs.entries()].map(([c, ls]) => [c, ls]));

  // 4. Check A — shell: ningún chunk de la carga inicial contiene librerías
  const initialLibs = [];
  for (const c of initialChunks) {
    for (const lib of chunkLibs.get(c) || []) initialLibs.push({ lib, chunk: c });
  }
  result.shell = {
    initialChunks: initialChunks.length,
    clean: initialLibs.length === 0,
  };
  for (const { lib, chunk } of initialLibs) {
    fail({
      scope: 'shell',
      view: cfg.route,
      lib,
      chunk,
      how: 'El código de la librería está presente en un chunk de la carga inicial de la ruta (entryJSFiles/rootMainFiles/clientModules async:false).',
      detail: `Chunk inicial "${chunk}" contiene código de ${lib}. Revisar qué import estático lo arrastra: buscar imports de "${lib}" alcanzables estáticamente desde el shell (src/app/, TerminalShell, HomePageClient).`,
    });
  }

  // 4b. Check A2 — módulos async:false: su cierre estático no debe alcanzar
  //     ningún chunk de librería (detecta un import estático nuevo desde el
  //     shell aunque el bundler aún lo liste como inicial).
  for (const id of asyncFalseModuleIds) {
    if (!graph.moduleChunk.has(id)) continue; // el módulo puede vivir solo en SSR
    const closure = moduleClosure(id, graph.moduleChunk, graph.moduleRefs);
    for (const c of closure.chunks) {
      for (const lib of chunkLibs.get(c) || []) {
        const chain = importChain(id, closure.chunkOwner.get(c), closure.parents);
        const culpritRefs = (graph.moduleRefs.get(closure.chunkOwner.get(c)) || []).filter(r => graph.moduleChunk.get(r) === c);
        fail({
          scope: 'shell-reachability',
          view: cfg.route,
          lib,
          chunk: c,
          how: `Alcanzado estáticamente desde el clientModule ${id} (async:false) vía módulos: ${chain.join(' → ')}.`,
          detail: `Cadena de chunks: ${chain.map(m => graph.moduleChunk.get(m)).join(' → ')} → ${culpritRefs.join(', ')}@${c} (${lib}).`,
        });
      }
    }
  }

  // 5. Check B — vistas protegidas
  for (const view of cfg.protectedViews) {
    const viewResult = {
      name: view.name,
      viewKey: view.viewKey || view.name,
      source: view.source,
    };
    result.views.push(viewResult);

    // 5a. el archivo fuente debe existir
    const srcPath = path.resolve(repoRoot, view.source);
    if (!io.exists(srcPath)) {
      result.blocked.push(`Vista "${view.name}": no existe el archivo fuente ${view.source}. Actualizar bundle-gate.config.json si la vista se movió o renombró.`);
      continue;
    }

    // 5b. anclar la vista a su chunk compilado
    const anchored = anchorViewToChunk(io.readFile(srcPath), graph.chunkFiles, f => io.readFile(`${chunksDir}/${f}`), {
      minAnchors: cfg.minAnchors ?? 3,
    });
    if (!anchored.ok) {
      result.blocked.push(`Vista "${view.name}": no se pudo anclar a un chunk de forma fiable. ${anchored.reason}`);
      continue;
    }
    viewResult.chunk = anchored.chunk;
    viewResult.anchorEvidence = anchored.anchors;

    // 5c. boundary(es) del next/dynamic que cargan ese chunk
    const proxies = graph.proxies.filter(p => p.chunks.includes(anchored.chunk));
    if (proxies.length === 0) {
      result.blocked.push(`Vista "${view.name}" anclada al chunk ${anchored.chunk}, pero ningún boundary de import() dinámica lo carga. ¿Se volvió estática la importación de la vista en TerminalShell? Verificar antes de confiar en cualquier resultado.`);
      continue;
    }
    viewResult.boundaries = proxies.map(p => p.proxyId);

    // 5d. por cada boundary: (i) chunks del array sin librerías; (ii) módulo
    //     destino registrado; (iii) cierre estático sin librerías.
    for (const proxy of proxies) {
      for (const c of proxy.chunks) {
        for (const lib of chunkLibs.get(c) || []) {
          fail({
            scope: 'view',
            view: view.name,
            lib,
            chunk: c,
            boundary: proxy.proxyId,
            how: 'El boundary del next/dynamic de la vista descarga un chunk que contiene código de la librería — se descarga al ABRIR la vista, sin que el usuario exporte nada.',
            detail: `Boundary ${proxy.proxyId} (chunk ${proxy.ownerChunk}) carga ${proxy.chunks.join(', ')}; "${c}" contiene ${lib}. Buscar el import estático reintroducido en la cadena de imports de la vista.`,
          });
        }
      }

      if (!graph.moduleChunk.has(proxy.targetId)) {
        result.blocked.push(`Vista "${view.name}": el módulo destino ${proxy.targetId} del boundary ${proxy.proxyId} no está registrado en ningún chunk parseable. No se puede verificar el cierre estático de la vista.`);
        continue;
      }

      const closure = moduleClosure(proxy.targetId, graph.moduleChunk, graph.moduleRefs);
      viewResult.closureModules = closure.modules.size;
      viewResult.closureChunks = closure.chunks.size;

      for (const c of closure.chunks) {
        for (const lib of chunkLibs.get(c) || []) {
          const ownerModule = closure.chunkOwner.get(c);
          const chain = importChain(proxy.targetId, ownerModule, closure.parents);
          const chainStr = chain.map(m => `${m}@${graph.moduleChunk.get(m)}`).join(' → ');
          // módulos exactos del dueño que apuntan al chunk con la librería
          const culpritRefs = (graph.moduleRefs.get(ownerModule) || []).filter(r => graph.moduleChunk.get(r) === c);
          fail({
            scope: 'view-closure',
            view: view.name,
            lib,
            chunk: c,
            boundary: proxy.proxyId,
            how: `El cierre estático de la vista (módulo de entrada ${proxy.targetId}) alcanza código de ${lib} a través de imports estáticos.`,
            detail: `Cadena: ${chainStr} → ${culpritRefs.join(', ')}@${c} (código de ${lib}). El import culpable está en el módulo ${ownerModule} del chunk ${graph.moduleChunk.get(ownerModule)}, que referencia estáticamente el/los módulo(s) ${culpritRefs.join(', ')} del chunk con la librería.`,
          });
        }
      }
    }
  }
}

export { detectLibs, signaturesFor };
