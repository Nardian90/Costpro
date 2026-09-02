# W9.4.5 — H-4 | FASE 7 — PAYMENT RESET

## Patrón canónico (PR-4 y void_pending_reception — ambos revisados en repo)
1. UPDATE receipts SET status=..., payment_status='unpaid', paid_amount=0, paid_at=NULL
2. UPDATE payment_transactions SET notes = notes || ' [REVERSED by <rpc> <id> at <ts>]'
   WHERE ref_type='receipt' AND ref_id=<receipt>
3. GET DIAGNOSTICS count → metadata 'payments_reversed'

## La viva (W7 S2.6)
Ninguna de las dos operaciones: una receipt 'active' con pagos quedaba
status='reversed' pero payment_status/paid_amount SIN tocar, y las
payment_transactions seguían vivas sin marcador de reversión.

## Impacto potencial
Una recepción activa pagada que se revierte dejaría un documento revertido marcado
como PAGADO (paid_amount>0, payment_status='paid') y sus payment_transactions sin
marcador → cuentas por pagar/flujo de caja inconsistentes y conciliación rota.
(Es el mismo defecto que motivó el reset en PR-4 y void_pending_reception.)

## Datos actuales
Las 6 receipts activas están payment_status='unpaid', paid_amount=0,
0 payment_transactions asociadas → el drift no dañó datos existentes HOY; el reset
restaurado protege el flujo con pagos reales (36 payment_transactions históricas de
receipts existen).

## En la canónica H-4
Reset restaurado verbatim (patrón PR-4/void_pending_reception), conservando
status='reversed' (W7). Verificado en FASE 18: A_payment_status=unpaid,
A_paid_amount=0, A_pt_notes_marked=1 tras reversión de receipt sintética 'paid'.
