-- ============================================================================
-- MIGRACIÓN PROPUESTA v1 — COBROS LEGACY → payment_transactions
-- Expediente: docs/audits/2026-11-13-migracion-legacy-pagos/
-- ============================================================================
-- ⚠️ PREPARADA Y VALIDADA EN BD E2E AISLADA (lguovmvrozxgssupkwpf). NO EJECUTAR
--    EN PRODUCCIÓN SIN AUTORIZACIÓN EXPRESA DEL PROPIETARIO (misión final 2026-11-13,
--    apartado 2: «Autorizo únicamente preparar y validar una propuesta de migración
--    reversible en la BD aislada»).
--
-- OBJETO: materializar en payment_transactions los cobros que hoy viven SOLO en
-- los campos históricos de transactions (cash_amount / transfer_amount /
-- zelle_amount) para las ventas que NO tienen filas de pago. Con ello el motor
-- CP-FIN puede contabilizarlas (Σcob = total_cup) en el evento de reconocimiento
-- (la VENTA no tiene evento 'pago': los cobros se agregan al asiento de
-- reconocimiento — no se genera un segundo asiento por el mismo hecho económico).
--
-- ALCANCE (ver m2-165-legacy.json, extracción read-only del 2026-11-13):
--   · 165 ventas (todas ENERVIDA-VITALLCONS, jul–ago 2026), total 3.163.110 CUP.
--   · 161 MIGRABLES: cash 138 · transfer 14 · mixtas cash+transfer 9
--     (= 2.720.000… importes verificados fila a fila; suma exacta == total_amount).
--   · 4 EXCLUIDAS Y BLOQUEADAS (31.620 CUP): contienen zelle_amount en CUP
--     (c5965c77, cb3052c3, 119a4f5e puras; 1558287f mixta cash+zelle). El trigger
--     de invariantes PROHÍBE zelle+CUP (PT005: zelle exige USD/EUR/MLC) → migrarlas
--     tal cual ABORTARÍA (fail-closed). Alternativas (decisión del propietario):
--       (a) mantenerlas bloqueadas;
--       (b) autorizar una salvedad explícita de PT005 para datos históricos;
--       (c) reclasificar documentalmente el riel (requiere decisión sobre datos
--           originales — NO se hace sin autorización).
--
-- PROPIEDADES (demostradas por el validador en BD aislada):
--   1. Conserva las fechas históricas: payment_date := transactions.created_at.
--   2. Respeta métodos y monedas originales: método = nombre del campo legacy;
--      moneda = CUP DEMOSTRADO documento a documento (sale_currency=CUP, ítems CUP,
--      sin carve USD, sin liquidación, saldo == 0). Tasa = 1 (contrato PT003).
--   3. No duplica: fila por (venta, método) con clave única
--      legacy-mig-v1-<id>[-método] (ON CONFLICT DO NOTHING + NOT EXISTS);
--      re-ejecutable e idempotente.
--   4. No genera dos asientos: la VENTA solo tiene evento reconocimiento (los
--      cobros se agregan ahí); el INSERT de pagos NO dispara asiento de pago.
--   5. Reversible de forma controlada: ver REVERSIÓN al final (borrado exacto por
--      clave de idempotencia, con trigger PT007 deshabilitado temporalmente).
--   6. Todos los pagos quedan vinculados a la venta original: ref_type='sale',
--      ref_id = transaction_id = id de la venta.
-- ============================================================================

-- ─── APLICACIÓN (transaccional; re-ejecutable) ────────────────────────────────
BEGIN;

INSERT INTO public.payment_transactions
  (store_id, ref_type, ref_id, transaction_id,
   amount, payment_method, currency, exchange_rate,
   direction, payment_date, reference, notes, idempotency_key)
SELECT
  t.store_id, 'sale', t.id, t.id,
  comp.importe, comp.metodo, 'CUP', 1,
  'in', t.created_at, 'legacy-migration-v1',
  'Cobro materializado del campo legacy ' || comp.campo
    || ' (migración propuesta v1 — reversible; no ejecutar en producción sin autorización)',
  'legacy-mig-v1-' || t.id
    || CASE WHEN comp.n_componentes > 1 THEN '-' || comp.metodo ELSE '' END
