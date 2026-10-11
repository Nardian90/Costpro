/**
 * Bundle Gate — carga y validación de los artefactos de build de Next.js.
 *
 * Artefactos utilizados (todos generados por `next build` del MISMO commit):
 *
 *  - `.next/build-manifest.json`
 *      `rootMainFiles` (chunks runtime/framework) y `polyfillFiles`.
 *      `chunkLoadingGlobal` debe ser "TURBOPACK": si cambia el bundler,
 *      el formato de este gate ya no aplica → BLOCKED.
 *
 *  - `.next/server/app/page_client-reference-manifest.js`
 *      Manifiesto RSC de la ruta `/` (el shell). De él se extraen:
 *        · `entryJSFiles["[project]/src/app/page"]` — lista de chunks
 *          iniciales de la ruta calculada por Turbopack (cierre estático).
 *        · `clientModules` — módulos cliente con su flag `async` y sus
 *          chunks; los `async:false` cargan con la ruta.
 *
 *  - `.next/static/chunks/*.js` — chunks cliente compilados.
 *
 * Cualquier artefacto ausente, vacío o con formato no reconocido produce
 * BLOCKED (el gate jamás reporta PASS sin haber verificado la propiedad).
 */

/**
 * @typedef {{status:'PASS'|'FAIL'|'BLOCKED', reasons:string[]}} LoadResult
 */

/**
 * Normaliza la ruta de un chunk desde cualquier manifiesto a su nombre de
 * archivo dentro de .next/static/chunks. Soporta los formatos observados:
 *   "static/chunks/X.js" (build-manifest, entryJSFiles)
 *   "/_next/static/chunks/X.js" (clientModules)
 */
function normalizeChunkPath(p) {
  const marker = 'static/chunks/';
  const idx = p.lastIndexOf(marker);
  return idx >= 0 ? p.slice(idx + marker.length) : p;
}

/**
 * Carga los manifiestos necesarios.
 * @param {string} nextDir ruta del directorio .next
 * @param {{readFile: (p: string) => string, exists: (p: string) => boolean, listChunks: (dir: string) => string[]}} io
 * @param {{pageEntry: string}} cfg
 * @returns {{ok: true, data: object} | {ok: false, status: 'BLOCKED', reasons: string[]}}
 */
