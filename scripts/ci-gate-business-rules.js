#!/usr/bin/env node
/**
 * BUSINESS RULES GATE — CP-BRA-001 (Fase 9 de CP-SAAS-BUSINESS-RULES-CERTIFICATION-001)
 *
 * Puerta de aseguramiento empresarial. Estática y sin credenciales (excepto
 * lectura del cuerpo del PR vía archivo JSON pre-descargado por el workflow).
 *
 * Qué hace:
 *  1. Integridad del manifiesto de reglas (siempre, fail-closed):
 *     - JSON válido, familias conocidas, IDs únicos y con prefijo válido.
 *     - Catálogo/política presentes en el repo.
 *     - Archivos de prueba/ruta referenciados por reglas críticas existen.
 *     - Dominios críticos con rutas no vacías.
 *  2. Declaración de reglas del PR (--pr-body <json de la API de GitHub>):
 *     - Exige la sección «Reglas de negocio afectadas» de la plantilla.
 *     - Acepta «NINGUNA» o IDs válidos del manifiesto.
 *     - Si el PR toca dominios críticos (--changed-from <ref>), la sección es
 *       OBLIGATORIA con IDs válidos (NINGUNA sin justificación de dominio
 *       crítico = fallo).
 *  3. Sin --pr-body: solo validez estructural (modo push/local).
 *
 * Códigos de salida: 0 OK · 1 FALLO (fail-closed).
 * No debilita ningún control existente; no toca migraciones ni bases de datos.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'docs/quality/business-rules/business-rules-manifest.json');

const FAMILIAS_VALIDAS = ['FIN', 'INV', 'PUR', 'POS', 'DOC', 'PRO', 'CAT', 'TEN', 'SEC', 'HR', 'REP', 'SYS'];
const ID_REGEX = /^(FIN|INV|PUR|POS|DOC|PRO|CAT|TEN|SEC|HR|REP|SYS)-\d{3}$/;
// Para extracción en texto libre: \b en ambos lados (evita ^/$ que fallan con
// IDs a mitad de línea como "FIN-001, SEC-002"; \d{3}\b no matchea FIN-0012)
const ID_REGEX_GLOBAL = /\b(FIN|INV|PUR|POS|DOC|PRO|CAT|TEN|SEC|HR|REP|SYS)-\d{3}\b/g;

const problems = [];
function fail(msg) {
  problems.push(msg);
}

function loadManifest() {
  let raw;
  try {
    raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  } catch (e) {
    fail(`Manifiesto de reglas no legible: ${MANIFEST_PATH} (${e.message})`);
    return null;
  }
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (e) {
    fail(`Manifiesto de reglas corrupto (JSON inválido): ${e.message}`);
    return null;
  }
  return manifest;
}

function validateManifest(m) {
  if (!m) return;
  if (m.standard !== 'CP-BRA-001') fail(`standard inesperado: "${m.standard}"`);
  if (!Array.isArray(m.families) || m.families.length === 0) fail('families vacío o no es lista');

  for (const doc of ['catalog_doc', 'policy_doc']) {
    if (typeof m[doc] !== 'string' || !fs.existsSync(path.join(REPO_ROOT, m[doc]))) {
      fail(`documento ${doc} no existe: ${m[doc]}`);
    }
  }

  const seen = new Set();
  const register = (id, where) => {
    if (!ID_REGEX.test(id)) {
      fail(`ID inválido en ${where}: "${id}" (formato FAM-NNN)`);
      return;
    }
    const fam = id.split('-')[0];
    if (!FAMILIAS_VALIDAS.includes(fam)) fail(`familia desconocida para ${id} en ${where}`);
    if (seen.has(id)) fail(`ID duplicado en el manifiesto: ${id} (${where})`);
    seen.add(id);
  };

  if (Array.isArray(m.critical_rules)) {
    for (const r of m.critical_rules) {
      if (!r || typeof r.id !== 'string') {
        fail('critical_rules contiene una entrada sin id');
        continue;
      }
      register(r.id, 'critical_rules');
      if (!r.severity) fail(`regla crítica ${r.id} sin severity`);
      if (r.tests) {
        if (!Array.isArray(r.tests)) {
          fail(`regla crítica ${r.id}: tests debe ser lista`);
        } else {
          for (const t of r.tests) {
            const p = path.join(REPO_ROOT, t);
            if (!fs.existsSync(p)) fail(`regla crítica ${r.id}: prueba/ruta referenciada no existe: ${t}`);
          }
        }
      }
    }
  } else {
    fail('critical_rules no es lista');
  }

  if (Array.isArray(m.other_rules)) {
    for (const id of m.other_rules) register(id, 'other_rules');
  } else {
    fail('other_rules no es lista');
  }

  if (!Array.isArray(m.critical_domains) || m.critical_domains.length === 0) {
    fail('critical_domains vacío o no es lista');
  } else {
    for (const d of m.critical_domains) {
      if (!d || typeof d.domain !== 'string') {
        fail('critical_domains con entrada sin domain');
        continue;
      }
      if (!Array.isArray(d.paths) || d.paths.length === 0) {
        fail(`dominio crítico "${d.domain}" sin rutas`);
      }
    }
  }

  if (problems.length === 0) {
    console.log(`[CP-BRA-001] Manifiesto OK: ${m.critical_rules.length} reglas críticas, ${m.other_rules.length} reglas de seguimiento, ${m.critical_domains.length} dominios críticos.`);
  }
}

function runGitDiff(args) {
  try {
    return execFileSync('git', ['diff', '--name-only'].concat(args), { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    return null;
  }
}

function toLines(out) {
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

function changedFiles(baseRef) {
  // 1) Tres puntos (merge-base): correcto con historial completo.
  let out = runGitDiff([`${baseRef}...HEAD`]);
  if (out !== null) return toLines(out);
  // 2) Checkout superficial (depth=1, default de actions/checkout): fetch
  //    superficial del SHA base y reintento.
  try {
    execFileSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', baseRef], { cwd: REPO_ROOT, encoding: 'utf8' });
  } catch (e) {
    fail(`No se pudo obtener el SHA base ${baseRef}: ${e.message}`);
    return null;
  }
  out = runGitDiff([`${baseRef}...HEAD`]);
  if (out !== null) return toLines(out);
  // 3) Sin base común en shallow: dos puntos (árboles directos, sin merge-base).
  //    Con el checkout de merge-commit de GitHub, base..HEAD es exactamente el diff del PR.
  out = runGitDiff([baseRef, 'HEAD']);
  if (out !== null) {
    console.log('[CP-BRA-001] Diff calculado en modo dos puntos (checkout superficial sin base común).');
    return toLines(out);
  }
  fail(`No se pudo calcular el diff contra ${baseRef}`);
  return null;
}

function detectCriticalDomains(files, manifest) {
  const hits = new Set();
  for (const f of files) {
    for (const d of manifest.critical_domains) {
      for (const p of d.paths) {
        if (f === p.replace(/\/$/, '') || f.startsWith(p)) {
          hits.add(d.domain);
          break;
        }
      }
    }
  }
  return [...hits];
}

function parsePrBody(prBodyFile) {
  let json;
  try {
    json = JSON.parse(fs.readFileSync(prBodyFile, 'utf8'));
  } catch (e) {
    fail(`--pr-body no es JSON legible: ${e.message}`);
    return null;
  }
  const body = typeof json.body === 'string' ? json.body : (json.body === null ? '' : null);
  if (body === null) {
    fail('El JSON del PR no contiene campo "body"');
    return null;
  }
  return body;
}

function extractDeclaration(body) {
  // Sección marcador en la plantilla de PR:
  //   ## Reglas de negocio afectadas (CP-BRA-001)
  const marker = /##\s*Reglas de negocio afectadas\s*\(CP-BRA-001\)/i;
  const idx = body.search(marker);
  if (idx === -1) return null;
  const rest = body.slice(idx + body.match(marker)[0].length);
  const nextHeading = rest.search(/^##\s+/m);
  const section = (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();
  return section;
}

function validateDeclaration(section, manifest, criticalDomains) {
  const declared = section.match(ID_REGEX_GLOBAL) || [];
  const ids = declared.filter((id) => manifest.critical_rules.some((r) => r.id === id) || manifest.other_rules.includes(id));
  const unknown = declared.filter((id) => !ids.includes(id));
  const saysNone = /NINGUNA/i.test(section);

  if (unknown.length > 0) {
    fail(`IDs declarados que NO existen en el catálogo CP-BRA-001: ${[...new Set(unknown)].join(', ')}. Actualice BUSINESS-RULES-CATALOG.md o corrija el PR.`);
    return;
  }

  if (criticalDomains.length > 0) {
    if (ids.length === 0) {
      // Permitir "NINGUNA" SOLO si se justifica que no se alteran reglas;
      // el dominio crítico exige declaración con IDs — la política §17 lo requiere.
      fail(`El PR modifica dominios críticos (${criticalDomains.join(', ')}) y la sección «Reglas de negocio afectadas» no declara ningún ID válido del catálogo. Debe listar las reglas afectadas (ver docs/quality/business-rules/BUSINESS-RULES-CATALOG.md).`);
      return;
    }
    console.log(`[CP-BRA-001] Declaración OK — dominios críticos afectados: ${criticalDomains.join(', ')}; reglas declaradas: ${ids.join(', ')}.`);
  } else if (ids.length > 0) {
    console.log(`[CP-BRA-001] Declaración OK — sin dominios críticos en el diff; reglas declaradas: ${ids.join(', ')}.`);
  } else if (saysNone) {
    console.log('[CP-BRA-001] Declaración OK — NINGUNA regla afectada (diff sin dominios críticos).');
  } else {
    console.log('[CP-BRA-001] Aviso: la sección de reglas está vacía y el diff no toca dominios críticos. Se permite (declaración opcional fuera de dominios críticos).');
  }
}

function main() {
  const argv = process.argv.slice(2);
  let prBodyFile = null;
  let baseRef = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--pr-body') prBodyFile = argv[i + 1];
    if (argv[i] === '--changed-from') baseRef = argv[i + 1];
  }

  const manifest = loadManifest();
  validateManifest(manifest);

  if (manifest && problems.length === 0) {
    if (prBodyFile) {
      const body = parsePrBody(prBodyFile);
      if (body !== null && baseRef) {
        const files = changedFiles(baseRef);
        if (files) {
          const criticalDomains = detectCriticalDomains(files, manifest);
          if (criticalDomains.length > 0) {
            console.log(`[CP-BRA-001] Archivos modificados en dominios críticos: ${criticalDomains.join(', ')} (${files.length} archivos en el diff).`);
          }
          const section = extractDeclaration(body);
          if (section === null) {
            fail('El PR no contiene la sección «## Reglas de negocio afectadas (CP-BRA-001)» de la plantilla. Use la plantilla vigente (.github/pull_request_template.md).');
          } else {
            validateDeclaration(section, manifest, criticalDomains);
          }
        }
      }
    } else {
      console.log('[CP-BRA-001] Modo estático: integridad del manifiesto verificada (sin evaluación de declaración de PR).');
    }
  }

  if (problems.length > 0) {
    console.error('[CP-BRA-001] GATE FALLIDO — razones:');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('Referencia: docs/quality/business-rules/STANDARD-CP-BRA-001.md §17');
    process.exit(1);
  }
  console.log('[CP-BRA-001] GATE PASS.');
  process.exit(0);
}

main();
