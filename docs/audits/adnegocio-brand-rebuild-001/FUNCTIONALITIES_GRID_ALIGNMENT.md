# FUNCTIONALITIES_GRID_ALIGNMENT — Equilibrio geométrico de «Funcionalidades»

**Misión:** ADN-LANDING-FINAL-POLISH-003 · **Sección:** §6 · **Fecha:** 2026-11-18

## 1. Defecto reportado

La sección «Funcionalidades» quedaba **excesivamente desplazada a la izquierda**, con
demasiado espacio vacío a la derecha: el encabezado pegado al borde y los módulos
confinados a una columna estrecha (`max-w-3xl`) mientras el resto del ancho quedaba
muerto.

## 2. Causa raíz (geometría previa)

```tsx
// ANTES
<div ref id="features" className="px-2">          // ← solo 8px de margen lateral
  <motion.div className="mb-10 sm:mb-14">         // header a sangre izquierda
    <h2 className="… max-w-2xl">…</h2>
    <p  className="… max-w-2xl">…</p>
  </motion.div>
  <div className="max-w-3xl">                     // filas 768px, otras retículas
    {AREAS.map(… fila …)}
  </div>
</div>
```

Tres retículas incoherentes (`px-2` a sangre + `max-w-2xl` del texto + `max-w-3xl` de las
filas), sin contenedor centrado: a 1440/1920 el bloque entero se pegaba al borde
izquierdo y sobraba ~60–75% del ancho a la derecha.

## 3. Corrección aplicada (una sola retícula)

```tsx
// DESPUÉS
<div ref id="features" className="px-6 sm:px-10 lg:px-16 xl:px-20">
  <div className="w-full max-w-[1360px] mx-auto">
    {/* header 12-col: título (7) + descripción (5) con hairline */}
    <motion.div className="… grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-end">
      <div className="lg:col-span-7">eyebrow + h2</div>
      <div className="lg:col-span-5 lg:pb-1.5">
        <p className="… max-w-md lg:border-l lg:border-white/[0.09] lg:pl-8">descripción</p>
      </div>
    </motion.div>
    {/* índice a 2 columnas ≥lg, mismo gutter del header */}
    <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-10 xl:gap-x-14">
      {AREAS.map(… fila …)}
    </div>
  </div>
</div>
```

Cumplimiento punto por punto del mandato:

| Requisito | Solución |
| --- | --- |
| Contenedor centrado con ancho máximo coherente | `max-w-[1360px] mx-auto` — **el mismo del hero** |
| Márgenes izquierdo/derecho equilibrados | `px-6 sm:px-10 lg:px-16 xl:px-20` — **los mismos del hero** |
| Título y descripción alineados con el conjunto | Header y filas comparten el mismo contenedor y el mismo gutter (`lg:gap-10`/`gap-x-10`) |
| Distribución coherente con las columnas siguientes | Header a 12 columnas; índice a 2 columnas en ≥lg con el mismo gutter |
| Separación vertical suficiente | `mb-12 sm:mb-16` entre header e índice; filas `py-5 sm:py-6` |
| Sin contenido pegado al borde izquierdo | El contenedor centrado aporta margen real en todo breakpoint |
| Sin grandes vacíos a la derecha | La descripción ocupa el espacio derecho del header (hairline vertical editorial); el índice usa dos columnas |
| No «centrar solo el texto» dejando tarjetas desalineadas | Header, descripción y las 9 filas comparten UNA retícula con bordes simétricos |
| Escritorio aprovecha el ancho | Índice 01·02 / 03·04 / 05·06 / 07·08 / 09 con gutter igual al del header |
| Móvil una columna, márgenes constantes | `grid-cols-1` + `px-6` constante (verificado 360/390) |
| Contenido comercial intacto | Las 9 áreas, títulos y descripciones son byte a byte los mismos; no se inventaron módulos |

## 4. Verificación

Medición real (`responsive_003_metrics.json` → `features`): el contenedor interno queda
**perfectamente centrado** en los 6 viewports, con márgenes idénticos a ambos lados:

| Viewport | margen izq | margen der | centrado |
| ---: | ---: | ---: | --- |
| 360 | 24 | 24 | ✅ (Δ0) |
| 390 | 24 | 24 | ✅ (Δ0) |
| 768 | 40 | 40 | ✅ (Δ0) |
| 1024 | 64 | 64 | ✅ (Δ0) |
| 1440 | 80 | 80 | ✅ (Δ0) |
| 1920 | 280 | 280 | ✅ (Δ0) |

Evidencia visual: `evidencia-003/before/07-features-1440-before.png` (ANTES: pegado a la
izquierda, vacío derecho) vs `evidencia-003/after/08-features-tall-1440-after.png`
(DESPUÉS: header editorial a dos voces e índice a dos columnas),
`after/09-features-390-after.png` (móvil) y `after/10-features-768-after.png` (tablet).

El contrato e2e (`#features` con elementos `h3`) se conserva: la suite completa pasó
(6168/6168).
