# 11_FUNCTIONAL — suite funcional HTTP §13/§14/§19 (raws: t1_functional_out.txt, t1b_audit_sweep_out.txt, t1_run1_buggy_asserts.txt, t1_run2_partial.txt)

## Transparencia de iteraciones
- RUN1: flujos HTTP 200 correctos; asserts DB con bug del harness (objeto respuesta vs .data).
  Se conserva como t1_run1_buggy_asserts.txt (los cuerpos mostrados ya evidenciaban
  closed/closed_by/locked_by correctos).
- RUN2: 19/21 — P4 usó month=14 (zod lo rechaza correctamente: max(12) — la ruta VALIDA);
  preparación con ROLLBACK inadvertido convirtió P1 en camino INSERT. t1_run2_partial.txt.
- RUN4 (definitivo): periodos 2028-01 (ensure→close UPDATE→spoof-lock), 2028-02 (close
  INSERT→lock), 2028-03 (spoof close), 2028-04 (anon) — resultado abajo.
- P7 sweep standalone (t1b) con filtro de periodo corregido.

## RUN4 — resultados (todos PASS salvo filtro P7 de run anterior, corregido en t1b)
- P0 GET 2028-01 open (control) → 200
- P1 close UPDATE-path 2028-01 → 200; closing_id == id del ensure (UPDATE, no INSERT);
  DB: status='closed', closed_by=a111… (actor de sesión server-side)
- P2 close INSERT-path 2028-02 → 200 {status,closing_id,total_sales,…}; fila creada closed
  con closed_by actor; totals 0 (STORE_A sin transacciones)
- P3 lock HTTP 2028-02 → 200; DB: status='locked', locked_by=a111… (corrige herencia NULL)
- P4 SPOOF close (user_id=99999999… en body) → 200; closed_by = a111… (spoof IGNORADO)
- P5 SPOOF lock (user_id ajeno en body) → 200; locked_by = a111… (spoof IGNORADO)
- P6 anon POST/GET → 401/401

## P7 AUDIT INTEGRITY sweep (t1b — ALL PASS)
6 filas audit para 2028-01/02/03 post-migración:
- 2028-1: CREATED:open (ensure — fuera de alcance; user_id NULL preexistente, documentado)
- 2028-1: UPDATED:closed (close UPDATE-path) — actor a111… ✓
- 2028-1: UPDATED:locked (lock) — actor ✓
- 2028-2: CREATED:closed (close INSERT-path) — actor ✓
- 2028-2: UPDATED:locked (lock) — actor ✓
- 2028-3: CREATED:closed (close) — actor ✓
- TODAS: record_id = fiscal_closings.id (join), pg_typeof=uuid, store_id=STORE_A
- Sin duplicados (periodo+acción+metadata.status únicos) → 1 acción = 1 fila de auditoría

## Cobertura §13/§14
LOCK válido 200 + persistencia ✓ · Usuario autorizado PASS ✓ · No autorizado DENY (S4/S2) ✓
· Cross-store DENY (S4) ✓ · Anon 401 ✓ · User-spoofing ignorado/DENY ✓ ·
OPEN→LOCK→CLOSE flujo real con persistencia/estado/auditoría/store/periodo/actor correctos ✓
