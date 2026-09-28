# F4 — ACCESSIBILITY VALIDATION

Fecha: 2026-09-28 · Método: verificación en vivo (navegador real, sesión admin) + auditoría estática de los archivos tocados.

## Verificaciones en vivo (view `sales`, viewport 375 y 1440)

| Check | Resultado | Evidencia |
|---|---|---|
| Skip link WCAG 2.4.1 | ✓ | `a[href="#main-content"]` presente y enfocable ("Saltar al contenido") |
| Landmark principal | ✓ | `<main id="main-content" role="main">` |
| Breadcrumb landmark | ✓ | `<nav aria-label="breadcrumb">` con `<ol>` |
| aria-current | ✓ | Ítem activo del sidebar con `aria-current="page"` ("Historial de Ventas"); Home y tabs móviles con `aria-pressed`/`aria-current` correctos |
| Nombres accesibles de navegación | ✓ | Todos los botones del MobileTabBar con `aria-label` (Vender/Recibir/Inventario/Caja/Más/Colapsar); icon-only del footer con aria+title |
| Coherencia de nombres (F4) | ✓ MEJORADO | Botón gear del footer: `aria-label` "Configuración"→"**Ajustes**" (mismo destino, mismo nombre que el menú lateral); menú usuario Header ídem |
| Escape / overlays (F3) | ✓ | Command Palette abre con ⌘K y cierra con Escape; el foco vuelve al editor del shell |
| Touch targets | ✓ | e2e `mobile-viewport-audit` — "botones visibles ≥44px" PASS (375px) |
| Contraste | ✓ (sin cambios) | F4 no alteró tokens de color; títulos usan los colores existentes del tema |

## Notas honestas (deuda preexistente, NO introducida por F4)

1. **Doble `<h1>` en vistas con PageHeader** (Header global + PageHeader): estructura
   preexistente (F-02 de la auditoría, clasificada P3 — corregirla requiere tocar el
   Header y ~40 vistas, fuera del principio de mínimo cambio). F4 no añadió ningún
   h1 nuevo; en las 3 vistas migradas a PageHeader el h1 reemplaza al h2 previo
   (misma cantidad de headings por nivel que antes en el peor caso, jerarquía F2 canónica).
2. **Leaf del breadcrumb en uppercase por CSS** con string fuente mixed-case: pauta
   visual de F2/F4 de metadatos; el nombre accesible NO depende del CSS (usa el
   string fuente) — sin impacto en lectores de pantalla.
3. **Plugin jsx-a11y no configurado** en el eslint del repo (script `lint:a11y`
   falla por configuración, preexistente) — se sustituyó por los checks manuales
   de arriba + el spec e2e de touch targets.

## Cambios F4 que mejoran a11y

- Nombres accesibles coherentes para el mismo destino (Ajustes ×3 superficies).
- Breadcrumb real en 11 deep-links que antes no ofrecían contexto ni navegación de vuelta.
- Botón POS "Caja (n)"→"Carrito (n)" alineado con su `aria-label` ya existente
  ("Abrir carrito") — se elimina la contradicción label vs nombre accesible.
