#!/usr/bin/env node
/* snap-03-build.js — construye PRODUCTION-SCHEMA-SNAPSHOT (DDL ejecutable) desde las
 * respuestas pristine de catálogo (Opción A). No contiene ningún dato de negocio:
 * únicamente DDL reconstruido de pg_catalog. */
const fs = require('fs'), path = require('path');
const SNAP = '/home/z/my-project/download/auditoria-multitienda/RECOVERY-20260828/PRODUCTION-SCHEMA-SNAPSHOT';
const RAW = path.join(SNAP, 'extraction-raw');

// ---------- lecturas ----------
function arr(slug) { // junta chunks slug-###.response.json en orden
  const files = fs.readdirSync(RAW).filter(f => f.startsWith(slug + '-') && f.endsWith('.response.json')).sort();
  const out = [];
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
    if (!Array.isArray(j)) throw new Error('no-array: ' + f);
    out.push(...j);
  }
  return out;
}
const one = (slug) => {
  const j = JSON.parse(fs.readFileSync(path.join(RAW, slug + '.response.json'), 'utf8'));
  if (!Array.isArray(j)) throw new Error('no-array: ' + slug);
  return j;
};

// ---------- helpers SQL ----------
const qi = (id) => /^[a-z_][a-z0-9_$]*$/.test(id) ? id : '"' + id.replace(/"/g, '""') + '"';
const ql = (s) => "'" + String(s).replace(/'/g, "''") + "'";
function dollar(s) { // dollar-quote seguro para cuerpos arbitrarios
  if (!s.includes('$aud$')) return '$aud$\n' + s + '\n$aud$';
  for (let i = 0; i < 1000; i++) { const t = `$aud${i}$`; if (!s.includes(t)) return t + '\n' + s + '\n' + t; }
  throw new Error('no dollar tag');
}
const stripSemi = (s) => String(s ?? '').replace(/;\s*$/, '');
const qual = (t) => { // "public.x" o "x" → nombre calificado
  const m = String(t).match(/^(?:public\.)?(.+)$/); return 'public.' + m[1];
};
const unpub = (t) => String(t).replace(/^public\./, '');
const STORAGE = { p: 'PLAIN', m: 'MAIN', e: 'EXTERNAL', x: 'EXTENDED' };
const pubopts = (txt) => { // "{publish=insert, ...}" → "publish = insert, ..."
  if (!txt) return '';
  const inner = txt.replace(/^\{/, '').replace(/\}$/, '');
  return inner.split(',').map(kv => { const i = kv.indexOf('='); return kv.slice(0, i).trim() + ' = ' + kv.slice(i + 1).trim(); }).join(', ');
};

// ---------- datos ----------
const enums = one('enums');
const comps = one('composites');
const seqs = one('sequences');
const evtHandlers = one('evt-handlers'); // [meta: esquema real del handler (plataforma)]
const tables = arr('tables');
const cons = arr('constraints');
const indexes = arr('indexes');
const triggers = arr('triggers');
const funcs = arr('functions');
const policies = arr('policies');
const views = arr('views');
const etrigs = one('event-triggers');
const grel = arr('grants-rel');
const gfun = arr('grants-func2'); // ACLs estructuradas de función (incluye PUBLIC; funciones con proacl no nulo)
const gsch = one('grants-schema');
const dacls = one('default-acls');
const pubs = one('publications');
const pubrels = one('pub-rels');

const byName = Object.fromEntries(tables.map(t => [t.name, t]));
const viewNames = new Set(views.map(v => v.name));
const matViews = views.filter(v => v.kind === 'm');
const plainViews = views.filter(v => v.kind === 'v');
const matTargets = new Set(matViews.map(v => v.name));
const isMatIdx = (def) => { const m = def.match(/^CREATE (?:UNIQUE )?INDEX [^]*? ON (?:public\.)?("(?:[^"]|"")+"|\w+)/); return m && matTargets.has(unpub(m[1].replace(/^"|"$/g, '').replace(/""/g, '"'))); };

// ---------- emisión ----------
const STMTS = [];
function S(phase, section, sql) { STMTS.push({ phase, section, sql }); }

// — extensiones (las de plataforma pg_stat_statements/supabase_vault se excluyen: ver manifiesto)
S('A', 'extensions', `CREATE EXTENSION IF NOT EXISTS plpgsql;`);
S('A', 'extensions', `CREATE EXTENSION IF NOT EXISTS btree_gist;`);
S('A', 'extensions', `CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;`);
S('A', 'extensions', `CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;`);

// — enums
for (const e of enums) {
  const labels = e.labels.split('\x1f').map(ql).join(', ');
  S('A', 'enums', `CREATE TYPE public.${qi(e.name)} AS ENUM (${labels});`);
}

// — composite types standalone (orden: los no referenciados primero)
const compDeps = new Map(comps.map(c => {
  const ds = comps.filter(o => o.name !== c.name && (c.attrs || '').includes(o.name)).map(o => o.name);
  return [c.name, ds];
}));
{
  const done = new Set(); let pend = comps.map(c => c.name);
  while (pend.length) {
    const ready = pend.filter(n => compDeps.get(n).every(d => done.has(d)));
    const batch = ready.length ? ready : pend;
    for (const n of batch) {
      done.add(n);
      const c = comps.find(x => x.name === n);
      const attrs = (c.attrs || '').split('\x1e').filter(Boolean).map(a => {
        const i = a.indexOf('\x1f'); return qi(a.slice(0, i)) + ' ' + a.slice(i + 1);
      }).join(', ');
      S('A', 'composites', `CREATE TYPE public.${qi(c.name)} AS (${attrs});`);
    }
    pend = pend.filter(n => !done.has(n));
  }
}

// — secuencias (CREATE; OWNED BY va tras las tablas)
// Las secuencias de columnas IDENTITY (deptype 'i') NO se emiten: la cláusula
// GENERATED ... AS IDENTITY de CREATE TABLE las auto-crea con los mismos parámetros.
const identityOwned = new Set();
for (const t of tables) for (const c of (t.cols || [])) if (c.i)
  identityOwned.add(`${t.name}.${c.n}`);
const seqsExplicit = seqs.filter(s => {
  if (s.owned_by && identityOwned.has(s.owned_by.replace(/^public\./, ''))) return false;
  return true;
});
for (const s of seqsExplicit) {
  S('A', 'sequences', `CREATE SEQUENCE public.${qi(s.name)} AS ${s.seqtype} START WITH ${s.seqstart} INCREMENT BY ${s.seqincrement} MINVALUE ${s.seqmin} MAXVALUE ${s.seqmax} CACHE ${s.seqcache}${s.seqcycle ? ' CYCLE' : ' NO CYCLE'};`);
}

// — tablas
for (const t of tables) {
  const cols = (t.cols || []).map(c => {
    let p = '  ' + qi(c.n) + ' ' + c.t;
    if (c.c) p += ` COLLATE ${qi(c.c)}`;
    if (c.i === 'always') p += ' GENERATED ALWAYS AS IDENTITY';
    if (c.i === 'by default') p += ' GENERATED BY DEFAULT AS IDENTITY';
    if (c.g) p += ` GENERATED ALWAYS AS (${c.g}) STORED`;
    if (c.d) p += ` DEFAULT ${c.d}`;
    if (c.nn) p += ' NOT NULL';
    return p;
  }).join(',\n');
  const opts = pubopts(t.reloptions);
  S('A', 'tables', `CREATE TABLE public.${qi(t.name)} (\n${cols}\n)${opts ? ` WITH (${opts})` : ''};`);
  for (const c of (t.cols || [])) if (c.s && STORAGE[c.s])
    S('A', 'tables', `ALTER TABLE public.${qi(t.name)} ALTER COLUMN ${qi(c.n)} SET STORAGE ${STORAGE[c.s]};`);
}

// — constraints: PK/UNIQUE/CHECK/EXCL primero, FK después
const isFK = (c) => c.type === 'f';
for (const c of cons.filter(c => !isFK(c)))
  S('A', 'constraints', `ALTER TABLE ${qual(c.tbl)} ADD CONSTRAINT ${qi(c.name)} ${c.def};`);
for (const c of cons.filter(isFK))
  S('A', 'constraints', `ALTER TABLE ${qual(c.tbl)} ADD CONSTRAINT ${qi(c.name)} ${c.def};`);

// — OWNED BY de secuencias (deptype 'a' solamente; las identity se administran solas)
for (const s of seqs) if (s.owned_by && seqsExplicit.includes(s)) {
  const [ns, tbl, col] = s.owned_by.split('.');
  S('A', 'sequences', `ALTER SEQUENCE public.${qi(s.name)} OWNED BY public.${qi(tbl)}.${qi(col)};`);
}

// — índices: de tablas en fase A; los de matviews van con las matviews
const idxMat = [], idxTab = [];
for (const i of indexes) (isMatIdx(i.def) ? idxMat : idxTab).push(i);
for (const i of idxTab) S('A', 'indexes', stripSemi(i.def) + ';');

// — funciones (orden de creación en prod = oid)
for (const f of funcs) S('A', 'functions', stripSemi(f.def) + ';');

// — triggers
for (const t of triggers) S('A', 'triggers', stripSemi(t.def) + ';');

// — event triggers (handlers viven en esquema 'extensions' en prod — SHIM-PLATFORM stub)
const hSchema = new Map(evtHandlers.map(h => [h.evtname, h.handler_schema]));
for (const e of etrigs) {
  const hs = hSchema.get(e.name) || 'extensions';
  if (hs !== 'public') {
    const proname = e.handler.replace(/\(.*$/, '');
    S('A', 'event-triggers', `CREATE OR REPLACE FUNCTION ${hs}.${qi(proname)}() RETURNS event_trigger LANGUAGE plpgsql AS ${dollar('BEGIN /* SHIM-PLATFORM: stub declarado, cuerpo real pertenece a Supabase */ END')};`);
  }
  let sql = `CREATE EVENT TRIGGER ${qi(e.name)} ON ${e.event}`;
  if (e.tags) sql += ` WHEN TAG IN (${e.tags.split('\x1f').map(ql).join(', ')})`;
  sql += ` EXECUTE FUNCTION ${hs}.${e.handler};`;
  S('A', 'event-triggers', sql);
  const en = { O: 'ENABLE', A: 'ENABLE ALWAYS', R: 'ENABLE REPLICA', D: 'DISABLE' }[e.enabled] || 'ENABLE';
  S('A', 'event-triggers', `ALTER EVENT TRIGGER ${qi(e.name)} ${en};`);
}

// — vistas (orden topológico simple por referencias entre vistas)
const deps = new Map(plainViews.map(v => {
  const ds = plainViews.filter(o => o.name !== v.name && new RegExp(`\\b${o.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(v.def)).map(o => o.name);
  return [v.name, ds];
}));
const emitted = new Set(), ordered = [];
let pending = plainViews.map(v => v.name);
while (pending.length) {
  const ready = pending.filter(n => deps.get(n).every(d => emitted.has(d)));
  const batch = ready.length ? ready : pending; // si hay ciclo, fuerza orden
  for (const n of batch) { emitted.add(n); ordered.push(n); }
  pending = pending.filter(n => !emitted.has(n));
}
for (const n of ordered) {
  const v = plainViews.find(x => x.name === n);
  const opts = pubopts(v.reloptions);
  S('A', 'views', `CREATE VIEW public.${qi(v.name)}${opts ? ` WITH (${opts})` : ''} AS\n${stripSemi(v.def)};`);
}

// — matviews + sus índices
for (const v of matViews) {
  const opts = pubopts(v.reloptions);
  S('A', 'matviews', `CREATE MATERIALIZED VIEW public.${qi(v.name)}${opts ? ` WITH (${opts})` : ''} AS\n${stripSemi(v.def)};`);
}
for (const i of idxMat) S('A', 'matviews', stripSemi(i.def) + ';');

// — RLS enable/force + policies
for (const t of tables) {
  if (t.rls) S('A', 'rls', `ALTER TABLE public.${qi(t.name)} ENABLE ROW LEVEL SECURITY;`);
  if (t.rls_force) S('A', 'rls', `ALTER TABLE public.${qi(t.name)} FORCE ROW LEVEL SECURITY;`);
}
for (const p of policies) {
  let s = `CREATE POLICY ${qi(p.policyname)} ON public.${qi(p.tablename)}`;
  if (p.permissive === 'RESTRICTIVE') s += ' AS RESTRICTIVE';
  if (p.cmd && p.cmd !== 'ALL') s += ` FOR ${p.cmd}`; else if (p.cmd === 'ALL') s += ' FOR ALL';
  const rolesArr = typeof p.roles === 'string'
    ? p.roles.replace(/^\{|\}$/g, '').split(',').map(x => x.replace(/^"|"$/g, '')).filter(Boolean)
    : (p.roles || []);
  if (rolesArr.length) s += ` TO ${rolesArr.map(r => r === 'public' ? 'PUBLIC' : qi(r)).join(', ')}`;
  if (p.qual) s += ` USING (${p.qual})`;
  if (p.with_check) s += ` WITH CHECK (${p.with_check})`;
  S('A', 'policies', s + ';');
}

// — grants
// Normalización de ACLs de función (estilo pg_dump): REVOKE-first para eliminar el
// EXECUTE-público builtin y cualquier herencia, luego GRANTs exactos según prod.
const CANDIDATES = ['PUBLIC', 'postgres', 'anon', 'authenticated', 'service_role', 'supabase_admin', 'supabase_auth_admin', 'dashboard_user', 'costpro_transaction_adjuster', 'costpro_snapshot_restorer', 'warehouse_staff'];
{
  const byFn = new Map();
  for (const r of gfun) { if (!byFn.has(r.obj)) byFn.set(r.obj, []); byFn.get(r.obj).push(r); }
  for (const [sig, rows] of byFn) {
    const grantees = new Set(rows.map(r => r.grantee));
    for (const c of CANDIDATES) if (!grantees.has(c === 'PUBLIC' ? 'public' : c))
      S('A', 'grants', `REVOKE ALL ON FUNCTION public.${sig} FROM ${c};`);
    const g = new Map();
    for (const r of rows) { const k = `${r.grantee}|${r.grantable}`; if (!g.has(k)) g.set(k, []); g.get(k).push(r.priv); }
    for (const [k, privs] of g) {
      const [grantee, grantable] = k.split('|');
      S('A', 'grants', `GRANT ${[...new Set(privs)].join(', ')} ON FUNCTION public.${sig} TO ${grantee === 'public' ? 'PUBLIC' : qi(grantee)}${grantable === 'YES' ? ' WITH GRANT OPTION' : ''};`);
    }
  }
}

// — grants de relaciones y esquema (funciones van por normalización ACL arriba)
const relKindWord = { r: 'TABLE', p: 'TABLE', v: 'TABLE', m: 'TABLE', S: 'SEQUENCE' }; // matview usa ON TABLE (ACL RELATION)
function grantLines(rows, objFn) {
  const g = new Map();
  for (const r of rows) {
    const k = `${objFn(r)}|${r.grantee}|${r.grantable}`;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(r.priv);
  }
  return [...g.entries()].map(([k, privs]) => {
    const [obj, grantee, grantable] = k.split('|');
    return `GRANT ${[...new Set(privs)].join(', ')} ON ${obj} TO ${grantee === 'public' ? 'PUBLIC' : qi(grantee)}${grantable === 'YES' ? ' WITH GRANT OPTION' : ''};`;
  });
}
for (const s of grantLines(grel, r => `${relKindWord[r.kind] || 'TABLE'} ${qual(r.obj)}`)) S('A', 'grants', s);
for (const s of grantLines(gsch, r => `SCHEMA ${qi(r.obj)}`)) S('A', 'grants', s);

// — default privileges
const OBJW = { r: 'TABLES', S: 'SEQUENCES', f: 'FUNCTIONS', T: 'TYPES', n: 'SCHEMAS' };
for (const d of dacls) {
  let s = `ALTER DEFAULT PRIVILEGES FOR ROLE ${qi(d.target_role)}`;
  if (d.ns) s += ` IN SCHEMA ${qi(d.ns)}`;
  s += ` GRANT ${d.priv}${d.grantable === 'YES' ? ' WITH GRANT OPTION' : ''} ON ${OBJW[d.objtype] || d.objtype} TO ${d.grantee === 'public' ? 'PUBLIC' : qi(d.grantee)};`;
  S('A', 'default-privileges', s);
}


// — publicaciones (fase B tolerante)
for (const p of pubs) {
  const parts = [];
  const pub = ['insert', 'update', 'delete', 'truncate'].filter((k, i) => [p.ins, p.upd, p.del, p.trunc][i]);
  parts.push(`publish = '${pub.join(', ')}'`);
  if (p.viaroot) parts.push('publish_via_partition_root = true');
  S('B', 'publications', `CREATE PUBLICATION ${qi(p.name)} WITH (${parts.join(', ')});`);
}
for (const r of pubrels) S('B', 'publications', `ALTER PUBLICATION ${qi(r.pub)} ADD TABLE public.${qi(r.tbl)};`);

// ---------- inventario de roles referenciados (para shims de import) ----------
const roles = new Set();
for (const r of grel) roles.add(r.grantee);
for (const r of gfun) roles.add(r.grantee);
for (const r of gsch) roles.add(r.grantee);
for (const d of dacls) { roles.add(d.grantee); roles.add(d.target_role); }
for (const t of tables) roles.add(t.owner);
for (const v of views) roles.add(v.owner);
for (const c of cons) roles.add(c.owner);
for (const i of indexes) roles.add(i.owner);
for (const t of triggers) roles.add(t.owner);
for (const f of funcs) roles.add(f.owner);
for (const e of etrigs) roles.add(e.owner);
for (const p of pubs) roles.add(p.owner);
const EXIST_LAB = new Set(['postgres', 'anon', 'authenticated', 'service_role', 'authenticator', 'public']);
const shimRoles = [...roles].filter(r => r && !EXIST_LAB.has(r)).sort();

// ---------- artefactos ----------
const banner = `--
-- ══════════════════════════════════════════════════════════════════════
-- PRODUCTION-SCHEMA-SNAPSHOT-RECOVERY · CostPro (Supabase wthkddeleylijmonclxg)
-- ══════════════════════════════════════════════════════════════════════
-- Fecha de extracción : 2026-08-28 (UTC) · Autorización: dueño — Opción A
-- Método              : consultas SELECT-only sobre pg_catalog vía Management API
--                       (pg_dump directo imposible: sin contraseña de BD; host directo
--                       IPv6-only inaccesible desde sandbox; ver manifiesto 71)
-- Alcance             : esquema public únicamente (DDL: tablas, columnas, tipos,
--                       PK/FK/CHECK/UNIQUE, índices, enums, funciones, triggers,
--                       secuencias, vistas/matviews, RLS, grants, default ACLs,
--                       event triggers, publicaciones)
-- DATOS DE NEGOCIO    : NINGUNO — este archivo no contiene filas de ninguna tabla
-- ADVERTENCIA         : NO es la «verdad histórica del harness perdido». Es una
--                       NUEVA evidencia de recuperación (cadena: harness=LOST,
--                       baseline=LOST, este snapshot=RECOVERED). No presentarlo
--                       como original bajo ningún concepto.
-- Desviación de origen: prod=PostgreSQL 17.6.1.063/aarch64 · lab=17.11/x86_64
--                       (DEV-MINOR-VERSION-DEVIATION, declarada)
-- Exclusiones declaradas: extensiones de plataforma pg_stat_statements (requiere
--                       shared_preload) y supabase_vault (específica Supabase);
--                       esquemas auth/storage/supabase_* (cubiertos por SHIMS lab)
-- ══════════════════════════════════════════════════════════════════════
--
SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;`;

let text = banner + '\n';
const linesOf = (s) => s.split('\n').length;
let cur = linesOf(banner);
const stmtsOut = [];
for (const st of STMTS) {
  text += '\n' + st.sql + '\n';
  stmtsOut.push({ ...st, line: cur + 1 });
  cur += linesOf(st.sql) + 1;
}
fs.writeFileSync(path.join(SNAP, 'production-schema-snapshot-20260828.sql'), text);
fs.writeFileSync(path.join(SNAP, 'statements.json'), JSON.stringify(stmtsOut, null, 1));
fs.writeFileSync(path.join(SNAP, 'roles-inventory.json'), JSON.stringify({
  referenced: [...roles].filter(Boolean).sort(), shim_create: shimRoles,
  preexisting_lab: [...EXIST_LAB].filter(r => r !== 'public')
}, null, 2));

// ---------- resumen ----------
const bySec = {};
for (const s of STMTS) bySec[s.section] = (bySec[s.section] || 0) + 1;
console.log('statements:', STMTS.length);
console.log(bySec);
console.log('shim roles a crear:', shimRoles.join(', ') || '(ninguno)');
console.log('matview indexes:', idxMat.length, '/', indexes.length);
