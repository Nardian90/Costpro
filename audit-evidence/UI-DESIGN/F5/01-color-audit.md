# F5 — 01 COLOR AUDIT (A1)

Fecha: 2026-09-29 · Método: rg cuantitativo sobre src/ + lectura de contexto. Datos completos en la subauditoría (transcrita en 09-debt-matrix).

## 1. Panorama de familias de verde

| Familia | Volumen | Rol real observado |
|---|---|---|
| Tokens (`text-primary`/`bg-primary`) | **1.788 / 1.635 usos** | Sistema canónico F2 — domina |
| Paleta Tailwind (`text-green-*` 184, `bg-green-*` 140, `border-green-*` 60, `text-emerald-*` 184, `bg-emerald-*` 110, `border-emerald-*` 41) | **719 clases** | Drift concentrado en landing/storefront/WhatsApp/Wallet/Health |
| Hex literal en .tsx | `#22c55e`×316, `#16a34a`×24, `#15803d`×18, `#4ade80`×7, `#004D40`×7, `#166534`×6, `#14532d`×2, `#39FF14`×1(en comentario) | Charts/SVG/configs + landing |
| `--brand` (#39ff14, identidad F2) | **0 usos reales** (1 `bg-brand` = tile de icono PageHeader) | Token identidad, no acción |

## 2. Clasificación por función (no por frecuencia)

```text
CANONICAL      → --primary/--brand/--success/etc. y sus usos token (3400+)
SEMANTIC       → DocumentStatusBadge/FCStatusBadge/SyncStatusBadge (bg-success/10 …),
                 PageHeader badgeVariantMap, estado CR/DR de Wallet (emerald=ingreso)
LEGACY         → componentes.css:189-229 (gradientes hex mixtos), modes.css sólidos
DRIFT          → 12 botones de acción con bg-green-600/bg-emerald-500/600 (ver §4),
                 ternarios de status con bg-*-100 (33 usos/14 archivos)
DECORATIVE     → gradientes landing (permitidos = BRAND), glows modos.css enhanced
INTENTIONAL_EXCEPTION → meta theme-color #16a34a (PWA chrome, no admite var()),
                 paletas de charts (necesitan hex literales), print templates PDF
```

## 3. Hex no-verde en .tsx: 491 ocurrencias / 83 valores

Top: `#10b981`×44, `#3b82f6`×36, `#ef4444`×33, `#f59e0b`×30, `#64748b`×25…
Clasificación mecánica: ~220 son constantes de paletas de charts (CHART_PALETTE,
mapas de categoría, Recharts stops) — legítimas como datos; ~197 dentro de
className (drift); 34 en SVG fill/stroke. `chart.tsx` (shadcn) usa hex
estructurales que mapean a tokens.

## 4. Botones de acción con verde competidor (el hallazgo P1 central)

| # | Ubicación | Hoy | Semántica |
|---|---|---|---|
| 1 | `whatsapp/WhatsAppDashboardView.tsx:276` | `bg-green-600 hover:bg-green-700` | Acción primaria "probar bot" |
| 2 | `whatsapp/WhatsAppConfigView.tsx:153` | `bg-green-600 hover:bg-green-700` | CTA conectar |
| 3 | `whatsapp/WhatsAppAutoPublishSection.tsx:576` | `bg-green-600 hover:bg-green-700` | Publicar ahora |
| 4 | `modals/UpgradeModal.tsx:55` | `bg-green-600 hover:bg-green-700` | CTA upgrade |
| 5 | `exchange_intelligence/ExchangeIntelligenceView.tsx:642` | `bg-emerald-600 hover:bg-emerald-700` | Subir Excel |
| 6 | `exchange_intelligence/ExchangeIntelligenceView.tsx:2685` | `bg-emerald-600 hover:bg-emerald-700` | Descargar plantilla |
| 7 | `pick3/Pick3OnboardingWizard.tsx:171` | `bg-success hover:bg-emerald-700` | Híbrido token→paleta |
| 8 | `ipv/mvt/TemplateEditor.tsx:303` | `bg-success hover:bg-emerald-700` | Híbrido token→paleta |

→ **4 sistemas de relleno distintos implementan "acción primaria"**: `bg-primary`,
`bg-green-600`, `bg-emerald-500/600`, `bg-[#22c55e]` + híbridos `bg-success hover:bg-emerald-700`.

INTENTIONAL_EXCEPTION documentado: WalletView FAB/CR-DR (emerald=ingreso vs red=gasto
es semántica de la vista), POS `HISTORIAL` azul (info), botones de cámara `bg-green-500/10`.

## 5. CSS fuera de tokens

- `components.css:189-229`: gradientes con hex mezclados con var(--primary); shimmer; "retro shadow" 8 pasos emerald.
- `landing.css:381-647`: gradientes verdes + paleta feature-accent (BRAND, permitido).
- `modes.css`: sólidos `#141414/#1a1a1a/#0a0a0a` duplicando valores de tokens + glows 40–120px (enhanced).

## 6. Objetivo de jerarquía (estado actual)

```text
Primary action  → --primary (dominante PERO competido por 8 botones paleta)
Secondary       → outline/ghost/secondary ✓
Neutral         → grises token ✓
Success         → --success (#047857/#34d399) ✓ PERO emerald-500/600 compite en botones
Warning/Danger  → --warning/--danger ✓ (drift bg-amber-100/bg-red-100 puntual)
Info            → --info ✓ (POS HISTORIAL)
Decorative      → --brand como identidad (subutilizado: 0 usos fuera de 1 tile)
```

**Veredicto**: la jerarquía EXISTE en tokens pero el verde primario compite consigo mismo
en ≥8 botones de acción (paleta vs token) — remediación quirúrgica F5-D justificada.
La migración de las 719 clases restantes = NO-GO (masiva) → C/Document.
