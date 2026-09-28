# F4 — VISUAL EVIDENCE (BEFORE / AFTER)

Fecha: 2026-09-28 · Método: navegador real contra pm2 (HMR). AFTER = rama F4 aplicada.
BEFORE obtenido con `git stash push` sobre la misma sesión → captura inmediata →
`git stash pop` → verificación de recompilación mediante marcador F4
(settings h2 "Ajustes Globales"→"Ajustes") antes de capturar AFTER.
Viewport 1440×900 (desktop) y 375×812 (móvil). 28 PNG en `shots/`.

Áreas modificadas cubiertas (mandato: solo áreas tocadas):

## Áreas sin cambio planificado (control de igualdad)

| Vista | Antes → Después | Resultado |
|---|---|---|
| Dashboard/Home (desktop) | dashboard ×2 | idéntico (sin diffs visuales) |
| Ventas hub (desktop) | sales-hub ×2 | idéntico |
| Inventario (desktop+móvil) | inventory ×4 | idéntico |
| Caja (desktop+móvil) | cash ×4 | idéntico |
| Sheet "Más" (móvil) | mas-sheet ×2 | idéntico (grupos/dedupe intactos) |

## Áreas modificadas (verificadas 1 a 1)

| Caso | Antes (stale state real) | Después | Verificado |
|---|---|---|---|
| **Vender desktop** (`before/after-desktop-pos.png`) | h2 "TPV" junto a toolbar; carrito "Caja (0)"; "Registro" | Sin TPV; "CARRITO (0)"; "HISTORIAL"; header+crumb "Vender" | ✓ imagen inspeccionada |
| **Vender móvil** | idem layout F1 | idéntico + sin h2 (ya estaba oculto en móvil) | ✓ imagen inspeccionada |
| **Ajustes desktop** | h2 "Ajustes Globales" (2ª identidad) | "AJUSTES" único; Header+crumb "Ajustes" | ✓ imagen inspeccionada |
| **Gestión de Tiendas desktop** | breadcrumb local "Inicio / MULTI-TIENDA / Gestión"; h2 "Gestión"; tab "GESTIÓN TIENDAS" | crumb global "Inicio > OPERACIÓN > GESTIÓN DE TIENDAS"; h2 "GESTIÓN DE TIENDAS"; tab "TIENDAS" | ✓ imagen inspeccionada |
| **Recepciones desktop** | h2 self-made uppercase + acciones ad-hoc | PageHeader F2 (icono+Recepciones+descripción; NUEVA primary; Express/Tasas/Exportar secondary) | ✓ imagen inspeccionada |
| **Recepciones móvil** | idem | PageHeader apilado en columna, acciones envueltas, sin overflow | ✓ |
| **Venta por Conteo desktop** | h2 con clases en conflicto + ActionMenu suelto | PageHeader (título+descripción dinámica+ActionMenu en slot) | ✓ |
| Deep-link `storefront-config` / `whatsapp-config` / `telegram-group` | crumb "Módulo No Disponible" (capturado como dato en 04; el crumb fantasma es texto bajo el header) | crumb real del hub (Gestión de Tiendas > Vitrina Pública / REDES > WHATSAPP > CONFIGURACIÓN / TELEGRAM > GRUPO DE VENTAS) | ✓ verificación DOM en 04 |
| Journey D cancel | aterriza en `?view=inventory` (Inventario) | aterriza en `?view=reception_list` con crumb RECEPCIONES | ✓ verificación DOM en 04 |

## Notas de sesión

- Estado de sesión idéntico en BEFORE/AFTER (misma tienda activa, admin, dark theme,
  Cookie consent presente en ambas pasadas).
- `git stash list` verificado vacío tras pop; `git status` con los 16 archivos F4
  restaurados; marcador de recompilación confirmado antes de cada set.
- Ninguna captura es stale: todas tomadas en la misma sesión tras networkidle + settle.
