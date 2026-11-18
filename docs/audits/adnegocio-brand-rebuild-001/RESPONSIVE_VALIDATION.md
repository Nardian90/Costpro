# RESPONSIVE VALIDATION — ADN-BRAND-REBUILD-001

**2026-11-18** · Verificación con Chromium real (Playwright) contra el servidor local.

## 1. Tallas verificadas (misión §12)

| Viewport | overflowX (scrollWidth−clientWidth) | Captura | Resultado |
|---|---|---|---|
| 360×780 | **0 px** | `resp-360.png` | Hero apilado, CTAs completos, selector en columna, sin solapamientos |
| 390×844 | **0 px** | `resp-390.png` | Header con hamburger; marca y titular sin recortes |
| 768×1024 | **0 px** | `resp-768.png` | Transición correcta (header con Acceder + hamburger) |
| 1024×768 | **0 px** | `resp-1024.png` | Nav de 3 enlaces visible |
| 1440×900 | **0 px** | `resp-1440.png` | Composición completa; índice editorial a una columna con jerarquía clara |
| 1920×1080 | **0 px** | `resp-1920.png` | Contenido centrado, sin desbordes |

**No hay desplazamiento horizontal accidental en ninguna talla.**

## 2. Header al desplazarse

- A scrollY=1800 (1440×900): header `fixed` top=0 con fondo `#05070A/85` + blur +
  borde inferior y **wordmark compacto ADNegocio** visible (la marca grande del
  hero ya no está en pantalla) — captura `resp-header-scrolled.png`.
- Causa técnica documentada: `html/body { overflow-x: hidden }` desactiva
  `position:sticky` en Chromium; por eso el header es `fixed` con espaciador de
  flujo (diagnóstico con `getComputedStyle`: `position: fixed`, `navTop: 0`).

## 3. Elementos verificados por talla

- Logo/isotipo: legible en todas las tallas; tile reconocible a 16 px (hoja de contacto de marca).
- Menús: drawer móvil único (< md) con navegación de secciones; header desktop con Funcionalidades · Plataforma · Ayuda · Acceder.
- Animaciones: respetan `prefers-reduced-motion` (partículas off, fades 0.01ms).
- Hero/sections/capturas/footer: sin solapamientos ni columnas rotas.
- Cookie banner y toasts dentro del viewport seguro (`safe-area-inset`).

## 4. Acceso y autenticación

- El landing monta `LoginModal` desde el CTA «Acceder» (header) y «Acceder a la
  plataforma» (hero) vía `entrarACostpro()` (contrato CP-AUTH-RESILIENCE-003
  verde: sin recargas ni `window.location.assign`).
- El flujo completo de sesión se valida en CI con la BD aislada
  (`auth.spec.ts`, `auth-resilience-persistent.spec.ts`, `auth-session-ui.spec.ts`
  — este último actualizado al aria-label «Entrar a ADNegocio»).

## 5. Consola

`console.error`/`pageerror` = **0** tras corregir las keys React duplicadas del
wordmark (dos «o» en ADNegocio).
