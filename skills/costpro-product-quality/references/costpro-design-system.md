# CostPro Design System — Referencia real del producto

Documento de referencia generado por CP-AGENT-FOUNDATION-001 (2026-11-21) a partir del código real en `main` @ `281d1df`. Describe el sistema visual EXISTENTE: el objetivo es normalizar y mejorar, no reemplazar la identidad aprobada. Fuente única de verdad de los valores: `src/styles/tokens.css` (importado por `src/app/globals.css`); si este documento y el código divergen, gana el código y se actualiza este documento.

## 1. Arquitectura de estilos

| Capa | Archivo | Rol |
|---|---|---|
| Tokens (SSoT) | `src/styles/tokens.css` | 382 líneas; primitivos + temas light/dark, hex/rgba |
| Base | `src/styles/base.css` | reset, h1–h6 sobre escala tipográfica |
| Componentes | `src/styles/components.css` | clases `cp-*` (tipografía semántica) |
| Landing | `src/styles/landing.css` + `landing-shield.css` | branding dark propio del landing (`#landing-root`) |
| Modos | `src/styles/modes.css` | `.mode-performance` / `.mode-enhanced` / `[data-connectivity="3g"]` |
| Accesibilidad senior | `src/styles/elderly-tokens.css` | `.text-elderly-*` |
| Hardening móvil | `src/app/fc-mobile-hardening.css`, `mobile-ipv-hardening.css`, `pick3-mobile.css` | ≤375px/≤420px: touch targets 44px, scroll-x contenido, grids a 1 columna |

El mapeo token→utility se hace con `@theme inline` en `globals.css` (Tailwind 4). **Nota**: `tailwind.config.ts` heredado usa `hsl(var(--primary))` pero los tokens son hex — el sistema activo es `@theme inline`; el `.ts` es legacy. Animación CSS via `tw-animate-css` (`tailwindcss-animate` está en package.json pero NO se importa: no uses su sintaxis `animate-in` de tailwindcss-animate).

## 2. Temas y modos

Dimensiones: Tema (**light / dark**) × Modo (**performance / enhanced**). Dark es el tema principal del producto. `darkMode: "class"`; el landing usa `#landing-root` con dark forzado (`@custom-variant dark`).

- `.mode-performance`: sin animaciones ni transiciones (`0.01ms`), `backdrop-filter: none`, fondos sólidos (dark `#121212`, sidebar `#0a0a0a`). Se activa manual o por `prefers-reduced-motion`.
- `prefers-reduced-motion` reduce animaciones en CUALQUIER tema (excluyendo el landing).
- `[data-connectivity="3g"]` desactiva animación por conexión lenta.

## 3. Color — tokens por tema (valores reales)

### Light (`:root, .theme-light`)
| Token | Valor | Semántica |
|---|---|---|
| `--background` | `#f8fafc` | fondo app |
| `--foreground` | `#0f172a` | texto principal |
| `--card` | `#ffffff` | superficies de tarjeta |
| `--muted` / `--muted-foreground` | `#f1f5f9` / `#475569` | texto secundario |
| `--border` / `--input` | `#e2e8f0` / `#cbd5e1` | bordes / inputs |
| `--ring` / `--selection` | `rgba(21,128,61,.4)` / `rgba(21,128,61,.15)` | foco y selección (verde primario) |
| `--primary` (+fg) | `#15803d` / `#ffffff` | primario interactivo ÚNICO (FIX F2/UI-010: no segundo verde) |
| `--secondary` (+fg) | `#475569` / `#ffffff` | secundario neutro |
| `--success` / `-light` | `#047857` (5.24:1 AA) / `#34d399` | estados positivos |
| `--warning` / `-light` | `#b45309` / `#fbbf24` | advertencias |
| `--danger` / `--destructive` | `#dc2626` / `#dc2626` | error/destructivo |
| `--info` | `#3b82f6` | informativo |
| `--accent` (+fg) | `#f0fdf4` / `#166534` | acento verde sutil |
| `--brand` (+familia) | `#128209`, hover `#0e6b07`, muted `#3f6c1a`, subtle `rgba(57,255,20,.1)`, border `rgba(18,130,9,.35)`, fg `#ffffff` | identidad F2 (histórico `#39FF14` oscurecido para light) |
| Charts 1–6 | `#15803d` `#0369a1` `#b45309` `#7c3aed` `#be185d` `#0f766e` | series; grid `#cbd5e1`, axis `#475569` |
| Sidebar | `#f1f5f9` bg, `#15803d` primary, accent `#e2e8f0`, border `#e8ecf1` | barra lateral |
| Escala grises | Zinc `--color-gray-50..950` (`#fafafa`→`#09090b`) | primitivos |
| Escala marca | `--brand-green-50..900` (`#f0fdf4`→`#14532d`) | primitivos |

