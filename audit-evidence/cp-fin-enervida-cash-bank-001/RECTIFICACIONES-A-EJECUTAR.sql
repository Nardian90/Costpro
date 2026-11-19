-- ============================================================================
-- CP-FIN-ENERVIDA-CASH-BANK-CLASSIFICATION-AND-BALANCE-RECONCILIATION-001
-- EJECUCIÓN DE RECTIFICACIONES HISTÓRICAS (Fase 7 — tras merge y migración)
-- Store ENERVIDA-VITALLCONS (5e6fe821-5465-48b1-b3f1-3aa3182edc38).
--
-- Alcance (auditado read-only 2026-11-19; ver expediente §C/§D):
--   R1..R7: ventas CUP-dominadas cuyo cobro el POS registró como nominal USD
--           equivalente (componente cash/USD) → reclasificación de MONEDA a
--           cash/CUP (escritor canónico fin_reclassify_sale_payment_currency).
--           Evidencia primaria: sale_currency='CUP', total en CUP, tasa
--           documental registrada en el pago (800/845/900/920/930); el
--           propietario confirma que el medio efectivo y la moneda entregada
--           fueron CUP (mandato §3 y §16).
--   R8:     venta 28e94349 con ASIENTO OBSOLETO (publicado por la versión del
--           motor de M-015 con reparto por ítems a tasa 810) inconsistente con
--           su pago registrado (cash/CUP 169,670) → reclasificación del débito
--           ACT_EFECTIVO_USD 167,670 a ACT_EFECTIVO_CUP (caso
--           'asiento_obsoleto' del escritor; tasa documental reconstruida
--           167,670/207 = 810 desde el propio débito).
--   P1/P2:  ventas del registro de misión 16-10 con cobro real registrado y
--           SIN reconocimiento contable (8ab7becf: cobro 16,000 / total
--           15,800 / sobrepago 200 documentado MISIÓN-FLEX; 1df5d727: precio
--           catálogo 0 vs 12,000 recibido, incidencia documentada) →
--           reconocimiento VENTA por el escritor canónico fin_post_document
--           con el motor LIVE (regla VENTA v2: diferencia_cobro_haber).
--
-- Reglas: idempotente (YA_APLICADO / NULL en re-ejecución); no altera
-- ingresos, COGS, inventario, precios, cantidades ni tasas registradas;
-- conserva trazabilidad al asiento y movimiento originales; NO ejecutar dos
-- veces RECT-FIN-E2614F36 (ya aplicada el 2026-11-18, cf781c93).
-- ============================================================================

-- R1 · 9d1ccef8 (11-07): cash/USD 7 @930 → caja CUP 6,510
SELECT public.fin_reclassify_sale_payment_currency(
  '9d1ccef8-83ab-4fca-8eb9-ab016eb98a85'::uuid, 'cash', 'USD', 'CUP',
  'a1111111-1111-1111-1111-111111111111'::uuid,
  'Venta CUP 6,510 (catálogo 7 USD x930) cobrada en efectivo CUP; el POS registro el nominal USD 7.00 equivalente. Moneda real del cobro: CUP. Expediente CP-FIN-ENERVIDA-CASH-BANK-CLASSIFICATION-AND-BALANCE-RECONCILIATION-001 §C.'
) AS r1;

-- R2 · 97263a9c (11-16): cash/USD 10 @920 → caja CUP 9,200
SELECT public.fin_reclassify_sale_payment_currency(
  '97263a9c-054f-45a0-a6fe-bc52c155bcff'::uuid, 'cash', 'USD', 'CUP',
  'a1111111-1111-1111-1111-111111111111'::uuid,
  'Venta CUP 9,200 (catálogo 10 USD x920) cobrada en efectivo CUP; el POS registro el nominal USD 10.00 equivalente. Moneda real del cobro: CUP. Expediente CP-FIN-ENERVIDA-CASH-BANK-CLASSIFICATION-AND-BALANCE-RECONCILIATION-001 §C.'
) AS r2;

-- R3 · abab9e20 (11-17): cash/USD 18 @900 → caja CUP 16,200
SELECT public.fin_reclassify_sale_payment_currency(
  'abab9e20-a28a-417b-8c16-128362a3e6b8'::uuid, 'cash', 'USD', 'CUP',
  'a1111111-1111-1111-1111-111111111111'::uuid,
  'Venta CUP 16,200 (catálogo 18 USD x900) cobrada en efectivo CUP; el POS registro el nominal USD 18.00 equivalente. Moneda real del cobro: CUP. Expediente CP-FIN-ENERVIDA-CASH-BANK-CLASSIFICATION-AND-BALANCE-RECONCILIATION-001 §C.'
) AS r3;

