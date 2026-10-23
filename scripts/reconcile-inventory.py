#!/usr/bin/env python3
"""
reconcile-inventory.py — Inventario de conciliación del historial de migraciones
(orden §7): Git versionado vs supabase_migrations.schema_migrations vs objetos
reales del esquema vivo. SOLO LECTURA contra producción.

Clasificación por migración (efectos de firma verificables en catálogo):
  · CREATE TABLE / TYPE / VIEW / MATERIALIZED VIEW / FUNCTION (name/argc) /
    INDEX (tabla) / ADD COLUMN (tabla.columna) → presencia verificable.
  · Solo ACL/DROP/UPDATE/INSERT de datos → 'no-verificable-por-catalogo'.
Salida: audit/migration-reconciliation.json + resumen MD.
"""
import json, re, os, urllib.request

import os
REF = os.environ['SUPABASE_PROJECT_REF']
TOKEN = os.environ['SUPABASE_ACCESS_TOKEN']
REPO = 'supabase/migrations'
AUD = 'audit'

def q(sql):
    req = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{REF}/database/query',
        data=json.dumps({'query': sql}).encode(),
        headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'},
        method='POST')
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        print('HTTP', e.code, e.read().decode()[:300]); raise SystemExit(1)

# ── 1. catálogo vivo (una sola pasada) ──
live = {}
live['tables'] = {r['rel'] for r in q("""
  SELECT n.nspname||'.'||c.relname AS rel FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')""")}
live['views'] = {r['rel'] for r in q("""
  SELECT n.nspname||'.'||c.relname AS rel FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('v','m')""")}
live['types'] = {r['t'] for r in q("SELECT n.nspname||'.'||t.typname AS t FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'")}
live['functions'] = {r['k'] for r in q("""
  SELECT p.proname || '/' || coalesce(array_length(proargtypes,1),0)+1 AS k
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'""")}
live['fn_names'] = {k.split('/')[0] for k in live['functions']}
live['columns'] = {(r['t'], r['c']) for r in q("""
  SELECT table_name t, column_name c FROM information_schema.columns WHERE table_schema='public'""")}
live['indexes'] = {r['t'] for r in q("""
  SELECT DISTINCT tablename t FROM pg_indexes WHERE schemaname='public'""")}
live['policies'] = {(r['tablename'], r['policyname']) for r in q("""
  SELECT tablename, policyname FROM pg_policies WHERE schemaname='public'""")}

# ── 2. historial registrado ──
history = {r['version'] for r in q("SELECT version FROM supabase_migrations.schema_migrations")}

# ── 3. extraer firma de objetos por migración ──
def signature(sql):
    sig = {'tables': set(), 'views': set(), 'types': set(), 'functions': set(),
           'indexes': set(), 'columns': set(), 'policies': set(), 'other': 0}
    def clean(s):
        # quitar comentarios de línea para el parsing
        return re.sub(r'^\s*--.*$', '', s, flags=re.M)
    s = clean(sql)
    for m in re.finditer(r'CREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-zA-Z_0-9]+)', s, re.I):
        sig['tables'].add(m.group(1).lower())
    for m in re.finditer(r'CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-zA-Z_0-9]+)', s, re.I):
        sig['views'].add(m.group(1).lower())
    for m in re.finditer(r'CREATE\s+TYPE\s+public\.([a-zA-Z_0-9]+)', s, re.I):
        sig['types'].add(m.group(1).lower())
    for m in re.finditer(r'CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-zA-Z_0-9]+)\s*\(([^)]*)\)', s, re.I | re.S):
        args = m.group(2)
        argc = len(args.split(',')) if args.strip() else 0
        sig['functions'].add(f'{m.group(1).lower()}/{argc}')
    for m in re.finditer(r'CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?[a-zA-Z_0-9"]+\s+ON\s+(?:ONLY\s+)?public\.([a-zA-Z_0-9]+)', s, re.I):
        sig['indexes'].add(m.group(1).lower())
    for m in re.finditer(r'ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?public\.([a-zA-Z_0-9]+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z_0-9]+)"?', s, re.I):
        sig['columns'].add((m.group(1).lower(), m.group(2).lower()))
    for m in re.finditer(r'CREATE\s+POLICY\s+"?([a-zA-Z_0-9\s\-]+)"?\s+ON\s+public\.([a-zA-Z_0-9]+)', s, re.I):
        sig['policies'].add((m.group(2).lower(), m.group(1).strip().lower()))
    if re.search(r'^\s*(GRANT|REVOKE|DROP|UPDATE|INSERT|DELETE|ALTER)\b', s, re.I | re.M):
        sig['other'] += 1
    return sig

def presence(sig):
    checks = []
    for t in sig['tables']:
        checks.append((f'table:{t}', f'public.{t}' in live['tables']))
    for v in sig['views']:
        checks.append((f'view:{v}', f'public.{v}' in live['views']))
    for t in sig['types']:
        checks.append((f'type:{t}', f'public.{t}' in live['types']))
    for f in sig['functions']:
        name = f.split('/')[0]
        if f in live['functions']:
            checks.append((f'fn:{f}', True))
        elif name in live['fn_names']:
            checks.append((f'fn:{f}', 'firma-distinta'))
        else:
            checks.append((f'fn:{f}', False))
    for t in sig['indexes']:
        checks.append((f'idx_on:{t}', f'public.{t}' in live['indexes']))
    for tc in sig['columns']:
        checks.append((f'col:{tc[0]}.{tc[1]}', tc in live['columns']))
    for p in sig['policies']:
        checks.append((f'policy:{p[0]}.{p[1]}', p in live['policies']))
    return checks

report = {'generated_at': None, 'history_count': len(history), 'migrations': []}
unrecorded = []
for f in sorted(os.listdir(REPO)):
    if not f.endswith('.sql') or f.startswith('run_'): continue
    version = f.split('_')[0]
    entry = {'version': version, 'file': f, 'in_history': version in history}
    sql = open(os.path.join(REPO, f), encoding='utf-8').read()
    sig = signature(sql)
    checks = presence(sig)
    entry['checks'] = checks
    entry['verifiable'] = len(checks) > 0
    if checks:
        vals = [v for _, v in checks]
        if all(v is True for v in vals):
            entry['status'] = 'materializada-verificada'
        elif any(v is False for v in vals):
            entry['status'] = 'efectos-parciales-o-ausentes'
        else:  # firma-distinta
            entry['status'] = 'firma-distinta'
    else:
        entry['status'] = 'no-verificable-por-catalogo'
    report['migrations'].append(entry)
    if not entry['in_history']:
        unrecorded.append(entry)

report['generated_at'] = __import__('time').strftime('%Y-%m-%dT%H:%M:%SZ', __import__('time').gmtime())
from collections import Counter
c = Counter(e['status'] for e in unrecorded)
report['summary'] = dict(c)
report['proposed_inserts'] = sorted(e['version'] for e in unrecorded if e['status'] == 'materializada-verificada')
json.dump(report, open(f'{AUD}/migration-reconciliation.json', 'w'), indent=1, ensure_ascii=False)

print(f"migraciones en repo: {len(report['migrations'])} · registradas en Supabase: {len(history)} · SIN registrar: {len(unrecorded)}")
print('estado de las sin registrar:', dict(c))
print('candidatas a INSERT (todas sus firmas verificadas presentes):', len(report['proposed_inserts']))
