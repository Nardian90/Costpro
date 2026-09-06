# W9.5 — B-10b-OBS-2 · REPAIR DESIGN · 18-execution-checklist.md
# Checklist de ejecución para la fase futura (GATE 18) — la fase de ejecución deberá
# marcar cada casilla con evidencia; sin excepciones.

## Fase 0 — Autorización (antes de tocar nada)

- [ ] Decisión humana firmada (16-repair-recommendation.md §SIGNATURE): modelo D, lista
      07-proposed-opening.csv fila a fila, exclusión de 10 Test, fecha de ejecución.
- [ ] ACTOR designado con nombre y usuario real (candidato 051c6157 admin@costpro.com);
      credenciales JWT disponibles para la sesión de ejecución.
- [ ] Ventana de mantenimiento acordada (POS cerrado para TIENDA CENTRAL COSTPRO).
- [ ] Este pack revisado y su SHA256SUMS verificado (N/N OK) — copia archivada.

## PRE (precondiciones técnicas)

- [ ] Git: HEAD == origin/main, worktree clean, commit ≥ 7dfcaeea (+commit de diseño).
- [ ] Funciones congeladas intactas: comparar pg_get_functiondef de register_stock_movement,
      fn_recalc_wac, fn_sync_inventory_on_movement, reverse_devolution contra
      raw/g5_funcdefs.json (hash == hash del pack OBS-2).
- [ ] Triggers intactos: pg_triggerdef == raw/g5_triggerdefs.json.
- [ ] DB snapshot PRE completo (dump lógico de las 9 tablas auditadas + products) archivado.
- [ ] Checksums PRE: products/inventory/movements == valores de 20-zero-mutation.md §PRE
      (productos: 6c900fcfcbf2c78870d42cd4a3b0b9ef; inventory: 007fec6b6c0968bfd3ae2c765fb86fa7;
      movements: 39ba7edf0ec53f7a65c2f287b5ed2961).
- [ ] Universo esperado congelado: re-consultar los 124 productos y comparar contra
      raw/frozen_universe.json → 0 diferencias (stock_current, cost_average, status).
- [ ] Quantities esperadas: Σ apertura = 6.427 u / 98 filas (07-proposed-opening.csv).
- [ ] WAC esperado: por fila, unit_cost == cost_average (98/98, V8).
- [ ] repair_batch_id generado y registrado en acta: 'B10B-OBS2-RECON-OPENING:<ts>-<rand>'.
- [ ] Barreras: 0 rows con reference_doc LIKE 'B10B-OBS2-RECON-OPENING:%';
      audit_logs action='STOCK_RECONCILIATION_OPENING' count=0.
- [ ] Ledger tienda vacío: inventory 0 / movements 0 / kardex 0 / transactions 0.
- [ ] Detector permanente (iteration-17) ejecutado PRE: reporta 108 orphans vivos (baseline).
- [ ] Backup de emergencia verificado/restorable (plan de contingencia).

## DURANTE (transacción única — 12-atomicity.md)

- [ ] BEGIN + advisory lock + FOR UPDATE (98 ids, ORDER BY id).
- [ ] Validación 1: universo y drift (por fila: stock_current y cost_average == pack).
- [ ] Validación 2: ledger vacío y barreras de idempotencia (B1–B2).
- [ ] Mutación: 98 × register_stock_movement('initial', +Q, unit_cost=WAC,
      reference_doc=batch, p_user_id=firmante, notes=evidencia, p_operation_date=now(),
      p_skip_access_check=false) — NADA más.
- [ ] Verificación en-transacción: invariantes I1, I2, I9 (SQL puro, RAISE si falla).
- [ ] Audit del lote: 1 INSERT audit_logs (action='STOCK_RECONCILIATION_OPENING',
      metadata.batch_id, SHA del pack).
- [ ] COMMIT (o ROLLBACK total ante CUALQUIER excepción — sin excepciones parciales).
- [ ] Registro de acta: hora inicio/fin, duración, salida del runner, errores=0.

## POST (verificación exigible)

- [ ] Stock: stock_current de las 124 filas == PRE (checksum I5) — la apertura no reescribe.
- [ ] Inventory: 98 filas nuevas; quantity == Q por producto (I1).
- [ ] Movements: +98, todos 'initial', reference_doc=batch, unit_cost=WAC (I11).
- [ ] Kardex: +98 'in', 1:1, balance_quantity=Q, balance_unit_cost=WAC (I2).
- [ ] WAC: checksum cost_average 124/124 idéntico (I3); wac_change_log +0 (I4).
- [ ] Audit: +1 fila de lote; 0 UPDATE_PRODUCT nuevas (I10).
- [ ] business_events: +98 con new_qty=Q (I9).
- [ ] Idempotence (probe seguro): re-ejecutar SOLO la validación B1 → debe devolver
      ERR_RECON_ALREADY_APPLIED (sin intentar mutar).
- [ ] Neutralidad financiera: pay=366, tx=0, comm=0, dev=13, rec=0 — sin cambios (I8, 14-*).
- [ ] Aislamiento: counts globales de otras tiendas idénticos (I7).
- [ ] Detector permanente (iteration-17) POST: 0 orphans vivos no-clasificados;
      Test visibles como clasificados (I13); 6.553 = 6.427 + 126 (I14).
- [ ] Test suite completa (iteration-17 + iteration-18) PASS.
- [ ] PM2 3/3 online · HTTP 200 en / y /api/health · logs sin errores nuevos.
- [ ] Evidence pack de ejecución (nuevo) con PRE/DURANTE/POST + SHA256SUMS + acta firmada
      + push a origin/main.
