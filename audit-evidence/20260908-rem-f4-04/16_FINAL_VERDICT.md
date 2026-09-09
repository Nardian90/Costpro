# 16 — FINAL VERDICT

**Gate:** REM-F4-04 — WAC CANONICAL PATH REMEDIATION
**Fecha de cierre:** 2026-09-09
**Formato:** §19 de la directive (REM-F4-04)

---

## Baseline

```text
HEAD:         310fad7db3a80b36bbecbc471879e68fa78990ef (al inicio; == origin/main)
origin/main:  310fad7db3a80b36bbecbc471879e68fa78990ef
worktree:     clean (tracked) + artefactos F4-04 untracked → commiteados en §30
```

## Remediation

```text
Migration:           supabase/migrations/20260909000000_rem_f4_04_register_reception_canonical_wac.sql
                     (SHA256 1cbd9cdf0d0c6eb4ba550320eee9bc0c12a7a8cf5475fca3503f7eee9cff5326,
                      aplicada 2026-09-09T01:47:57Z, HTTP 201, verificada contra definición viva §B1)
Commit base:         310fad7d
Commit remediation:  75bedef1 (fix(audit): remediate F4-04 canonical WAC path;
                     descendiente directo de 310fad7d; HEAD final tras amend de
                     este veredicto + SHA256SUMS — hash exacto en worklog y
                     reporte al principal; patrón idéntico al RECON 04d4f062)
```

## WAC

```text
Path A (HTTP real):   PASS — stock 0→10, WAC 0→100, single contribution
Path B (canónico):    PASS — confirm_pending_reception intacto, 802 exacto
Expected:             (99×800 + 1×1000)/100 = 802
Actual:               802
Tolerance:            1e-6 (PASS por igualdad exacta a 802.000000)
```

## Functional

```text
Receipt:      PASS  (HTTP 201, receipt activo, total_cost 1000)
Stock:        PASS  (0→10 y 99→100 según caso; invariantes exactas)
WAC:          PASS  (escritor único fn_recalc_wac; wac_change_log sin duplicados)
Sale:         PASS  (COGS == qty × WAC == 1800 server-side; WAC invariante)
COGS:         PASS  (1800, NO 0 — server-side)
Reverse:      PASS  (stock 19 restaurado, WAC 1800 estable, tx voided, par sale/sale_reverse)
Idempotency:  PASS  (retry → idx_receipts_store_reference_doc; 0 efectos duplicados)
Multimoneda:  PASS  (USD@120 → 1200 CUP, normalización única)
```

## Security

```text
Same-store:    PASS (member OK por diseño)
Cross-store:   PASS (non-member → 'Unauthorized store access' DENY)
Anon:          PASS (401 en recepción y checkout)
Guard:         PASS (trg_guard_wac_writer intacto; ACL pre/post idénticas)
RLS bypass:    NONE (has_store_access_as sigue como primera sentencia)
```

## Zero-touch

```text
ENERVIDA:      PRE == POST (125 productos, stock 4012.5000, valor, updated_at, 451 movs, fingerprint)
PUERTO PADRE:  PRE == POST (36 productos, stock 966.1289, valor, updated_at, 251 movs, fingerprint)
```

## Regression

```text
Vitest:  PASS  2058 PASS / 0 FAIL / 24 SKIP == baseline EXACTO (208.20s, single worker)
TSC:     PASS  exit 0, 0 errores
Lint:    PASS  0 errors / 1291 warnings == baseline histórico exacto
Build:   INFRA OOM — "Compiled successfully in 77s"; type-checker interno muerto
         por OOM del kernel (firma dmesg: next-build anon-rss 3.1GB en 3.9Gi sin
         swap). Criterio subyacente demostrado por vía independiente:
         TSC 0 errores (§25). next.config.ts NO tocado. Precedente idéntico RECON.
         La remediación es migration SQL: el bundle Next.js no la contiene →
         impacto del bloqueo para F4-04: NULO.
PM2:     PASS  3/3 online, 0 restarts, sin crash loop
Health:  PASS  HTTP 200 {"status":"ok"}
```

## Evidence

```text
Path:          audit-evidence/20260908-rem-f4-04/
Documents:     17 numerados (00–16) + F4-04_REMEDIATION_DESIGN.md
Raw artifacts: 16 en evidence/ (inspección BD, apply, zero-touch PRE/POST,
               diff función, suite results, vitest/tsc/lint/build logs,
               firma OOM kernel, rollback, sanitización)
SHA256SUMS:    generado sobre el contenido final del pack
Secretos:      escaneo 0 tokens (MGMT_TOKEN externalizado antes del commit;
               ver evidence/remf404-sanitization-note.txt)
```

## Git

```text
Local HEAD:  ver worklog.md + reporte al principal (hash del amend final)
Remote HEAD: resultado del push documentado honestamente (§31)
Push:        intentado con git push origin main; resultado explícito en worklog
Base:        310fad7d — el commit RECON 04d4f062 permanece local-only (nunca
             fue pusheado y NO aparece mágicamente como remoto)
```

## Findings

1. F4-04 cerrado por el camino real (HTTP) y convergencia total con el camino
   canónico en un único escritor (`fn_recalc_wac`), sin segunda autoridad matemática.
2. Deuda histórica separada y preservada: 110 productos `stock>0 ∧ WAC=0`
   (67 ENERVIDA + 43 audit/históricos) → backlog **F-08**, NO reparados aquí.
3. Infraestructura del entorno (3.9Gi / 0 swap) es el límite operacional
   recurrente: Vitest requiere single-worker; el type-checker integrado del
   build OOMea de forma determinista (firmado por kernel dos corridas seguidas).
   Recomendación de plataforma (no bloqueante para F4-04): runner de build
   con ≥8Gi para verificar el gate Build de forma completa en futuras corridas.
4. Sanitización aplicada antes del commit (MGMT_TOKEN → env var), lógica del
   harness verificada con `node --check`.

---

## VERDICT

```text
REM-F4-04 = PASS
```

**Justificación de síntesis:** todos los gates funcionales, de integridad,
seguridad, zero-touch y regresión medibles están en PASS con baseline exacto.
El único gate no ejecutable íntegramente (Build) lo está por OOM de
infraestructura firmado por el kernel, con su criterio subyacente (compilación
exitosa + 0 errores TypeScript) demostrado por vías independientes y con
impacto nulo para una remediación que es migration SQL. Clasificado INFRA OOM
(no CODE FAIL) conforme §27/§17 de la directive y al precedente idéntico
aceptado en RECON.

## Next gate

```text
REM-F4-04 = PASS  →  AUTORIZADO → REM-F4-03
(NO ejecutar REM-F4-03 dentro de esta corrida)
```
