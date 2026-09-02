# W9.4.5 — H-4 | FASE 9 — AUDIT TRAIL

## Acciones candidatas
- 'REVERSE_RECEIPT_V2' → 36 filas históricas (noche 2026-08-09/10, versión PR-4);
  contrato B-12 (test PT-11.3.5 itera sobre el archivo de migración histórico —
  intacto, sigue en verde); estilo nombrado del repo.
- 'RECEIPT_REVERSED_V2' → 0 filas históricas; estilo de W7 (PRODUCTION_*_REVERSED).

## Consumidores (grep exhaustivo src/ scripts/ tests/)
ÚNICO consumidor de cualquier variante: src/__tests__/integration/iteration-11-3.test.ts:80
que exige la cadena 'REVERSE_RECEIPT_V2' DENTRO del archivo de migración 20260808000004
(histórico, no se modifica) → la elección de action de la función viva NO rompe tests.
No hay dashboards/reports en src/ filtrando por ninguna de las dos cadenas.

## Contrato correcto
'REVERSE_RECEIPT_V2' — razones:
1. Unifica la huella con las 36 filas históricas (auditabilidad: un solo string por
   tipo de evento; si la viva hubiera corrido, habría dividido la historia en dos).
2. Coincide con el contrato B-12 del repo.
3. FASE 18 verificó: nueva fila escrita con action='REVERSE_RECEIPT_V2'.
Metadata enriquecida: reason, items_processed, payments_reversed, v2_reverse=true.
Nota: el trigger trg_audit_receipt_changes añade además su propia fila de auditoría
por el cambio de status (verificado en diagnóstico: 2 filas por reversión).
