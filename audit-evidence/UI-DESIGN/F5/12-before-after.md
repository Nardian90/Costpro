# F5 — 12 BEFORE / AFTER (cambios realmente realizados)

Fecha: 2026-09-29 · Alcance: exclusivamente los cambios presentes en el working tree de
`audit/f5-visual-sobriety` (verificables con `git diff` / `git diff --cached`).
**17 archivos modificados (+58/−58) + 2 archivos eliminados (−273) = 19 rutas.**

## 1. Cambios por fix (todos verificados byte-level 20/20 PASS — script `scripts/f5-verify-fixes.js`)

| Fix | Archivos | Cambio real | Evidencia en diff |
|---|---|---|---|
| F5-001 (retractado) | CostSheetCalculator.tsx | ÚNICO remanente válido del ítem: retiro del glow decorativo neon del display (`drop-shadow-[0_0_15px_rgba(22,163,74,0.5)]`). Las "utilidades corruptas" eran FALSO POSITIVO (retractado en 09: `dark:border-[hsl(var(--primary))]/30` etc. VÁLIDAS — verificado Read+grep+hexdump) | 2 ±1 |
| F5-002 | ui/Building3D.tsx, ui/PWAInstallModal.tsx | ELIMINADOS (código muerto, 0 imports verificados ×2) | −273 (staged) |
| F5-003 | ui/CostProLoader.tsx | 7 × `console.log('[DIAG]…')` eliminados | −6 |
| F5-004 | Pick3OnboardingWizard.tsx, ipv/mvt/TemplateEditor.tsx | `hover:bg-emerald-700` → `hover:bg-success/90` (2 híbridos consolidados) | 2 ±1 |
| F5-005 | WhatsAppConfigView, WhatsAppAutoPublishSection, UpgradeModal, ExchangeIntelligenceView (×2), **WhatsAppDashboardView** | overrides `bg-green-600 hover:bg-green-700` / `bg-emerald-600 …` retirados de 6 CTAs de acción → caen al variant default (`--primary`). NOTA: WhatsAppDashboardView:276 se recuperó en F5-E.1 (había quedado sin aplicar; patrón idéntico al hermano) | 2+16+2+4+2 líneas |
| F5-006 | StoreDashboardView (×4 CTAs), MultiStoreDashboardView (:194), multi-store/StoreKPICard (:149) | CTAs: `bg-gradient-to-r from-primary…` → `bg-primary` sólido (+ hover `bg-primary/90`); voz `font-black uppercase tracking-widest` → `font-medium`. Texto fuente y alturas intactas | 8+2+2 |
| F5-007 | ipv/IPVView.tsx (:404) | h1 sin texto degradado (`bg-clip-text` retirado) → color sólido `foreground` | 2 ±1 |
| F5-008 | health/tabs/KnowledgeTab.tsx | `text-[7px]` → `text-[10px]`; `text-muted-foreground/50` (th) → un solo muted; th `font-black` → `font-semibold` | 30 (15±15) |
| F5-009 | TelegramConfigView, WhatsAppAutoPublishSection | 2 ternarios de status copy-paste (`bg-emerald-100/red-100/amber-100…`) → gramática canónica token `bg-success/10 text-success`, `bg-destructive/10`, `bg-warning/10` (misma que DocumentStatusBadge) + 5 badges Vitrina | 14+16 |
| F5-010 | ui/CyberShell.tsx, src/styles/modes.css | `perf-hide-decor` añadido a capas puramente decorativas (dots esquina ×4, sweep, borde cónico) + regla `.mode-performance .perf-hide-decor { display: none }`. Default enhanced SIN cambio | 13+7 |

## 2. Comparación cuantitativa F5-A → F5-F (byte-level, node fs, 1324 archivos)

