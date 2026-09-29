# F6 — 08 PERFORMANCE / DECORATION MODES (F6-J) · RESILIENCE (F6-K)

## F6-J — Mecanismos existentes verificados (sin cambios de default)

Mecanismo: `src/styles/modes.css` + clase en `<html>`. Convención F5-010:
`.perf-hide-decor` oculta capas puramente decorativas en performance mode.

| Verificación | Evidencia |
|---|---|
| Default actual | `mode-enhanced` (heredado; decisión de producto F5-013 NO revertida unilateralmente) |
| Toggle accesible | botón "Cambiar a modo Performance (optimizado)" presente en el header — verificado en vivo |
| Activación manual | click → `html.className` = `h-full dark mode-performance` ✓ |
| Gating decorativo | `.perf-hide-decor`: **6/6 elementos** con `display:none` computado en performance mode ✓ |
| prefers-reduced-motion | regla auto en modes.css (herencia) — sin cambios |
| Restauración | vuelta a `mode-enhanced` verificada (`Cambiar a modo Enhanced` / restauración) ✓ |
| Sin ruptura funcional | performance mode solo apaga animaciones/blur/decoración; controles operacionales intactos |

```text
PERFORMANCE ✓ · ENHANCED ✓ · DECORATION GATING (F5-010) operativo ✓
Default = PRODUCT DECISION (F5-011/012/013 permanecen clasificados D, documentados en 10-defects)
```

## F6-K — 3G / Resilience UX (cualitativo)

| Aspecto | Observación (dev server real, red local; sin benchmark artificial) |
|---|---|
| Loading visible | splash (ViewLoadingSplash) en transiciones de vista; estados de compile no producen pantalla en blanco |
| Sin pantallas bloqueadas | cada vista con compile lento terminó en render correcto; el fallback público muestra landing legible |
| Skeleton/spinner coherente | gramática F3 única (splash/muted blocks) |
| Errores recuperables | DefaultErrorComponent con mensaje + Reintentar; cron pollers 401 (idempotentes) no degradan la UI |
| Retry | onRetry suave (F3-B2) en consumidores react-query |
| Feedback de operaciones | carrito/checkout reflejan estado inmediato |
| Navegación mientras carga | deep-links responden aunque el chunk compile (200 server-side) |
| Caso autenticación | al perder sesión (localStorage cleared durante prueba), la app cae a la **landing pública** de forma limpia — sin pantalla rota ni error crudo (resilience positiva) |

```text
Objetivo "conexión lenta ≠ interfaz rota": CUMPLE cualitativamente · 3G/RESILIENCE — PASS
```
