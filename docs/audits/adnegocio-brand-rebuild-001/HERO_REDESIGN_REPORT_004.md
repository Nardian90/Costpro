# ADN-LANDING-HERO-AND-PAGER-FIX-004 — Informe del rediseño del hero

**Misión:** ADN-LANDING-HERO-AND-PAGER-FIX-004 · **Ámbito:** landing pública
**Fecha:** 2026-11-19 · **Rama:** `feat/adn-landing-hero-and-pager-fix-004-20261119`

## A. Diagnóstico

### Qué comunicaba el hero (ANTES)
1. Eyebrow mono: «PLATAFORMA DE GESTIÓN EMPRESARIAL — MULTI-TIENDA» (categoría).
2. Titular monumental: «MENOS MALABARES. MÁS negocio.» (el mensaje publicitario,
   con «negocio.» en serif italic verde como acento mayor).
3. Promesa + CTAs en columna 7, escena editorial de los cuatro malabares en
   columna 5, selector de tres caminos debajo.

### Por qué ADNegocio no tenía presencia
- El nombre del producto existía **solo** como wordmark del header fijo
  (`text-lg`, ~24px) en la esquina superior izquierda.
- El peso visual recaía en el eslogan: «negocio.» (serif verde a 7.2rem) era
  tipográficamente ~5× mayor que el wordmark del header y semánticamente más
  cercano a la promesa que al nombre de la aplicación.
- Resultado: el visitante recordaba la frase («menos malabares, más negocio»)
  pero no necesariamente identificaba **cómo se llama el producto**.
- Hallazgo adicional del análisis de composición: existía una **zona muerta
  vertical** (~170px) entre el titular y la promesa en la columna izquierda —
  un vacío accidental creado por el centrado vertical contra la escena alta.

## B. Alternativas evaluadas

| Alternativa | Composición | Veredicto |
|---|---|---|
| **A1 «La marca abre»** | Wordmark gigante sobre el titular; eslogan debajo | Clásica y clara, pero menos memorable; la marca compite con el eyebrow por la misma posición |
| **A2 «La firma» (ELEGIDA)** | La marca es la pieza protagónica de la columna principal, entre el titular y la promesa, con hairline verde editorial | Ocupa la zona muerta (vacío accidental → pieza intencional), queda cerca del centro óptico y permite la narrativa de animación «el mensaje firma el nombre» |
| **B «Fusión»** | «MENOS MALABARES. MÁS ADNegocio.» — el nombre completa la frase | Máxima integración pero **alteraba el texto del eslogan aprobado en ADN-BRAND-HERO-REFINEMENT-002**; descartada para no rehacer identidad ya aprobada |

## C. Composición implementada (A2)

```
[eyebrow mono]    PLATAFORMA DE GESTIÓN EMPRESARIAL — MULTI-TIENDA
[titular]         MENOS MALABARES.        (reducido 7.2rem → 6.6rem)
                  MÁS negocio.            (serif verde — íntegro)
[LA FIRMA]        — ADNegocio             ← NUEVO: BrandWordmark a
                                            clamp(2.7rem, 5.3vw, 5.1rem)
[promesa+CTAs]    Las operaciones…        [escena N.01–N.04]
[3 caminos]       ¿Qué quieres hacer?
```

Decisiones de dirección artística (criterios Awwwards + Otter 2026: jerarquía
inmediata de marca, primera pantalla con la promesa, color acento con
intención, microinteracciones con significado):

- **Identidad única:** la firma reutiliza el MISMO `BrandWordmark` del menú
  lateral autenticado (`ADN` verde `#22c55e` + `egocio` blanco, Space Grotesk
  bold) — ninguna segunda identidad gráfica.
- **Jerarquía tipográfica en tres actos:** mensaje (6.6rem) → marca (5.1rem)
  → promesa (18-20px). La marca es perceptible sin anular al eslogan.
- **Narrativa de animación:** MENOS asciende → MALABARES se asienta (caos→
  orden) → MÁS negocio. llega por máscara → **la firma revela el nombre por
  máscara ascendente (delay 0.78s)**. El remate del relato es el nombre.
  Máscara con `pb-[0.3em]` para cubrir la descendente de la «g» (lección de
  la misión 003 §4) y arranque oculto `y:148%` recalculado.
- **Equilibrio:** `items-start` en la retícula 12-col (ciclo de revisión 2:
  `items-center` centraba la pila contra la escena alta y recreaba el vacío).
  La escena N.01–N.04 conserva su papel de apoyo.
- **Sin recargos:** no hay WebGL, 3D, vídeo ni partículas nuevas; se reusan
  la retícula hero, los dos glows y ParticleRain existentes.
- **Responsive intencional:** en móvil la pila monumental se apila
  (eyebrow → MENOS / MALABARES. / MÁS negocio. → firma → promesa → CTAs);
  la marca conserva su propio tamaño fluido y plena legibilidad a 360px.

## D. Resultado

El primer pantallazo responde las tres preguntas de la misión:
1. ¿Cómo se llama? **ADNegocio** — pieza protagónica del hero.
2. ¿Qué es? Plataforma de gestión empresarial multi-tienda (eyebrow + promo).
3. ¿Qué beneficio? Centralizar la gestión en un solo sistema (promesa + CTAs).

Evidencia: `evidencia-004/before-hero-1440.png` vs `evidencia-004/after-hero-1440.png`
(más 360/390/768/1024/1648×924/1920 y zoom de descendentes en `evidencia-004/`).
