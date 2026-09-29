# F6 — 06 DESIGN SYSTEM CONSISTENCY (F6-G)

Verificación transversal de la gramática F2 sobre el main certificado.
Método: lectura de primitivos + conteos estáticos + muestreo en vivo.

## Color

| Rol | Fuente | Verificación |
|---|---|---|
| Primary | `--primary #15803d` (light) / tokens dark | ✓ tokenizado; CTAs primarios sólidos `bg-primary` (herencia F5-006) |
| Success/Warning/Danger | `--success #047857`, `--warning #b45309`, `--destructive #dc2626` | ✓ tokenizados; PageHeader badge map usa `/10` + border `/20` |
| Neutral | `--muted #f1f5f9`, `--muted-foreground #475569`, `--border #e2e8f0` | ✓ |
| Brand | escala `--brand-green-50…900` | ✓ momento de marca confinado al chip del PageHeader |
| Verde controlado | herencia F5 | sin regresión: 0 gradientes en CTAs de dashboard corregidos; los 4 restantes en StoreDashboardView son tintes sutiles de contenedor (`from-primary/5`) y badges pequeños = deuda F5-015/017 documentada, NO nueva |

## Typography (voz F2)

| Rol | Verificación |
|---|---|
| Page title | `.cp-page-title` vía PageHeader ✓ |
| Section/body/label | jerarquía estable en vistas verificadas ✓ |
| Button | `font-medium tracking-normal` (button.tsx) — 0 regresión a font-black ✓ |
| KPI/Table | sin voz "loud" nueva en superficies operacionales muestreadas ✓ |
| Masa heredada | `font-black` global = **4.242** vs 4.245 baseline F5-F (−3, ruido de conteo, no regresión); `text-[7px]` = **12 archivos** — exactamente la deuda F5-015 documentada. Clasificado DEBT, NO-GO de migración |

## Buttons

| Variante | Estado |
|---|---|
| Primary | `bg-primary text-primary-foreground shadow-xs hover:bg-primary/90` ✓ |
| Secondary/Outline/Ghost/Link | definidas y consumidas ✓ |
| Destructive | `bg-destructive` + ring destructive ✓ |
| Icon | size-11 (44px) ✓ |
| Mobile | h-11 default (44px) ✓ |
| Focus | `focus-visible:ring-[3px]` ✓ |

## Badges

* `badge.tsx` **sin** variants success/warning — deuda **F5-018 documentada** (0 matches,
  estable vs F5). La gramática canónica de status vive en PageHeader badgeMap +
  DocumentStatusBadge (token `/10`). No se detectó gramática nueva.

## Icons

Lucide consistente en navegación y toolbar (source única navigation-definition);
decorativos marcados `aria-hidden="true"` (Sidebar search icon verificado).

## Radius / Shadows

| Elemento | Estado |
|---|---|
| Radius | botones `rounded-xl`, cards `rounded-2xl` coherentes en muestreo; `rounded-3xl` global ≈128 = deuda F5-016 documentada (estable) |
| Shadows | `shadow-xs` en botones (F2); elevación fuerte confinada a overlays; glows gated en modes.css (F5-010) ✓ |

## Decoración

Subordinada: CyberShell con gate `perf-hide-decor` (6/6 elementos ocultos en
mode-performance, ver 08); ParticleBackground/watermark bajo modo enhanced
(decisión de producto F5-011/012/013 — sin cambio unilateral).

```text
COLOR ✓ · TYPOGRAPHY ✓ · BUTTONS ✓ · BADGES (deuda estable) ✓ · ICONS ✓
RADIUS (deuda estable) ✓ · SHADOWS ✓ · DECORACIÓN subordinada ✓
DESIGN SYSTEM — PASS (misma gramática; deuda F5 sin crecimiento)
```
