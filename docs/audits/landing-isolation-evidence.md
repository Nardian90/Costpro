# Evidencia — Blindaje Total del Landing Page (TEST 1–8)

**Fecha:** 2026-10-06 · **Branch:** `fix/landing-aislamiento-total` · **Suite:** `e2e/landing-shield/landing_shield_tests.py` (Playwright + Chromium)

## Resultado global

```
RESULTADO: 211/211 checks OK — ✅ BLINDAJE VERIFICADO
```

## Matriz ejecutada

| TEST | Escenario | `<html>` resultante | Landing |
|---|---|---|---|
| 1 | Baseline (defaults del sistema) | `dark` + `mode-performance` | ✅ idéntico |
| 2 | Theme → light | `light` + `mode-performance` | ✅ idéntico |
| 3 | Performance activado | `dark` + `mode-performance` | ✅ idéntico |
| 4 | Enhanced activado | `dark` + `mode-enhanced` | ✅ idéntico |
| 5 | light + Performance (combinado) | `light` + `mode-performance` | ✅ idéntico |
| 6 | Todo desactivado | `dark` + `mode-performance` | ✅ idéntico |
| 7 | Recarga de página | `dark` + `mode-performance` | ✅ idéntico |
| 8 | Navegación `/privacy` + regreso | `light` + `mode-performance` (en ambas rutas) | ✅ idéntico |

## Invariantes del landing (idénticos en los 8 escenarios)

| Invariante | Valor |
|---|---|
| Fondo de `#landing-root` | `rgb(2, 6, 23)` (#020617, marca) |
| `color-scheme` | `dark` |
| `--foreground` | `#e4e4e7` (aunque html esté en light) |
| `--muted` | `#1e1e1e` |
| `--primary` | `#22c55e` |
| `--brand` | `#39ff14` |
| `--lp-bg` | `#000000` |
| Glassmorphism (`backdrop-blur`) | vivo (blur activo, nunca `none`) |
| Animaciones CSS | vivas (`animation-name ≠ none`) |
| Canvas del landing | montado (`display ≠ none`) |

## Prueba de doble vía (app interna conserva Performance)

En TEST 3 se inyectan probes `.glass-card backdrop-blur-md` y `.animate-float` en `body`
(fuera del landing):

| Estado | backdrop-filter | animation-name |
|---|---|---|
| Con landing montado (reglas desarmadas) | `blur(12px)` | `float` |
| Sin landing (tras retirar `#landing-root`, reglas re-armadas) | `none` | `none` |
| Mundo-app real (`/privacy`, sin landing) | `none` | `none` |

→ El Modo Performance sigue funcionando al 100 % en la aplicación interna.

## Capturas

Comparación píxel a píxel contra el baseline (canvas ocultado uniformemente
en todos los escenarios para eliminar partículas `Math.random()`; tolerancia
0.15 % para residuos WAAPI):

```
TEST2 vs TEST1 top:   0 px   (idéntico)      TEST6 vs TEST1 top:   0 px
TEST3 vs TEST1 top:   0 px                   TEST7 vs TEST1 top:   0 px
TEST4 vs TEST1 top:   0 px                   TEST8 vs TEST1 top:   0 px
TEST5 vs TEST1 top:   0 px                   (sec2 igual en todos)
```

Archivos: `TEST{1..8}_{top|sec2}.png` + `results.json` (checks completos).

## Nota de metodología

- `reduced_motion='reduce'` + congelación de `setInterval` se aplican por igual
  en todos los escenarios para hacer las capturas deterministas (el carrusel
  demo del hero avanza con temporizadores). Los computed styles y el estado de
  `<html>` se miden sin esas restricciones de render.
- La invalidación de `:has()` en Chromium es asíncrona: el probe espera frames
  antes de medir el re-arme.

## Hallazgo de toolchain documentado

Lightning CSS (Tailwind v4) transforma las listas de selectores en `:is(…)`
y deduplica el par `backdrop-filter` / `-webkit-backdrop-filter` emitiendo solo
el prefijo `-webkit-`. En Chromium, `:is(… :not(:has(#x)) …)` nunca coincide y
la versión `-webkit-` no afecta a la propiedad estándar. Ambos problemas se
resolvieron dividiendo las reglas de modo a selector único
(`e2e/landing-shield/split_mode_rules.py`) y conservando solo la declaración
estándar (`e2e/landing-shield/dedup_backdrop_pairs.py`).
