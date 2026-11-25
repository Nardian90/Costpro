# APLICACIÓN EN PRODUCCIÓN — 20261126140000 (CP-BRA-REMEDIATION-001: R-01 + R-14)

**Fecha:** 2026-11-25 (~19:10 UTC) · **Misión:** CP-BRA-REMEDIATION-001 · **PR:** fix/cpbra-r01-r14-motor-pagos
**Canal:** Management API `/database/query` + `NOTIFY pgrst, 'reload schema'` (canal canónico documentado,
patrón `scripts/cpops-apply-migrations-prod.mjs`), guard CP-INFRA-019 con doble flag del operador
(`ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND`), lote único, sin reintentos.
**Producción:** CostproBD — ref `wthkddeleylijmonclxg`.
**Script versionado:** `scripts/cpbra-apply-migration-prod.mjs` (declarado en `scripts/lib/writers.manifest.json`,
guardProtected; marcas re-ejecutables + modo `--check`).
**SHA-256 de la migración:** `15efb4e4a8fd7a4b8da1734cd5ed117aa65bb88e4c20b2055f914e0fa3f7ffeb` (22.555 bytes).

---

## 1. Qué remedia

| Hallazgo | Regla | Defecto | Corrección |
|---|---|---|---|
| **R-01** (CRÍTICO) | FIN-002/REP-001/FIN-011 | La reemisión 20261124120000 de `update_payment_status` PERDIÓ la rama `production_order\|work` (existía desde 20261113120800): todo pago futuro a una OT dejaría `production_orders.paid_amount` desactualizado y el saldo CxC divergente del mayor | Trigger reemitido con las TRES ramas; rama OT restaurada CON neteo de contra-filas (`direction='reversal'` resta) y guard de OT voided; lectura `COALESCE(NEW,OLD)` para que DELETE también recompute |
| **R-01 colateral** | FIN-011 | `register_supplier_payment` rama OT sin lock (concurrencia) y sin gate de estado | `FOR UPDATE` + `ERR_ORDER_NOT_PAYABLE` para OT `voided` (draft sigue permitido: 34 pagos históricos en draft — anticipos, decisión documentada) |
| **R-14** (CRÍTICO) | FIN-008/FIN-004 | `reverse_supplier_payment` permitía revertir pagos ya incluidos en cierres fiscales cerrados/locked — el efecto caía en el turno vigente (manipulación del corte) | Guard de período fiscal (patrón ERR_FISCAL_PERIOD_CLOSED de v2_19_3) sobre la fecha del pago ORIGINAL; excepción administrativa auditada (`p_allow_closed_period` + `is_admin_check` + motivo) → evento `PAYMENT_REVERSED_CLOSED_PERIOD` |

## 2. Orden §11g cumplido (aislado antes que producción)

1. **BD aislada CostproE2E (`lguovmvrozxgssupkwpf`) PRIMERO:** `node scripts/cpbra-apply-migration-prod.mjs --target e2e` →
   SQL ejecutado sin error, 9/9 marcas OK.
2. **Prueba funcional EN LA AISLADA (transacción con ROLLBACK — cero residuos):**
   - OT presupuesto 1.000 CUP + pago 400 → `paid_amount=400.00, payment_status='partial'` ✓
   - + pago 600 → `paid_amount=1000.00, payment_status='paid', paid_at set` ✓
   - + contra-fila reversión 100 → `paid_amount=900.00, payment_status='partial', paid_at NULL` ✓ (neteo)
   La rama OT del trigger recalcula el saldo ante INSERT y ante contra-filas de reversión.
3. **Producción, UNA sola vez:** `ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND node scripts/cpbra-apply-migration-prod.mjs`
   → SQL ejecutado sin error, 9/9 marcas OK, `NOTIFY pgrst, 'reload schema`' enviado (201).
4. **Surface re-certificado:** `node scripts/export-contract-surface.cjs` → `contract-surface.sql` 232 funciones,
   sha256 `7dea8aa83a9b290b23908d82c0acc8c3f50ef37357b5d09c897b5d01c0eee34f`; entrada obsoleta
   `register_supplier_payment/12` del `source_of_truth_baseline` retirada (drift resuelto);
   `security-contract-test-static.cjs` → **232/232 representadas, 0 divergencias, CONTRATO OK (3 warnings MEDIUM/LOW preexistentes)**.

## 3. Estado ANTES → DESPUÉS (producción, marcas re-ejecutables)

| Marca | Antes | Después |
|---|---|---|
| `reverse_supplier_payment` overload 4 args (sin guard) | 1 | **0** (eliminado con DROP) |
| `reverse_supplier_payment` 5 args (con `p_allow_closed_period`) | 0 | **1** |
| `update_payment_status` contiene rama `production_order\|work` | false | **true** |
| `register_supplier_payment` gate `ERR_ORDER_NOT_PAYABLE` | false | **true** |
| `register_supplier_payment` rama OT con `FOR UPDATE` | false | **true** |
| `reverse_supplier_payment` guard `ERR_PAYMENT_IN_CLOSED_FISCAL_PERIOD` | false | **true** |

Re-ejecutable: `node scripts/cpbra-apply-migration-prod.mjs --check` (debe dar 9/9 OK y exit 0).

## 4. Seguridad

- Migración **aditiva y fail-closed**: solo AÑADE guards (ninguna vía pierde controles); sin cambios de RLS,
  sin cambios de datos históricos (los saldos OT actuales ya eran coherentes — forense R-01: 18/18 OTs
  pagadas con `paid_amount` correcto porque sus pagos son previos a la reemisión defectuosa).
- Idempotente: `CREATE OR REPLACE` + `DROP FUNCTION IF EXISTS` + `DROP TRIGGER IF EXISTS`; ACLs re-declaradas
  (service_role exclusivo, convención PUR-004).
- El overload de 4 args se ELIMINA para que no quede una vía antigua sin el guard (lección ADN-009);
  la ruta `/api/payments/[id]` usa args nombrados → retrocompatible; el error nuevo se mapea a 409
  (`ERR_PAYMENT_IN_CLOSED_FISCAL_PERIOD`).
- Cero exposición actual del guard R-14 (0 cierres fiscales en producción a 2026-11-25): protección
  preventiva; la excepción administrativa existe para los casos futuros autorizados por el propietario.

## 5. Verificación posterior

- Suite de contrato de la migración: `src/__tests__/migrations/cpbra-r01-r14-payment-engine-migration.test.ts` (13 pruebas).
- Replay E2E actualizado: 216 migraciones incluidas (`replay-unblock-create-sale-v2.test.ts`).
- `security-contract-test-static.cjs`: CONTRATO OK (ver §2.4).
- E2E de humo aislado: queda para el workflow manual «E2E Aislado (CostproE2E)» (workflow_dispatch) del PR.
