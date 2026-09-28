# F5 — 09 DEBT MATRIX (F5-B)

Severidad: P0 bloquea operación · P1 inconsistencia significativa · P2 deuda moderada · P3 cosmética · D doc.
Categoría blueprint (ver 10): A fix-now · B low-risk · C document · D product-decision · E out-of-scope.

| ID | FILE:LINE | CATEGORY | CURRENT_STATE | EXPECTED_STATE | SEV | USER_IMPACT | RISK | EFFORT | ACTION | BP |
|---|---|---|---|---|---|---|---|---|---|---|
| F5-001 | ~~RETRACTADO~~ | CORRUPTED-CLASS (falso positivo) | verificación byte-level (grep -c + hexdump): `dark:border-[hsl(var(--primary))]/30` VÁLIDO en SidePanel y Calculator | — | — | — | — | RETIRADO | — |
| F5-002 | ui/Building3D.tsx; ui/PWAInstallModal.tsx | DEAD-CODE | 0 imports (verificado rg) | eliminados | P2 | ninguno (muertos) | nulo | 2min | eliminar | A |
| F5-003 | ui/CostProLoader.tsx:63-88 | DEBUG-LOGS | 7 × console.log('[DIAG]…') en path de producción | sin logs de diagnóstico | P2 | consola sucia en prod | nulo | 2min | eliminar | A |
| F5-004 | pick3/Pick3OnboardingWizard.tsx:171; ipv/mvt/TemplateEditor.tsx:303 | COLOR-DRIFT | `bg-success hover:bg-emerald-700` (híbrido token→paleta) | `hover:bg-success/90` | P1 | hover cambia de familia de verde | bajo | 2min | consolidar | A |
| F5-005 | WhatsAppDashboardView:276; WhatsAppConfigView:153; WhatsAppAutoPublishSection:576; UpgradeModal:55; ExchangeIntelligenceView:642,2685 | COLOR-DRIFT | acción primaria con `bg-green-600`/`bg-emerald-600` | relleno `--primary` (variant default) | P1 | 4 sistemas de verde compiten en acción primaria | bajo | 10min | consolidar | B |
| F5-006 | dashboard/StoreDashboardView (×9 gradientes); MultiStoreDashboardView:194; multi-store/StoreKPICard:149 | DECORATION+VOICE | CTAs `bg-gradient-to-r from-primary…` + `font-black uppercase tracking-widest` | `bg-primary` sólido + voz media | P2 | CTAs gritan y compiten con KPIs | medio (área visible) | 20min | sosegar | B |
| F5-007 | ipv/IPVView.tsx:404 | DECORATION | h1 con texto degradado (bg-clip-text) | texto sólido `foreground` | P2 | efecto sin función en vista operacional | bajo | 2min | retirar | B |
| F5-008 | health/tabs/KnowledgeTab.tsx:140,176,179,276-281 | TYPOGRAPHY-FLOOR | `text-[7px]` (+ `/50` doble mutado en th) | `text-[10px]`, un solo muted, peso medium/semibold | P1 | ilegible (7px, ~50% contraste) | bajo | 8min | subir piso | B |
| F5-009 | TelegramConfigView:1028,978 ≡ WhatsAppAutoPublishSection:612,557 | STATUS-GRAMMAR | ternarios copy-paste `bg-emerald-100/red-100/amber-100` idénticos ×2 vistas | gramática canónica token `/10` | P1 | mismo estado, 2 gramáticas | bajo | 10min | alinear | B |
| F5-010 | ui/CyberShell.tsx (dots, sweep, borde cónico) + modes.css | DECORATION-UNGATED | capas puramente decorativas activas incluso en reduced-motion/performance | ocultas en `.mode-performance` (convención perf-hide existente) | P2 | reduced-motion aún ve animaciones | bajo | 10min | gate | B |
| F5-011 | HomePageClient:119 (CyberShell→TerminalShell) | ARCHITECTURE-DECOR | chrome cyber por defecto en toda la app operacional | identidad sobria con cyber opt-in | D | identidad global de la app | alto | — | DECISIÓN PRODUCTO | D |
| F5-012 | ParticleBackground (watermark COSTPRO, mesh orbs en ops) | DECORATION-UNGATED | branding gigante detrás de datos (enhanced) | sin UI para opt-out (mode-performance existe pero sin toggle) | D | ruido tras datos | medio | — | DECISIÓN PRODUCTO | D |
| F5-013 | IntelligentThemeHandler (default enhanced, override sin UI) | DECORATION-DEFAULT | decoración por defecto, sin opt-in accesible | toggle en Ajustes y/o default sobrio | D | — | — | — | DECISIÓN PRODUCTO | D |
| F5-014 | 719 clases green/emerald + 396 hex arbitrarios (90% landing/auth) | COLOR-DRIFT-MASA | paleta Tailwind + hex compitiendo con tokens | migración a tokens | P2 | coherencia | alto | días | NO-GO → codemod futuro | C |
| F5-015 | 2.708 text-[Npx] (65% <10px); 4.265 font-black; 4.308 uppercase; 2.290 tracking-widest | TYPOGRAPHY-MASA | "loud label" de facto; roles cp-* muertos (2/2/4 usos) | roles tipográficos adoptados | P1 estructural | voz cyber en operacional | alto | días | NO-GO → migración explícita futura | C |
| F5-016 | rounded-3xl ×130 sin token; rounded-[…] ×198 | RADIUS | 3er nivel de radius sin token | consolidar a escala con token | P2 | inconsistencia sutil | medio | — | C | C |
| F5-017 | shadow-2xl/xl en cards estáticas; shadow-[#22c55e] ×14; glows 40–120px modes.css | SHADOW | elevación usada como decoración | shadow solo overlays/FABs | P2 | ruido | medio | — | C (parcial D por modes.css enhanced) | C |
| F5-018 | badge.tsx sin success/warning; 33 bg-*-100; 181 emojis status; 3 gramáticas | STATUS-GRAMMAR-MASA | sin consolidación posible sin migración | Badge semántico + migración | P1 estructural | gramática irreconocible | alto | — | C | C |
| F5-019 | 88/95 icon-buttons sin aria-label | A11Y | sin nombre accesible | aria-labels | P1 a11y | lectores de pantalla | bajo-médio | horas | C (inventario incluido) | C |
| F5-020 | GraphViewer text-[5px]/[6px] | TYPOGRAPHY-FLOOR | labels de grafo ilegibles | ≥9px | P2 | lectura de grafo | medio (layout SVG) | — | C | C |
| F5-021 | WalletView FAB/CR-DR emerald/red; POS HISTORIAL azul; meta theme-color #16a34a; paletas charts | EXCEPTIONS | semántica/tecnología propia | mantener | — | — | — | — | DOC (intentional) | C |
| F5-022 | ci.yml branches corrupto `ain, master, develop]` | CI-CONFIG | filtro de ramas corrupto | `[main, master, develop]` | P2 (CI) | fuera de alcance UI | — | — | E (no-F5, CI) | E |

## Resumen

```text
P0: 0  (ningún hallazgo bloquea comprensión/operación)
P1: 12 (F5-001a..e, 004, 005, 008, 009 + estructurales 015/018/019)
P2: 9  (F5-002, 003, 006, 007, 010, 014, 016, 017, 020, 022)
P3: 0
Documentation: F5-021 + notes
```

**RETRACTACIÓN DE F5-001 (honestidad de evidencia)**: el hallazgo de "utilidades corruptas
`sl(var…)]`" fue un FALSO POSITIVO doble: (1) el patrón de búsqueda `sl(var` matcheaba el
sufijo de `hsl(var`; (2) un artefacto del pipeline de salida del tool mostraba `[h` comido
en los resultados de sed/rg. La verificación autoritativa (Read directo + `grep -c` +
hexdump de bytes) confirma que CostSheetCalculator y CostSheetSidePanel contienen clases
VÁLIDAS (`dark:border-[hsl(var(--primary))]/30` etc.). Ningún código corrupto existe.
Lo ÚNICO que se implementa de este ítem: retiro del glow decorativo neon del display de
CostSheetCalculator (decoración sin función, P3), ya aplicado y verificable en git diff.
