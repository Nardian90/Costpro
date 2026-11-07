# INFORME — Iconos colapsados en botones («el botón de los productos no muestra el icono»)

**Fecha:** 2026-11-08 · **Rama:** `fix/iconos-colapsados-maxwidth-svg-20261108`
**Reporte del propietario:** «en la vista Inicio → OPERACIÓN → Almacén → Inventario, en el tab
Catálogo, el botón de los productos no muestra el icono, y así pasa en varias vistas; si hay
alguna forma de encontrar a otros y resolverlos de adelante, a lo mejor por un patrón que
reconozcas en esta misma vista».

---

## 1. Diagnóstico (patrón global, no local de una vista)

Reproducción en vivo con tienda QA aislada (local :3000 + Supabase del proyecto): en
Inventario → Catálogo (vista tabla), la columna **ACCIONES** mostraba los 4 botones
(Clonar / Editar / Desactivar / Eliminar) como píldoras **vacías**, y los iconos de orden
de los encabezados tampoco se veían.

Inspección del DOM en el navegador:

- Los `<svg>` de lucide-react **SÍ estaban en el DOM** (`stroke="currentColor"`), pero su
  tamaño computado era `width: 0px` (el alto sí era 20px).
- Medición: 22 de 94 SVG de la vista con `width = 0`.

Causa raíz encontrada en `src/styles/base.css` (reset del proyecto, importado por
`globals.css`):

```css
/* ANTES */
img, video, svg {
  display: block;
  max-width: 100%;
}
```

- El preflight estándar de Tailwind aplica `max-width: 100%` **solo a `img` y `video`**;
  el proyecto lo había extendido a `svg` (commit «act integral diseño pro», que creó el
  archivo).
- Los iconos SVG tienen `width/height` fijos (p. ej. `w-5` = 20px) y `stroke="currentColor"`.
  Con `max-width: 100%`, dentro de un contenedor flex apretado (la columna Acciones tiene
  ~124px para 4 botones de 40px) la cadena de encogimiento flex → `max-width: 100%` del SVG
  → **icono de ancho 0**, invisible. El botón quedaba reducido a su padding (20px).
- Como es una regla **global**, el mismo mecanismo afectaba a cualquier vista con filas de
  acciones en tablas o filas flex apretadas — exactamente el patrón «así pasa en varias
  vistas» que pidió el propietario.

## 2. Corrección (2 capas)

1. **`src/styles/base.css`** — se restaura el estándar de Tailwind: `max-width: 100%` solo
   para `img`/`video`; el `svg` conserva `display: block; vertical-align: middle` (sin
   max-width). Un archivo = todas las vistas.
2. **`IconButton` (`src/components/ui/atomic/index.tsx`)** — `shrink-0`: un botón de icono
   en una fila flex nunca debe encogerse por debajo de su icono; si falta espacio, el
   contenedor hace scroll (práctica estándar para icon buttons). Defensa en profundidad.

## 3. Verificación (navegador real, tienda QA aislada `QA UI Icons Store`)

| Escenario | Antes | Después |
| --- | --- | --- |
| SVG con width=0 en Catálogo (tabla) | 22 | 0 |
| Catálogo tabla — columna ACCIONES | píldoras vacías | Clonar/Editar/Desactivar/Eliminar visibles |
| Catálogo tarjetas — acciones de tarjeta | — | Info/Editar, Duplicar, FC, Eliminar visibles |
| Móvil 390 px (cards + tab bar inferior) | — | todos los iconos visibles |
| Barrido: POS, Caja, Dashboard, Trazabilidad, Vales, Traslados, Inventario Físico, Stock History | — | 0 iconos colapsados visibles (solo falsos positivos dentro de `display:none` móvil) |
| Landing (svgs decorativos, regresión por quitar max-width) | — | 0 invisibles / 0 desbordados de 57 SVG |

Pruebas: `vitest` — `catalog-stale-search-regression` (7), `catalog-governance-wiring` (9),
`inventory-row-actions`, `inventory-mobile-row`, `edit-product-item-type` (14) — **46 tests verdes**.
ESLint en archivos tocados: 0 errores.

## 4. Evidencia

- `01-antes-catalogo-tab-acciones-vacias.png` — tab Catálogo antes: columna ACCIONES vacía.
- `02-antes-zoom-acciones-sin-iconos.png` — zoom antes: botones sin icono.
- `03-despues-tabla-iconos-visibles.png` — después (tabla): 4 acciones + icono FC visibles.
- `04-despues-tarjetas-iconos-visibles.png` — después (tarjetas): acciones visibles.
- `05-despues-movil-390px.png` — después (móvil 390px): cards + tab bar con iconos.

## 5. Entorno QA creado para la verificación (reutilizable, aislado en su propio tenant)

| Recurso | Valor |
| --- | --- |
| Usuario QA | `qa.ui.icons.20261108@costpro.test` (id `6efdeadb-4511-4cff-8387-71b0f28a3840`, role `admin`) |
| Tenant QA | `QA UI ICONS TENANT 20261108` (`6bf78be0-a704-4583-855e-a255a2662b9c`, plan enterprise trial) |
| Tienda QA | `QA UI Icons Store` (`6691b866-a7cd-409b-b1e5-dd9bc2ad9d7a`, slug `qa-ui-icons-store`) |
| Productos QA | `QA-ICON-001`, `QA-ICON-002` (sin imagen → placeholders; útil para probar ambos estados) |

- Ninguna tienda real fue modificada (Vitallcons/Enervida/Ferro solo vistas en listados).
- RLS verificada de paso: el usuario QA **no** puede leer productos de otras tiendas
  (SELECT con su JWT → 0 filas).

**Observación adicional (para una auditoría dedicada, NO investigada en esta misión):**
`GET /api/stores` con el JWT del usuario QA devuelve el listado de **todas** las tiendas de
la plataforma (solo nombres/metadata; los datos operativos siguen bloqueados por RLS).
Repro: JWT del usuario QA → `curl /api/stores`. Convendría confirmar si el endpoint debe
filtrar por tenant para roles no-plataforma.

## 6. Estado y entrega

- Commits en la rama `fix/iconos-colapsados-maxwidth-svg-20261108` (desde `main @ 6bf80b6bc`,
  post-PR #1566). **El push a GitHub quedó pendiente** por falta de credenciales de GitHub en
  la sesión del sandbox; se adjunta el parche `git format-patch` para aplicar/push desde
  cualquier entorno con credenciales:

```bash
git am 0001-fix-ui-restaurar-iconos-de-botones-colapsados-por-max.patch
git push -u origin fix/iconos-colapsados-maxwidth-svg-20261108
```
