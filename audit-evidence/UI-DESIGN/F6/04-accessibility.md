# F6 — 04 ACCESSIBILITY QA (F6-D)

Método: accessibility tree de agent-browser (roles/labels reales), navegación por
teclado, y verificación de código de los primitivos.

## Keyboard

| Tecla | Superficie | Resultado |
|---|---|---|
| Tab | landing + app | focus avanza por controles interactivos ✓ |
| Enter | botones/links nativos y cards hub | ✓ (activación estándar) |
| Escape | modal Cobro (POS) | cierra, estado de carrito preservado ✓ |
| Escape | drawer "Más" (mobile) | cierra (0 diálogos restantes) ✓ |
| Escape | Command Palette (Ctrl+K) | cierra ✓ |
| Ctrl+K | palette global | abre con cmdk-root ✓ |

## Focus

| Verificación | Resultado |
|---|---|
| Focus visible | outline **3px** computado en elemento tabulado ✓ |
| Focus order | orden DOM lógico (skip-link → nav → main) ✓ |
| Focus restoration | al cerrar modal/drawer el foco retorna al trigger (Radix Dialog) ✓ |
| Focus trap | `BaseModal` usa `useFocusTrap(open)`; drawer "Más" recibe focus dentro (activeElement=BUTTON) ✓ |
| Modal exit | Escape + botón Close etiquetado en login/checkout ✓ |

## Semántica (muestreo del árbol accesible)

| Verificación | Evidencia |
|---|---|
| Headings | H1 por vista (Inicio, Vender, Ventas, Caja, Ajustes…); jerarquía H2/H3/H4 en landing y cards — **nota**: doble-H1 heredado documentado (deuda F4 clase C, estable) |
| Buttons | labels descriptivos completos: "Agregar Abrazadera metálica de 1 pulgada al carrito. Precio: $350.00. Stock: 32" |
| Links | skip-links ×2, links de vitrina y breadcrumbs con nombre |
| Labels | formularios login (Correo/Contraseña required), buscadores con aria-label específico |
| aria-label | toolbar POS, pin de vistas ("Fijar X"), notificaciones ("Notificaciones (3 sin leer)") |
| aria-expanded | carrito, drawer, menús de usuario, combobox de búsqueda ✓ |
| aria-selected | tab STOCK ACTUAL ✓ |
| aria-current | crumb actual marcado `disabled` (patrón certificado) ✓ |
| Roles | navigation, tab, dialog, listbox/option (grilla POS), radiogroup categorías ✓ |

## Touch (controles operacionales, 390×844)

```text
MobileTabBar (6): 48–49px  ✓ contrato F1
StickyCart:       72px     ✓
Carrito/Historial: 44px    (toolbar POS — patrón certificado F1, sin regresión)
```

No se detectó ningún control operacional crítico con target insuficiente.

## Deuda a11y heredada (NO regresa, se mantiene clasificada)

* F5-019: icon-buttons sin aria-label (~88/95 al momento F5) — **deuda documentada clase C**,
  requeriría inventario completo; fuera del alcance F6 (no es regresión: los controles
  operacionales muestreados en vivo SÍ tienen nombre accesible).
* Doble-H1 estructural — deuda F4 clase C (ver 10-defects).

## Veredicto

```text
KEYBOARD usable ✓ · FOCUS visible y gestionado ✓ · MODALS correctos ✓
ESCAPE funcional (modal/drawer/palette) ✓ · TARGETS adecuados ✓ · ARIA razonable ✓
ACCESSIBILITY — PASS (sin regresiones; deuda heredada permanece documentada)
```
