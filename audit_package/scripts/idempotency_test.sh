#!/bin/bash
# Test idempotency by sending the same transaction_id twice
ID=$(uuidgen)
JWT=$1
URL=$2
STORE_ID=$3
PRODUCT_ID=$4

echo "Sending first request with ID: $ID"
curl -X POST "$URL/rest/v1/rpc/create_sale" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{ \"p_store_id\": \"$STORE_ID\", \"p_transaction_id\": \"$ID\", \"p_items\": [{\"product_id\": \"$PRODUCT_ID\", \"quantity\": 1, \"price\": 10, \"cost\": 5}], \"p_total_amount\": 10, \"p_subtotal\": 10, \"p_payment_method\": \"cash\", \"p_discount_type\": \"none\", \"p_discount_value\": 0 }"

echo -e "\nSending second request with SAME ID: $ID"
curl -X POST "$URL/rest/v1/rpc/create_sale" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{ \"p_store_id\": \"$STORE_ID\", \"p_transaction_id\": \"$ID\", \"p_items\": [{\"product_id\": \"$PRODUCT_ID\", \"quantity\": 1, \"price\": 10, \"cost\": 5}], \"p_total_amount\": 10, \"p_subtotal\": 10, \"p_payment_method\": \"cash\", \"p_discount_type\": \"none\", \"p_discount_value\": 0 }"