### Dark (`.dark, .theme-dark`) — "Zed-style dark gray"
| Token | Valor | Semántica |
|---|---|---|
| `--background` / `--foreground` | `#121212` / `#e4e4e7` | fondo / texto |
| `--card` / `--popover` | `#1a1a1a` | superficies |
| `--muted` / `--muted-foreground` | `#1e1e1e` / `#b4b4bc` | secundario |
| `--border` / `--input` | `#2a2a2a` | bordes/inputs |
| `--primary` (+fg) | `#22c55e` / `#052e16` | primario interactivo ÚNICO |
| `--secondary` | `#71717a` / `#fafafa` | secundario |
| `--success` / `-light` | `#34d399` / `#6ee7b7` | positivo |
| `--warning` / `-light` | `#fbbf24` / `#fcd34d` | advertencia |
| `--danger` / `--destructive` | `#f87171` / `#ef4444` | error |
| `--brand` (+familia) | `#39ff14` (AAA sobre dark), hover `#2fd60f`, muted `#86ef3c`, subtle `rgba(57,255,20,.08)`, border `rgba(57,255,20,.35)`, fg `#052e16` | identidad de marca |
| Charts 1–6 | `#2dd4bf` `#38bdf8` `#fbbf24` `#a78bfa` `#f472b6` `#86efac` | series dark; tooltip `#1e1e1e` |
| Sidebar | `#0a0a0a` bg (capa más oscura), `#d4d4d8` fg, `#22c55e` primary | barra lateral |
| `--background-solid` | `#121212` | base modo performance |

**Landing** (`.landing-tokens`): bg `#000000`, accent `#22c55e`, glow `rgba(34,197,94,.4)`, gradientes `#15803d→#4ade80`. Usar solo dentro del landing.

## 4. Tipografía

6 familias via `next/font/google` en `src/app/layout.tsx` (`display: 'swap'`):

| Rol | Variable | Familia | Uso |
|---|---|---|---|
| `--font-sans` | `--font-geist-sans` | Geist | UI por defecto |
| `--font-mono` | `--font-geist-mono` | Geist Mono | importes monoespaciados, código |
| `--font-headline` / `--font-body` | `--font-inter` | Inter | títulos y cuerpo |
| `--font-label` | `--font-space-grotesk` | Space Grotesk | labels/etiquetas |
| `--font-display` | `--font-archivo` (wdth 125) | Archivo | SOLO hero del landing |
| `--font-editorial` | `--font-instrument` | Instrument Serif italic | UNA palabra de acento en landing |

Escala primitiva `--text-xs..6xl` (0.75→3.75rem). Clases semánticas `cp-*` (`src/styles/components.css` ~L659-721) — **la voz por defecto ya no es `font-black/uppercase/tracking-widest`** (decisión F2):

- `.cp-page-title` — título de página (lg→xl ≥640px, weight 600, tracking tight) — usar con `PageHeader`
- `.cp-page-description` — sm, muted
- `.cp-section-title` — base/600
- `.cp-kpi-value` — xl/700 + `tabular-nums` (KPIs e importes)
- `.cp-label` — xs/500 · `.cp-caption` — xs/400
- `.cp-metadata` — 10px/500 **uppercase** 0.05em — ÚNICO lugar del sistema donde vive uppercase (junto a nav compacta)

## 5. Espaciado, radios, sombras, capas, duraciones

- **Espaciado**: `--space-0..24` (0→6rem, escala consistente).
- **Radios**: primitivos `--radius-sm..full` (0.25→1.5rem + 9999px); tema `--radius: var(--radius-lg)` (0.75rem) y derivados `--radius-md` (−2px), `--radius-sm` (−4px), `--radius-xl` (+4px). Botones shadcn usan `rounded-xl`.
- **Sombras**: `--shadow-xs..xl` (rgba negra) + neumórficas `--neu-shadow-out/in/out-sm/in-sm/hover` (intensificadas en dark 0.2–0.5).
- **Z-index**: escala `--z-base..--z-splash` (0→9999); modal 50, toast 70, tooltip 80; `LoadingOverlay` usa `z-[100]`. No inventes z-index fuera de escala.
- **Duraciones**: `--duration-instant..slower` (0/75/150/300/500ms); easing `--ease-spring: cubic-bezier(0.34,1.56,0.64,1)`. Animar SOLO `transform`/`opacity` con Framer Motion; respetar reduced-motion (ya cubierto por modos).

