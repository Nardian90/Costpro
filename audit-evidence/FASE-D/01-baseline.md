# FASE D — 01 BASELINE

```text
FASE D BASELINE
HEAD:         c0649c05ce88139820e2ea4956c7790a652189aa (== esperado c0649c05; no asumido, verificado)
origin/main:  c0649c05ce88139820e2ea4956c7790a652189aa
branch:       main (sincronizada con origin/main)
worktree:     limpio salvo audit-evidence/FASE-C2R/10-reverification-r1.md (untracked, fase anterior)
date:         2026-09-25T23:13:09Z (inicio FASE D)
servidor dev: PM2 `costpro` en :3000 (HTTP 200), Next 16 + React 19 + Zustand 5 + TanStack + Dexie + vitest + Playwright
```

## Comandos ejecutados (solo lectura)

```text
git status --short --branch → ## main...origin/main (+1 untracked de C2R-R1)
git rev-parse HEAD          → c0649c05ce88139820e2ea4956c7790a652189aa
git rev-parse origin/main   → c0649c05ce88139820e2ea4956c7790a652189aa
git log --oneline --decorate -n 15 → c0649c05 (docs C2R) → 00a7c9a7 (CI C2) → ca3a019f (C2) → …
```

## Inventario previo relevante

- Evidencia C2R commiteada (01–09); re-verificación R1 untracked (documento 10) — no se tocó.
- `db/custom.db` presente pero el POS NO depende de Prisma: productos/ventas/stock viven en
  Supabase LIVE vía RPC (`get_products_for_pos`, `create_sale_v2`).
- Censo de tiendas LIVE (read-only): 50 tiendas; identificadas las zonas prohibidas:
  - **ENERVIDA-VITALLCONS** = `5e6fe821-5465-48b1-b3f1-3aa3182edc38`
  - **Puerto Padre VITALLCONS** = `43a4dabc-b8b4-4b66-82b3-0c75335ca5d1`
  - TIENDA CENTRAL COSTPRO = `d1c4ba0e-…` (tratada como producción por prudencia)
  - Resto: fixtures sintéticos de fases anteriores (E2E2-ALPHA/BETA, AUDIT F4E1, HOT*, Tienda Auditor).