| Métrica | BEFORE (01–05) | AFTER | NET | Clasificación |
|---|---|---|---|---|
| CTA con override `bg-green-600`/`emerald-600` | 8 | **0 en alcance** | −8 | **FIXED** (F5-005; +1 recuperado en E.1) |
| `console.log [DIAG]` | 7 | 0 | −7 | **FIXED** |
| Archivos muertos Building3D/PWAInstallModal | 2 | 0 | −2 | **FIXED** |
| Ternarios status paleta-100 (Telegram≡WhatsApp) | 2 bloques | 0 | −2 | **FIXED** |
| `bg-(emerald|red|amber)-100` grammar | 33 | 24 | −9 | FIXED (alcance) / **REMAINING DEBT** el resto → F5-018 |
| `text-[7px]` | 45 (3f) | 32 (12f) | −13 | **FIXED en KnowledgeTab** (0 restantes allí); post-audit byte-level revela piso 7px más amplio de lo medido en A2 (11 archivos más) → **REMAINING DEBT P2 nueva** (documentada, no ampliada) |
| `font-black` | 4.265 | 4.245 | −20 | FIXED (voz CTAs/th en alcance) / masa = **REMAINING DEBT** F5-015 (C) |
| `tracking-widest` | 2.290 | 2.268 | −22 | ídem |
| `bg-clip-text` en views/ | 1 | 0 | −1 | **FIXED** (F5-007) |
| `bg-gradient-to` en views/ | 83 | 79 | −4 | FIXED (CTAs dashboard) / resto = LEGACY/deuda → F5-014/017 |
| Capas CyberShell sin gate reduced-motion | 3 grupos | 0 | −3 | **FIXED** (F5-010; gated, no eliminadas) |
| `text-green-*`/`border-green-*`/`text-emerald-*` masa | 719 familia | ~665 | −54 | **REMAINING DEBT** → F5-014 (C, NO-GO) |
| `#22c55e` hex | 316 | ~340* | ~0* | *método F5-F incluye .ts/.css de configs de charts; sin cambio real por F5 → **INTENTIONAL** (paletas charts) + LEGACY |
| `#39FF14` | 1 | 6* | — | *hex de DEFINICIÓN del token --brand (tokens.css/landing.css/comentarios), 0 usos de acción → **INTENTIONAL/BRAND** |
| `rounded-3xl` | 130 | 128 | −2 | **REMAINING DEBT** → F5-016 (C) |
| `shadow-2xl` / `shadow-xl` | 159/117 | 159/118 | 0/+1 | **REMAINING DEBT** → F5-017 (C; mixto con legítimos overlays) |
| `glow` | 112 | 116 | +4 | Enhanced gated por modo → **INTENTIONAL (D)** F5-012/013 |
| `animate-pulse` views/ | 77 | 77 | 0 | ~mitad skeletons funcionales → **INTENTIONAL/LEGACY** |
| `text-[Npx]` masa / `uppercase` | 2.708 / 4.308 | sin cambio de masa | 0 | **REMAINING DEBT** F5-015 (C, NO-GO respetado) |

## 3. Screenshots (shots/)

- **BEFORE desktop 1280** (13): pos, sales, sales-hub, catalog, cash, wallet, inventory,
  reception_list, management-hub, dashboard, cost-sheets, exchange-intelligence, ipv,
  settings, telegram-hub, whatsapp-hub + light ×3 + mobile-320-pos.
- **AFTER desktop 1280** (14, todos verificados 1280×800 byte-level): pos, sales-hub,
  dashboard, inventory, catalog, cash, reception_list, settings, reports, telegram-hub,
  cost-sheets, exchange-intelligence, ipv, whatsapp-hub.
- **AFTER light**: dashboard, inventory, settings (1280) + mobile-375 dashboard.
- **AFTER mobile**: pos ×5 anchos (320/360/375/390/400) + drawer 390.

Corrección documentada: settings y telegram-hub AFTER de la sesión previa estaban a 320px
(emulación de dispositivo persistente) → re-capturados a 1280 y verificados.

## 4. Lo que F5 NO cambió (compromiso verificado)

`tokens.css`, `button.tsx`, `PageHeader.tsx`, `StateRenderer`, `BaseModal`, MobileTabBar,
StickyCart, navigation-definition/map, nomenclatura F4, landing/storefront (BRAND), Wallet
(semántica CR/DR), POS HISTORIAL azul, meta theme-color, paletas de charts, CI, backend,
seguridad, tests de negocio. Cero cambios de lógica: **+58/−58 son solo clases/estilos y
eliminación de código muerto/logs**.
