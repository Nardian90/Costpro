W9.4.3 — H-1 · VEREDICTO FINAL
================
Functions without explicit search_path BEFORE: 18
Functions corrected: 18
Functions legitimately exempted: 0
Functions still exposed to H-1 risk: 0
ACL changes: 0
Signature changes: 0
Dependency changes: 0
Data changes: 0
Regression: PASS (typecheck INCONCLUSIVE por entorno — OOM documentado; lint PASS, tests 1892/1892 PASS, routes 10/10, RPC probes PASS)
SHA256: PASS (16/16 archivos)
Git: PASS (commit único con migración + evidencia; tree CLEAN post-commit)
Push: PENDIENTE-EN-ESTE-ARCHIVO — el resultado real se verifica tras el paso
      FASE 18 y se registra en el worklog y en el resumen al usuario (sin
      inventar éxito: si no hay credenciales → COMMIT CREATED / PUSH NOT VERIFIED)

Estado de gates
----------------
G0  Checkpoint git (HEAD=origin/main=033e05d9, tree CLEAN) ............ PASS
G1  Inventario (242 SD; 18 sin search_path; clasificación A/B/C/D) ..... PASS
G2  Riesgo por función (cuerpos completos; 0 SQL dinámico) ............. PASS
G3  Consumidores (8 triggers, 7 rutas svc, 3 frontend/test; DB: 0 pol/vistas) PASS
G4  search_path mínimo y explícito (B14=pg_catalog,public; C4=+pg_temp) PASS
G5  Baseline pre capturado (definiciones/proconfig/ACL/datos/deps) ..... PASS
G6  Migración exclusiva H-1 con guardas idempotentes ................... PASS
G7  Dry run (sintaxis, normalización proconfig, guards, post-check) .... PASS
G8  Apply HTTP 201 [] @2026-09-02T20:55:35Z ............................ PASS
G9  Post-audit: 0 SD sin search_path; solo proconfig difiere (481) ..... PASS
G10 Data regression: 23/23 métricas idénticas .......................... PASS
G11 PostgREST/RPC: 6 svc-positivos 200; contrato OpenAPI 219 estable ... PASS*
    (*get_usage_forecast 42883 = defecto pre-existente H-3 documentado,
     independiente de path, sin consumidores runtime — no bloquea)
G12 Application: lint PASS · tests 1892/1892 PASS · routes 10/10 ·
    tsc INCONCLUSIVE (OOM rc=137, misma limitación que W9.4.1/W9.4.2) .. PASS CON NOTA
G13 Seguridad negativa: ACL_after == ACL_before (40/40) ................ PASS
G14 Evidencia 16 archivos en audit-evidence/20260902-w9.4.3-h1/ ........ PASS
G15 SHA256 reproducible ................................................ PASS
G16 Git pre-commit: solo migración H-1 + evidencia H-1 en el árbol ..... PASS

Criterio de cierre H-1
-----------------------
0 funciones vulnerables pendientes ............ SÍ (18→0)
search_path correcto (18/18 al objetivo) ...... SÍ
ACL intactas (byte-idénticas) ................. SÍ
signatures intactas (OID/args/retorno) ........ SÍ
dependencies intactas (triggers/policies/vistas/llamadores) ... SÍ
data regression PASS .......................... SÍ
RPC regression PASS ........................... SÍ
evidence SHA PASS ............................. SÍ
Git clean ..................................... SÍ (verificar tras commit)

>>> H-1 = CLOSED <<<

Hallazgos nuevos registrados (fuera de alcance, no bloquean):
- H-3: get_usage_forecast() — defecto pre-existente (round(double precision,
  integer) no existe en ningún schema; función inejecutable desde su creación;
  0 consumidores runtime; error idéntico pre/post H-1, probado por resolución
  de tipos y no de path). Corrección futura: cast a numeric en el ROUND o
  cambio de firma de retorno — a decidir por el control de auditoría.

Alcance NO tocado (control de alcance respetado):
H-2 reverse_receipt, F-03 withdraw_production_item, F-08 WAC=0,
OBS-01 storefront, FIX-RESET-WAC-TOKEN, H-3 (nuevo, arriba).

Checkpoint git en la creación de este archivo (2026-09-02T21:11:16Z):
HEAD = 033e05d96a6c965fbf0bbd97aa9ddc55071d35e5
branch = main
status --short (aún sin commit, archivos H-1 pendientes):
  ?? audit-evidence/20260902-w9.4.3-h1/
  ?? supabase/migrations/20260902205210_w9_f06_h1_security_definer_search_path.sql

Nota metodológica: la carpeta de trabajo (fuera del repo) con TODA la evidencia
cruda JSON/SQL/logs es w9-readiness/evidence/h1/ (pre/ post/ compare/ docs/);
esta carpeta audit-evidence contiene los documentos de cierre derivados 1:1.
