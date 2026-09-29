# F5 — 03 RADIUS & SHADOW AUDIT (A3 + A4)

Fecha: 2026-09-29 · Método: rg cuantitativo + clasificación de contexto.

## A3 — BORDER RADIUS

| Clase | Usos | Archivos | Clasificación general |
|---|---|---|---|
| `rounded-lg` | 1.118 | 254 | base de tabla/input/panel ✓ |
| `rounded-xl` | 1.465 | 319 | botones/cards canónicos ✓ |
| `rounded-2xl` | 566 | 208 | cards/modals (~60/10/8/12/10% card/modal/FAB/tile/hero) |
| `rounded-3xl` | **130** | 60 | ~110 cards, ~14 modals, 4 landing, 0 botones |
| `rounded-full` | 799 | 260 | pills/badges/FAB ✓ |
| `rounded-md` | 182 | 83 | ✓ |
| `rounded-[…]` | 198 | 80 | drift arbitrario |
| `rounded-sm`/`none` | 25/8 | — | ✓ |

**No existe token `--radius-3xl`** en tokens.css (escala termina en 2xl) → los 130 usos
de rounded-3xl viven fuera del sistema. Clasificación por contexto: APPROPRIATE en
landing/hero; **EXCESSIVE-INCONSISTENT en cards operacionales** (AnalyticsDashboard,
PipelineTab, SettingsView ×6, MasteryDashboard ×6, wiki, Wallet) donde conviven
rounded-xl, rounded-2xl y rounded-3xl en superficies equivalentes.

**Decisión**: NO migración (F5-C.1). C/Document: consolidación futura a 2 niveles
(md/lg para controles, xl/2xl para superficies) requiere decisión + codemod.
rounded-3xl en cards operacionales = P2 debt documentada con lista completa.

## A4 — SHADOW

| Clase | Usos | Archivos | Nota |
|---|---|---|---|
| `shadow-sm` | 249 | 121 | ✓ elevación sutil |
| `shadow-lg` | 197 | 128 | ✓ overlays/cards |
| `shadow-2xl` | **159** | 114 | mezcla legítima (modals/popovers/drawers) + ruido (cards/FABs) |
| `shadow-xl` | **117** | 83 | ídem |
| `shadow-[…]` | 65 | 36 | ver abajo |
| `drop-shadow-*` | 10 | 6 | hero legibility (ok) + glows (2) |

- shadow-2xl/shadow-xl **legítimos**: modals (DuplicateDocumentModal, ReverseDocumentModal,
  CommandPalette), popovers/dropdowns (SyncStatusBadge:100, chart tooltip), drawers,
  CookieConsent, mobile sheets → NO tocar (funcionales).
- shadow-2xl/shadow-xl **como ruido**: cards estáticas (AnalyticsDashboard stat cards
  shadow-xl p-8), FABs con glow de color (`shadow-xl shadow-amber-500/40` StorefrontPage:1553,
  `shadow-2xl shadow-green-600/30` StorefrontPage:1117) → P2/P3 documentado; landing/storefront = BRAND.
- `shadow-[#22c55e]` ×14 + `shadow-[#15803d]` ×2 = **color-only shadow hack** (drop-shadow
  sólido, sin blur definido) → drift; ubicación a confirmar en remediation.
- Glows CSS ≥30px: ~15 (modes.css:529-656 enhanced pricing glows hasta 120px; components.css:344;
  landing.css) → FUNCTIONAL? no: DECORATIVE gated por modo → D/C.

### HALLAZGO OBJETIVO — utilidades corruptas (FIX F5-D)

Codemod mangled dejó clases inválidas (Tailwind no las genera; los overrides dark: se
ignoran silenciosamente):

| Archivo | Línea | Corrupción | Restauración |
|---|---|---|---|
| `cost_sheet/CostSheetCalculator.tsx` | 99 | `dark:text-sl(var(--primary))]/40` | `dark:text-[hsl(var(--primary)/0.4)]` |
| ídem | 109 | `dark:text-sl(var(--primary))]` + glow `drop-shadow-[0_0_15px_rgba(22,163,74,0.5)]` | quitar fragmento roto (text-primary cubre dark: mismo hex) + retirar glow decorativo |
| ídem | 119 | `dark:to-sl(var(--primary))]/5` | `dark:to-[hsl(var(--primary)/0.05)]` |
| ídem | 166 | `dark:shadow-sl(var(--primary))]/30` | `dark:shadow-primary/30` |
| `cost_sheet/CostSheetSidePanel.tsx` | 137, 234 | `dark:border-sl(...)]/30 dark:shadow-sl(...)]/10` | `dark:border-primary/30 dark:shadow-primary/10` |
| ídem | 252 | `dark:text-sl(var(--primary))]` | quitar (text-primary ya cubre) |
| ídem | 274 | `dark:text-sl(var(--primary))]/50` | `dark:text-[hsl(var(--primary)/0.5)]` |

Estas son P1 objetivas: código roto con intención visual conocida y restauración de bajo riesgo.
