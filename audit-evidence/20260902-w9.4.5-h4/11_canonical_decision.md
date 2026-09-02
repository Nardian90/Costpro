# W9.4.5 — H-4 | FASE 11 — DETERMINACIÓN DE LA CANÓNICA

## Criterios (peso en la decisión)
1. SEGURIDAD: la canónica debe tener guard de identidad + aislamiento tenant/store.
2. INTEGRIDAD WAC: debe respetar el single-writer W7 (fn_recalc_wac + trigger guard)
   y la inversa exacta (RAISE si S+q≤0).
3. CORRECTNESS: reset de pagos; moneda NULL-safe; locking.
4. AUDITABILIDAD: huella unificada con historia real; identidad real en campos audit.
5. COMPATIBILIDAD: firma/owner/ACL/JSON contract; consumidores actuales intactos.

## Descarte de candidatas
- PR-4 (última migración del repo): DESCARTADA como base — su UPDATE inline de
  cost_average es rechazado por trg_guard_wac_writer (W7) → no operable en producción
  actual. Aporta, sin embargo, el patrón de pagos y el guard (heredados).
- "Última versión del repo" ≠ "correcta": la autoridad de facto de producción es la
  release W7 → la canónica se ancla en ella (no se sobrescribe producción a ciegas
  con código obsoleto).
- Viva tal cual (Opción C): DESCARTADA — P1 de seguridad sin mitigación.

## DECISIÓN: Opción B — canónica = W7 S2.6 + reparaciones mínimas (R1–R6)
R1 guard v_caller_uid + has_store_access_as [P1]
R2 inversa exacta sin clamp (fn_recalc_wac siempre)
R3 reset de pagos (patrón PR-4/void_pending_reception)
R4 audit 'REVERSE_RECEIPT_V2' (unificación)
R5 search_path 'public, pg_temp'
R6 campos de auditoría con v_caller_uid
Firma, owner, SECURITY DEFINER, proacl, JSON keys de W7 (con extra aditivo
payments_reversed): SIN CAMBIOS. V1: SIN CAMBIOS. H-2: sigue BACKLOG.
