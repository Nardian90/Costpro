# W9.4.6 — H-5 · FASE 7.H · Análisis de auditoría (detalle)

Referencia cruzada: medición en vivo en `12-payment-audit.md` y `raw/probes/p6_authorized_v2.txt` / `p10_v1_authorized.txt`.

## Cadena de auditoría por versión

```text
V2: reverse_transaction_v2
  ├─ INSERT audit_logs(action='REVERSE_TRANSACTION_V2', table_name='transactions',
  │     record_id=<tx>, store_id=<store>, user_id=<actor real>, metadata={reason, units_restored})
  └─ trg_audit_transaction_changes → audit_logs(action='UPDATE_STATUS', old_data, new_data, store_id)

V1: reverse_transaction
  └─ trg_audit_transaction_changes → audit_logs(action='UPDATE_STATUS')   [único registro]
     + campos en la fila: reversed_at / reversed_by / reversal_reason
```

## Consumers de las actions

- `REVERSE_TRANSACTION_V2`: no consumido por vistas de la app (grep en src/ sin coincidencias) — valor forense/observabilidad.
- `UPDATE_STATUS`: consumido indirectamente por la vista de historial (si existe) — patrón genérico.
- Huella histórica: 0 filas `REVERSE_TRANSACTION_V2` en audit_logs (la RPC V2 de venta nunca se ejecutó en producción: tx_voided=0, tx_reversed=0 — coherente con `sm_sale_reverse=0` y kardex sin reversiones).

## Evaluación

1. V2 satisface AUDITABILITY: actor real, store, razón, unidades, doble registro (explícito + trigger).
2. V1 no emite action canónico de reversión: solo UPDATE_STATUS genérico; la trazabilidad descansa en las columnas de la fila (reversed_by/reason). Aceptable como legacy; se resuelve con la consolidación canónica (checklist backlog C1).
3. Atribución del trigger genérico bajo service_role: `COALESCE(auth.uid(), seller_id)` — con service key pura (sin claims sub) caería al vendedor original; el flujo real `/api/reverse` pasa claims del usuario autenticado vía supabase-admin... Nota: `getSupabaseAdminSafe()` usa service key SIN JWT de usuario → en el flujo real el INSERT de V2 usa v_caller_uid=p_user_id (session.user.id) ✔ correcto; el trigger genérico atribuiría a seller_id (limitación documentada, preexistente, aplica igualmente a receipts/H-4 — no agrava este par).
