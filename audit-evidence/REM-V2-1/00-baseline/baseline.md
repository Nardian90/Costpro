# REM-V2-1 — 00 BASELINE

- Repo: `Nardian90/Costpro` (origin, branch `main` = fuente canónica)
- Baseline requerido por el gate: `34f50a55e0092c88f8ca0790d652ca622086858a`
- Verificación del clon fresco (workspace reset #3, re-provisionado desde GitHub):
  ```
  HEAD         = 34f50a55e0092c88f8ca0790d652ca622086858a
  origin/main  = 34f50a55e0092c88f8ca0790d652ca622086858a
  WORKTREE     = CLEAN (0 archivos)
  ```
- Cadena heredada: `f59b8883` (rem-sec-1 verdict) → `244ba2fc` (rem-po-1 fix) → `0b7e726f` (rem-po-1 evidence) → `493ebc95` (regla de cierre permanente) → `34f50a55` (**rem-inv-1 evidence pack**, publicado entre gates).

## Estado de entorno al inicio del gate

| Ítem | Estado |
|---|---|
| Clon fresco | OK (HEAD == origin/main == baseline) |
| `.env` del operador | **NO disponible** (perdido con el reset del workspace; no es recuperable por diseño) |
| Acceso live Supabase | **BLOQUEADO** para este gate hasta re-provisión de credenciales → consultas READ-ONLY live y fingerprint zero-touch §22 no ejecutables en esta pasada |
| Evidence pack REM-INV-1 | En repo (`audit-evidence/20260912-rem-inv-1/`), mismo día que el baseline → ACLs live r13 usables como evidencia de grants con valencia de baseline |
| Entorno seguro para mutaciones | No existe staging; no hay credenciales live; SQLite local ≠ semántica Postgres/RPC → pruebas mutativas dinámicas: DOCUMENTADAS Y NO EJECUTADAS (§3) |

## Fuente de evidencia de grants live

`audit-evidence/20260912-rem-inv-1/12-multistore/r13-grants.json` — catálogo live capturado
en REM-INV-1 (2026-09-12), mismo día del commit baseline `34f50a55`. Se usa como
instantánea de ACLs a baseline, marcada explícitamente como "live @ REM-INV-1".
