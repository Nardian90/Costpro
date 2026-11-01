#!/usr/bin/env bash
# Aplica el RPC e2e_hard_delete_user corregido vía Supabase Management API.
#
# CP-INFRA-019 (fix A): este script usa el ref de PRODUCCIÓN hardcodeado en la
# URL de Management API. El guard ya NO deduce el destino del entorno: recibe
# el IDENTIFICADOR REAL de la petición (PROJECT_REF) y valida exactamente ese
# ref. Una variable ambiental que apunte a CostproE2E no autoriza esta
# operación dirigida a CostproBD.
set -euo pipefail

# Ref REAL usado en las peticiones de Management API de este script.
PROJECT_REF="wthkddeleylijmonclxg" # CostproBD (producción) — hardcodeado históricamente

# GUARD (CP-INFRA-019): valida el ref exacto que usarán las peticiones.
source "$(dirname "$0")/lib/assert-not-production.sh"
assert_not_production write "" "apply-rpc-fix.sh" "$PROJECT_REF"

# Cargar SOLO el token de acceso (sin export $(grep …), que mete al entorno
# NEXT_PUBLIC_SUPABASE_URL y el resto de secretos del .env).
# Raíz del repo (donde viven .env y supabase/migrations) — sin rutas absolutas
# de sandbox: el original apuntaba a /home/z/my-project/Costpro, que no existe
# en un checkout limpio.
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUPABASE_ACCESS_TOKEN="$(sed -n 's/^SUPABASE_ACCESS_TOKEN=//p' "$REPO_ROOT/.env" | tail -1 | tr -d '"' | tr -d "'")"
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "Falta SUPABASE_ACCESS_TOKEN en $REPO_ROOT/.env" >&2
  exit 1
fi
cd "$REPO_ROOT"

python3 - <<EOF
import json, os, urllib.request

sql = open('supabase/migrations/20261005120001_e2e_hard_delete_user.sql', encoding='utf-8').read()
body = json.dumps({"query": sql}).encode()
req = urllib.request.Request(
    "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query",
    data=body, method="POST",
    headers={
        "Authorization": f"Bearer {os.environ['SUPABASE_ACCESS_TOKEN']}",
        "Content-Type": "application/json",
    },
)
with urllib.request.urlopen(req, timeout=120) as r:
    print("HTTP", r.status)
    print(r.read().decode()[:500])
EOF

echo "---verificación: función actualizada---"
curl -s -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select prosrc from pg_proc where proname = '"'"'e2e_hard_delete_user'"'"'"}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); src=d[0]['prosrc'] if d else ''; print('restore_mode presente:', 'app.restore_mode' in src); print('payment_transactions presente:', 'payment_transactions' in src)"
