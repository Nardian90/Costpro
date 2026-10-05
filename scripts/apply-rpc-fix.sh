#!/usr/bin/env bash
# Aplica el RPC e2e_hard_delete_user corregido vía Supabase Management API.
set -euo pipefail
cd /home/z/my-project/Costpro
export $(grep -v '^#' .env | xargs)

python3 - <<'EOF'
import json, os, urllib.request

sql = open('supabase/migrations/20261005120001_e2e_hard_delete_user.sql', encoding='utf-8').read()
# Quitar comentarios de línea SQL para enviar solo el cuerpo ejecutable
# (PostgREST/Management API ejecuta comentarios bien, pero los -- con acentos
#  viajan mejor fuera). En realidad los comentarios son SQL válido — enviar todo.
body = json.dumps({"query": sql}).encode()
req = urllib.request.Request(
    "https://api.supabase.com/v1/projects/wthkddeleylijmonclxg/database/query",
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
curl -s -X POST "https://api.supabase.com/v1/projects/wthkddeleylijmonclxg/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select prosrc from pg_proc where proname = '"'"'e2e_hard_delete_user'"'"'"}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); src=d[0]['prosrc'] if d else ''; print('restore_mode presente:', 'app.restore_mode' in src); print('payment_transactions presente:', 'payment_transactions' in src)"