## 6. Componentes canónicos

Los componentes de `src/components/ui/` (103 archivos) son la capa canónica. Principales y su contrato:

- **`BaseModal.tsx`** — modal estándar (~90 usos). Mobile-first (top-4 en móvil, centrado ≥sm), `maxWidth` configurable, header/footer sticky, focus trap (`useFocusTrap`). Cualquier modal nuevo lo usa; no envuelvas `Dialog` crudo.
- **`PageHeader.tsx`** — jerarquía de página: TITLE → DESCRIPTION → PRIMARY ACTION → SECONDARY ACTIONS. Props `title, description, icon, iconVariant ('brand'|'neutral'), badge, context, primaryAction, secondaryActions, headingLevel`. Sin lógica de negocio.
- **`button.tsx`** — touch-first: `default h-11`, `sm h-11 md:h-9` (44px móvil), `lg h-12`, `icon size-11`; variantes default/destructive/outline/secondary/ghost/link; `rounded-xl text-xs font-medium`. NO botones raw.
- **`StateRenderer.tsx`** — estados declarativos: `isLoading/error/data/empty` + `onRetry`. Loading por defecto `ViewLoadingSplash`; error panel destructivo con Reintentar; empty panel muted. Usarlo en vistas de datos; loading inline con `Skeleton` shadcn cuando proceda.
- **`ResponsiveTable.tsx`** — columnas con `priority: high|medium|low`; móvil <768px muestra high + Sheet de detalle. (Solo 2 usos — evaluar adopción, no duplicar su lógica en vistas nuevas sin razón.)
- **`ElderlyTable.tsx`** — variante accesibilidad senior (`elderly-tokens.css`), API compatible. **Coexiste con ResponsiveTable por responsabilidad funcional distinta: no fusionar.**
- **`DestructiveConfirmModal.tsx`** — confirmación destructiva escribiendo el nombre de la entidad (`confirmName`). Reemplaza `confirm()` nativo.
- **`CostProLoader.tsx`** — splash de marca; timings: primera visita 650ms, retorno 250ms, fade 200ms; respeta reduced-motion.
- **`atomic/index.tsx`** — `ProductImage`, `IconButton` (Tooltip + `aria-label` obligatorio), `SearchInput`, `ProductCard` (jerarquía de badges: Margen Negativo > Inactivo > Incompleto > Stock). Sus `PrimaryButton`/`SecondaryButton` raw son DEUDA: preferir `button.tsx`.
- **Navegación terminal** (`src/components/views/terminal/`): `Header.tsx` (pinta h1, ThemeToggle, StoreSelectorSheet, NotificationCenter), `Sidebar.tsx` (estructura desde `@/config/navigation/sidebar.structure`, focus mode, monograma ADN), `MobileTabBar.tsx` (tab bar inferior <768px desde `@/config/navigation/mobile-sheet.ts`, `min-h-[44px]`, `env(safe-area-inset-bottom)`).
- **Estados de sincronización/operación**: `SyncStatusBadge`, `StoreStatusChip`, `DocumentStatusBadge`, `FCStatusBadge`, `OfflineConflictResolver`, `OnlineStatusDot` (shared).
- **Toasts**: `sonner` (Toaster en layout raíz). El par shadcn `toast/toaster` es legacy.

## 7. Estados y feedback

- **Carga**: `CostProLoader` (raíz) → `ViewLoadingSplash` (vista) → `Skeleton`/`LoadingOverlay` (parcial).
- **Vacío**: panel con mensaje + acción siguiente (nunca silencio en blanco).
- **Error**: panel destructivo con botón Reintentar (fallback reload); API → `createApiError` (`@/lib/api-errors`); boundaries: `ErrorBoundary`, `ChunkErrorBoundary`, `StorefrontErrorBoundary`.
- **Toasts** sonner para resultado de acciones; `aria-live` inherente del componente.
- **Offline**: Dexie + `OnlineStatusDot` + `SyncStatusBadge`; conflictos con `OfflineConflictResolver`.

## 8. Responsive y móvil

