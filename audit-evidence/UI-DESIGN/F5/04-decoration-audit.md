# F5 — 04 DECORATION / CYBER AUDIT (A5)

Fecha: 2026-09-29 · Principio del mandato: "La identidad CostPro puede existir sin que cada
pantalla parezca una landing futurista. Los efectos decorativos deben ser opt-in, no predeterminados."

## 1. Inventario de componentes decorativos

| Componente | Qué hace | Dónde monta | Clasificación |
|---|---|---|---|
| `CyberShell.tsx` | Dot grid + perspectiva + tinte + glow radial + **borde cónico animado** + glass panel (backdrop-blur-2xl) + **cyber-sweep** + **4 dots pulsantes en esquinas** | **HomePageClient:119 envuelve TODO TerminalShell (app operacional)** | NOISE en ops (BRAND en landing) — D |
| `ParticleBackground.tsx` | Mesh orbs + canvas + **watermark gigante "COSTPRO"** (bg-costpro-branding) + tips de fondo | TerminalShell (chrome ops); **ya oculto en .mode-performance** | NOISE en ops — D (mecanismo de exclusión ya existe) |
| `ViewLoadingSplash.tsx` | Shimmer text-clip, logo "CP" pulsante, anillo SVG rotante, tips rotativos | Carga de TODAS las vistas (StateRenderer→loading) + app/loading | BRAND funcional (loading) pero el más decorado del sistema — C |
| `CostProLoader.tsx` | Splash fases (línea→logo→hold) + mini-loader | HomePageClient splash + 12 embeds operacionales | BRAND en splash ok; **7 × console.log('[DIAG]…') en producción = FIX** |
| `Building3D.tsx` (ui/) | CSS-3D building animado | **MUERTO — 0 imports** (landing usa Building3DCanvas propio) | **RETIRAR** |
| `PWAInstallModal.tsx` | Modal instalación PWA con glows | **MUERTO — 0 imports** | **RETIRAR** |
| `DataDecryption.tsx` | Spinner "DECRYPTING DATA" cyan | Solo landing Modals (Suspense) | BRAND landing — DOC-ONLY |

## 2. Patrones en superficies operacionales

| Patrón | Total src | En ops (views/) | Lectura |
|---|---|---|---|
| `animate-pulse` | 125/79f | **77/53f** | ~ mitad son skeletons legítimos; resto: labels "live", dots, Sparkles (DarianEditor), badges — ruido moderado |
| `animate-spin` | 261/132f | 232/114f | loaders funcionales — NO tocar |
| `backdrop-blur` | 230/129f | 161/98f | overlays de modals hand-rolled (Wallet, CashReport, Customers…) — funcional |
| `bg-gradient-to` | 167/73f | **83/44f** | CTAs con gradiente en ops (StoreDashboard ×9, MultiStore, SectionHub, Settings, Exchange ×9, Help ×6) — ruido |
| `glow` | 112/20f | 29/5f | GraphViewer 22 (observabilidad SVG — funcional), Header:327 (ya gated perf-hide-gradient) |
| `text-transparent`+`bg-clip-text` | 5/5f | **1: IPVView:404** | h1 con texto degradado en vista operacional — B (retirar) |
| `bg-[radial/conic` | 3 | 1 (CostSheetCalculator dot-grid) | funcional-decorativo menor |

## 3. El interruptor existe pero nadie puede usarlo

- `tokens.css` declara "Theme (light/dark) × Mode (performance/enhanced)".
- `IntelligentThemeHandler`: default = **enhanced** para usuarios nuevos; respeta
  prefers-reduced-motion → performance; lee override manual pero **NINGUNA UI escribe
  el override** (MANUAL_OVERRIDE_KEY solo se lee; 0 setters en src/).
- Conclusión: la decoración NO es opt-in hoy — es default y sin opt-in accesible.
- Flipping el default sin UI de opt-in = decoración forzada-off (peor que ambos extremos)
  y una decisión de identidad → **D (PRODUCT DECISION)**, con recomendación registrada:
  (a) añadir toggle en Ajustes reutilizando el handler existente, o (b) flip default +
  toggle, en fase posterior explícitamente autorizada.
- Lo que SÍ entra en F5-D: extender la convención `perf-hide-*` existente a las capas
  puramente decorativas de CyberShell (dots esquina, sweep, borde cónico) para que
  reduced-motion/performance reciban chrome sobrio — alineado con el precedente del
  Header (perf-hide-gradient) y sin cambiar nada para usuarios enhanced.

## 4. Veredicto

| Categoría | Ítems |
|---|---|
| FUNCTIONAL | animate-spin loaders, backdrop-blur overlays, skeletons pulse |
| BRAND | landing completa, splash, ViewLoadingSplash, DataDecryption, storefront |
| NOISE (D) | CyberShell en ops, ParticleBackground watermark en ops (gated), CTAs gradiente masivos |
| **NOISE (fix F5-D)** | IPVView gradiente-text, CostSheetCalculator glow del display, [DIAG] logs, muertos Building3D/PWAInstallModal, capas CyberShell sin exclusión reduced-motion |
