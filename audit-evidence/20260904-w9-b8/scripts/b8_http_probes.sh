#!/usr/bin/env bash
# W9.5-B8 · GATE 7 — Probes HTTP reales vía PostgREST (anon / service_role)
# No imprime claves. Objetivo: TX-H b8d00000-0000-4000-8000-00000000d001 (fixture).
set -u
cd /home/z/my-project/Costpro
ENV_URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env | cut -d= -f2- | tr -d '"')
ANON=$(grep -E '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env | cut -d= -f2- | tr -d '"')
SVC=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env | cut -d= -f2- | tr -d '"')
RPC="$ENV_URL/rest/v1/rpc/void_transaction"
TX="b8d00000-0000-4000-8000-00000000d001"

echo "=== P7 — ANON (JWT anon real, sin identidad) ==="
echo "--- POST /rest/v1/rpc/void_transaction {p_transaction_id: TX-H, p_reason: b8-anon-probe}"
http_code=$(curl -s -o /tmp/b8_p7_body.json -w '%{http_code}' -X POST "$RPC" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
  -d "{\"p_transaction_id\":\"$TX\",\"p_reason\":\"b8-anon-probe\"}")
echo "HTTP $http_code"
cat /tmp/b8_p7_body.json; echo

echo
echo "=== P12 — SERVICE_ROLE SIN p_user_id ==="
http_code=$(curl -s -o /tmp/b8_p12_body.json -w '%{http_code}' -X POST "$RPC" \
  -H "apikey: $SVC" -H "Authorization: Bearer $SVC" -H "Content-Type: application/json" \
  -d "{\"p_transaction_id\":\"$TX\",\"p_reason\":\"b8-service-no-identity\"}")
echo "HTTP $http_code"
cat /tmp/b8_p12_body.json; echo

echo
echo "=== P6c — SERVICE_ROLE CON p_user_id (identidad inyectada, miembro de la tienda) ==="
http_code=$(curl -s -o /tmp/b8_p6c_body.json -w '%{http_code}' -X POST "$RPC" \
  -H "apikey: $SVC" -H "Authorization: Bearer $SVC" -H "Content-Type: application/json" \
  -d "{\"p_transaction_id\":\"$TX\",\"p_reason\":\"b8-service-with-identity\",\"p_user_id\":\"b8b00000-0000-4000-8000-00000000000a\"}")
echo "HTTP $http_code"
cat /tmp/b8_p6c_body.json; echo
