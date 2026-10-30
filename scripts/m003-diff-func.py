#!/usr/bin/env python3
"""CP-CAT-MAESTRO-003 — Normaliza y compara cuerpos de función SQL."""
import json, re, sys, difflib

def normalize(src: str) -> str:
    # quita comentarios de línea, espacios redundantes y líneas vacías
    lines = []
    for ln in src.splitlines():
        ln = re.sub(r'--.*$', '', ln)
        ln = re.sub(r'\s+', ' ', ln).strip()
        if ln:
            lines.append(ln)
    return lines

def extract_from_migration(path: str, fname: str) -> str:
    txt = open(path).read()
    # localiza CREATE OR REPLACE FUNCTION fname ... AS $function$ ... $function$;
    m = re.search(r'CREATE OR REPLACE FUNCTION (?:public\.)?' + re.escape(fname) + r'\b.*?\$function\$(.*?)\$function\$;', txt, re.S)
    if not m:
        raise SystemExit(f'no se encontró {fname} en {path}')
    return m.group(1)

antes = normalize(open('/tmp/prosrc_antes.sql').read())
orig = normalize(extract_from_migration(sys.argv[1] if len(sys.argv) > 1 else 'supabase/migrations/20261028112100_cp_catalogo_rpcs_ciclo_vida.sql', 'fn_master_apply_identity_changes'))
objetivo = normalize(extract_from_migration('supabase/migrations/20261030120000_cp_catalogo_master_image_propagation.sql', 'fn_master_apply_identity_changes'))

print('═══ Vigente vs 20261028112100 (fuente versionada):')
diff1 = list(difflib.unified_diff(orig, antes, lineterm='', n=1))
print('\n'.join(diff1) if diff1 else '  IDÉNTICOS')
print()
print('═══ Vigente vs 20261030120000 (migración pendiente):')
diff2 = list(difflib.unified_diff(objetivo, antes, lineterm='', n=1))
print('\n'.join(diff2) if diff2 else '  IDÉNTICOS')