- **Touch targets ≥44×44px** (botones ya lo garantizan; chips e iconos lo refuerzan en hardening CSS).
- **Safe areas**: `env(safe-area-inset-bottom)` en MobileTabBar, Header, POS (`StickyCartSummary`, `POSCart`), StoreDashboard, Telegram, landing.
- **Global** (`globals.css`): `scroll-padding-top: 100px` (header fijo), `-webkit-tap-highlight-color: transparent`, `overscroll-behavior-y: none`, sin selección de texto en botones.
- **Breakpoints duros**: ≤375px (FC), ≤420px (IPv) — grid 1 columna, scroll-x contenido; tabs con `flex-nowrap overflow-x-auto` + scroll táctil.
- **No scroll horizontal de página**: tablas anchas dentro de contenedores con overflow propio (`HorizontalScroll`, `SecurityScrollContainer`).
- Auditoría programática existente: `e2e/mobile-viewport-audit.spec.ts` (4 viewports: 375×667, 390×844, 360×800, 768×1024; valida PWA meta, safe-areas, scroll-x, targets ≥44px).

## 9. i18n

`next-intl`: `src/messages/es.json` (~1062 claves) + `en.json`; `useTranslations` en ~125 archivos. **La adopción es parcial** (UI base y algunas vistas hardcodean español). Regla para código nuevo: texto de usuario SIEMPRE vía `t()`; si la vista vecina aún no migra, no empeores — usa i18n en lo que toques. Fechas/moneda con `Intl.DateTimeFormat`/`Intl.NumberFormat` según locale activo.

## 10. Iconografía y animación

- Iconos: `lucide-react` importación nombrada directa; único icono custom: monograma `AdnMonograma` (`@/components/brand/AdnBrand`).
- Animación: **Framer Motion** (negocio: Sidebar, PageHeader, LoadingOverlay — `useReducedMotion` cuando aplique); `tw-animate-css` (CSS); GSAP SOLO landing (`CinemaStage`). `@react-three/fiber` SOLO landing (Triangle3D/ParticleBackground). No introducir GSAP/three en vistas de negocio.

## 11. Lista de vigilancia (inconsistencias conocidas — origen común)

Hallazgos sistémicos registrados por CP-AGENT-Foundation-001; corregir en el origen cuando se toque la zona (no parchar vista a vista):

1. **Dos ViewSwitcher** (`ui/ViewSwitcher.tsx` radiogroup vs `atomic` icon-only `aria-pressed`).
2. **Botones paralelos** en atomic sin cva; `IconButton` variante 'primary' usa `text-foreground` (contraste débil sobre bg-primary; FIX-A11Y-CONTRAST solo cubrió `PrimaryButton`).
3. **Hardcodes de color fuera de tokens**: `PageHeader.badgeVariantMap` (emerald-500/amber-500/red-500), `atomic/ProductCard` (`bg-red-600`, `bg-gray-800`, `border-white/5` — este último decisión consciente documentada: `--danger` dark no transmite urgencia).
4. **Tres soluciones de tabla** coexistiendo (shadcn `table.tsx`, ResponsiveTable 2 usos, ElderlyTable 2 usos); la convención de facto son tablas por vista.
5. **StateRenderer no universal** (22 de ~57 vistas) — falta cobertura de estados en varias vistas.
6. **i18n parcial** (español hardcodeado en UI base/POS).
7. **`tailwindcss-animate` sin usar** (dependencia duplicada de `tw-animate-css`).
8. **Marca dividida**: tokens dicen COSTPRO, metadata del producto dice ADNegocio — decisión de marca pendiente; usar "CostPro" en docs y ADN en monograma hasta decisión.
9. Artefacto de backup `src/app/layout.tsx.bak.1782273355` en el árbol (limpiar en misión de limpieza, no urgente).

## 12. Reglas de oro

1. Antes de crear un componente, busca su equivalente canónico en `src/components/ui/` y en la vista hermana.
2. Color SIEMPRE por token semántico (`bg-primary`, `text-muted-foreground`, `text-brand`...) — hex crudo prohibido salvo decisión documentada.
3. Numeric siempre con `tabular-nums` y `Intl`; nunca `toFixed` para presentación monetaria si existe helper del proyecto.
4. Todo modal → `BaseModal`; toda confirmación destructiva → `DestructiveConfirmModal`; toda página con acción primaria → `PageHeader`.
5. Contraste AA verificado en light Y dark; foco visible siempre (anillos existentes).
6. Texto de usuario vía i18n; icon-only button siempre con `aria-label`.
7. No añadir dependencias de UI nuevas sin decisión explícita del propietario.
