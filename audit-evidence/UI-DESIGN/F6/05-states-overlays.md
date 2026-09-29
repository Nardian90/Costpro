# F6 — 05 STATES & OVERLAYS MATRIX (F6-E / F6-F)

## F6-E — Estado (gramática F3, no se creó ningún sistema nuevo)

Primitivo: `StateRenderer.tsx` (20 consumidores) + gramática canónica
loading (ViewLoadingSplash) / error / empty. Verificación: código + en vivo.

| Estado | Superficie probada | Verificación | Resultado |
|---|---|---|---|
| Loading | transiciones de vista (dev compile) + DefaultLoadingComponent | splash visible, sin pantallas bloqueadas | ✓ |
| Empty | DefaultEmptyComponent ("No hay datos disponibles" + acción opcional) | código + consumidores | ✓ |
| Filtered empty | Catálogo con filtro inexistente | "Sin resultados / No se encontraron productos… / **LIMPIAR FILTROS**" | ✓ |
| Error | DefaultErrorComponent (border destructive/20, mensaje + **Reintentar** con onRetry suave o reload) | código + gramática F3-B2 | ✓ |
| Retry | botón Reintentar del error renderer; refrescar caja en POS | ✓ |
| Success | operaciones de carrito reflejan conteo/total inmediato ("Cobrar 1 productos por $350.00") | ✓ |
| Disabled | botones disabled:opacity-50 + disabled:pointer-events- none en primitivo Button | ✓ |
| Saving/Saved | gramática token de estados (badge/turno) heredada de F3/F5 — sin nuevas gramáticas | ✓ |
| Offline | fuera de alcance simulado; cobertura cualitativa en 08/11 (cron 401 no degrada UI) | ✓ |
| Destructive | "Anular carrito completo" y "Eliminar [producto] del carrito" etiquetados explícitos | ✓ |
| Operacional | POS sin turno: "NO TIENES TURNO ABIERTO" + CTA a Caja (estado honesto con salida) | ✓ |

## F6-F — Modales y overlays (mecanismos existentes, 0 nuevos)

| Overlay | Instancia probada | Open | Focus | Escape | Close | Restoración | Scroll lock | Layering | Mobile | Dark/Light |
|---|---|---|---|---|---|---|---|---|---|---|
| Modal (BaseModal/Dialog) | Cobro POS "💳 PAGO $350.00" | ✓ | ✓ (trap) | ✓ | ✓ | ✓ (Radix) | ✓ | ✓ | top-anchored ✓ | ✓ |
| Dialog auth | Login | ✓ | ✓ | ✓ | ✓ (Close etiquetado) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Drawer | "Más" (MobileTabBar) | ✓ | focus entra (BUTTON) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Dropdown | menús de usuario/store-switcher (aria-expanded) | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | ✓ | ✓ |
| Popover/toolbar | notificaciones (dismiss accesible) | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | ✓ | ✓ |
| Toast | region "Notifications alt+T" | ✓ | n/a | n/a | ✓ | n/a | n/a | ✓ | ✓ | ✓ |
| Confirmation | "Anular carrito completo" etiquetado (destructive) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Image viewer | fuera de muestreo (vitrina) — mecanismo BaseModal/Dialog cubre el caso | — | — | — | — | — | — | — | — | — |

```text
61 consumidores de BaseModal · 0 overlays con mecanismo paralelo nuevo detectado
Gramática F3 intacta — OVERLAYS — PASS
```
