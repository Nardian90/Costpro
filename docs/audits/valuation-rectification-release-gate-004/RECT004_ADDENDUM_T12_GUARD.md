# RECT004 — ADDENDUM: SALVAGUARDA T12 (misión CP-FIN-FINAL-CLOSE-005)

Fecha: 2026-11-15 · Autor: agente CP-FIN-FINAL-CLOSE-005 · Estado: IMPLEMENTADA Y PROBADA

## Qué cambia respecto de RECT004

RECT004 documentó la trampa T12 (§ RECT004_REVERSAL_SEMANTICS.md, prueba T12 de m050d):
una reversión parcial enlazada por `reversal_of` hacía que `fin_post_document_annulment`
tratara el asiento original como «ya revertido» (EXISTS ingenuo) y SALTARA su compensación,
dejando el residual contable sin compensar en silencio. La mitigación de RECT004 era
solamente DOCUMENTAL (runbook: «si la FVC se anula, requiere asiento manual del residual»).

Este addendum registra que la mitigación pasó a ser TÉCNICA y SERVER-SIDE, en la rama del
PR #1628 (misión 005, §5), mediante la migración
`supabase/migrations/20261115100000_cp_fin_t12_partial_reversal_guard.sql`:

1. **`fin_entry_reversal_residual(uuid)`** — desviación (CUP) entre un asiento y sus
   reversiones enlazadas por `reversal_of`. 0 = cobertura total; > 0,01 = parcial.
2. **Motor (`fin_post_document_annulment` v2)** — distingue cobertura TOTAL (idempotencia
   ordinaria intacta: se respeta el «ya revertido») de PARCIAL (excepción
   `ERR_PARTIAL_REVERSION_PENDING`; el canal `_safe` la registra en `fin_posting_errors`
   = auditoría visible; el canal directo aborta la transacción). Aplica a TODOS los tipos
   de documento.
3. **Negocio (trigger `fin_t12_receipt_annulment_block` BEFORE UPDATE OF status en
   `receipts`)** — BLOQUEA toda transición a `voided`/`reversed` mientras el asiento
   posted de la recepción tenga reversión parcial con residual pendiente. Protege todas
   las vías (reverse_receipt_v2, UPDATE directo, scripts, API): todas convergen en el
   UPDATE de status. Sin escape hatch: el residual se resuelve contablemente.

## Evidencia de regresión (BD E2E aislada, motor real)

- `scripts/m052-t12-guard-regression.mjs` — 9/9 PASS (P0–P8): anulación ordinaria intacta;
  reversión parcial → residual; bloqueo de negocio (UPDATE abortado, recepción queda
  `active`); bloqueo de motor + auditoría `fin_posting_errors`; reversión completa
  ordinaria respetada (sin 2ª compensación); regularización del residual rehabilita el
  cauce ordinario; net delta 0.
- `supabase/tests/cp_fin_t12_partial_reversal_guard_test.sql` — batería SQL autocontenida
  (C1–C5), ejecutable con el runner oficial
  `node scripts/e2e/run-sql-test-e2e.mjs supabase/tests/cp_fin_t12_partial_reversal_guard_test.sql`
  (PASS por Management API) y vía `scripts/m052c-t12-sqlbat-pg.mjs` (PASS por cliente pg).
- Copia de la evidencia JSON en el expediente 005:
  `docs/audits/valuation-rectification-final-close-005/t12-guard-regression.json`.

## Consecuencias para el runbook de producción (RECT-1/RECT-2)

1. **NUEVO PRE-FLIGHT OBLIGATORIO**: antes de ejecutar RECT-1, la migración
   `20261115100000_cp_fin_t12_partial_reversal_guard.sql` debe estar APLICADA en producción
   (cauce normal de migraciones del proyecto, con registro en el ledger de migraciones de
   producción). Sin ella, la protección T12 no existe en la BD productiva.
2. **Regularización del residual (si algún día se anulara FAC-VITALLCONS-001)**: el
   asiento de regularización del residual NO puede reutilizar el par
   (RECEPCION, FAC-VITALLCONS-001, ajuste_manual) — la restricción única
   `uq_fin_entries_doc_event` solo admite uno. Debe registrarse como ASIENTO MANUAL
   (document_id NULL) enlazado por `reversal_of` al asiento original (hallazgo m052/P7).
   Tras completar la cobertura, la anulación funciona por el cauce ordinario.
3. **Auditoría de intentos bloqueados**: el canal del motor registra cada intento en
   `fin_posting_errors` (error_code `ERR_PARTIAL_REVERSAL_PENDING`); el bloqueo de negocio
   emite además un `RAISE WARNING` al log del servidor. Ni uno ni otro alteran saldos.

## Hallazgos técnicos colaterales (documentados)

- `fin_trg_receipts` es un **CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED**: dispara
  al COMMIT, no al final de la sentencia. Es coherente con el diseño (el posting de la
  recepción ocurre al confirmar, cuando ya existen los items), pero obliga a las pruebas
  transaccionales a usar `SET CONSTRAINTS fin_trg_receipts IMMEDIATE` para observar los
  efectos dentro de la misma transacción (hallazgo m052d, incorporado a la batería).
- Producción permanece INTACTA: la migración vive en la rama del PR; su aplicación a
  producción es una decisión del flujo normal de migraciones del propietario.