export function loadManifests(nextDir, io, cfg) {
  const reasons = [];

  // 1. build-manifest.json
  const bmPath = `${nextDir}/build-manifest.json`;
  if (!io.exists(bmPath)) {
    return { ok: false, status: 'BLOCKED', reasons: [`Falta ${bmPath}. El gate requiere artefactos de un build de producción completo (\`next build\`).`] };
  }
  let buildManifest;
  try {
    buildManifest = JSON.parse(io.readFile(bmPath));
  } catch (e) {
    return { ok: false, status: 'BLOCKED', reasons: [`build-manifest.json no es JSON válido: ${e.message}`] };
  }
  const bundler = buildManifest.chunkLoadingGlobal;
  if (bundler !== 'TURBOPACK') {
    reasons.push(`chunkLoadingGlobal="${bundler}" — el gate fue validado contra el loader de Turbopack. Si el proyecto migró de bundler, actualizar el gate (ver README) antes de confiar en su resultado.`);
    return { ok: false, status: 'BLOCKED', reasons };
  }

  // 2. client-reference-manifest del shell
  const fileName = `${cfg.manifestBaseName}_client-reference-manifest.js`;
  const crmPath = `${nextDir}/server/app/${fileName}`;
  if (!io.exists(crmPath)) {
    return { ok: false, status: 'BLOCKED', reasons: [`Falta ${crmPath}. ¿Se construyó la ruta del shell (${cfg.route})? ¿Cambió Next.js el formato del manifiesto RSC?`] };
  }
  let rsc;
  try {
    const src = io.readFile(crmPath);
    const anchor = src.indexOf('= ', src.indexOf(cfg.manifestRouteKey));
    const start = src.indexOf('{', anchor);
    const end = src.lastIndexOf('}');
    if (anchor < 0 || start < 0 || end <= start) throw new Error('no se encontró el objeto JSON del manifiesto');
    rsc = JSON.parse(src.slice(start, end + 1));
  } catch (e) {
    return { ok: false, status: 'BLOCKED', reasons: [`${fileName} no pudo parsearse: ${e.message}. Formato del manifiesto RSC cambiado → actualizar el gate.`] };
  }

  // entryJSFiles de la ruta protegida — cierre estático inicial calculado
  // por Turbopack (la contabilidad propia del bundler de "qué JS carga /")
  const entryFiles = rsc.entryJSFiles?.[cfg.pageEntry];
  if (!Array.isArray(entryFiles) || entryFiles.length === 0) {
    return {
      ok: false,
      status: 'BLOCKED',
      reasons: [`entryJSFiles no contiene la entrada "${cfg.pageEntry}". Claves disponibles: ${Object.keys(rsc.entryJSFiles || {}).join(', ') || '(ninguna)'}. Si Next.js cambió el esquema del manifiesto, actualizar el gate.`],
    };
  }
  const initialChunks = new Set();
  for (const p of entryFiles) initialChunks.add(normalizeChunkPath(p));

  // clientModules: chunks iniciales (async:false) e ids de módulos por nombre
  const clientModules = rsc.clientModules || {};
  if (Object.keys(clientModules).length === 0) {
    return { ok: false, status: 'BLOCKED', reasons: ['clientModules vacío en el manifiesto RSC — formato no reconocido.'] };
  }
  const asyncFalseModuleIds = [];
  for (const [key, mod] of Object.entries(clientModules)) {
    if (!mod || typeof mod !== 'object' || !Array.isArray(mod.chunks)) {
      reasons.push(`clientModule "${key}" sin lista de chunks — entrada ignorada.`);
      continue;
    }
    if (mod.async === false) {
      asyncFalseModuleIds.push(mod.id);
      for (const c of mod.chunks) initialChunks.add(normalizeChunkPath(c));
    }
  }
  if (asyncFalseModuleIds.length === 0) {
    return { ok: false, status: 'BLOCKED', reasons: ['Ningún clientModule con async:false — no se puede determinar la carga inicial.'] };
  }

  // 3. chunks en disco
  const chunksDir = `${nextDir}/static/chunks`;
  const chunkFiles = io.listChunks(chunksDir);
  if (chunkFiles.length === 0) {
    return { ok: false, status: 'BLOCKED', reasons: [`No hay chunks cliente en ${chunksDir}.`] };
  }

  // rootMainFiles + polyfill
  for (const p of buildManifest.rootMainFiles || []) initialChunks.add(normalizeChunkPath(p));
  for (const p of buildManifest.polyfillFiles || []) initialChunks.add(normalizeChunkPath(p));

  // verificación de que todos los chunks iniciales existen en disco
  const missing = [...initialChunks].filter(c => !chunkFiles.includes(c));
  if (missing.length > 0) {
    return {
      ok: false,
      status: 'BLOCKED',
      reasons: [`Los siguientes chunks de la carga inicial no están en disco: ${missing.join(', ')}. Build incompleto o formato de rutas cambiado.`],
    };
  }

  return {
    ok: true,
    data: {
      buildManifest,
      rsc,
      initialChunks: [...initialChunks],
      asyncFalseModuleIds,
      chunksDir,
      chunkFiles,
      clientModules,
      entryFiles,
    },
  };
}

/**
 * Localiza el chunk (o chunks) dueños de un módulo por su clave en
 * clientModules — p. ej. "[project]/src/components/.../POSView.tsx".
 * Devuelve {id, chunks} si existe exactamente una coincidencia.
 */
export function findClientModule(rsc, pathFragment) {
  const cms = rsc.clientModules || {};
  const hits = [];
  for (const [key, mod] of Object.entries(cms)) {
    if (key.includes(pathFragment)) hits.push({ key, mod });
  }
  return hits;
}
