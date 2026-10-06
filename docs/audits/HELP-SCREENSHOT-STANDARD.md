# Estándar de Capturas de Pantalla del Centro de Ayuda

> **Fecha**: 2026-10-05 · **Alcance**: documentación de usuario (`knowledge/help/**`)
> **Estado**: Aprobado y aplicado (26 capturas, 21 documentos ilustrados)

## 1. Evaluación de estándares internacionales

Antes de incorporar imágenes se evaluó la viabilidad según los referentes
internacionales de documentación de usuario. **Conclusión: viable y
recomendado** para el contenido procedural; el Centro de Ayuda ya declara su
alineación con ISO/IEC 26514 y Diátaxis, y este estándar operationaliza esa
alineación para el contenido visual.

| Estándar | Relevancia | Cómo se aplica aquí |
|----------|------------|---------------------|
| **ISO/IEC 26514:2008** (diseño y desarrollo de documentación de usuario) | Los sistemas de ayuda en línea deben incluir elementos visuales que apoyen el texto, colocados próximos al contenido relacionado, legibles y consistentes con la versión de la UI. | Cada captura se inserta adyacente al paso o sección que describe, con numeración "Figura N." por documento y caption explicativo. |
| **Diátaxis** (framework de organización: tutoriales / how-to / referencia / explicación) | Los documentos procedurales (tutoriales, guías prácticas) se benefician de capturas en los puntos de decisión; la referencia pura las necesita menos. | 20 de las 26 capturas ilustran tutoriales y how-tos; las imágenes de referencia/explicación aparecen solo cuando definen la vista que se conceptualiza. |
| **Microsoft Style Guide** (contenido de ayuda) | "Mostrar la UI real": capturas del producto real, sin recortes engañosos, sin datos de terceros, consistentes en encuadre; la imagen no duplica el texto, lo complementa. | Capturas a viewport completo 1440×900 del producto en ejecución, sin anotaciones externas, con la misma tienda activa y tema en toda la serie. |
| **Google Developer Documentation Style Guide** | Las imágenes deben tener texto alternativo significativo, caption cuando aportan contexto y evitarse cuando son puramente decorativas. | Todo `![alt](src)` lleva alt en español descriptivo + atributo `title` que se renderiza como `<figcaption>`. |
| **WCAG 2.1 (1.1.1 Contenido no textual; 1.4.5 Imagen de texto)** | El texto alternativo es obligatorio; el texto real se prefiere sobre texto incrustado en imagen. | Alt descriptivo obligatorio; los captions son texto HTML real (no quemado en el PNG); imágenes con `loading="lazy"` y `decoding="async"`. |

## 2. Convenciones adoptadas

### 2.1 Captura

- **Viewport**: 1440×900 CSS px, `deviceScaleFactor=2` (nitidez retina).
- **Locale**: `es-ES`; tema oscuro del sistema (consistente en toda la serie).
- **Sesión**: login real vía `/?login=1` con el usuario admin del entorno;
  la tienda pública y el landing se capturan en contexto anónimo.
- **Estado**: se espera `networkidle` + 4.5 s de asentamiento (skeletons,
  gráficos y fade de toasts). El indicador de dev de Next.js se oculta por CSS.
- **Datos**: datos reales del entorno; se filtran las tiendas piloto E2E de
  las capturas donde resultaría ruido (gestión de tiendas, selector).
- **Prohibido**: recortes que oculten contexto relevante, anotaciones hechas
  fuera del producto, capturas con banners de consentimiento o toasts.

### 2.2 Formato y peso

- **Formato**: WebP, calidad 82, ancho final 1440 px.
- **Peso objetivo**: < 100 KB por imagen (serie actual: 13–81 KB, ~950 KB total).
- **Ubicación**: `public/help/capturas/<nombre-kebab-case>.webp`.
- **Nombre**: kebab-case estable y descriptivo (`pos-terminal.webp`,
  `recepcion-mercancia.webp`); nunca versionado por fecha.

### 2.3 Incrustación en Markdown

```markdown
![Texto alternativo descriptivo para lectores de pantalla](/help/capturas/archivo.webp "Figura N. Caption breve en español")
```

