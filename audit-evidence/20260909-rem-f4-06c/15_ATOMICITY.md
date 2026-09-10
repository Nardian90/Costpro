# 15_ATOMICITY — §17 (raw: t2_idem_atomic_out.txt) — ALL PASS

Método: éxito del RPC + RAISE forzado EN LA MISMA transacción (DO $$ RAISE … $$) →
la txn completa se revierte. Demuestra que negocio + auditoría (trigger) viven en la
misma unidad atómica.

- A1 close (2028-07): RPC exitoso dentro de la txn → RAISE FORCED_AFTER_AUDIT_A1 →
  negocio revertido (0 filas 2028-07) + auditoría revertida (0 deltas: 16→16).
  ⇒ NO existe «business persisted + audit missing» ni «audit persisted + business missing».
- A2 lock (2028-08, cerrado en prep): lock exitoso en txn → RAISE FORCED_AFTER_AUDIT_A2 →
  fila sigue 'closed' (NO locked) + auditoría revertida (19→19).
- A3 camino negativo (cross-ref I1/I3/I5): operación fallida (ERR_PERIOD_LOCKED /
  ERR_NOT_CLOSED / ERR_UNAUTHORIZED) → 0 auditoría, 0 estado.

0 residuo DDL (los RPCs no ejecutan DDL). La auditoría es por trigger en la misma txn
del negocio — integridad estructural garantizada por PostgreSQL.
