# RESPONSIVE_VISUAL_VALIDATION — Validación responsive real (360→1920) + reduced-motion

**Misión:** ADN-LANDING-FINAL-POLISH-003 · **Sección:** §9 · **Fecha:** 2026-11-18

## 1. Método

Playwright/Chromium (navegador real) contra el servidor local (PM2, health 200).
Por cada viewport (360, 390, 768, 1024, 1440, 1920) se verificó en el DOM vivo y se
capturó pantalla (`resp-003-<w>.png`). Métricas completas en
`responsive_003_metrics.json`; script reproducible `scripts/validate_003.cjs` (copia en
este expediente).

## 2. Resultados por viewport

| Viewport | scroll horizontal | Logo completo (ADN verde + egocio blanco) | «g» íntegra (margen tinta/máscara) | Hero sin solapes | Escena problemas estática | Funcionalidades centrada (márgenes) | Captura |
| ---: | --- | --- | ---: | --- | --- | --- | --- |
| 360 | ✅ no | ✅ | ✅ +11.6px | ✅ | n/a (<lg no aparece) | ✅ 24/24 | `resp-003-360.png` |
| 390 | ✅ no | ✅ | ✅ +10.7px | ✅ | n/a | ✅ 24/24 | `resp-003-390.png` |
| 768 | ✅ no | ✅ | ✅ +14.8px | ✅ | n/a | ✅ 40/40 | `resp-003-768.png` |
| 1024 | ✅ no | ✅ | ✅ +20.2px | ✅ | ✅ sin colisiones | ✅ 64/64 | `resp-003-1024.png` |
| 1440 | ✅ no | ✅ | ✅ +28.5px | ✅ | ✅ | ✅ 80/80 | `resp-003-1440.png` |
| 1920 | ✅ no | ✅ | ✅ +31.3px | ✅ | ✅ | ✅ 280/280 | `resp-003-1920.png` |

Notas:
- La escena de problemas existe solo desde `lg` (1024). A 1024 (ancho más ajustado) la
  composición porcentual escala sin solapes entre fragmentos
  (`after/zoom-scene-1024.png`). El botón flotante de WhatsApp es overlay fijo
  pre-existente de la app, no colisión de la composición.
- `zoom-header-360.png` / `zoom-header-1920.png`: el wordmark unificado se mantiene
  íntegro en los extremos del rango.

## 3. prefers-reduced-motion

Contexto con `reducedMotion: 'reduce'` (1440×900):

- Titular completo visible de inmediato: «MALABARES.» opacity 1 (sin dispersión de
  letras, `w=664 h=135`), «negocio.» opacity 1 (sin máscara activa, `h=144`).
- Escena de los cuatro problemas: estática por construcción (sin animaciones que
  desactivar) — `sceneAnim: "none"` en todos los viewports.
- Cinta de módulos: sin animación (regla CSS `prefers-reduced-motion` de 002 intacta).
- Captura: `resp-003-reduced-motion-1440.png`.

## 4. Favicon identificable

- Composición de legibilidad a tamaños reales: `favicon-legibility-review.png`
  (ADN-16px descartado vs N-16/32/48px legibles).
- Servidas con 200 y content-type correcto: `/favicon.svg`, `/favicon.ico`,
  `/icons/icon-192.png`, `/apple-touch-icon.png`, `/fc/icons/icon-192.png`
  (`faviconHttp` en `responsive_003_metrics.json`).
- `<link rel="icon">` declarados por el HTML servido: `favicon.svg` + `favicon.ico` +
  `icons/icon-192.png`; `apple-touch-icon` → `/apple-touch-icon.png`.

## 5. Conclusión

Las cuatro zonas corregidas pasan el rango completo 360→1920 sin scroll horizontal, sin
solapes, con la marca única y la «g» íntegra; la sección de problemas es estática y la
sección Funcionalidades queda centrada con retícula compartida. Ningún salto de
composición entre breakpoints (posiciones en % + contenedor con `aspect-ratio`).
