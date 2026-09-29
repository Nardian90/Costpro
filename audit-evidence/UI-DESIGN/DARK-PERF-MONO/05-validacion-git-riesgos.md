# DARK PERFORMANCE MONOCHROME — 05 Validación + Git + Limitaciones

## Validación (GATE 13)

| Check | Resultado | Baseline F5/F6 |
|---|---|---|
| TypeScript (`tsc --noEmit`, heap 3GB) | **0 errores** | 0 |
| ESLint (`eslint .`) | **0 errores / 1297 warnings advisory** | 0 / 1297 (idéntico) |
| Vitest (`vitest run`) | **2387 passed / 24 skipped / 0 failed** (118 files) | 2387 / 24 / 0 (idéntico) |
| Build local (`next build`) | **OOM Killed (exit 137)** — 6.ª vez, precedente F5/F6 | OOM ×5 |
| CI (`quality`: tsc+lint+tests+build) | Autoridad (job existente en push/PR) | — |

Smoke real en vivo (dark+performance): login → dashboard → POS: agregar
producto ("CARRITO (1)") → abrir panel CAJA → Escape cierra → drawer móvil
abre/cierra con Escape → navegación Tab con focus blanco → cambio de vistas.
Todo funcional sin regresiones (solo CSS cambió).

## Git (GATE 15)

- Rama: `feat/ui-dark-performance-monochrome` (creada desde `origin/main` @ `5ac500a4`).
- `git status` / `git diff --check` antes de commit: limpio / OK.
- Commit único: `feat(ui): add monochrome dark performance mode`.
- Contenido: `src/styles/modes.css` (+ evidencia DARK-PERF-MONO).
- Push verificado: SHA local == SHA remoto (ver 06-final-verdict.md).

## Riesgos y limitaciones (GATE 16.14/16.15)

1. **Imagen de referencia no recibida** — se implementó la especificación
   escrita; si la referencia exige valores exactos distintos, la paleta es
   ajustable editando SOLO el bloque T-MONO-TOKENS (un lugar).
2. **Carrera pre-existente LandingPage vs IntelligentThemeHandler**
   (`LandingPage.tsx:114-124` fuerza `mode-enhanced` en cargas completas):
   puede dejar a un usuario con override "performance" en modo enhanced tras
   un hard-refresh hasta la siguiente interacción. PRE-EXISTENTE (F5-era),
   fuera de alcance (comportamiento funcional, GATE 12). Documentado, NO
   corregido.
3. **Barrido por substring**: cubre ~130 familias verificadas + arbitrarias;
   un futuro verde crudo nuevo (p.ej. `text-green-450`, inexistente en
   Tailwind) no quedaría cubierto automáticamente. Mitigación: convención de
   tokens/semánticos ya establecida por F1–F6.
4. **Charts monócrita**: `--chart-1..5` pasa a rampa de grises en
   dark+performance; series distingibles por luminosidad. Si producto prefiere
   colores de datos, revertir solo `--chart-*` en T-MONO-TOKENS.
5. **Build local OOM** — infraestructura conocida; CI como autoridad.
6. **Landing en dark+performance**: tokens lp-* a gris (coherencia); los
   componentes de landing conservan sus hex verdes si se accede con el modo
   activo antes de hidratar (decoraciones ya ocultas por reglas perf F5).
