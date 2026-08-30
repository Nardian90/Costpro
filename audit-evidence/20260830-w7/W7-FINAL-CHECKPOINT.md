# W7-FINAL-CHECKPOINT — Cierre formal W7 (orden GO W7 FINAL CLOSURE + OWNER DECISION GATE)

Fecha: 2026-08-30 · Sesión: re-verificación física íntegra (FASE 0 sin fiar del worklog) + re-demostración en clones efímeros frescos + consolidación documental + release candidate.
Producción: **NO CONTACTADA ni MUTADA** durante toda esta sesión (todas las pruebas en 127.0.0.1:5433; el contraste S1 se hizo contra la baseline congelada, no contra producción).

## 1. Git

| Check | Valor |
|---|---|
| HEAD | `b7b9decbb9ca57532cbf5a2de3e3d97c1d4f9c84` |
| origin/main | `b7b9decbb9ca57532cbf5a2de3e3d97c1d4f9c84` (HEAD == origin/main) |
| Git status | tree limpio — 0 líneas porcelain; 0 commits locales sin push; 0 stash |
| Tags | `audit-w6-harness-parity-20260828` · `wac-w6.1-decision-gate-20260828` · `fase3-safety-lot` (verificado ANCESTRO de HEAD — pre-existente, no nuevo) |
| Commits nuevos / push | 0 / 0 (regla mantenida) |

## 2. Base de datos (harness local)

| Check | Valor |
|---|---|
| Motor | PostgreSQL 17.11 (Debian) en 127.0.0.1:5433 |
| Bases existentes | `costpro_audit_v2` (pristine), `costpro_audit_v3` (template), `postgres` |
| Clones de esta sesión | `w7final`, `w7final_rb` — creados, usados y **DESTRUIDOS** (0 conexiones residuales) |
| v2 | intacta — S1 fresh byte-idéntico a baseline (§3); public tables=141 == BASELINE_SCHEMA_COUNTS |
| v3 | intacta — usada solo como template y para fingerprint de lectura (baseline rollback) |

## 3. S1 (huella de esquema, 15 dimensiones)

| Momento | Resultado |
|---|---|
| Inicio de sesión (FASE 0) | 10.753 líneas F — SHA `9e7cea9a596de6f4aa96c353cdd4f743f574958767f211a21c8857c5cf19edc2` == baseline producción — DIFF=0 |
| Cierre de sesión (post clones) | 10.753 líneas F — SHA `9e7cea9a…edc2` — **DIFF=0** (evidencia: `tmp/w7final/s1-final-closure.txt`) |

## 4. W7-D1 (ACL `fn_recalc_wac`) — re-demostrado hoy con consultas PostgreSQL

| Estado | Medición (clon fresco `w7final`, paquetes 01..09) |
|---|---|
| PRE | `proacl = =X/postgres, postgres=X, anon=X, authenticated=X, service_role=X` · overloads=1 · HFP anon/auth/service/owner = true/true/true/true |
| Exploit PRE | anon y authenticated → llamada ACEPTADA, WAC 100 → 399.6666666666666667 (6/6 PASS, bitácora registrada) |
| Parche | `w7d1-acl-patch.sql` (3 REVOKE exactos, firma única) |
| POST | `proacl = postgres=X/postgres, service_role=X/postgres` (entradas PUBLIC/anon/authenticated eliminadas) · HFP anon=false, authenticated=false, service_role=true, owner=true |
| Exploit POST | anon → `DENIED(42501)`, authenticated → `DENIED(42501)`, WAC intacto; PUBLIC sin EXECUTE efectivo; service_role/owner autorizados; **consumidor real authenticated → blend exacto 108.333333 vía SECURITY DEFINER + traza `reception_in`** (12/12 PASS) |
| No-bypass | F6 3/3 (wrappers ERR_UNAUTHORIZED, reset fail-closed) + barrido amplio: 0 forjas de token `app.wac_writer`; único trigger que toca `cost_average` = guard; 24 funciones con UPDATE-products+cost_average TODAS `SECURITY DEFINER owner=postgres`; overloads writer=1; guard no invocable por RPC (0A000) |

## 5. Regresión contable (clon `w7final` con paquetes + parche integrados)

