# REM-INV-4 — 16-final-verdict.md

REM-INV-4 — FINAL REPORT
Baseline: 793d1309
Scope: PostgreSQL schema/function drift
Production business-data mutation: ZERO

## 1. Executive Verdict

**CONDITIONAL — RECONCILIATION REQUIRED.**
El PostgreSQL LIVE de CostPro **NO puede reproducirse determinísticamente desde Git/migrations** (38.9% de migraciones aplican limpias; el bootstrap de 53 tablas core nunca estuvo versionado). El patrón out-of-band detectado en REM-INV-3C **no fue aislado: es sistémico como proceso** — el ledger de migraciones quedó congelado el 2026-06-15 y el 97.2% del historial declarado no consta como aplicado. En el estado observado NO hay evidencia de corrupción contable/inventario, ni bypass cross-store, ni modificación adversarial: los cuerpos LIVE divergentes son mayoritariamente versiones **más nuevas** (hotfixes/releases aplicados directo), coherentes con la historia de gates. El riesgo central es de **gobernanza y reconstrucción**, más 3 **fixes de seguridad declarados en Git que producción NO ejecuta** (F-04, candidato P1 — requiere verificación fuera de este gate).

## 2. Scope
Funciones (309 de app + 188 de extensiones), triggers (87), policies (391), grants (tablas/funciones/secuencias), constraints, dependencias, ledger de migraciones y replay completo en PostgreSQL efímero. READ-ONLY sobre producción.

## 3. LIVE Snapshot
484 funciones (245 secdef) · 87 triggers (82 public + 1 auth.users + 4 storage) · 391 policies · 146 tablas · 8 vistas · 6 secuencias · 590 constraints. Archivos 01–09 + zero-touch-pre/post.json.

## 4. Git Reconstruction
427 migraciones versionadas (653 CREATE FUNCTION, 79/79 triggers, 454 keys de policies, 122 tablas) + 5 SQL auxiliares no versionados. 246 estados finales de función volcados y validados (11-git-reconstruction.md).

## 5. Function Comparison
Reproducibles: **151 byte-exactos** al final declarado + 1 canónico (solo-whitespace) + 3 que ejecutan versiones HISTÓRICAS (stale). No reproducibles: **39 con cuerpo nunca declarado** + **25 con firma y cuerpo no declarados** (LIVE-adelantado) + 23 con drift de atributos (2 secdef, 21 search_path) + 55 orphans + 188 orphans de extensión + 13 declaradas-ausentes. Validación anti-falsa-precisión: 205/205 cuerpos aplicables en PostgreSQL 17.6 efímero produjeron md5(prosrc) idéntico (0 artefactos).

## 6. Trigger Comparison
63 MATCH · 24 ORPHAN (20 app + 4 storage-plataforma) · 8 MISSING_LIVE (incl. triggers de auditoría declarados y ausentes: F-08).

## 7. Grant Comparison
- REM-INV-3R-B vigente: devolutions/devolution_items rxt para extremos ✓.
- Patrón de referencia endurecido: stock_movements SELECT-only authenticated.
- **F-05:** audit_logs con TRUNCATE (y arwd) para anon/authenticated — D2 defense-in-depth.
- Clasificación completa en 10-drift-register.md §F-05 y 06-live-grants.tsv.

## 8. RLS Comparison
391 policies: 320 existencia-match, 71 orphan (incl. deny-guards de inventory aplicados out-of-band), 42 missing (incl. las 6 de audit_logs declaradas por Git y reemplazadas LIVE por otra superficie — F-08/F-05).

## 9. Dependency Comparison
263 aristas pg_depend hacia funciones; complementado con censo estático src/ (caller-impact.json: 45 funciones no-reproducibles con callers activos — POS/NC/transferencias/cash dependen de versiones driftadas) y censo de triggers (quién invoca qué).

## 10. Drift Register
13 findings F-01…F-13 con severidad D1–D3 (ningún D0) — 10-drift-register.md.

