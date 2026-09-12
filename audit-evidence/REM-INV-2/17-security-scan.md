# REM-INV-2 — 17: SECURITY SCAN

## 1. Escaneo de secretos sobre la superficie del gate

Superficie escaneada: `git diff` + `git diff --cached` + test pin permanente + todos los archivos del evidence pack (`audit-evidence/REM-INV-2/**`).

Patrones: `github_pat_`, `sb_secret_`, `sbp_…`, JWT (`eyJ…` ≥20 chars), claves privadas (`-----BEGIN … PRIVATE KEY`), `password=`, `SUPABASE_ACCESS_TOKEN=`, service-role keys.

```text
Resultado: 0 hits — CLEAN
```

## 2. Estado de credenciales

| Ítem | Estado |
|---|---|
| `.env` | existe, **gitignored** (`git check-ignore` = YES), untracked (0 entradas en status) |
| `SUPABASE_ACCESS_TOKEN` | usado solo en scripts locales bajo `/home/z/my-project/scripts/rem-inv-2/` (fuera del repo), jamás impreso ni persistido en el pack |
| PAT de GitHub | solo en `.git/config` local, jamás impreso |
| Pack de evidencia | contiene únicamente resultados de catálogo/SELECT y SQL de definición — sin credenciales |

## 3. Integridad del diff

```text
git diff --check → limpio (sin conflictos de whitespace)
Archivos tocados por el gate:
 ?? audit-evidence/REM-INV-2/                       (evidence pack)
 ?? src/__tests__/integration/rem-inv-2-dynamic-reachability.test.ts  (pin permanente)
```

Cero modificaciones a: `.env`, `.gitignore`, `package.json`, `package-lock.json`, código de aplicación, `supabase/`, features/flags, otras RPC.

## Veredicto

**SECURITY: PASS** — sin secretos en evidencia/worklog/diff; superficie del gate exactamente la declarada; sin cambios de ACL ni de políticas RLS ejecutados.
