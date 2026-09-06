# W9.5 — B-10b-OBS-2-R1 · 05-execution.md
# §9–§20 ACTA DE EJECUCIÓN (transacción única — 12-atomicity.md)

## Identidad de la ejecución

```text
repair_batch_id:  B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW
txn_started_at:   2026-09-06T20:26:26.416067+00:00   (fecha de REGULARIZACIÓN — no retro-fechada)
commit:           OK (HTTP 201, exit 0) · duración ~4.7 s
runner:           b10b_query.js (Supabase Management API, batch simple-query único)
script:           scripts/r1_execute.sql (1824 líneas, COMMIT final)
actor:            051c6157-600b-425e-b8c0-72388bacf541 (RECONCILIATION_EXECUTOR)
position_date:    2026-08-16T22:01:13Z (documentada en notes + metadata, NO usada como fecha del movimiento)
```

## Fases ejecutadas (una sola transacción)

1. **LOCKS**: `pg_advisory_xact_lock(hashtextextended('b10b-obs2-recon:<store>',0))` +
   `FOR UPDATE` de los 98 productos `ORDER BY id`; `lock_timeout 15 s`.
2. **VALIDATE (§15, anti-TOCTOU)**: barreras B1/B4 (prefijo y audit = 0), ledger vacío
   (inventory/movements/kardex/transactions = 0), universo 98+124, drift fila a fila
   (qty y WAC), residuo Test intacto.
3. **MUTATION**: 98 × `register_stock_movement(p_movement_type=>'initial',
   p_reason=>batch, p_unit_cost=>cost_average exacto, p_notes=>evidencia JSON,
   p_operation_date=>now(), p_user_id=>actor, p_skip_access_check=>false)` — con
   `request.jwt.claims` establecido (auth.uid() = actor) para que el access check
   canónico se ejercitara.
4. **VERIFY in-transacción**: invariantes I1–I16 + neutralidad financiera (ver
   06-postconditions.md).
5. **AUDIT**: 1 fila `audit_logs` action=`STOCK_RECONCILIATION_OPENING` (ver
   07-audit-verification.md).
6. **COMMIT** (solo tras pasar todo; cualquier fallo → ROLLBACK total automático).

## Desviación documentada del texto del diseño (mecanismo de sesión)

El diseño (10-opening-design.md §5) prescribía `SET ROLE authenticated`. La ACL real de
`register_stock_movement` otorga EXECUTE solo a `postgres` + `service_role`
(`raw/r1_acl.json`) — en producción la llama el servidor con credenciales de servicio.
La ejecución se realizó sobre la conexión privilegiada con `set_config('request.jwt.claims')`
del firmante: **auth.uid() = actor**, access check canónico EJERCITADO (no saltado),
`created_by` y contexto de auditoría = firmante. Propiedades de seguridad del diseño
íntegramente preservadas; evidencia: `raw/r1_actor_probe.json`, `raw/r1_acl.json`.

## Ensayos previos (REHEARSAL — mismo script, ROLLBACK final)

| # | Resultado | Causa | Mutación persistida |
|---|---|---|---|
| 1 | ABORT `ERR_UNIVERSE_DRIFT` (falso positivo) | bug del comparador SQL: variable `int` recibía `cost_average` (numeric) → cast 489.999…→490 | 0 (falló en Fase B, pre-mutación) |
| 2 | ABORT `ERR_UNIVERSE_DRIFT` | hallazgo real de representación decimal (numeric vs float64-JSON) — ver 03-pre-snapshot.md | 0 (falló en Fase B, pre-mutación) |
| 3 | **PASS completo** → ROLLBACK | — | **0 — 34/34 métricas idénticas post-rollback** (`raw/r1_post_rehearsal_snapshot.json`) |

El ensayo PASS reportó en-transacción: movements 98 · units 6427 · value
9.932.216,938816005 · inventory 98 · kardex 98 · BE 98 · stock_current_sum 6.553
(sin cambio). (`raw/r1_rehearsal_result.json`)

## Registro de filas afectadas (§20)

```text
stock_movements   +98   (1/producto, 'initial', reference_doc=batch, unit_cost=WAC exacto)
inventory         +98   (0→98 filas, quantity=Q, version=1)
kardex_entries    +98   ('in' 1:1, numeric(12,2), reference_description=batch)
business_events   +98   ('stock_movement', payload.new_qty=Q)
audit_logs        +1    (lote STOCK_RECONCILIATION_OPENING)
products          +0 filas (98 filas: updated_at=now(); stock_current y cost_average SIN CAMBIOS)
wac_change_log    +0
financiero        +0    (transactions/payments/commissions/receipts/devolutions/transfers)
```
