# DARK PERFORMANCE MONOCHROME — 02 Arquitectura + 03 Archivos + 04 Paleta

## Arquitectura utilizada (GATE 4)

Solución CENTRALIZADA en un único archivo (`src/styles/modes.css`), reutilizando
el selector raíz existente `.mode-performance` (colocado en `<html>` por
IntelligentThemeHandler junto a `.dark`):

```
Theme dark (.dark en <html>)
        ↓
Mode performance (.mode-performance en <html>)
        ↓
.mode-performance.dark  →  CAPA DE TOKENS (redefine vars cromáticas)
        ↓
@theme inline (globals.css) → utilidades Tailwind existentes
        ↓
COMPONENTES EXISTENTES heredan la estética (0 componentes modificados)
```

Tres sub-capas, todas scopeadas a `.mode-performance.dark` (Light+Performance
intacto por construcción):

1. **T-MONO-TOKENS** — redefine `--primary`, `--brand*`, `--ring`, `--selection`,
   `--chart-1..5`, `--sidebar-primary*`, `--sidebar-ring` + tokens `--lp-*` de
   landing. NO toca superficies neutras (ya grayscale) NI semánticos.
2. **T-MONO-INTERNAL/SVG** — overrides de verdes dentro de reglas perf
   existentes (glass-card::before), stops del logo, y barrido de presentation
   attributes SVG (`[fill="#22c55e"]` etc.). `#15803d` excluido (funcional).
3. **T-MONO-SWEEP** — barrido enumerado (desde auditoría) de utilidades crudas
   green/emerald/lime por tier de luminosidad, con orden sensible (shade "50"
   antes que "500" por substring; tintes con slash después de sólidos).

## Archivos modificados (GATE 16.4)

| Archivo | Cambio |
|---|---|
| `src/styles/modes.css` | +772 líneas (único archivo de la aplicación) |

Cero cambios en: TSX/TS, Supabase, RLS, APIs, auth, Zustand, TanStack Query,
Dexie, POS logic, tests, CI, E2E.

## Paleta final (GATE 5 / GATE 16.5)

### Tokens monocromos (solo Dark+Performance)

| Token | Antes (dark) | Después | Rol |
|---|---|---|---|
| `--primary` | #22c55e | **#e4e4e7** | acción primaria (botón blanco técnico) |
| `--primary-foreground` | #052e16 | **#0a0a0a** | texto sobre primario |
| `--primary-light` | #4ade80 | **#f4f4f5** | highlight |
| `--primary-dark` | #16a34a | **#a1a1aa** | hover primario |
| `--brand` | #39ff14 | **#fafafa** | marca |
| `--brand-hover` | #2fd60f | **#e4e4e7** | marca hover |
| `--brand-muted` | #86ef3c | **#a1a1aa** | marca tenue |
| `--brand-subtle` | rgba(57,255,20,.08) | **rgba(255,255,255,.08)** | fondo marca |
| `--brand-border` | rgba(57,255,20,.35) | **rgba(255,255,255,.32)** | borde marca |
| `--brand-foreground` | #052e16 | **#0a0a0a** | texto sobre marca |
| `--ring` | rgba(34,197,94,.4) | **rgba(255,255,255,.55)** | focus (mejora) |
| `--selection` | rgba(34,197,94,.2) | **rgba(255,255,255,.22)** | selección |
| `--chart-1..5` | verdes/rosa/ámbar/sky | **#e4e4e7/#a1a1aa/#71717a/#52525b/#3f3f46** | rampa data-viz |
| `--sidebar-primary` | #22c55e | **#e4e4e7** | sidebar activo |
| `--sidebar-primary-foreground` | #052e16 | **#0a0a0a** | texto activo sidebar |
| `--sidebar-ring` | rgba(34,197,94,.3) | **rgba(255,255,255,.35)** | focus sidebar |
| `--lp-accent/glow/subtle/border-hover/gradient-*/shadow-glow` | verdes | **grises/blancos** | landing |

### Superficies (SIN cambio — ya neutras, evita negro puro duro)

`--sidebar #0a0a0a` · `--background #121212` · `--card #1a1a1a` ·
`--muted #1e1e1e` · `--border #2a2a2a` · borde-strong del barrido `#3f3f46` ·
texto `#e4e4e7` · muted `#b4b4bc` · secundario `#d4d4d8`.

### Semántica preservada (sin cambio)

`--success #34d399` · `--warning #fbbf24` · `--danger #f87171` ·
`--destructive #ef4444` + todo cromatismo no-verde (ámbar/rojo/azul).
