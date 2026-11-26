# GITHUB-STATE — Estado real verificado en GitHub

**Misión:** CP-BRA-FINAL-VERIFICATION-AND-INV005-001
**Fecha de verificación:** 2026-11-26 (UTC) · **Método:** API REST de GitHub (`/pulls/{n}`, `/commits/{sha}/check-runs`) + `git fetch` de las 4 ramas objetivo. Ningún informe previo fue tomado como verdad.

## 1. Reconciliación de informes históricos

| Fuente | Afirmación | Verdad verificada |
|---|---|---|
| Informe antiguo (CP-SAAS-BUSINESS-RULES-CERTIFICATION-001) | PR #1715 abierto | **FALSO hoy**: fusionado 2026-11-25 18:31Z, merge `ea2eb0503` |
| Informe posterior (INFORME.md de CP-BRA-REMEDIATION-001, en rama #1720) | #1715 y #1716 fusionados | **VERDADERO** |
| Informe de remediación | #1719/#1720 con CI en ejecución al cierre | Ahora **9/9 green** (el workflow E2E Aislado terminó en success) |

## 2. Estado de `main`

- **HEAD:** `08312dfa5b` — «Merge pull request #1716 from Nardian90/fix/payment-lifecycle-supplier-integrity-20261126»
- Anterior: `ea2eb0503` — «Merge pull request #1715 … feat/cp-bra-001-20261126»
- Árbol de trabajo local limpio (`git status` vacío), rama local `main` sincronizada con `origin/main`.

## 3. Estado real de los PRs objetivo y antecedentes

| PR | Título (resumido) | Estado | Rama head → base | Head SHA | Merge SHA previsto | Commits | Diff | CI |
|---|---|---|---|---|---|---|---|---|
| #1715 | estándar CP-BRA-001 + puerta CI | **MERGED** 25-11 18:31Z | feat/cp-bra-001-20261126 → main | `e55839c257` | `ea2eb0503` | — | — | 7/7 (al fusionar) |
| #1716 | guards ciclo de vida de pagos | **MERGED** 25-11 | fix/payment-lifecycle-supplier-integrity-20261126 → main | `ed60e9505e` | `08312dfa5` | — | — | green |
| #1717 | motor de pagos R-01 + R-14 | **OPEN** | fix/cpbra-r01-r14-motor-pagos-20261125 → main | `90ce9e5d6` | `f66ca79b45` | 1 | 14 files, +1227/−35 | **9/9 success** |
| #1718 | CxC tasa canónica R-02 | **OPEN** | fix/cpbra-r02-cxc-tasa-canonica-20261125 → main | `9b6bb8dc31` | `35aa93079` | 2 | 18 files, +1441/−54 | **9/9 success** |
| #1719 | incidencias POS R-11 | **OPEN** | fix/cpbra-r11-pos-incidencias-20261125 → main | `abd32444d9` | `c60c78f02` | 3 | 21 files, +3170/−138 | **9/9 success** |
| #1720 | dedup proveedores R-15 | **OPEN** | fix/cpbra-r15-dedup-server-20261125 → main | `37f20697e3` | `a014b17e7` | 4 | 27 files, +3880/−339 | **9/9 success** |

Checks ejecutados en cada head (idénticos, 9/9 `success`, `completed`):
`TypeCheck + Lint + Unit Tests + Build` · `TypeScript Security Checks` · `SQL DB Security Checks` ·
`SQL Static Checks` · `Security Audit` · `Allowlist Review` · `E2E Aislado (project)` (workflow manual, ejecutado en cada head) ·
`Unit & Integration Tests` · `Vercel Preview Comments`.

## 4. Dependencias reales entre ramas (verificado con git, no asumido)

Los 4 PRs **comparten una cadena lineal** de commits sobre la base común `08312dfa5` (HEAD de main):

```
08312dfa5 (main)
   └─ 90ce9e5d6  fix(cpbra-001): R-01 rama OT + R-14 guard período fiscal      (19:15Z) ← head #1717
       └─ 9b6bb8dc3  fix(cpbra-001): R-02 tasa canónica CxC                    (19:18Z) ← head #1718
           └─ abd32444d  fix(cpbra-001): R-11 incidencias POS server-side      (19:37Z) ← head #1719
               └─ 37f20697e  fix(cpbra-001): R-15 dedup proveedores vía RPC    (19:50Z) ← head #1720
```

Consecuencias verificadas:

1. Cada rama posterior **contiene** los archivos de las anteriores (p. ej. #1720 incluye los 3 SQL de migración
   `20261126140000/150000/160000`, el expediente `CP-BRA-REMEDIATION-001/` completo y los archivos de #1717–#1719).
2. **La secuencia de fusión 1717 → 1718 → 1719 → 1720 no es una convención: es la única secuencia válida.**
   Fusionar en otro orden dejaría PRs cuyos diffs incluyen trabajo ya integrado.
3. Tras cada fusión, el PR siguiente ve reducido su diff incremental (GitHub lo recalcula automáticamente).
4. `mergeable: true` y `mergeable_state: clean` en los 4 al momento de la verificación (sin conflictos).
5. Ninguno de los 4 PRs tiene conflictos con #1715/#1716 (la cadena parte del post-merge de #1716).

## 5. Otros PRs que afectan los mismos dominios

- Ningún PR adicional abierto al inicio de esta misión (verificado por listado de PRs abiertos: solo #1717–#1720).
- `main` no recibió pushes posteriores al merge de #1716 que toquen los dominios de los 4 PRs.

## 6. Commit-dates de la cadena (dato para FASE 3 — discrepancia temporal)

Los 4 commits son del **2026-11-25 19:15–19:50Z**, pero los archivos de migración que introducen llevan
versiones con timestamp **2026-11-26 14:00/15:00/16:00**. Es decir: las migraciones fueron creadas y
comprometidas el día 25 con versiones fechadas el día 26 (posterior). Esta discrepancia temporal se
audita en `MIGRATION-RECONCILIATION.md`; el número de versión es un identificador, no un registro de
ejecución, pero debe documentarse porque el informe de remediación (fechado 25-11) declara «aplicadas en
producción» migraciones con versión 26-11 14:00–16:00.
