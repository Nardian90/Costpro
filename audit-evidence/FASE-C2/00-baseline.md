# FASE C — C2 · 00 BASELINE

Fecha: 2026-09-23 · Gate: **C2 — Implementación de CostSheet: persistencia real + separación por contrato + Guardar Ficha** · Modo: IMPLEMENTACIÓN CONTROLADA / NO REESCRITURA.

## 1. Verificación git inicial (GATE 0)

| Verificación | Resultado |
|---|---|
| Branch | `main` |
| `git rev-parse HEAD` | `bbb74f4c4e9d7cb502d1c2357d58af92d2363526` |
| `git rev-parse origin/main` | `bbb74f4c4e9d7cb502d1c2357d58af92d2363526` |
| Comparación | **HEAD == origin/main == bbb74f4c** — el SHA NO cambió desde C1R; el código es el mismo |
| `git status --short` (inicio) | `?? audit-evidence/FASE-C/` · `?? FASE-C1/` · `?? FASE-C1R/` (evidencia previa intacta) |
| `git diff -- public/fc/` (inicio) | vacío — FC.html intacto |

## 2. Evidencia previa leída

- `audit-evidence/FASE-C1R/` completa (especialmente `03-c2-scope.md` — alcance autorizado C2-A/B/C/E, y `FINAL-REPORT.md` — veredicto READY_FOR_C2).
- `audit-evidence/FASE-C1/` (especialmente `PRODUCT-DECISIONS-C1.md`, `FINAL-REPORT.md`, docs 01–07 como respaldo técnico).

## 3. Decisiones que rigen la implementación

D1–D8 CONFIRMADAS (C1R). Restricciones activas durante todo C2:
- **C2-D**: FC.html intocable (contrato, offline, SW, sync, fichas). Verificado al inicio y al cierre (`git diff -- public/fc/` vacío).
- **C2-E**: prohibido `store_id` en `cost_sheets` (sin DDL, sin migración, sin tabla nueva).
- **D3**: los 7 documentos FC permanecen intactos — no convertir/migrar/modificar.
- **§22/§23**: RLS sin cambios y sin evasión; service role solo para diagnóstico de LECTURA; operaciones de usuario con JWT real.

## 4. Entorno de verificación

| Componente | Estado |
|---|---|
| PM2 `costpro` | online (bun server.ts, NODE_ENV=development → hot-reload: los cambios de código quedaron vivos sin reinicio) |
| LIVE Supabase | misma instancia de C0/C1/C1R (censo idéntico al de C1R al inicio) |
| Cuenta de prueba | `admin@demo.com` (uid `a1111111-…`) — utilizada en gates previos; es OWNER de 3 de los 7 documentos FC (dato crítico, ver 07-security.md) |
| CI GitHub Actions | disponible (TypeCheck + Lint + Unit + Build) — usada para Build (limitación OOM local, ver 05-tests.md) |
