#!/usr/bin/env node
/**
 * GUARD DE PRODUCCIÓN — scripts/lib/assert-not-production.mjs  (CP-INFRA-019)
 * ───────────────────────────────────────────────────────────────────────────
 * Bloquea que un script automatizado toque producción (CostproBD,
 * ref wthkddeleylijmonclxg) por accidente. Fail-closed: si el guard no puede
 * IDENTIFICAR el destino real de la operación, la operación no se ejecuta.
 *
 * Contrato (idéntico en .mjs / .py / .sh):
 *
 *   · PRODUCCIÓN se bloquea SIEMPRE por defecto (lectura y escritura).
 *   · Lectura de producción: exige ALLOW_PROD=read-only.
 *   · Escritura de producción: exige ADEMÁS ALLOW_PROD_WRITE=I_UNDERSTAND
 *     (doble flag explícito; queda registrado en stderr).
 *   · Escritura con destino DESCONOCIDO o AUSENTE: BLOQUEADA siempre
 *     (no hay flags que la autoricen — no se puede autorizar lo que no se
 *     identificó). Lectura sin destino: exige ALLOW_PROD=read-only (asume el
 *     peor caso: podría ser producción).
 *   · E2E (refs conocidos no-productivos), localhost y 127.0.0.1: paso libre.
 *   · La URL devuelta es la misma que recibió: el escritor DEBE usarla para
 *     construir la petición (así el destino comprobado y el ejecutado
 *     coinciden por construcción).
 *
 * Identificación del destino (CP-INFRA-019): el guard NO acepta "cualquier
 * URL que no contenga el ref de producción". Clasifica el destino por su
 * IDENTIFICADOR REAL de proyecto:
 *
 *   · url          → https://<ref>.supabase.co (o db.<ref>...) → ref = <ref>
 *   · projectRef   → identificador de proyecto ya extraído (p.ej. el ref
 *                    hardcodeado de una llamada a la Management API):
 *                    `https://api.supabase.com/v1/projects/<ref>/...`.
 *                    Verifica EXACTAMENTE ese ref.
 *   · url postgres → postgres://postgres.<ref>@... → ref = <ref>.
 *   · localhost / 127.0.0.1 / ::1 / *.localhost (cualquier esquema/puerto) →
 *                    local (paso libre).
 *   · Sin URL y sin ref  → destino no identificado (ver regla arriba).
 *   · Cualquier otra cosa (host no-supabase, ref no identificado como E2E
 *     conocido, URL malformada, .com en lugar de .co, etc.) → DESCONOCIDO:
 *     escritura bloqueada; lectura solo con ALLOW_PROD=read-only.
 *     Un "desconocido" que contenga el ref de producción se trata como
 *     PRODUCCIÓN (bloqueado + flags aplicables).
 *
 * E2E_KNOWN_REFS: refs no-productivos verificados del proyecto (CostproE2E
 * 'lguovmvrozxgssupkwpf' + el de rama efímera usado por los workflows E2E).
 * Solo estos refs remotos pasan como "e2e". Cualquier OTRO ref remoto es
 * "desconocido" y exige validación humana (ALLOW_PROD=read-only no lo
 * autoriza a escribir: se considera destino no verificado).
 *
 * Uso (ESM):
 *   import { assertNotProduction } from './lib/assert-not-production.mjs';
 *   // a) el escritor usa una URL:
 *   const url = assertNotProduction({ mode: 'write', url: SUPABASE_URL, context: 'mi-script' });
 *   // b) el escritor usa un ref hardcodeado (Management API):
 *   assertNotProduction({ mode: 'write', projectRef: 'wthkdd...', context: 'mi-script' });
 *
 * Uso (CLI, mismo contrato que .py/.sh):
 *   node scripts/lib/assert-not-production.mjs --mode write --url "$SUPA_URL" --context mi-script
 *   node scripts/lib/assert-not-production.mjs --mode write --project-ref "$REF" --context mi-script
 *   → exit 0 si pasa; exit 1 con mensaje claro si bloquea.
 *
 * Sin PII y sin secretos en mensajes: solo se imprime el ref del proyecto
 * (público en el cliente de la app) o el host enmascarado, nunca keys.
 */

export const PROD_REF = 'wthkddeleylijmonclxg'; // CostproBD (producción)
// Refs remotos NO productivos verificados (CostproE2E + rama efímera E2E).
// Un ref remoto que no esté aquí ni sea PROD_REF es "desconocido" (fail-closed).
export const E2E_KNOWN_REFS = ['lguovmvrozxgssupkwpf', 'e2e-branch-ephemeral'];

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

