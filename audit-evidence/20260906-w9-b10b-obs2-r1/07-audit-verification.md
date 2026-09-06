# W9.5 — B-10b-OBS-2-R1 · 07-audit-verification.md
# §17 verificación de la fila de auditoría del lote

## Fila creada (exactamente 1)

```json
{
  "id": "418e6377-aaea-4cf1-be4a-59033f23bc6b",
  "action": "STOCK_RECONCILIATION_OPENING",
  "user_id": "051c6157-600b-425e-b8c0-72388bacf541",
  "table_name": "stock_movements",
  "store_id": "d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576",
  "trace_id": "B10B-OBS2-RECON-OPENING-R1",
  "created_at": "2026-09-06T20:26:26.416067+00:00"
}
```

## new_data

```json
{
  "batch_id": "B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW",
  "movements": 98,
  "units": 6427,
  "estimated_value": 9932216.938816005,
  "estimated_value_published": 9932216.94
}
```

## metadata

```json
{
  "model": "D = B + C (formal audited opening + Test exclusion)",
  "store": "d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576",
  "actor_role": "RECONCILIATION_EXECUTOR",
  "historical_movements_reconstructed": false,
  "evidence_pack": "20260906-w9-b10b-obs2-repair-design",
  "pack_sha256sums": "45/45 OK",
  "position_date": "2026-08-16T22:01:13Z",
  "backup_ts": "2026-08-02T02:25:31Z",
  "excluded_test": "10 products / 126 units EXCLUDED_FROM_REPAIR",
  "human_authorization": "R1 execution order (session web-c98ecee2-ae4b-4463-b4c1-135e982ca7ed, 2026-09-06)",
  "movement_type": "initial",
  "date_policy": "EXECUTION_TIMESTAMP (no retro-dating)"
}
```

## Cumplimiento §17

- [x] Identifica RECONCILIATION (action + actor_role RECONCILIATION_EXECUTOR)
- [x] Identifica store (uuid + metadata)
- [x] Identifica repair_batch_id (new_data.batch_id + trace_id + reference_doc de las 98 filas)
- [x] Identifica actor (user_id = firmante designado, NO el actor histórico del purge, que permanece UNKNOWN)
- [x] 98 products / 6427 units / model B+C
- [x] Forensic source (evidence_pack + pack_sha256sums + backup_ts + position_date)
- [x] `historical_movements_reconstructed: false` — explícito
- [x] 0 filas UPDATE_PRODUCT nuevas (WHEN del trigger lo excluye — I10 verificada)
- [x] audit_logs tienda: 365 → 366 (+1 exacto)
