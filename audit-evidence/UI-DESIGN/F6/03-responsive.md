# F6 — 03 RESPONSIVE CERTIFICATION (F6-C)

Método: `agent-browser set viewport W×H` + medición JavaScript del overflow horizontal
(`document.documentElement.scrollWidth - clientWidth`) sobre 3 superficies críticas
(POS, Inventario, Dashboard de Tiendas). Verificación de controles móviles a 390×844.

## Matriz de overflow (px horizontales accidentales)

| Breakpoint | POS | Inventario | Dashboard | Criterio |
|---|---|---|---|---|
| 320 | 0 | 0 | 0 | ✓ |
| 360 | 0 | — | — | ✓ |
| 375 | 0 | 0 | 0 | ✓ |
| 390 | 0 | 0 | 0 | ✓ |
| 400 | 0 | — | — | ✓ |
| 768 | — | — | 0 | ✓ |
| 1024 | — | — | 0 | ✓ |
| 1280 | 0 (set completo de journeys) | 0 | 0 | ✓ |
| 1440 | — | — | 0 | ✓ |

**Overflow accidental: 0px en los 9 breakpoints probados.**

## Elementos por breakpoint (muestreo representativo)

| Elemento | 320–400 | 768 | 1024–1440 |
|---|---|---|---|
| Header | compacto, store-switcher y notificaciones accesibles | ✓ | ✓ |
| Navigation | MobileTabBar + drawer "Más" | híbrido | sidebar expandida |
| Buttons | CTA "Cobrar" accesible dentro del carrito | ✓ | ✓ |
| Tables | densidad mantenida, scroll vertical | ✓ | ✓ |
| Dialogs | BaseModal top-anchored móvil-first, max-h-90vh | ✓ | centrado |
| Drawers | "Más" role=dialog, Escape | n/a | n/a |
| Sticky elements | StickyCart "TU CARRITO $350.00 VER CAJA" 72px | ✓ | n/a |
| Bottom navigation | MobileTabBar 6 controles 48–49px | ✓ | n/a |
| Forms | login con labels y required | ✓ | ✓ |

## Controles operacionales móviles (390×844, vista POS)

```text
MobileTabBar: Vender/Recibir/Inventario/Caja/Más = 49px · Colapsar = 48px  (≥48 F1 ✓)
StickyCart:   72px, contador de ítems + total + CTA VER CAJA (F1 ✓)
Carrito:      "Abrir carrito (1 productos)" 44px con aria-expanded correcto
Historial:    44px etiquetado
```

## Veredicto

```text
320–400 usable ✓ · 768 usable ✓ · 1024–1440 usable ✓
0 overflow accidental ✓ · navegación utilizable ✓ · CTA accesible ✓
RESPONSIVE — PASS
```
