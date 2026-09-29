# F5 — 00 BASELINE (GATE 0 / 0.2 / 0.3)

Fecha: 2026-09-29 · Agente: UI/UX Design Agent (CostPro exclusivo)
Fase: F5 — Visual Sobriety, Consistency & Design Debt

## 1. Git — estado real verificado

```text
$ git fetch origin --prune
2f102685..2c7f9564  main -> origin/main        ← main HABÍA AVANZADO tras PRE-F5
$ git rev-parse origin/main
2c7f9564e4ff198bb361752a1965b385bc51b9ed
$ git merge-base --is-ancestor 60dd04ac origin/main   → PASS (F3 contenido)
$ git merge-base --is-ancestor 55b39920 origin/main   → PASS (F4 contenido)
$ git tag --list "backup/pre-f5-main-*"               → backup/pre-f5-main-09ef9e97
$ git ls-remote origin refs/tags/backup/pre-f5-main-09ef9e97 → existe local + remoto
```

### Caracterización del main nuevo (2f102685..2c7f9564)

```text
2c7f9564 Merge pull request #1332 from Nardian90/security/sec-ts-07-e2e-artifacts-workflow
ec6982f2 fix(ci): secure public e2e artifacts and wire service role (SEC-TS-07)
→ 2 commits, SOLO .github/workflows/ci.yml + test-coverage.yml (CI/seguridad).
→ CERO solape con UI/Design System. Se preserva intacto.
```

```text
F5_BASELINE_SHA = 2c7f9564e4ff198bb361752a1965b385bc51b9ed
F5_BRANCH       = audit/f5-visual-sobriety  (creada desde origin/main; WORKTREE CLEAN)
RECOVERY        = tag backup/pre-f5-main-09ef9e97 (local + origin) + base de rama F5
Prohibidos usados: NO reset --hard, NO clean -fd, NO push --force, NO rebase, NO ramas borradas
```

## 2. Contexto leído antes de tocar UI (GATE 0.3)

| Fuente | Lectura | Relevancia F5 |
|---|---|---|
| `src/styles/tokens.css` (360 líneas) | completa | Jerarquía F2: `--primary` (#22c55e dark/#15803d light) = ACCIÓN; `--brand` (#39ff14 dark/#128209 light) = MARCA; `--success/--warning/--danger/--info` = estado; landing-tokens aislados |
| `src/components/ui/button.tsx` | completa | F2 ya corrigió la voz del botón (font-medium, tracking-normal, rounded-xl); variantes default/destructive/outline/secondary/ghost/link |
| `src/components/ui/PageHeader.tsx` | completa | Portador F2 de jerarquía; badgeVariantMap usa paleta emerald/amber/red en clases (drift suave) |
| `src/components/ui/StateRenderer.tsx` + `BaseModal.tsx` | vía subauditoría | SOBRIOS; loading delega en ViewLoadingSplash (decorado — ver 04) |
| `src/components/views/TerminalShell.tsx` | parcial | Chrome operacional; monta ParticleBackground (branding gigante, gated por modo) |
| `src/components/IntelligentThemeHandler.tsx` | completa | Sistema de modos: default 'enhanced' para usuarios nuevos; override manual SOLO se lee, nunca se escribe desde UI |
| `src/styles/modes.css` | parcial | `.mode-performance` oculta capas decorativas (perf-hide-gradient, bg-costpro-branding, mesh-orbs) |
| `src/components/ui/CyberShell.tsx` | completa | Chrome cyber de la app operacional completa (HomePageClient:119) |
| `audit-evidence/UI-DESIGN/F4/00-09` | clave | Fuente de verdad navegación/nomenclatura F4; regresiones F1/F2/F3 |
| `audit-evidence/UI-DESIGN/PRE-F5/00-05` | clave | Baseline integrada; build local OOM documentado; CI = autoridad |
| DESIGN.md | no existe en repo | — |

## 3. Protección de áreas no-F5 (GATE 0.4)

Compromiso registrado: F5 no tocará Supabase/migrations/RLS/APIs/server actions/auth/
inventario/ventas/contabilidad/cálculos/seguridad/CI/E2E/modelos de negocio.
Cambios permitidos: solo UI/estilos/componentes visuales y sus pruebas.

## 4. Método de auditoría

- 3 exploraciones paralelas read-only sobre `src/` (color; tipografía/radius/shadow;
  decoración/botones/badges/iconos) con recuentos exactos rg.
- Verificación en vivo con navegador real (agent-browser) sobre pm2 localhost:3000
  (sesión admin), viewport desktop 1280×800 y mobile 320–400.
- Capturas BEFORE: 12 superficies desktop dark + 4 superficies de botones + light
  theme ×3 + mobile 320 → `shots/before-*.png`.
- Verificación programática: overflow horizontal en 9 anchos × 3 superficies;
  tokens computados; DOM de elementos decorativos.

## 5. Estado de verificación en vivo (resumen)

- Servidor pm2 HTTP 200 sobre rama F5 (sin cambios aún = baseline exacta).
- Sesión admin válida; deep-links funcionando (POST-F4 intacto).
- Overflow horizontal: **0px en 320/360/375/390/400/768/1024/1280/1440** (POS,
  dashboard, settings) — F1 intacto en baseline.
- Tema light funcional (bg #f8fafc, tokens vivos); dark funcional (#121212).
- Watermark gigante "COSTPRO" (bg-costpro-branding, ParticleBackground) visible en
  ambas modalidades de tema (default enhanced).