/**
 * Extrae el ref de proyecto de una URL de Supabase. Devuelve:
 *   { kind: 'supabase', ref }  → URL remota de Supabase identificada
 *   { kind: 'local' }          → host local
 *   { kind: 'unknown' }        → no se pudo identificar (NO se asume nada)
 */
export function classifyTarget(rawUrl) {
  const s = String(rawUrl ?? '').trim();
  if (!s) return { kind: 'none' };
  // ref de postgres connection string: postgres://postgres.<ref>@host/...
  const mPg = s.match(/postgres(?:ql)?:\/\/[^@]*\.([a-z0-9]{18,22})@/i);
  if (mPg) return { kind: 'supabase', ref: mPg[1].toLowerCase() };
  let u;
  try { u = new URL(s); } catch { return { kind: 'unknown' }; }
  const host = u.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host) || host.endsWith('.localhost')) return { kind: 'local' };
  if (host === 'supabase.co' || host.endsWith('.supabase.co')) {
    const parts = host.split('.');
    // <ref>.supabase.co | db.<ref>.supabase.co
    const ref = parts.length === 3 && parts[0] !== 'db'
      ? parts[0]
      : parts.length === 4 && parts[0] === 'db' ? parts[1] : null;
    if (ref && /^[a-z0-9]{18,22}$/.test(ref)) return { kind: 'supabase', ref };
  }
  return { kind: 'unknown' };
}

/** ¿El ref es uno de los no-productivos verificados? */
function isKnownE2eRef(ref) {
  return E2E_KNOWN_REFS.includes(ref);
}

