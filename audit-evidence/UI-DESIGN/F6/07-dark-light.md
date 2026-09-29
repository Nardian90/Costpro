# F6 — 07 DARK / LIGHT (F6-I)

Método: toggle del theme switcher nativo (botones "Cambiar a modo claro/oscuro"),
verificación de `html.className` y `getComputedStyle(body).backgroundColor`,
capturas representativas.

## Verificación

| Aspecto | Dark (default) | Light | Resultado |
|---|---|---|---|
| html class | `mode-enhanced dark` | `mode-enhanced light` | ✓ conmutación limpia |
| Background | dark sólido estándar (#121212 token, herencia GATE 1.3R) | `rgb(248,250,252)` = `--background #f8fafc` | ✓ coincide tokens.css |
| Contraste | texto principal legible en superficies muestreadas | ✓ | ✓ |
| Borders/muted | jerarquía mantenida | ✓ | ✓ |
| Status | gramática token `/10` legible en ambos | ✓ | ✓ |
| Buttons | primary sólido consistente | ✓ | ✓ |
| Tables | densidad y zebra estables | ✓ | ✓ |
| Dialogs | login/checkout probados en dark; light en ajustes/dashboard | ✓ | ✓ |
| Navigation | sidebar/tab bar legibles | ✓ | ✓ |
| Charts/KPI | sin regresión de paleta (herencia F5-021 excepciones intencionales) | ✓ | ✓ |
| Forms | labels/inputs legibles | ✓ | ✓ |

## Regla "una corrección dark no rompe light"

No se aplicó ninguna corrección de tema en F6 (0 cambios de código de tema).
Ambos temas verificados operativos con el mismo conjunto de primitivos
(tokens.css con bloque light + dark). Capturas cruzadas:

* Dark 1280: `f6-j1-app-dashboard-1280.png`, `f6-j2-pos-1280.png`, `f6-j3-caja.png`,
  `f6-j6-gestion-tiendas.png`, `f6-final-dashboard-dark-1280.png`
* Light 1280: `f6-light-1280-dashboard.png`, `f6-light-1280-ajustes.png`
* Light 390: `f6-light-390-inventario.png`
* Dark 390: `f6-mobile-390-dashboard.png`

## Veredicto

```text
DARK ✓ · LIGHT ✓ · sin breakage cruzado · THEMES — PASS
```