- **Alt** (obligatorio): describe qué se ve, no qué es ("Terminal POS con el
  buscador y la cuadrícula de productos", no "captura del POS").
- **Title/caption** (obligatorio): patrón `Figura N. …`, numeración por
  documento; el renderer lo muestra como `<figcaption>`.
- **Ubicación**: inmediatamente después del paso o sección que ilustra,
  precedida cuando aporta flujo por una frase de referencia en el texto.
- **Reutilización**: la misma captura puede ilustrar varios documentos que
  describen la misma vista (p. ej. `pos-terminal.webp` en el tutorial de
  primera venta y en el flujo completo de POS); no se duplican archivos.

### 2.4 Render (aplicación)

`HelpSectionRenderer.tsx` mapea `img` → `<figure>` con borde, esquinas
redondeadas, `loading="lazy"`, `decoding="async"` y `<figcaption>` derivado
del atributo `title`. El sanitizador (`sanitize.ts`) ya admite
`img/figure/figcaption` y los atributos `src/alt/title/width/height`.

## 3. Regeneración de capturas

```bash
node scripts/help-captures.mjs              # todas (26)
node scripts/help-captures.mjs pos cash     # subconjunto por nombre
node scripts/help-captures.mjs --list       # catálogo
python3 scripts/convert-captures.py         # PNG → WebP 1440px q82
```

Requisitos: aplicación corriendo en `BASE_URL` (por defecto
`http://localhost:3000`), credenciales `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASS`
(omisible: `admin@costpro.com`), `NEXT_PUBLIC_SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` (leídos de `.env`) para resolver el slug de la
tienda pública, y Playwright instalado.

**Cuándo regenerar**: ante cualquier cambio de UI que afecte una vista
capturada. Las capturas obsoletas son un defecto de documentación (ISO/IEC
26514: la documentación debe reflejar la versión del producto que documenta).

## 4. Serie de capturas vigente

| Archivo | Vista | Documentos ilustrados |
|---------|-------|------------------------|
| `pagina-inicio.webp` | Landing público | Tutorial: primer día |
| `dashboard-command-center.webp` | `/?view=dashboard` | Introducción, Primeros pasos, Tutorial: primer día |
| `asistente-darian.webp` | `/?view=chat` | Introducción, Primeros pasos |
| `paleta-comandos.webp` | Ctrl+K con búsqueda | Introducción, Cómo usar la paleta |
| `selector-tienda.webp` | Selector de sucursal abierto | Primeros pasos, Administrar tiendas |
| `centro-ayuda.webp` | `/?view=help` | Introducción, Primeros pasos |
| `fichas-costo-gestion.webp` | `/?view=cost-sheets` | Crear ficha de costo, Primeros pasos, ¿Qué es una ficha? |
| `ficha-costo-editor.webp` | `/?view=estructura-costo` | Estructura de costo y costeo dinámico |
| `costeo-dinamico.webp` | `/?view=costeo-dinamico` | Estructura de costo y costeo dinámico |
| `pos-terminal.webp` | `/?view=pos` | Tutorial: primera venta, Flujo completo de POS |
| `catalogo-ventas-tabla.webp` | `/?view=sales_catalog` | Catálogo de Ventas |
| `historial-ventas.webp` | `/?view=sales` | Cómo ver el historial de ventas |
| `devoluciones.webp` | `/?view=devolutions` | Cómo procesar una devolución |
| `clientes-crm.webp` | `/?view=customers` | Cómo gestionar clientes |
| `caja-arqueo.webp` | `/?view=cash` | Cómo cerrar la caja |
| `catalogo-productos.webp` | `/?view=catalog` | Tutorial: primer producto, Gestión de inventario |
| `inventario-stock.webp` | `/?view=inventory` | Gestión completa de inventario |
| `recepcion-mercancia.webp` | `/?view=recepcion` | Cómo recibir mercancía |
| `transferencias.webp` | `/?view=transferencias` | Cómo hacer una transferencia |
| `ajustes-inventario.webp` | `/?view=inventory_adjustments` | Cómo ajustar el inventario |
| `venta-por-conteo.webp` | `/?view=inventory_count` | Cómo usar la venta por conteo |
| `reportes-generador.webp` | `/?view=reports` | Tutorial: primer reporte, Guía del Generador |
| `ipv-conciliacion.webp` | `/?view=ipv` | ¿Qué es el IPV? |
| `gestion-tiendas.webp` | `/?view=stores` | Cómo administrar tiendas y usuarios |
| `roles-permisos.webp` | `/?view=roles` | Roles y permisos de usuario |
| `tienda-publica.webp` | `/tienda/enervida-vitallcons` (anónimo) | Tienda pública, Introducción |
