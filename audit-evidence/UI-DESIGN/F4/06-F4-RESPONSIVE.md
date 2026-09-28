# F4 — RESPONSIVE VALIDATION (320 → 1440)

Fecha: 2026-09-28 · Método: navegador real, scrollWidth-clientWidth medido por JS en cada breakpoint sobre las vistas operativas críticas (`pos`, `cash`) + spec e2e commiteado + verificación visual de las vistas modificadas.

## Overflow horizontal medido (px de exceso sobre viewport)

| Viewport | POS | Caja |
|---|---|---|
| 320×700 | **0** | **0** |
| 360×800 | **0** | **0** |
| 375×812 | **0** | **0** |
| 390×844 | **0** | **0** |
| 400×850 | **0** | **0** |
| 1024×768 | **0** | **0** |
| 1280×800 | **0** | **0** |
| 1440×900 | **0** | **0** |

## Spec e2e commiteado (`e2e/mobile-viewport-audit.spec.ts`)

```text
12 passed / 2 failed (fallos preexistentes, fuera del alcance F4):
  ✓ sin scroll horizontal en iPhone SE 375 / iPhone 12 390 / Galaxy S20 360 / iPad Mini 768
  ✓ botones visibles con touch target ≥44px (iPhone SE)
  ✓ manifest.json standalone / apple-mobile-web-app-capable / status-bar-style /
    mobile-web-app-capable / viewport-fit=cover / service worker /sw.js /
    tap-highlight + overscroll-behavior
  ✗ theme-color meta (strict-mode: 2 metas idénticas en la LANDING — duplicación
    preexistente en archivos no tocados por F4; el valor es correcto #16a34a)
  ✗ consola limpia en landing (ruido "WebSocket is already in CLOSING/CLOSED" del
    dev server + Socket.io — preexistente, server.ts no tocado por F4)
```

## Vistas modificadas por F4 — verificación visual por breakpoint

| Vista | 375 (móvil) | 1440 (desktop) | Notas |
|---|---|---|---|
| Vender (pos) | ✓ (shots `before/after-mobile-pos`) | ✓ (`before/after-desktop-pos`) | Sin el h2 "TPV": la toolbar (Volver/Vista/Carrito/Express/Historial) envuelve igual que antes (F1 UI-002 intacto); el header ya titula |
| Recepciones | ✓ | ✓ | PageHeader F2: título+acciones en columna móvil, fila en desktop |
| Venta por Conteo | n/a (tab secondary) | ✓ | PageHeader con ActionMenu desktop; móvil conserva su barra inferior propia |
| Ajustes | ✓ | ✓ | Solo cambió el string del h2 |
| Gestión de Tiendas | ✓ | ✓ | Sin breadcrumb local: el contenido sube al hueco del crumb local; tabs Tiendas/Vitrina intactas |
| Sheet "Más" móvil | ✓ (`before/after-mobile-mas-sheet`) | n/a | Grupos derivados, dedupe, cierre por Escape/Backdrop intactos |

## Conclusión

Sin regresión responsive: 0px overflow en 320–1440, touch targets ≥44 verificados
por e2e, y las 6 superficies tocadas por F4 renderizan idéntico en layout (solo
cambiaron textos/encabezados planificados). Los 2 fallos del spec e2e son
preexistentes (landing meta duplicada + ruido WebSocket) y viven en archivos fuera
del diff de F4.
