# REM-INV-4 — 13-risk-classification.md

## Clasificación de riesgo D0–D3 y decisión de remediación R0–R4

### Matriz D0–D3 (§20)

| Nivel | Findings | Justificación |
|---|---|---|
| **D0 — CRITICAL** (cross-store / RLS bypass / escalada / corrupción contable-inventario / pagos duplicados / destrucción no autorizada) | **NINGUNO demostrado** | Ningún drift encontrado introduce un camino explotable de cross-store, bypass RLS o corrupción de datos en el estado actual. Los grants y superficies críticas ya endurecidos en 3R-B/3C siguen intactos (zero-touch + canary del catálogo). |
| **D1 — HIGH** (altera autorización/lifecycle/idempotency/WAC/fiscal) | **F-04** (3 fixes declarados en Git NO desplegados: has_store_role anti-spoofing [6 callers], cancel_transfer remediation, get_users_for_encargado hardening) | El fix de autorización declarado no corre en producción → la debilidad que remediaba puede estar activa. Es CANDIDATO P1: NO se eleva a P1 final sin reproducción en staging (regla del gate). Nota WAC: F-06 es D3 documental, la escritura WAC real (fn_process_receipt/fn_recalc_wac) funciona. |
| **D2 — MEDIUM** (defensa secundaria / governance con efecto) | **F-01** (bootstrap ausente, DR irreconstruible), **F-02** (ledger detenido 97.2% sin registrar), **F-03** (64 funciones LIVE≠Git con callers activos), **F-05** (TRUNCATE/DML extremos en audit_logs), **F-08** (triggers de auditoría declarados ausentes), **F-10** (pick3/academy out-of-band activo) | Ninguno rompe comportamiento actual demostrado; todos rompen auditabilidad, reproducibilidad o defensa en profundidad. |
| **D3 — LOW** (documental/no funcional) | **F-06** (comentario WAC obsoleto), **F-07** (fc_automation nunca aplicada), **F-11** (residuos test/tooling), **F-12** (21 search_path + 2 secdef audit_*), **F-13** (SQL no versionado en migrations/) | Sin efecto de runtime demostrado. |

### Regla §21 aplicada
- LIVE≠Git = **DRIFT** (este gate). No se clasificó NINGÚN caso como BUG nuevo (LIVE==Git con lógica defectuosa) — eso pertenece a gates funcionales previos (3R/3C).
- Caso 3C: DRIFT + BUG históricos, ya resueltos y versionados; su patrón resultó **sistémico** como proceso, no como bug replicado.

### Decisión de remediación R0–R4 (§30)

| Finding | Decisión | Gate propuesto |
|---|---|---|
| F-09 (extensiones/platform) | **R0 — LEAVE** | n/a |
| F-07 (fc_automation), F-11 (residuos), F-13 (SQL no versionado), F-06 (comentario WAC) | **R1/R2 — DOCUMENT → RECONCILE LATER** | gate de higiene |
| F-01, F-02, F-03, F-08, F-10, F-12 | **R2 — RECONCILE LATER** | gate único "schema reconciliation" baselining + CI schema-drift-check (§33; proponer, NO implementar) |
| F-04 (fixes no desplegados) | **R3 — SECURITY REMEDIATION** | gate independiente: reproducir en staging el spoofing de caller uid sobre has_store_role LIVE vs Git-fix; si es explotable, aplicar el fix ya declarado (pin de hashes) |
| F-05 (audit_logs TRUNCATE/DML extremos) | **R3 — SECURITY REMEDIATION** | hardening 3R-B-style (REVOKE a extremos; conservar INSERT si el writer lo usa con policy) |
| — | **R4 — BLOCKER** | ninguno (no hay corrupción/bypass activo demostrado) |

**Regla §18 respetada:** NO se ejecutó CREATE OR REPLACE / DROP / GRANT / REVOKE / ALTER alguno en producción durante este gate. Todo hallazgo queda documentado para gates separados.