## 11. Temporal Analysis
Ledger LIVE: 12 entradas (2024-01-23 … 2026-06-15). Ventana sin registro: 2026-06-15 → hoy (~9 meses, era V2 completa). Para cada objeto driftado: LAST KNOWN GIT STATE = final declarado (citado por archivo); FIRST OBSERVED LIVE STATE = actual; **ORIGIN: MIGRATION-nunca-registrada / EMERGENCY PATCH — ORIGIN UNKNOWN por objeto** (no se inventa origen, §16).

## 12. Exploitability
- F-04: el fix anti-spoofing de has_store_role (20260820000001) NO corre en producción → la debilidad remediada puede estar explotable; VERIFICACIÓN REQUERIDA (staging, fuera de scope). Sin reproducibilidad no se declara P1 final.
- F-05: TRUNCATE de audit_logs no explotable vía PostgREST; riesgo insider/SQL directo (P2-leaning).
- F-03: sin evidencia de comportamiento adversarial en los cuerpos LIVE (son versiones posteriores verificadas operativamente por gates previos: 3R/3C/W9).

## 13. Accounting Impact
Ningún drift altera el estado actual de transactions/payment_transactions/devolutions (zero-touch PRE==POST). Riesgo latente: irreproducibilidad del pipeline contable ante DR (F-01).

## 14. Inventory Impact
Ídem: stock_movements/inventory intactos; la lógica WAC real (fn_process_receipt/fn_recalc_wac/A2 hotfix) opera out-of-Git (F-03/F-06) — funcional hoy, inauditable.

## 15. Security Impact
Sin regresión de las superficies endurecidas (3R-B REVOKEs y 3C fail-closed verificados por canary). Nuevos puntos de atención: F-04 (autorización), F-05 (TRUNCATE audit), F-08 (cobertura de auditoría menor a la declarada).

## 16. Reproducibility
- Esquema completo: **NON-REPRODUCIBLE** (R2: 17/146 tablas; 38.9% archivos limpios).
- Funciones: **PARTIALLY REPRODUCIBLE** (154/309 byte-exactas desde Git; R1 valida extracción).
- Ledger: NON-REPRODUCIBLE como proceso (12/427 registradas).

## 17. Zero-Touch
16/16 secciones PRE==POST (7 tablas de negocio + catálogo). Business data mutation = 0. DDL/grants/policies = 0. 14-zero-touch.txt.

## 18. Evidence Integrity
Pack audit-evidence/REM-INV-4/: 00–16 + zero-touch JSONs + raw/{census,compare,staging,regression}. MANIFEST.sha256 con sha256 de todos los artefactos; secret scan limpio (15-security.txt).

## 19. Recommended Remediation Gates (§30/§33 — NO ejecutar aquí)
1. **Gate R3 (seguridad):** reproducir has_store_role spoofing (LIVE vs fix 20260820000001) en staging; aplicar los 3 fixes de F-04 con pin de hashes si procede; REVOKE TRUNCATE/DELETE audit_logs extremos (F-05).
2. **Gate R2 (reconciliación):** baselining del esquema LIVE (pg_dump --schema-only versionado) + extracción de cuerpos LIVE a migraciones + decidir fc_automation (F-07) y residuos (F-11) + mover SQL no versionado (F-13).
3. **Control permanente (§33, proponer):** schema-drift-check en CI/CD comparando hashes canónicos Git↔pg_proc, triggers y grants (el motor de este gate es reutilizable).

## 20. Git Closure
Commit exclusivo de evidencia; `bash scripts/gate-closure-check.sh` → CLOSURE OK; fetch + reset --hard origin/main + clean -fd (sin -fdx); .env intacto; pm2 intacto. (Ejecutado tras este veredicto — ver 00-baseline.txt actualizado y worklog.)

## 21. Final Verdict
**CONDITIONAL — RECONCILIATION REQUIRED** (§32). El estado LIVE es funcional y sin evidencia de compromiso, pero la cadena Git→producción está rota como proceso (F-01/F-02), la mitad de la lógica de aplicación no es reproducible desde el repo (F-03) y hay fixes de seguridad declarados sin desplegar (F-04). No procede NOT READY (no hay drift de seguridad explotable demostrado ni corrupción), ni CERTIFIED (no hay determinismo de reconstrucción). La certificación permanente (schema-drift-check) queda propuesta y NO implementada, conforme al gate.
