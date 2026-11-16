# GITHUB_PR_INTEGRATION.md — CP-FIN-ULTIMATE-CLOSE-008

Fecha: 2026-11-16 · Registro verificable (GitHub API) de la integración de todos los PRs del ciclo CP-FIN.

## 1. PRs del ciclo — todos fusionados

| PR | Misión | merged_at (UTC) | Merge commit | Head fusionado |
|---|---|---|---|---|
| #1628 | CP-FIN-VALUATION-RECTIFICATION-003 (incluye migración T12 en main) | 2026-11-14T23:06:02Z | `55d4e4725` | `1ccd0b4fd` |
| #1629 | CP-POST-MERGE-VERIFICATION-003 (addendum) | 2026-11-15T11:50:26Z | `011e9a23f` | — |
| #1631 | CP-VALUATION-NOMINAL-ACTIVATION-004 (costo nominal 1 CUP + allowlist) | 2026-11-15T19:15:00Z | `4c42f4235` | `2f2362498`→`02026c069` |
| #1632 | CP-FIN-T12-PRIVILEGE-HARDENING-001 (privilegio mínimo + migración 20261116120000) | 2026-11-15T19:40:01Z | `5d33a86e3` | `21264887b` |
| #1630 | CP-FIN-T12-PRODUCTION-MIGRATION-006 (expediente + retirada excepción + m054–m057) | 2026-11-15T19:58:07Z | `4107f6b0d` | `26f704035` |
| #1633 | CP-FIN-T12-PR-CLOSE-007 (estado final #1630 + verificación post-fusión) | 2026-11-16T11:19:22Z | `337d4532` | `c73a61eee` |

**No quedan ramas con cambios válidos sin publicar**: `docs/cp-fin-t12-pr-close-007-20261116` (contenido íntegro en main tras #1633; diff `origin/main` ↔ rama = vacío).

## 2. CI por SHA (resultados reales, no históricos)

| SHA | Evento | Checks | Resultado |
|---|---|---|---|
| `c73a61eee` (head #1633) | pull_request | E2E Aislado / TypeCheck+Lint+Build / Unit & Integration / Security Audit / Vercel | **5/5 success** |
| `337d4532` (merge #1633 = main) | push 11:19:25Z | CI run 43856712909 · Test Coverage run 43856712927 | **success** |
| `26f704035` (head #1630) | pull_request 19:43:29Z | CI 43754005939 · Test Coverage 43754005847 · E2E 43754005851 | **success** |
| `4107f6b0d` (merge #1630) | push 19:58:09Z | CI 43755349423 · Test Coverage 43755349385 | **success** |
| `5d33a86e3` (merge #1632) | push 19:40:03Z | Security CI Gate · **SQL Security Gate 43753691957** · CI · Test Coverage | **success** |
| `4c42f4235` (merge #1631) | push 19:15:02Z | SQL Security Gate 43751353743 + suite | **success** |

SQL Security Gate en los heads del PR #1630: omisión por filtro de rutas (diseño del workflow, `on.pull_request.paths`); estado del contenido SQL+allowlist fusionado certificado verde en las runs citadas. E2E Aislado: manual-only por política del repo (se ejecutó bajo demanda en #1633: success).

## 3. PR documental de esta misión (#1634)

- Rama: `docs/cp-fin-ultimate-close-008-20261116` desde `main@337d4532`.
- Contenido: expediente `docs/audits/cp-fin-ultimate-close-008/` (9 documentos + 5 evidencias JSON + XLSX + SHA256SUMS) + 3 scripts de verificación re-ejecutable (m058, m058b, m059).
- Control pre-apertura: sin secretos (escaneo de patrones: 0 coincidencias); sin archivos `.env`; XLSX validado (xlsx.py validate → passed, 0 issues); SHA256SUMS verificado.
- Gates sobre el head: CI, Test Coverage, Security Audit, Vercel preview — resultados en el cuerpo del PR; fusión por flujo normal (API merge) autorizada por la misión (§11).
- Post-fusión: `main` terminal, checks del push de fusión y health verificados (§9 de la misión).

## 4. Disciplina

Sin push directo a `main`, sin force-push, sin bypass de controles, sin `pull_request_target`, sin ampliación de permisos de workflows. Fusiones por el cauce normal (API merge = botón de GitHub).