| Suite | Resultado |
|---|---|
| DF-01 (WAC singleton) | 24/24 PASS |
| DF-02 (COGS server-side) | 13/13 PASS |
| DF-03 (finanzas devolución) | 16/16 PASS |
| DF-04 (design-only) | 8/8 PASS |
| DF-05 (producción) | 13/13 PASS |
| DF-06 (transfer blend) | 16/16 PASS |
| DF-07 (devolution cap) | 8/8 PASS |
| DF-08 (close idempotente) | 10/10 PASS |
| DF-09 (overloads) | 12/12 PASS |
| INV-01..15 | **29/29 PASS** (+ INV-12 rollback estado 5/5) |
| F19 conservación | 10/10 PASS (ΣCOGS ≡ Σ uc×qty; A1 materializada) |
| F4/F18 stock-zero | 8/8 PASS (`WAC RETAINED` — decisión formal W7-09, no OPEN) |
| **TOTAL** | **182 PASS / 0 FAIL** (más adversarial/conc en su propio formato) |

## 6. Adversarial · Concurrencia · Rollback

| Suite | Resultado |
|---|---|
| Adversarial secuencial | 12 ataques — `0 ACCEPTED-INCORRECTLY = adversarial PASS` |
| Adversarial concurrencia | 4/4 OK (C1 transfer 8+8, C2 producción 4+4/6, C3 venta+recepción veneno, C3b conservación) |
| Concurrencia total | **16/16** (df01-conc 4 + df02-conc 5 + df07-race 3 + adv-conc 4) |
| Rollback (clon `w7final_rb`) | baseline(v3 pristine)=38 líneas SHA `f370a3d5…` → post-migración ≠ baseline (esperado) → `w7-rollback.sql` + `w7d1-rollback-complement.sql` → **POST_ROLLBACK == BASELINE byte-idéntico (diff=0, mismo SHA)** |
| Residuos post-rollback | **0 en los 8 checks**: guard_fn, guard_trg, fn_recalc_wac, wac_change_log, tablas w62_%, store_credit_ledger, pt.direction, withdraw_v3 |
| Equivalencia inter-sesión | baseline/post de hoy == conjunto idéntico (sort-diff=0) al histórico `w7d1-rb-baseline/post2` de la sesión W7-D1 (solo orden de líneas difiere por concatenación; el estado de BD es el mismo) |

## 7. P-1 (custodia de evidencia W6.2)

| Check | Resultado |
|---|---|
| Manifest W6.2 | 10/14 OK + 4 FAILED (W62-11/12/17/21) — exactamente la desviación declarada |
| SHAs actuales vs W7-19 | los 4 archivos actuales == SHAs **RERUN-REPLACEMENT** registrados en W7-19 (re-verificado hoy, byte a byte) |
| SHAs históricos | preservados en W7-19 (ORIGINAL-HISTORICAL) — NO reconstruidos, NO falsificados |
| Clasificación de esta sesión | **ACCEPTED como desviación documental** — no bloqueante: (a) solo outputs .out, no paquetes; (b) mismas suites con mismos casos; (c) re-demostración independiente HOY en clon fresco (df01/df02/df07-race/adversarial PASS); (d) cadena de custodia explícita con ambas generaciones |

## 8. Release candidate (W7-RELEASE/)

| Artefacto | Estado |
|---|---|
| `W7-RELEASE/sql/01..09` | candidato con **enmienda W7-D1 anexada a 01** (diff = solo bloque S5 `840a841,856`); 02..09 byte-idénticos a originales |
| `W7-RELEASE/rollback/` | `w7-rollback.sql` + `w7d1-rollback-complement.sql` incorporados al runbook |
| `W7-RELEASE/W7-RELEASE-MANIFEST.sha256` | **25/25 OK** (secciones: release candidate + originales históricos + fuentes de provenance) |
| `W7-RELEASE/COMMIT-CANDIDATE.sha256/.md` | 185 archivos listados con hashes — **READY FOR OWNER COMMIT (ningún git ejecutado)** |

## 9. Estado final de trabajo de esta sesión

- Clones destruidos; bases restantes v2+v3+postgres; 0 conexiones residuales.
- Git sin cambios (0 add/commit/push/tag); Sonar no tocado; producción no contactada.
- Únicos cambios en disco fuera del harness: `w7-readiness/tmp/w7final/` (33 evidencias nuevas), `W7-RELEASE/` (nuevo), `w7-readiness/W7-FINAL-*.md` (nuevos), `scripts/w7final-*` (persistidos), 1 symlink roto de doc .deb eliminado (sin valor forense, sin efecto en manifests).
