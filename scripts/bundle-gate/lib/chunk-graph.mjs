/**
 * Bundle Gate — parser del grafo de chunks/módulos de Turbopack.
 *
 * Formato de artefactos sobre el que trabaja (verificado contra Next.js
 * 16.3.3 + Turbopack, build de producción de ESTE repositorio):
 *
 * 1. Registro de módulos — cada chunk cliente termina con:
 *      (globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push([
 *        <scriptExpr>, <moduleId>, <factoryFn>, <moduleId>, <factoryFn>, ...
 *      ])
 *    La fábrica es una expresión función (declarada o flecha). El escáner
 *    recorre el array por elementos balanceados (strings ' " `, comentarios,
 *    llaves/paréntesis/corchetes anidados).
 *
 * 2. Imports estáticos entre módulos — dentro del código de una fábrica,
 *    una referencia a otro módulo se compila como `x.i(<moduleId>)`.
 *    El import estático garantiza que el chunk dueño del módulo referenciado
 *    forma parte del cierre estático del chunk importador (invariante de
 *    Turbopack: nunca emite una referencia estática a un chunk no cargado).
 *
 * 3. Boundary de importación dinámica — `import('...')` se compila a un
 *    módulo proxy cuya fábrica es:
 *      s=>{s.v(t=>Promise.all(["static/chunks/A.js","static/chunks/B.js"]
 *        .map(t=>s.l(t))).then(()=>t(<targetModuleId>)))}
 *    El array contiene TODOS los chunks que deben descargarse para ejecutar
 *    el módulo destino (cierre de chunks calculado por Turbopack).
 *
 * 4. `import type` / `import { type X }` se borran en compilación: no
 *    generan `x.i()` ni registro de módulo, por lo que nunca son aristas.
 */

const PUSH_RE = /\(globalThis\.TURBOPACK\|\|\(globalThis\.TURBOPACK=\[\]\)\)\.push\(\[/g;

/** Salta un string con comillas simples/dobles; devuelve índice de la comilla de cierre. */
function skipString(code, i) {
  const q = code[i];
  i++;
  while (i < code.length && code[i] !== q) {
    if (code[i] === '\\') i++;
    i++;
  }
  return i;
}

/** Salta un template literal (con ${...} anidado). */
export function skipTemplate(code, i) {
  i++;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch === '`') return i;
    if (ch === '$' && code[i + 1] === '{') {
      i += 2;
      let d = 1;
      while (i < code.length && d > 0) {
        const c2 = code[i];
        if (c2 === '\\') { i += 2; continue; }
        if (c2 === '"' || c2 === "'" || c2 === '`') {
          i = c2 === '`' ? skipTemplate(code, i) : skipString(code, i);
          i++;
          continue;
        }
        if (c2 === '{' || c2 === '(' || c2 === '[') d++;
        else if (c2 === '}' || c2 === ')' || c2 === ']') d--;
        i++;
      }
      continue;
    }
    i++;
  }
  return i;
}

/**
 * Salta una expresión balanceada. Termina en ',' o cierre ']'/')' a
 * profundidad 0 (sin consumirlo). Maneja strings, templates, comentarios y
 * anidamiento — suficiente para el output máquina de Turbopack.
 */
export function skipExpr(code, i) {
  let depth = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '"' || ch === "'") { i = skipString(code, i) + 1; continue; }
    if (ch === '`') { i = skipTemplate(code, i) + 1; continue; }
    if (ch === '/' && code[i + 1] === '/') { while (i < code.length && code[i] !== '\n') i++; continue; }
    if (ch === '/' && code[i + 1] === '*') { const e = code.indexOf('*/', i); i = e < 0 ? code.length : e + 2; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) return i;
      depth--;
      i++;
      continue;
    } else if (ch === ',' && depth === 0) return i;
    i++;
  }
  return i;
}