-- R4 · e825ba93 (10-27): cash/USD 72 @845 → caja CUP 60,840
SELECT public.fin_reclassify_sale_payment_currency(
  'e825ba93-e752-4c0e-87f8-f38fbf80c57c'::uuid, 'cash', 'USD', 'CUP',
  'a1111111-1111-1111-1111-111111111111'::uuid,
  'Venta CUP 60,840 (catálogo 72 USD x845) cobrada en efectivo CUP; el POS registro el nominal USD 72.00 equivalente. Moneda real del cobro: CUP. Expediente CP-FIN-ENERVIDA-CASH-BANK-CLASSIFICATION-AND-BALANCE-RECONCILIATION-001 §C.'
) AS r4;

-- R5 · 8757444f (10-26): cash/USD 40 @800 → caja CUP 32,000
SELECT public.fin_reclassify_sale_payment_currency(
  '8757444f-f38b-4b05-8a51-77b322f3769d'::uuid, 'cash', 'USD', 'CUP',
  'a1111111-1111-1111-1111-111111111111'::uuid,
  'Venta CUP 32,000 (catálogo 40 USD x800) cobrada en efectivo CUP; el POS registro el nominal USD 40.00 equivalente. Moneda real del cobro: CUP. Expediente CP-FIN-ENERVIDA-CASH-BANK-CLASSIFICATION-AND-BALANCE-RECONCILIATION-001 §C.'
) AS r5;

-- R6 · 6501f8da (11-07): cash/USD 1 @930 → caja CUP 930
SELECT public.fin_reclassify_sale_payment_currency(
  '6501f8da-e759-4493-945a-5e3adc76ebb2'::uuid, 'cash', 'USD', 'CUP',
  'a1111111-1111-1111-1111-111111111111'::uuid,
  'Venta CUP 930 (catálogo 1 USD x930) cobrada en efectivo CUP; el POS registro el nominal USD 1.00 equivalente. Moneda real del cobro: CUP. Expediente CP-FIN-ENERVIDA-CASH-BANK-CLASSIFICATION-AND-BALANCE-RECONCILIATION-001 §C.'
) AS r6;

-- R7 · 7d9ad144 (11-18): componente cash/USD 7 @930 (6,510 CUP) → caja CUP;
--      su componente cash/CUP 2,790 ya está correcto y NO se toca.
SELECT public.fin_reclassify_sale_payment_currency(
  '7d9ad144-e86d-4c09-9e00-74aad400169d'::uuid, 'cash', 'USD', 'CUP',
  'a1111111-1111-1111-1111-111111111111'::uuid,
  'Venta CUP 9,300 con cobro mixto en efectivo: componente USD 7.00 registrado como nominal equivalente de 6,510 CUP recibidos en billetes CUP (el cliente entregó CUP); componente CUP 2,790 ya correcto. Expediente CP-FIN-ENERVIDA-CASH-BANK-CLASSIFICATION-AND-BALANCE-RECONCILIATION-001 §C.'
) AS r7;

-- R8 · 28e94349 (10-19): asiento obsoleto — débito ACT_EFECTIVO_USD 167,670
--      (207 USD de ítems a tasa 810) → caja CUP; el pago real fue cash/CUP
--      169,670 (venta con pago insuficiente documentado: pendiente 8,100).
SELECT public.fin_reclassify_sale_payment_currency(
  '28e94349-0a3e-499c-935f-c4a25c9db3fe'::uuid, 'cash', 'USD', 'CUP',
  'a1111111-1111-1111-1111-111111111111'::uuid,
  'Venta CUP 177,770 cobrada en efectivo CUP (recibido 169,670, pendiente 8,100 documentado). El asiento reconocimiento f5856dcd fue publicado por la versión M-015 del motor con reparto por ítems (207 USD nominal a tasa 810) a ACT_EFECTIVO_USD; el pago registrado es cash/CUP 169,670. Reclasificación del débito a ACT_EFECTIVO_CUP (tasa documental 810 reconstruida desde el propio débito). Expediente CP-FIN-ENERVIDA-CASH-BANK-CLASSIFICATION-AND-BALANCE-RECONCILIATION-001 §C.'
) AS r8;

-- P1 · 8ab7becf (16-10): reconocimiento ausente — cobro cash/CUP 16,000,
--      total 15,800, sobrepago 200 documentado (MISIÓN-FLEX).
SELECT public.fin_post_document('VENTA',
  '8ab7becf-8598-4779-b3e4-dbee2b67ee98'::uuid, 'reconocimiento',
  NULL::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid
) AS p1;

-- P2 · 1df5d727 (16-10): reconocimiento ausente — precio catálogo 0,
--      recibido 12,000 CUP (incidencia documentada en el registro).
SELECT public.fin_post_document('VENTA',
  '1df5d727-e6ee-402a-aa51-6c44a0768c5a'::uuid, 'reconocimiento',
  NULL::uuid, 'a1111111-1111-1111-1111-111111111111'::uuid
) AS p2;