function maskUrl(url) {
  const s = String(url);
  const m = s.match(/^https?:\/\/([^/?#]+)/i);
  return m ? `https://${m[1]}` : s.split('?')[0];
}

function prodBlockedMessage(context, target) {
  return (
    `[${context}] BLOQUEADO: ${target} es PRODUCCIÓN (CostproBD).\n` +
    `  Producción no es banco de pruebas (docs/OPERATIONS/REGLA_PRODUCCION_NO_ES_BANCO_DE_PRUEBAS.md).\n` +
    `  · Para SOLO LECTURA:    export ALLOW_PROD=read-only\n` +
    `  · Para ESCRITURA:       export ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND\n` +
    `  · Alternativa correcta: apunta el script a CostproE2E (E2E_SUPABASE_URL) o a Supabase local.`
  );
}

function writeBlockedMessage(context, target, reason) {
  return (
    `[${context}] BLOQUEADO: operación de ESCRITURA sin destino verificado (${target}).\n` +
    `  ${reason}\n` +
    `  Este bloqueo NO se puede autorizar con flags: un destino no identificado no puede\n` +
    `  aprobarse a ciegas (CP-INFRA-019). Identifica el destino real:\n` +
    `  · URL explícita https://<ref>.supabase.co (CostproE2E o local) en la llamada al guard,\n` +
    `  · o --project-ref/<projectRef> con el ref exacto si la operación es contra la Management API.\n` +
    `  · Producción NUNCA pasa como 'desconocida': si el destino es CostproBD se bloquea como producción.`
  );
}

/**
 * @param {object} opts
 * @param {'read'|'write'} [opts.mode='write']  'read' = el script solo lee.
 * @param {string|undefined} [opts.url]         URL que el escritor USARÁ en su
 *        petición. Es la fuente de verdad del destino; no se deduce del
 *        entorno si el escritor usa otra cosa.
 * @param {string|undefined} [opts.projectRef]  Ref de proyecto YA extraído por
 *        el escritor (p.ej. hardcodeado en la URL de Management API). Se
 *        verifica exactamente ese identificador.
 * @param {string} [opts.envUrl]                URL de respaldo AMBIENTAL para
 *        el MODO LECTURA cuando `url`/`projectRef` no se pasan (la lectura no
 *        es destructiva). Nunca se usa para autorizar escrituras.
 * @param {string} [opts.context]               Nombre del script/operación.
 * @returns {string} El destino validado (la misma URL que se pasó, o
 *          `https://<ref>.supabase.co` si se validó por projectRef).
 * @throws {Error} Si el destino es producción sin flags, o una escritura con
 *          destino no identificado.
 */
export function assertNotProduction({ mode = 'write', url, projectRef, envUrl, context = 'script' } = {}) {
  const allowReadOnly = process.env.ALLOW_PROD === 'read-only';
  const allowWrite = process.env.ALLOW_PROD_WRITE === 'I_UNDERSTAND';

  // ── 1. Identificar el destino REAL de la operación ────────────────────────
  // Prioridad exacta de lo que el escritor va a usar: projectRef hardcodeado
  // o la URL explícita. La URL ambiental SOLO completa en modo lectura.
  let target;
  let cls;
  if (projectRef) {
    const ref = String(projectRef).trim().toLowerCase();
    if (!/^[a-z0-9]{18,22}$/.test(ref)) {
      throw new Error(writeBlockedMessage(context, `ref inválido '${ref}'`, 'El identificador de proyecto no tiene el formato de un ref de Supabase.'));
    }
    cls = { kind: 'supabase', ref };
    target = `https://${ref}.supabase.co`;
  } else {
    target = url;
    if (!target && mode === 'read') {
      target = envUrl ?? (
        (process.env.E2E_SUPABASE_URL || '') ||
        (process.env.NEXT_PUBLIC_SUPABASE_URL || '') ||
        (process.env.SUPABASE_URL || ''));
    }
    cls = classifyTarget(target);
  }

  // ── 2. Destino NO identificado (ausente / desconocido / malformado) ───────
  if (cls.kind === 'none' || cls.kind === 'unknown') {
    const shown = target ? maskUrl(target) : '(vacío)';
    // ¿el "desconocido" menciona producción en alguna parte? → producción.
    if (target && String(target).toLowerCase().includes(PROD_REF)) {
      throw new Error(prodBlockedMessage(context, shown));
    }
    if (mode === 'write') {
      const reason = cls.kind === 'none'
        ? 'No se pasó ninguna URL (ni projectRef) al guard.'
        : 'La URL no es un destino de Supabase identificable (se esperaba https://<ref>.supabase.co, postgres://... o localhost).';
      throw new Error(writeBlockedMessage(context, shown, reason));
    }
    if (!allowReadOnly) {
      throw new Error(
        `[${context}] BLOQUEADO: lectura con destino DESCONOCIDO (${shown}) sin ALLOW_PROD=read-only.\n` +
        `  Un destino no identificado podría ser producción: se exige el mismo permiso que la lectura de producción.\n` +
        `  export ALLOW_PROD=read-only  — o pasa una URL explícita al guard.`
      );
    }
    return target ?? '';
  }

  // ── 3. Destino identificado ───────────────────────────────────────────────
  if (cls.kind === 'local') return target; // Supabase local: paso libre

  const { ref } = cls; // kind === 'supabase'
  if (ref === PROD_REF) {
    if (!allowReadOnly) throw new Error(prodBlockedMessage(context, `https://${ref}.supabase.co`));
    if (mode === 'write' && !allowWrite) {
      throw new Error(
        `[${context}] BLOQUEADO: escritura contra PRODUCCIÓN (https://${ref}.supabase.co) requiere el doble flag:\n` +
        `  export ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND\n` +
        `  Si esto es una operación productiva legítima, documéntala en docs/audits/ antes de ejecutarla.`
      );
    }
    if (mode === 'write' && allowWrite) {
      // Registro visible de la autorización explícita (no es un error).
      console.error(`[${context}] AUTORIZADO (explícito): escritura contra producción https://${ref}.supabase.co — ALLOW_PROD_WRITE=I_UNDERSTAND presente.`);
    }
    return target;
  }

  if (isKnownE2eRef(ref)) return target; // CostproE2E / rama efímera: paso libre

  // Ref remoto NO verificado: para escritura no basta cualquier ref — solo
  // los E2E conocidos pasan sin revisión. Fail-closed.
  if (mode === 'write') {
    throw new Error(
      `[${context}] BLOQUEADO: escritura contra ref NO VERIFICADO (${ref}).\n` +
      `  Solo pasan sin flags: CostproE2E (${E2E_KNOWN_REFS.join(' | ')}), localhost y producción autorizada con doble flag.\n` +
      `  Si este ref es un entorno legítimo, añádelo a E2E_KNOWN_REFS en scripts/lib/assert-not-production.mjs\n` +
      `  con su justificación, y deja constancia en docs/audits/ (CP-INFRA-019).`
    );
  }
  if (!allowReadOnly) {
    throw new Error(
      `[${context}] BLOQUEADO: lectura contra ref NO VERIFICADO (${ref}) sin ALLOW_PROD=read-only.\n` +
      `  export ALLOW_PROD=read-only — o usa un ref E2E conocido.`
    );
  }
  return target;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
// Contrato idéntico al de assert-not-production.py/.sh para que cualquier
// tipo de script use la misma interfaz.
if (process.argv[1] && process.argv[1].endsWith('assert-not-production.mjs')) {
  const args = process.argv.slice(2);
  const get = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
  const mode = get('mode') === 'read' ? 'read' : 'write';
  const context = get('context') ?? 'cli';
  const url = get('url');
  const projectRef = get('project-ref');
  if (!url && !projectRef) {
    console.error(`[${context}] BLOQUEADO: falta --url o --project-ref (CP-INFRA-019: el guard debe recibir el destino real de la operación).`);
    process.exit(1);
  }
  try {
    assertNotProduction({ mode, url, projectRef, context });
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