/** Quita el texto de strings/templates preservando interpolaciones y estructura. */
function maskStrings(code) {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '"' || ch === "'") {
      const end = skipString(code, i);
      out += '""';
      i = end + 1;
      continue;
    }
    if (ch === '`') {
      // preservar ${...}, enmascarar texto literal
      out += '`';
      i++;
      while (i < code.length && code[i] !== '`') {
        if (code[i] === '\\') { i += 2; out += '\\'; continue; }
        if (code[i] === '$' && code[i + 1] === '{') {
          // copiar la interpolación tal cual (código real)
          let d = 1;
          out += '${';
          i += 2;
          while (i < code.length && d > 0) {
            const c2 = code[i];
            if (c2 === '\\') { out += c2; i += 2; continue; }
            if (c2 === '"' || c2 === "'") { const e = skipString(code, i); out += '""'; i = e + 1; continue; }
            if (c2 === '`') { const e = skipTemplate(code, i); out += '`'; i = e + 1; continue; }
            if (c2 === '{' || c2 === '(' || c2 === '[') d++;
            else if (c2 === '}' || c2 === ')' || c2 === ']') d--;
            out += c2;
            i++;
          }
          continue;
        }
        out += ' ';
        i++;
      }
      out += '`';
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Parsea los registros de módulos de un chunk.
 * @param {string} code código completo del chunk
 * @returns {{id: number, code: string}[]}
 */
export function parseModuleRegistrations(code) {
  const out = [];
  PUSH_RE.lastIndex = 0;
  let pm;
  while ((pm = PUSH_RE.exec(code))) {
    let i = pm.index + pm[0].length;
    // elemento 0: expresión del script — saltar hasta la coma a profundidad 0
    let depth = 0;
    while (i < code.length) {
      const ch = code[i];
      if (ch === '"' || ch === "'") { i = skipString(code, i) + 1; continue; }
      if (ch === '`') { i = skipTemplate(code, i) + 1; continue; }
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      else if (ch === ',' && depth === 0) break;
      i++;
    }
    i++;
    while (i < code.length) {
      while (i < code.length && /\s/.test(code[i])) i++;
      const numMatch = /^\d+/.exec(code.slice(i));
      if (!numMatch) break;
      const id = parseInt(numMatch[0], 10);
      i += numMatch[0].length;
      while (i < code.length && /[\s,]/.test(code[i])) i++;
      const fnStart = i;
      // la fábrica es una expresión: function(...), (...)=>..., o identificador
      if (code.startsWith('function', i) || code[i] === '(' || /^[A-Za-z_$]/.test(code[i])) {
        i = skipExpr(code, i);
        out.push({ id, code: code.slice(fnStart, i) });
      } else break;
      while (i < code.length && /[\s,]/.test(code[i])) i++;
      if (i >= code.length || code[i] === ']' || code[i] === ')') break;
    }
  }
  return out;
}

const PROXY_RE = /\.v\(\s*([\w$]+)\s*=>\s*Promise\.all\(\s*\[([^\]]*)\]\s*\.map\(\s*[\w$]+\s*=>\s*[\w$]+\.l\(\s*[\w$]+\s*\)\s*\)\s*\)\s*\.then\(\s*\(\s*\)\s*=>\s*([\w$]+)\((\d+)\)\s*\)\s*\)/;

/**
 * Parsea los módulos proxy (boundaries de import() dinámica) de un chunk.
 * @param {string} code
 * @returns {{proxyId: number, chunks: string[], targetId: number}[]}
 */
export function parseProxies(code) {
  const out = [];
  for (const { id, code: fc } of parseModuleRegistrations(code)) {
    const m = PROXY_RE.exec(fc);
    if (!m) continue;
    const chunks = [];
    const chunkRe = /"static\/chunks\/([^"]+\.js)"/g;
    let cm;
    while ((cm = chunkRe.exec(m[2]))) chunks.push(cm[1]);
    out.push({ proxyId: id, chunks, targetId: parseInt(m[4], 10) });
  }
  return out;
}

