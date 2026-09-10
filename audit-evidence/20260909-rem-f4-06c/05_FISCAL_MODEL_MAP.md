# 05_FISCAL_MODEL_MAP — mapa del modelo fiscal y decisión arquitectónica (§7/§8)

## Evidencia recolectada (fuentes)
1. **Migraciones** (cadena completa, rg sobre supabase/migrations):
   - 20260726000002_v1_2: CREATE TABLE fiscal_closings (modelo V2: store_id, period_year,
     period_month, status open/closed/locked CHECK, totals, closed_by/at, locked_by/at,
     UNIQUE(store,year,month)) + RLS (select/insert/update sobre authenticated) +
     close_fiscal_period (escribe fiscal_closings) + lock_fiscal_period + ensure_fiscal_period.
   - 20260727000006_v2_12_9: close_fiscal_period(p_store_id,p_year,p_month,p_user_id DEFAULT NULL)
     — patrón anti-spoofing — escribe fiscal_closings; retorno {status, closing_id, total_*}.
   - 20260727000012_v2_12_18: reemplaza close_fiscal_period → fiscal_period_closures (fantasma).
   - 20260809000004_v2_18_4: trigger auditoría trg_audit_fiscal_closings (reparado por F4-06b).
   - 20260810000005_v2_19_5: prevent_fiscal_closing_edit (inmutabilidad de locked).
   - 20260902200923_w9_f06_c2: EXECUTE solo service_role para close/lock/ensure.
   - 20260909000003_rem_f4_06b: audit_fiscal_closings_changes uuid→uuid (sin ::text).
   - **fiscal_period_closures: CERO CREATE TABLE en toda la cadena** (única mención: el
     cuerpo v2_12_18). Cero FKs, cero índices, cero policies, cero UI, cero queries.
2. **DB viva**: fiscal_closings existe (r) con RLS/2 triggers/3 índices;
   fiscal_period_closures ausente en TODO relkind (raw out_q01 s05/s06/s07).
3. **src/**: único consumidor runtime de ambos RPCs = route.ts (censo rg). UI
   FiscalCloseView: GET status + POST action 'close' y 'lock'; estados visibles
   open/closed/locked (modelo fiscal_closings). Sin referencias a fiscal_period_closures.
4. **Tipos/queries**: fiscal_closings referenciado en route.ts (GET) + tests de integración
   (iteration-fiscal, iteration-11-4: contratos ERR_FISCAL_CLOSING_LOCKED, inmutabilidad).
5. **audit_logs**: record_id=uuid — la auditoría canónica une con fiscal_closings.id.

## Evaluación de opciones (§7)
- **Opción A (tabla eliminada/renombrada, RPC obsoleto)**: DESCARTADA — no hay DROP/RENAME
  de fiscal_period_closures en la historia; el RPC de close NO es obsoleto: es la vía de
  negocio de la acción 'close' de la UI actual.
- **Opción B (falta una migración que la cree)**: DESCARTADA — violaría §8 (duplicaría el
  modelo) y dejaría el lock roto (nadie llevaría fiscal_closings a 'closed'); además la
  semántica V1 (period_start/end, transaction_count, total_revenue) es subconjunto derivable.
- **Opción C (RPC usa nombre incorrecto; debe escribir la estructura existente)**: **ELEGIDA**
  — demostrado: la versión canónica previa (v2_12_9) escribía fiscal_closings; v2_12_18
  introdujo la regresión hacia un nombre que jamás existió.
- **Opción D (coexistencia legítima)**: DESCARTADA — cero evidencia arquitectónica de dos
  entidades (sin migración de creación, sin consumidores, sin FK/UI/queries).

## Decisión documentada (§8 — ONE canonical fiscal-period model)
- Fuente de verdad: **public.fiscal_closings** (único modelo; status open→closed→locked;
  UNIQUE(store,year,month) como base de idempotencia estructural).
- Remediar = RESTAURAR el contrato canónico v2_12_9 de close_fiscal_period (misma firma,
  misma autorización, mismos errores, mismo retorno) escribiendo fiscal_closings.
- Prohibición §11 respetada: NO se creó tabla nueva para que el código deje de fallar.
