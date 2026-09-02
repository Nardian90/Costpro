# W9.4.5 — H-4 | FASE 24 — VEREDICTO FINAL

```text
W9.4.5 — H-4
================

Live version:      W7 release S2.6 (audit-evidence/20260830-w7/release/sql/
                   01-df01-wac-singleton.sql) aplicada out-of-band; 2201 chars;
                   sin guard; clamp; sin reset de pagos; 'RECEIPT_REVERSED_V2'
Canonical version: W7 S2.6 base + reparaciones R1–R6 (guard P1 + pagos + WAC exacto
                   + audit 'REVERSE_RECEIPT_V2' + search_path 'public, pg_temp'),
                   aplicada 2026-09-02T23:0xZ vía migración 20260902231200
Drift introduced:  UNKNOWN — DOCUMENTED (ventana [2026-08-10T04:04Z, ≤2026-09-02];
                   candidato natural = aplicación de la release W7 ≈ 2026-08-30;
                   supabase_migrations inactivo desde 2026-06-15)

Security impact:   P1 — authenticated (y anon vía PUBLIC EXECUTE) podía revertir
                   receipts de CUALQUIER store con p_user_id falsificado
                   (SECURITY DEFINER + sin guard). Probado estática y dinámicamente.
Functional impact: receipts activas revertidas quedaban con pagos vivos (sin reset);
                   clamp silenciaba inconsistencias de stock/WAC.
Data integrity impact: sin daños en datos actuales (6 receipts activas unpaid,
                   0 payment_tx asociadas); el daño era latente para flujos con pagos.
Audit impact:      huella bifurcada potencial ('RECEIPT_REVERSED_V2' vs las 36
                   'REVERSE_RECEIPT_V2' históricas) + autoría falsificable.

Authorization:
BEFORE: sin guard — cualquier caller EXECUTE operaba sobre cualquier receipt
AFTER:  v_caller_uid real + has_store_access_as(store) — ERR_UNAUTHORIZED si no;
        service_role exige p_user_id con acceso a la store (semántica V1)

Payment behavior:
BEFORE: sin reset (receipt revertida podía quedar 'paid'; payment_transactions sin marcador)
AFTER:  payment_status='unpaid', paid_amount=0, paid_at=NULL + notes '[REVERSED by
        reverse_receipt_v2 …]' + payments_reversed en metadata/retorno

Inventory/WAC:
BEFORE: clamp GREATEST(0) + skip fn_recalc_wac cuando stock<qty → inconsistencias silenciadas
AFTER:  inversa exacta — fn_recalc_wac SIEMPRE; ERR_WAC_REVERSE_NEGATIVE_STOCK si S+q≤0;
        single-writer (token) + wac_change_log intactos

Audit action:
BEFORE: 'RECEIPT_REVERSED_V2' (0 filas históricas; autoría falsificable)
AFTER:  'REVERSE_RECEIPT_V2' (unifica 36 filas históricas + contrato B-12) con
        user_id = identidad real del caller

search_path:
BEFORE: 'public, extensions'
AFTER:  'public, pg_temp' (explícito, temp último — estándar H-1)

ACL:
BEFORE: {=X, postgres=X, authenticated=X, service_role=X}
AFTER:  IDÉNTICA (sin cambios) — el guard en función re-asegura la exposición
        requerida por el flujo legítimo del navegador (excepción F-06)
```

## Gates

```text
canonical implementation established ......... PASS (base W7 verificada byte-a-byte;
                                    PR-4 descartado por incompatibilidad con trigger guard)
security defect resolved ..................... PASS (matriz FASE 18: 8/8)
functional behavior validated ................ PASS (flujo completo sintético con rollback)
WAC/inventory behavior validated ............. PASS (blend exacto verificado; RAISE en stock insuficiente real)
audit behavior validated ..................... PASS (fila 'REVERSE_RECEIPT_V2' con user_id real)
no unintended data changes ................... PASS (15/15 métricas PRE==POST)
regression PASS .............................. PASS con nota (lint PASS, vitest 1892 PASS;
                                    typecheck/build INCONCLUSIVE — ENVIRONMENTAL OOM)
evidence SHA PASS ............................ PASS (SHA256SUMS.txt 21 archivos)
Git verified ................................. PASS (commit + push verificados — ver FASE 22/23)
```

## Resultado

```text
H-4 = CLOSED WITH CONDITIONS
```

Condiciones documentadas (no bloquean el cierre; quedan trazadas):
1. typecheck/build INCONCLUSIVE — ENVIRONMENTAL OOM (limitación del entorno, no del
   cambio; código de aplicación SIN modificar y lint+tests completos en PASS).
2. Gobernanza: la definición canónica vivía solo como release dentro de
   audit-evidence/ (W7) — el repo debe volver a operar con supabase/migrations/
   como autoridad única (esta migración lo restablece para V2).
3. El patrón gemelo reverse_transaction/reverse_transaction_v2 tiene coexistencia y
   drift equivalentes → mismo tratamiento recomendado (fase futura).
4. audit_logs sin SELECT para authenticated (RLS preexistente) — fuera de alcance H-4.

## Estado del control maestro
- H-2 (reverse_receipt v1/v2): permanece BACKLOG — checklist de retiro C1 exige H-4
  resuelto (HECHO) → el retiro de V1 puede planificarse (C2–C5) en fase futura.
- Próximo hallazgo sugerido: consolidar backlog H-2 (retiro controlado de V1) o
  atender el gemelo reverse_transaction v1/v2 con el mismo método H-4/H-2.