/**
 * Extrae las referencias estáticas `.i(N)` de una fábrica, con strings
 * enmascarados para evitar falsas aristas desde texto literal.
 * @param {string} factoryCode
 * @returns {number[]}
 */
export function staticRefs(factoryCode) {
  const masked = maskStrings(factoryCode);
  const refs = [];
  const re = /\.i\((\d+)\)/g;
  let m;
  while ((m = re.exec(masked))) refs.push(parseInt(m[1], 10));
  return refs;
}

/**
 * Construye el grafo completo desde el directorio de chunks.
 * @param {string} chunksDir  p. ej. `.next/static/chunks`
 * @param {{readFile: (p: string) => string, listChunks: (dir: string) => string[]}} io
 * @returns {{
 *   chunkFiles: string[],
 *   moduleChunk: Map<number, string>,
 *   moduleRefs: Map<number, number[]>,
 *   proxies: {proxyId: number, ownerChunk: string, chunks: string[], targetId: number}[],
 *   anomalies: string[]
 * }}
 */
export function buildChunkGraph(chunksDir, io) {
  const chunkFiles = io.listChunks(chunksDir);
  const moduleChunk = new Map();
  const moduleCode = new Map();
  const proxies = [];
  const anomalies = [];
  for (const f of chunkFiles) {
    const code = io.readFile(`${chunksDir}/${f}`);
    let modules;
    try {
      modules = parseModuleRegistrations(code);
    } catch (e) {
      anomalies.push(`No se pudo parsear el chunk ${f}: ${e.message}`);
      continue;
    }
    for (const { id, code: fc } of modules) {
      if (!moduleChunk.has(id)) {
        moduleChunk.set(id, f);
        moduleCode.set(id, fc);
      }
    }
    for (const p of parseProxies(code)) proxies.push({ ...p, ownerChunk: f });
  }
  const moduleRefs = new Map();
  for (const [id, fc] of moduleCode) moduleRefs.set(id, staticRefs(fc));
  return { chunkFiles, moduleChunk, moduleRefs, proxies, anomalies };
}

/**
 * BFS estático a nivel módulo desde un módulo de entrada. Sigue únicamente
 * aristas `x.i(N)` (imports estáticos). Los boundaries proxy NO se siguen
 * (la carga perezosa legítima corta el recorrido).
 * Devuelve los módulos alcanzados, los chunks alcanzados y el árbol de
 * padres para reconstruir la cadena de importación de un fallo.
 * @param {number} entryId
 * @param {Map<number, string>} moduleChunk
 * @param {Map<number, number[]>} moduleRefs
 */
export function moduleClosure(entryId, moduleChunk, moduleRefs) {
  const seen = new Set([entryId]);
  const parents = new Map();
  const queue = [entryId];
  const chunks = new Set();
  const chunkOwner = new Map(); // chunk -> moduleId que lo trajo primero
  if (moduleChunk.has(entryId)) chunks.add(moduleChunk.get(entryId));
  while (queue.length) {
    const id = queue.shift();
    for (const ref of moduleRefs.get(id) || []) {
      if (moduleChunk.has(ref)) {
        const c = moduleChunk.get(ref);
        if (!chunks.has(c)) { chunks.add(c); chunkOwner.set(c, id); }
      }
      if (!seen.has(ref)) {
        seen.add(ref);
        parents.set(ref, id);
        queue.push(ref);
      }
    }
  }
  return { modules: seen, chunks, parents, chunkOwner };
}

/**
 * Reconstruye la cadena de importación entry→...→moduleId para el reporte.
 * @param {number} entryId
 * @param {number} hitId
 * @param {Map<number, number>} parents
 * @returns {number[]}
 */
export function importChain(entryId, hitId, parents) {
  const chain = [hitId];
  let cur = hitId;
  while (cur !== entryId && parents.has(cur)) {
    cur = parents.get(cur);
    chain.unshift(cur);
  }
  return chain;
}
