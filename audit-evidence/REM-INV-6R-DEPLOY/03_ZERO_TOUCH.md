# R1 DEPLOY — 03 ZERO-TOUCH (bitwise)

timestamp PRE : 2026-09-15T22:48:06.571Z
timestamp POST: 2026-09-15T22:48:54.901Z

| store | métrica | PRE | POST |
|---|---|---|---|
| ENERVIDA-VITALLCONS | inventory_n | 106 | 106 | ✔
| ENERVIDA-VITALLCONS | stock_movements_n | 451 | 451 | ✔
| ENERVIDA-VITALLCONS | transactions_n | 308 | 308 | ✔
| ENERVIDA-VITALLCONS | receipts_n | 4 | 4 | ✔
| ENERVIDA-VITALLCONS | payment_transactions_n | 154 | 154 | ✔
| ENERVIDA-VITALLCONS | audit_logs_n | 5438 | 5438 | ✔
| ENERVIDA-VITALLCONS | memberships_n | 3 | 3 | ✔
| ENERVIDA-VITALLCONS | ids_hash md5 | `7b1ea4e752fe79cc13d411e523463085` | `7b1ea4e752fe79cc13d411e523463085` | ✔
| Puerto Padre VITALLCON | inventory_n | 35 | 35 | ✔
| Puerto Padre VITALLCON | stock_movements_n | 251 | 251 | ✔
| Puerto Padre VITALLCON | transactions_n | 212 | 212 | ✔
| Puerto Padre VITALLCON | receipts_n | 2 | 2 | ✔
| Puerto Padre VITALLCON | payment_transactions_n | 212 | 212 | ✔
| Puerto Padre VITALLCON | audit_logs_n | 1136 | 1136 | ✔
| Puerto Padre VITALLCON | memberships_n | 3 | 3 | ✔
| Puerto Padre VITALLCON | ids_hash md5 | `4fcafb9cc8d2a7a3879cb28cc1a3d851` | `4fcafb9cc8d2a7a3879cb28cc1a3d851` | ✔

VEREDICTO: BITWISE IDENTICAL — los tenants protegidos ENERVIDA-VITALLCONS y Puerto Padre VITALLCONS no registraron ninguna mutación de datos durante el deploy (las migraciones solo tocan definiciones de funciones y ACLs).