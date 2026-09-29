# F6 — 00 BASELINE (GATE 0 / 0.1 / 0.2)

Fecha: 2026-09-29 · Rama: `audit/f6-transversal-ux-qa`

## GATE 0 — Baseline real

```text
git fetch origin --prune         → origin/main avanzó: a05c5a85 → 336b2e5a
git status --short               → (vacío)
git branch --show-current        → main (pre-creación de rama)
git rev-parse HEAD               → a05c5a85863f64c76e08870de38e41902a649b93
git rev-parse origin/main        → 336b2e5ac2eb3d1d6689b6245cc6923b6340f58a
```

CURRENT_MAIN = `origin/main` = **336b2e5a** (no se asumió ningún SHA; el main real
incluye además de F5 el commit de seguridad `58eb5570` SEC-TS-09 e2e hygiene,
PR #1335 — sin superficie UI).

### Ancestry F1–F5 (los tres gates PASS)

| Commit | Fase | `git merge-base --is-ancestor <sha> origin/main` |
|---|---|---|
| `48fe7829` | F5 — visual sobriety | **PASS** |
| `55b39920` | F4 — information architecture | **PASS** |
| `60dd04ac` | F3 — states/overlays | **PASS** |

F5 está integrado en `main` (vía PR #1336, merge `a05c5a85`) — condición GATE 0 cumplida.

### Recovery point

```text
tag:    backup/pre-f6-main-336b2e5  → 336b2e5ac2eb3d1d6689b6245cc6923b6340f58a
push:   git push origin backup/pre-f6-main-336b2e5 → OK
verify: git ls-remote origin refs/tags/backup/pre-f6-main-336b2e5 == 336b2e5a ✓
```

## GATE 0.1 — Rama

```text
git switch -c audit/f6-transversal-ux-qa origin/main  → OK
branch: audit/f6-transversal-ux-qa · HEAD: 336b2e5a · worktree LIMPIO
```

## GATE 0.2 — Contexto leído (baseline certificado, no re-auditado)

| Fuente | Contrato absorbido |
|---|---|
| F4 `09-F4-FINAL-VERDICT.md` | fuente única de navegación; nomenclatura Vender/Ventas/Ajustes/Recepciones/Gestión de Tiendas; deuda C (doble h1 estructural, PageHeader en ~22 vistas), D (dual dashboard), F (26 huérfanos) |
| F5 `13-final-verdict.md` | F5 CERTIFIED; deuda residual D (F5-011/012/013), C (F5-014…020 masa tipográfica/radius/shadow/badges/aria), excepciones F5-021, CI F5-022 |
| F5 `09-debt-matrix.md` | 22 ítems clasificados P0=0; F5-001 RETIRADO (falso positivo documentado) |
| `src/styles/tokens.css` | paleta brand verde 50–900; light `--primary #15803d`, `--background #f8fafc`, success/warning/destructive tokenizados |
| `src/components/ui/button.tsx` | voz F2: `font-medium tracking-normal rounded-xl`, h-11/h-9, focus ring 3px, 6 variantes |
| `src/components/ui/PageHeader.tsx` | portador jerarquía F2 (title→description→primary→secondary), badge map token, sin lógica |
| `src/components/ui/StateRenderer.tsx` | gramática F3: loading splash / error+Reintentar / empty+acción; onRetry suave |
| `src/components/ui/BaseModal.tsx` | modal móvil-first, header/footer sticky, focus trap (`useFocusTrap`), scroll vertical |
| `src/config/navigation/navigation-definition.ts` | 1.274 líneas; secciones OPERACIÓN/ANÁLISIS/SISTEMA/AYUDA/EN DESARROLLO; 0 listas paralelas permitidas |
| `src/styles/modes.css` | `.mode-performance` / `.mode-enhanced`; auto por `prefers-reduced-motion`; convención `perf-hide-decor` (F5-010) |
| Componentes móviles | `MobileTabBar.tsx`, `StickyCartSummary.tsx`, `SpeedDial.tsx` presentes en árbol |

Consumo vivo de contratos (conteo estático F6-G): BaseModal **61** consumidores ·
StateRenderer **20** · PageHeader **7** vistas · navigation-definition **10** importadores
(incl. tests de contrato gate1).

## Entorno de verificación

```text
pm2: costpro (bun server.ts, dev, :3000) + telegram/whatsapp cron pollers — online
db:  db/custom.db (SQLite) · auth: admin@demo.com
box: 4 GiB RAM (build local OOM esperado — ver 11)
```
