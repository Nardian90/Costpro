# DESCENDER_G_CLIPPING_FIX — Corrección definitiva del recorte de la descendente «g»

**Misión:** ADN-LANDING-FINAL-POLISH-003 · **Sección:** §4 · **Fecha:** 2026-11-18

## 1. Síntoma

La descendente de la letra «g» de «ADNegocio» aparecía cortada por su parte inferior, en
escritorio y móvil, en dos superficies:

1. **Logotipo del encabezado** (SVG): la palabra llegaba a leerse «ADNeaocio» — la bowl
   inferior de la «g» desaparecía por completo.
2. **Titular monumental** («MÁS negocio.» en Instrument Serif italic): la cola inferior de
   la «g» se cortaba con un borde plano.

## 2. Causa raíz — investigación

### 2.1 Wordmark SVG (`AdnWordmark`)

`src/components/brand/adnPaths.ts` (generado desde Space Grotesk Bold) declara métricas
`capHeight: 100` y `baseline y=100`. El componente renderizaba:

```
viewBox="0 0 742.43 100"
```

pero la **caja de tinta real** de la palabra excede esa caja:

| Glifo | Extremo | y |
| --- | --- | --- |
| `g` (descendente) | fondo del bucle inferior | **128.57** |
| `e` `o` `c` (redondas, overshoot) | borde inferior | 102 |
| punto de la «i» | borde superior | **−2** |

El SVG recortaba todo lo que sale de `[0..100]`: la descendente completa de la «g» (28.57
unidades) y el overshoot de las redondas, además del punto superior de la «i». El defecto
era **estructural** (viewBox), no de CSS: ocurría a cualquier tamaño de renderizado.

### 2.2 Máscara del titular («negocio.»)

La línea 2 del `h1` («MÁS negocio.») usa una máscara `overflow-hidden` para el reveal
ascendente. Contenía `pb-[0.1em]` — insuficiente: la descendente de Instrument Serif
desborda la caja de línea (la línea usa `leading 0.9 < 1`), y el recorte afectaba a la
«g» de «negocio.» en el estado final de la animación.

### 2.3 Causas descartadas

Se revisaron el resto de hipótesis del mandato y **no** concurren: no hay `clip-path`,
no hay `transform` persistente (las transformaciones de entrada terminan en `0`), no hay
posicionamiento absoluto sobre el titular, no hay altura fija del contenedor del
wordmark, y el `line-height` del header (`leading-none`) no recorta porque ningún
ancestro del enlace del logo tiene `overflow: hidden`.

## 3. Corrección aplicada (en el origen)

### 3.1 `src/components/brand/AdnBrand.tsx`

```ts
const WORDMARK_INK_TOP = -4;      // punto de la «i» (−2) + margen
const WORDMARK_INK_BOTTOM = 131;  // descendente «g» (128.57) + margen
// viewBox={`0 ${WORDMARK_INK_TOP} ${wordmarkInkWidth} ${WORDMARK_VIEWBOX_HEIGHT}`}
```

El viewBox ahora es `0 -4 742.43 135` — contiene ascendentes, cap-height, overshoot y
descendentes. **No** se redujo la fuente ni se sustituyó letra alguna.

### 3.2 `src/components/landing/HeroSection.tsx` (máscara del titular)

```
pb-[0.1em] → pb-[0.34em]  ·  -mb-[0.1em] → -mb-[0.34em]  ·  y inicial 118% → 146%
```

- El `padding-bottom` cubre la tinta real de la descendente serif.
- El margen negativo compensa el padding: el ritmo vertical del hero no cambia.
- El punto de partida del reveal se recalcula (`y ≥ 1 + pb/alturaDeLínea`) para que la
  línea siga oculta al inicio: `146% ≥ 1 + 0.34em/0.963em = 1.353` con margen.

## 4. Verificación (numérica + visual, 6 viewports)

Método: `measureText('negocio.')` con la fuente computada real devuelve
`actualBoundingBoxDescent` (tinta bajo la baseline); se compara contra el borde inferior
de la máscara (`maskBottom = innerTop + alturaLínea − padding? …`; cálculo directo del
rect del clip). Resultados (`responsive_003_metrics.json`):

| Viewport | Tinta bajo baseline (px) | Borde máscara (px) | Tinta+baseline (px) | Margen libre | Resultado |
| ---: | ---: | ---: | ---: | ---: | --- |
| 360 | 7.0 | 351.6 | 340.0 | **+11.6** | PASS |
| 390 | 8.0 | 349.4 | 338.7 | **+10.7** | PASS |
| 768 | 10.0 | 337.2 | 322.5 | **+14.8** | PASS |
| 1024 | 13.0 | 379.2 | 358.9 | **+20.2** | PASS |
| 1440 | 18.0 | 445.7 | 417.2 | **+28.5** | PASS |
| 1920 | 20.0 | 472.2 | 440.9 | **+31.3** | PASS |

Visual: `evidencia-003/after/zoom-negocio-g.png` (1440), `zoom-negocio-g-390.png` (390) —
el bucle inferior de la «g» se ve completo; `zoom-logo-header.png` — «ADNegocio» íntegro.
El resto de letras (ascendentes de «d», «b», overshoot de «o») tampoco se recortan.

## 5. Regresión

Contrato añadido en `landing-brand-enhanced.test.tsx`: el SVG de marca debe declarar la
caja de tinta (`WORDMARK_INK_TOP`/`WORDMARK_INK_BOTTOM`) y la máscara sus valores
correctos (`pb-[0.34em]`, `y: '146%'`).
