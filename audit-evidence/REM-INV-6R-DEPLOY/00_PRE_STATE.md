# R1 DEPLOY — 00 PRE STATE (read-only capture)

timestamp: 2026-09-15T22:48:06.571Z
target: Supabase LIVE wthkddeleylijmonclxg (production)
method: Management API /database/query (SELECT only)

## Funciones afectadas (7) — firma · secdef · proacl PRE

- `cleanup_expired_idempotency_keys()` · secdef=True · acl=`postgres=X/postgres,service_role=X/postgres`
- `register_idempotency(text,text,uuid,text,jsonb)` · secdef=True · acl=`postgres=X/postgres,service_role=X/postgres`
- `cleanup_old_aggregates(integer)` · secdef=True · acl=`postgres=X/postgres,service_role=X/postgres`
- `managed_delete_user(uuid)` · secdef=True · acl=`postgres=X/postgres,service_role=X/postgres`
- `purge_old_reset_snapshots(integer)` · secdef=True · acl=`postgres=X/postgres,service_role=X/postgres`
- `validate_active_store()` · secdef=True · acl=`postgres=X/postgres,service_role=X/postgres`
- `get_batch_store_daily_kpis(uuid[],date)` · secdef=True · acl=`postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres`

## Zero-touch PRE (tenants protegidos)

| store | inventory | stock_movements | transactions | receipts | payment_transactions | audit_logs | memberships | ids_hash(md5) |
|---|---|---|---|---|---|---|---|---|
| ENERVIDA-VITALLCONS | 106 | 451 | 308 | 4 | 154 | 5438 | 3 | `7b1ea4e752fe79cc13d411e523463085` |
| Puerto Padre VITALLCONS | 35 | 251 | 212 | 2 | 212 | 1136 | 3 | `4fcafb9cc8d2a7a3879cb28cc1a3d851` |

Nota: los counts suman exactamente los números certificados en REM-INV-6R (inv 106+35=141, movs 451+251=702, tx 308+212=520, memb 3+3=6).

KPI get_batch_store_daily_kpis PRE: SIN guard (body len=2994, has_store_access=False) — residual R1 pendiente, esperado.