# REM-V2-2.1R — EVIDENCE MANIFEST REPAIR (reparación documental posterior)

> **Distinción de gates:** `REM-V2-2.1` = gate funcional original (P-1 activation, veredicto en
> `13-verdict/README.md` — NO modificado por esta reparación). `REM-V2-2.1R` = reparación
> documental posterior, exclusiva del manifiesto SHA-256 de este evidence pack.
> Ningún resultado funcional del gate original se altera, re-ejecuta ni re-clasifica.

## Baseline

| Campo | Valor |
|---|---|
| HEAD / origin/main | `224ba6f42c3b979b354a537e60d35e6e52ec2c7c` |
| Commit del gate original | `feat: activate V2 checkout and reverse` (verificado) |
| Branch | `main` |
| Worktree al iniciar | CLEAN (0 modificaciones) |

## Problema encontrado (reproducido)

`sha256sum -c SHA256SUMS` (manifest original, 29 entradas) → **23 OK + 6 FAILED open-or-read**.
Se corrige y amplía la observación previa («5 stale entries»): eran **6**, una había pasado
desapercibida en la auditoría informal previa (`10-build/build.log`).

Las 6 entradas dangling (referenciadas pero inexistentes en el artifact publicado):

| Entrada | Hash en manifest viejo | Estado |
|---|---|---|
| `worklog.md` | `98859207…e0d` | No versionado — excluido por `.gitignore:114` (`worklog.md`) |
| `09-regression-suite/contract-test.log` | `b8d3d1ae…71bc` | No versionado — excluido por `.gitignore:46` (`*.log`) |
| `09-regression-suite/eslint.log` | `9d1f871d…388c` | No versionado — excluido por `.gitignore:46` |
| `09-regression-suite/tsc.log` | `e3b0c442…7852` | No versionado — excluido por `.gitignore:46`; hash corresponde a string vacío (tsc silencioso en éxito, consistente) |
| `09-regression-suite/vitest.log` | `210a4bd1…4ea3` | No versionado — excluido por `.gitignore:46` |
| `10-build/build.log` | `05e44fa7…ef26a` | No versionado — excluido por `.gitignore:46` |

## Causa raíz

La sesión del gate original generó `SHA256SUMS` sobre el **árbol local completo** del pack
(incluyendo logs crudos y worklog locales) pero el commit publicó únicamente los archivos no
ignorados por `.gitignore`. El manifiesto nunca se regeneró contra el árbol publicado → 6
referencias sin archivo. Los archivos excluidos (logs crudos, worklog) son precisamente de la
clase que puede contener secretos, por lo que su exclusión del repo es la dirección segura; el
defecto es exclusivamente la frescura del manifiesto.

## Criterio de inclusión/exclusión del manifiesto corregido

- **Incluido:** todo archivo versionado por Git bajo `audit-evidence/REM-V2-2.1/`
  (`git ls-files`), incluido este documento `REM-V2-2.1R-REPAIR.md`.
- **Excluido:** `SHA256SUMS` (un archivo no puede contener su propio hash — excepción
  explícita autorizada en §5 del gate REM-V2-2.1R).
- **Excluido:** todo archivo ignorado por Git (`*.log`, `worklog.md`) — no forman parte del
  artifact publicado (§3: manifest = archivos que realmente pertenecen al evidence pack
  publicado). NO se eliminó evidencia válida para «hacer pasar el checksum»: los 23 archivos
  versionados del pack original conservan íntegramente sus hashes (verificado:
  0 tracked files carecían de hash).

## Reparación ejecutada

1. Manifest viejo preservado y documentado (tabla anterior).
2. `SHA256SUMS` regenerado determinísticamente: rutas relativas al pack, orden `LC_ALL=C sort`,
   hashes sobre el contenido versionado.
3. Verificación directa: `sha256sum -c SHA256SUMS` → 24/24 OK, 0 missing, 0 failed.
4. Verificación bidireccional: `A - B = vacío` y `B - A = vacío` (A = versionados en pack;
   B = referenciados por manifest; `SHA256SUMS` excluido por criterio).

## Resultados de verificación

| Check | Resultado |
|---|---|
| `sha256sum -c SHA256SUMS` | 24/24 OK — 0 missing, 0 failed, sin WARNING |
| A − B | vacío |
| B − A | vacío |
| Secret scan (patrones: `github_pat_`, `sb_secret_`, `sbp_[0-9a-f]{20,}`, JWT, private keys, passwords; sobre tracked + pack + diff) | **0 secrets** |
| Flags V2 (`.env`, no versionado) | `NEXT_PUBLIC_USE_V2_CHECKOUT=true`, `NEXT_PUBLIC_USE_V2_REVERSE=true` — sin cambios |
| `src/config/features.ts` | defaults fail-closed intactos (líneas 23/46) — sin cambios |
| `RPC_MAP_V1.receipt` / `RPC_MAP_V1.adjustment` | intactos (`reverse_receipt` / `reverse_adjustment`, route.ts:37/39) |
| `void_transaction` | intacto (9 referencias en 5 archivos) |
| Cambios funcionales | **0** (diff limitado a `audit-evidence/REM-V2-2.1/`) |

## Confirmaciones

- **P-4 NOT EXECUTED** — ningún RPC V1 retirado ni modificado; sin cleanup oportunista.
- **Cero cambios funcionales** — sin cambios en `src/`, `supabase/`, `migrations/`, rutas API,
  hooks, esquema, tests, CI, `package.json`, `ecosystem*`, `.env*`.
- **Veredicto funcional original intacto:** REM-V2-2.1 permanece `P-1 = CLOSED / CONDITIONAL`.

Generado: 2026-09-13 (gate REM-V2-2.1R)
