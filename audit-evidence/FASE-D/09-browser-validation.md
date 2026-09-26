# FASE D — 09 BROWSER VALIDATION (§23 — interacción real, no solo capturas)

Sesión: navegador headless real (agent-browser/Playwright), usuario fixture sintético
con login REAL (signInWithPassword por UI), tienda sandbox.

## Flujo validado por resolución (agregar producto + contador + captura)

| Resolución | Interacción realizada | Contador observado | Extra | Captura |
|---|---|---|---|---|
| 1440×900 | clic producto A | `Caja (1)` | — | 11-vender-1440x900.png |
| 1280×800 | clic producto (carrito persistido) | `Caja (2)` | D11 implícito | 11-vender-1280x800.png |
| 1024×768 | clic producto | `Caja (3)` | — | 11-vender-1024x768.png |
| 390×844 (móvil) | carrito limpio + clic A | `🛒 (1)` | StickyCartSummary visible | 11-vender-390x844-movil.png |
| 375×667 (móvil) | clic B | `🛒 (2)` | sticky visible | 11-vender-375x667-movil.png |

## Interacciones adicionales reales (no solo screenshots)

```text
- Login completo por formulario (credenciales fixture).
- Navegación por hubs: INICIO → OPERACIÓN → Vender → Caja → Vender (clicks reales).
- Apertura de turno: formulario fondo inicial + modal "Sí, Abrir Turno".
- Carrito: abrir/cerrar, pestañas ITEMS/PAGO, modal CONFIRMAR VENTA → confirmar.
- Checkout completo hasta pantalla "¡VENTA COMPLETADA! ID: A38FFA6A" + QR.
- Toggle de tema claro/oscuro (verificación .dark, §16).
- Verificaciones de texto computado (getComputedStyle) para los tokens a11y.
- localStorage manipulado para reproducir el estado envenenado (A/B pre/post fix).
```

## UX del menú (§24) e iconografía (§25)

```text
- Jerarquía conservada: INICIO → OPERACIÓN → Vender (navegación real usada en la
  sesión; no se reintrodujo "Terminal de Ventas"; no se duplicó Vender/Ventas).
- Vender = acción de 1 clic desde el hub (GATE 1.3 intacto).
- Iconos sección/Vender (lucide) consistentes; botones con aria-label descriptivos
  verificados en snapshots ("Abrir carrito (N productos)", aria-expanded, aria-live
  del carrito en POSView:385-389). No se sustituyó ningún icono.
- Error de consola relevante: 0 (solo HMR/telemetría de dev).
```
