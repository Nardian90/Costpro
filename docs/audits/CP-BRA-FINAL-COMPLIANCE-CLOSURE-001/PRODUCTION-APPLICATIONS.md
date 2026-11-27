# PRODUCTION-APPLICATIONS — Aplicaciones productivas gobernadas §11g

**Misión:** CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 · **Fecha:** 2026-11-27 · **Producción:** CostproBD `wthkddeleylijmonclxg`

Todas las aplicaciones siguieron el patrón canónico §11g (guard `assert-not-production` + doble flag, PRE/POST con marcas re-ejecutables, NOTIFY pgrst, idempotencia de expediente) — misma mecánica certificada en R-05/R-26 (misión precedente).

---

## 1. R-03 — `register_ot_payment_batch` (migración `20261127140000`)

| Elemento | Valor |
|---|---|
| Script gobernado | `scripts/cpbra-r03-apply-prod.mjs` (guardProtected) |
| PRE | `ya_existe=0` · `motor_certificado=1` (motor single intacto) |
| Aplicación | UNA SOLA VEZ · SQL ejecutado sin error · NOTIFY pgrst |
| POST | **7/7 marcas**: firma_nueva · gate_ot_exclusivo · lock_ot · neteo_contrafilas · via_motor_single · acl_service_role_exclusiva · security_definer |
| Guard final | motor_single_intacto OK (el motor single no fue alterado) |
| Motivo de la aplicación | el endpoint `/api/payments/ot-batch` (fusionado en #1732) invoca el RPC — sin él fallaría en producción |

## 2. §0.2 — `pay_commission` gate admin/manager/encargado (migración `20261127150000`)

| Elemento | Valor |
|---|---|
| Script gobernado | `scripts/cpbra-pc-apply-prod.mjs` (guardProtected) |
| PRE | 8 marcas leídas: solo `gate_tres_roles_en_codigo` ausente (drift intencional documentado en allowlist) — **sin drift inesperado** |
| Aplicación | UNA SOLA VEZ · NOTIFY pgrst |
| POST | **8/8 marcas**: firma_preservada · gate_tres_roles · rechazo_rol · advisory_cajon · guard_fisico · regla_actor · acl_invariante · security_definer |
| body_hash | prev (gate admin\|manager) `092daade2e0f5af377b1e3839dabea59` → post (gate tres roles) `7b08c5d52d66de6e41a17332d04119e5` |
| Allowlist | entrada `pay_commission/7` BODY_DRIFT **RETIRADA** tras la aplicación (patrón R-26) |

## 3. FASE 4 — Regularización Tienda Pueblo (migración `20261127160000`)

| Elemento | Valor |
|---|---|
| Script gobernado | `scripts/cpbra-tp-apply-prod.mjs` (guardProtected) |
| PRE | `ids_presentes=3` · `pendientes=3` · `total=19435.0` · `pagos=0` · `bucket_dash_total=19435.0` · `auditoria=0` — **detención automática probada**: el primer intento abortó por `canonicos=0` (bug de escape de regex en el SCRIPT — la migración siempre fue correcta; lección registrada) |
| Aplicación | UNA SOLA VEZ · NOTIFY pgrst |
| POST | **6/6 marcas**: tres_en_tienda_pueblo · totales_intactos (19,435) · estados_intactos · cero_pagos · auditoria_owner_x3 (OWNER_CONFIRMATION) · sin_bucket_dash |
| Conciliación | CxP Tienda Pueblo (unpaid) = 56,602.30 (incluye recepciones previas del proveedor + las 3 regularizadas: 19,435) · bucket «—» restante = 0 · kardex intocado |
| Historial | los 3 IDs, importes, referencias y el registro canónico en `TIENDA-PUEBLO-REGULARIZATION.md` |

## 4. Superficie y contratos tras el despliegue

- `contract-surface.sql` re-exportado LIVE ×2: post-§0.2 (sha `17c3039b…`, 233 funciones) y post-R-03 (sha `96db300c…`, 233 funciones — el lote OT queda fuera del surface POR DISEÑO, filtro write-detector REM-INV-6R; contrato por replay + tests estáticos).
- `security-contract-test-static.cjs`: **OK, 0 divergencias** (3 warnings MEDIUM/LOW preexistentes, semántica idéntica).
- `build-migrations-replay.mjs --check`: **MATCH** (224 migraciones; digest `06380a62…`).
- Entrada allowlist retirada: `pay_commission/7` (no queda drift LIVE-vs-migración).

## 5. Rutas migradas en producción (estado final)

| Migración | Posición replay | Estado |
|---|---|---|
| `20261127120000` (R-26) | 220 | aplicada (misión precedente) |
| `20261127130000` (cpop service-type, PR #1731) | 221 | aplicada (sesión concurrente) |
| `20261127140000` (R-03) | 222 | **aplicada §11g esta misión** |
| `20261127150000` (§0.2) | 223 | **aplicada §11g esta misión** |
| `20261127160000` (FASE 4) | 224 | **aplicada §11g esta misión** |