FROM public.transactions t
CROSS JOIN LATERAL (
  SELECT campo, metodo, importe,
         (coalesce(t.cash_amount,0) > 0)::int
       + (coalesce(t.transfer_amount,0) > 0)::int
       + (coalesce(t.zelle_amount,0) > 0)::int AS n_componentes
  FROM (VALUES
    ('cash_amount',     'cash',     coalesce(t.cash_amount, 0)),
    ('transfer_amount', 'transfer', coalesce(t.transfer_amount, 0))
  ) AS v(campo, metodo, importe)
) AS comp
WHERE comp.importe > 0
  AND t.status = 'completed'
  AND t.total_amount > 0
  -- solo ventas sin NINGUNA fila de pago previa (ni de otro registro)
  AND NOT EXISTS (SELECT 1 FROM public.payment_transactions pt
                   WHERE pt.ref_type = 'sale' AND pt.ref_id = t.id)
  -- correspondencia EXACTA del cobro legacy con el total canónico
  AND abs(coalesce(t.cash_amount,0) + coalesce(t.transfer_amount,0)
          + coalesce(t.zelle_amount,0) - t.total_amount) <= 0.005
  -- moneda REAL demostrada: documento CUP íntegro (ítems CUP, sin carve USD,
  -- sin liquidación en divisa) — el extractor m2-1 lo verificó documento a
  -- documento (165/165 CUP documentado)
  AND t.sale_currency = 'CUP'
  AND NOT EXISTS (SELECT 1 FROM public.transaction_items ti
                   WHERE ti.transaction_id = t.id AND coalesce(ti.currency,'CUP') <> 'CUP')
  AND NOT EXISTS (SELECT 1 FROM public.transaction_items ti
                   WHERE ti.transaction_id = t.id
                     AND ti.cash_currency = 'USD' AND coalesce(ti.cash_paid,0) > 0)
  AND (t.cash_received_cup IS NULL AND t.cash_received_usd IS NULL
       AND t.change_given_cup IS NULL AND t.change_given_usd IS NULL)
  -- EXCLUSIÓN de las 4 ventas con componente zelle (PT005: zelle jamás CUP;
  -- bloqueadas para decisión del propietario — ver cabecera)
  AND coalesce(t.zelle_amount, 0) = 0
  -- idempotencia: la clave no existe (protege re-ejecuciones concurrentes)
  AND NOT EXISTS (SELECT 1 FROM public.payment_transactions pt
                   WHERE pt.idempotency_key = 'legacy-mig-v1-' || t.id
                         || CASE WHEN comp.n_componentes > 1 THEN '-' || comp.metodo ELSE '' END)
ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

COMMIT;

-- ─── VERIFICACIÓN POSTERIOR (read-only; esperado: 161 ventas cubiertas) ──────
-- SELECT count(DISTINCT ref_id) AS ventas_cubiertas,
--        count(*) AS filas_pago,
--        coalesce(sum(amount_cup), 0) AS importe_total_cup
--   FROM public.payment_transactions WHERE idempotency_key LIKE 'legacy-mig-v1-%';

-- ─── REVERSIÓN CONTROLADA (borrado EXACTO de lo insertado; requiere PT007 off) ─
-- BEGIN;
--   ALTER TABLE public.payment_transactions DISABLE TRIGGER trg_validate_payment_invariants;
--   DELETE FROM public.payment_transactions WHERE idempotency_key LIKE 'legacy-mig-v1-%';
--   ALTER TABLE public.payment_transactions ENABLE TRIGGER trg_validate_payment_invariants;
-- COMMIT;
-- (El borrado no toca NINGÚN otro dato: las ventas, sus campos legacy y sus
--  asientos permanecen intactos; la reversión puede re-ejecutarse de forma segura.)
