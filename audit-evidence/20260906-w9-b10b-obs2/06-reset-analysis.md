# W9.5 — B-10b-OBS-2 · 06-reset-analysis.md
# Reset forensics — matriz de `reset_store_data` y del purge real de d1c4ba0e (GATE 5)

## 1. Versiones históricas de `reset_store_data` (repo) y comportamiento con products

| # | Migración | Firma | keep_catalog=true | keep_catalog=false | ¿Borra audit_logs? | ¿Crea snapshot? |
|---|---|---|---|---|---|---|
| 1 | 20260619000001 | (uuid,bool) | stock=0, cost=0 (:105-110) | DELETE products | no | no |
| 2 | 20260725000001 | (uuid,bool) | ídem (:155-160) | DELETE products | no | crea tabla `store_reset_snapshots` (:34-55) |
| 3 | 20260726000029 v2.11.2 | (uuid,bool) | stock=0 (:132) | DELETE products | no | borra snapshots (:138) |
| 4 | 20260726000031 v2.11.4 | (uuid,bool) | stock=0 (:156) | DELETE products | **SÍ — única (:138)** | no |
| 5 | 20260802000001 fase0 | (uuid,bool,**uuid**) | stock=0, cost=0 (:385) | DELETE products | no | no (audit `store_reset_completed` :416-424) |
| 6 | **20260817000002 (3-arg VIGENTE)** | (uuid,bool,uuid) | **stock=0, cost=0 (:182)** | DELETE products (:190) | no | NO — **BORRA** el snapshot que la API route creó (:206) |
| 7 | 20260820000005 (2-arg legacy) | (uuid,bool) | stock=0 (:51-56) + reconciliación final inventory (:71-77) | DELETE products | no | no |

ACL vigente (`20260831000001_w9_f07_reset_store_data_acl.sql:39-75`): 2 overloads vivos;
consumidor legítimo único = `src/app/api/stores/reset/route.ts` (service_role, 3-arg).

**Respuesta a la pregunta del mandato**: ¿Es técnicamente posible que `reset_store_data`
haya eliminado todo el ledger pero dejado `products.stock_current` intacto?
**NO.** En TODAS las versiones, keep_catalog=true fuerza `stock_current=0` (y
`cost_average=0`), y keep_catalog=false borra las filas de products. Ninguna versión
puede dejar 108 productos con stock>0. → **El purge de d1c4ba0e NO fue
`reset_store_data`.**

## 2. Reset AUDITADOS en la BD (todos de OTRAS tiendas)

- `5e6fe821` (ENERVIDA-VITALLCONS): 7 resets 2026-08-09/08-10/08-11, todos
  keep_catalog=**false**, con audit `store_reset_initiated`/`store_reset_completed`.
- `43a4dabc` (Puerto Padre VITALLCONS): 6 intentos 2026-08-16 23:05-23:15, 1 completado
  23:15:37, keep_catalog=false.
- **d1c4ba0e: CERO eventos `store_reset_*`.** (raw/g9_restore_deep.json)

## 3. Restores

- `restore_sessions`: 53 filas — 35 COMPLETED + 17 DRY_RUN de `43a4dabc`; **d1c4ba0e:
  1 DRY_RUN (preview) 2026-08-02T02:40:25, payload 650.531 bytes, NUNCA ejecutada**.
- Audit global: 37 STORE_BACKUP_EXPORT, 8 DRYRUN, 4 STORE_BACKUP_RESTORE — todos ≤ 08-07;
  tras el 08-01 solo 2 EXPORT (08-06/08-07). → Restore NO fue el mecanismo.

## 4. El PURGE real de d1c4ba0e — matriz de supervivencia (backup 08-02 → hoy)

Payload del backup exportado 2026-08-02T02:25:31Z (raw/g10_payload.json) vs estado actual:

| Tabla | en backup 08-02 | hoy en d1c4ba0e | destino |
|---|---:|---:|---|
| products | 114 | 114 | ✅ PRESERVADA (stock_current incluido) |
| inventory | 114 (Σ 5.495) | 0 | ❌ PURGADA |
| stock_movements | 242 (Σ +5.495) | 0 | ❌ PURGADA |
| kardex_entries | 242 | 0 | ❌ PURGADA |
| transactions | 20 | 0 | ❌ PURGADA |
| receipts | 1 | 0 | ❌ PURGADA |
| transfers | 5 | 0 | ❌ PURGADA |
| payment_transactions | 66 | 0 | ❌ PURGADA (sin residuo financiero huérfano) |
| devolutions | 0 | 13 | ➕ creadas 08-04..08-07 y PRESERVADAS |
| audit_logs | 105 | 365 | ✅ PRESERVADA |
| warehouses | 3 | 3 | ✅ PRESERVADA |
| commission_rules | 60 | 60 | ✅ PRESERVADA |
| z_reports | — | 6 | ✅ PRESERVADA |
| inventory_reservations | 5 | 8 | ✅ PRESERVADA |
| user_store_memberships | 7 | 9 | ✅ PRESERVADA |

Persistencia residual no-financiera: z_reports (6), warehouses (3), commission_rules (60),
inventory_reservations (8, expired), memberships (9), devolutions (13) — todas sin ledger
que las soporte; clasificadas como RESIDUO DE PURGE (documentación, no dinero).

## 5. Datación del purge (evidencia indirecta convergente)

1. Último audit_log de la tienda: **2026-08-17T02:48:46Z** (raw/g3).
2. `pg_stat_user_tables`: `receipts` del=80 (TODAS las que tuvo) y `receipt_items`
   del=2.433, con **last_autovacuum 2026-08-17T02:36:xx-02:37:xx** — autovacuum se
   dispara por dead tuples masivos → deletes masivos en receipts/receipt_items
   inmediatamente antes de las 02:36-37 del 08-17 (raw/g11).
3. products de la tienda: última modificación **2026-08-16T22:01** — el purge NO tocó
   products (0 updated_at posterior).
4. inventory/stock_movements/kardex con autovacuum 09-05 (otras tiendas siguieron
   escribiendo; menos precisión, coherente).
5. 0 eventos audit 08-17 02:36-02:48 relacionados a reset/restore.

**Ventana del purge: 2026-08-17, aproximadamente 02:00-02:50 UTC** (tras la última venta
auditada 02:36-ish y antes del silencio total). Executor: SQL directo (psql / Management
API / script), porque: (a) ninguna versión de reset_store_data deja stock>0; (b) 0 audit
de reset/restore; (c) 0 restore_sessions ejecutadas; (d) patrón selectivo por store_id
(sin tocar products/devolutions/audit) NO coincide con ningún DELETE del código del repo;
(e) `sync_log` = 0 filas.

## 6. Respuesta final del GATE 5

¿Explica el purge las 6.553 unidades? **SÍ — pero inversamente al enunciado**: el purge
fue hecho por un agente externo con SQL directo que borró el ledger completo de la tienda
SIN resetear `products.stock_current` (ni borrar products). Las 6.553 unidades son el
estado de stock CONGELADO de los productos en el momento del purge: **110 de los 114
productos del backup 08-02 tienen hoy EXACTAMENTE el mismo stock_current que el backup**
(+ operaciones reales 08-04..08-17 aún no congeladas en 4 productos + 10 productos Test
creados el 08-07). El "reset del 2026-08-11" citado por la migración 20260820000004
corresponde a los resets auditados de OTRAS tiendas, no a este purge.
