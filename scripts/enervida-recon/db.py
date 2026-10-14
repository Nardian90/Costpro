#!/usr/bin/env python3
"""Helper — ejecutar SQL read-only en Supabase vía Management API (solo server-side)."""
import json
import urllib.request

REPO = '/home/z/my-project/costpro'


def _env(name):
    for line in open(f'{REPO}/.env'):
        line = line.strip()
        if line.startswith(f'{name}='):
            return line.split('=', 1)[1]
    raise KeyError(name)


REF = _env('NEXT_PUBLIC_SUPABASE_URL').split('//')[1].split('.')[0]
TOKEN = _env('SUPABASE_ACCESS_TOKEN')


def sql(query, timeout=180):
    """Ejecuta SQL y devuelve (status, rows|error_text)."""
    req = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{REF}/database/query',
        data=json.dumps({'query': query}).encode(),
        headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'},
        method='POST')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:1500]


if __name__ == '__main__':
    st, rows = sql("SELECT id, name, tenant_id, is_active FROM stores WHERE name ILIKE '%enervida%' OR name ILIKE '%vitall%'")
    print(st, json.dumps(rows, ensure_ascii=False, indent=1))
