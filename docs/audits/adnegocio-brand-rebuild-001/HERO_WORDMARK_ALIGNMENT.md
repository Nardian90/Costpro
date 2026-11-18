# HERO_WORDMARK_ALIGNMENT — Alineación del wordmark del hero con el menú lateral autenticado

**Misión:** ADN-LANDING-FINAL-POLISH-003 · **Sección:** §3 · **Fecha:** 2026-11-18 · **Rama:** `feat/adnegocio-landing-final-polish-003-20261118`

## 1. Defecto reportado

El logotipo del hero del landing no usaba el mismo tratamiento visual que el menú lateral
de la aplicación autenticada. El landing renderizaba en su encabezado el componente SVG
`AdnWordmark` (todas las letras en blanco, acento verde únicamente en el punto de la «i»),
mientras que el menú lateral autenticado (`src/components/views/terminal/Sidebar.tsx`)
usa el tratamiento tipográfico aprobado por el propietario: **«ADN» verde + «egocio»
blanco**, en una sola línea, sin isotipo ni lockup adicional.

## 2. Referencia (tratamiento aprobado — Sidebar.tsx)

```tsx
// src/components/views/terminal/Sidebar.tsx (sidebar expandido)
<button … className="… font-black text-lg tracking-tight leading-none …">
  <span className="text-green-600 dark:text-green-400">ADN</span>egocio
</button>
```

## 3. Corrección aplicada

- `src/components/landing/HeroSection.tsx` (encabezado del landing): se sustituye
  `<AdnWordmark height={18} />` por el componente compartido del landing
  **`BrandWordmark`**, que materializa exactamente ese lenguaje:
  `<span className="text-[#22c55e]">ADN</span><span className="text-white">egocio</span>`.
  Clases aplicadas: `text-lg font-bold tracking-tight leading-none
  font-[family-name:var(--font-space-grotesk)]` — coherentes con los otros tres usos del
  componente en el landing (drawer móvil, footer, CTA final), reutilizando el componente
  y los tokens existentes.
- Se elimina el import de `AdnWordmark` del hero. El componente SVG permanece en la
  biblioteca de marca (`src/components/brand/AdnBrand.tsx`) corregido (ver
  `DESCENDER_G_CLIPPING_FIX.md`), pero ya no forma parte del encabezado del landing.
- El símbolo «ADN» (`AdnMonograma`) sigue reservado a favicon, PWA y rail colapsado del
  sidebar, según la arquitectura de marca aprobada en ADN-BRAND-REBUILD-001.

## 4. Reglas de identidad verificadas

| Regla | Estado |
| --- | --- |
| Una sola identidad legible («ADNegocio») | ✅ — una sola pieza en el header |
| Sin «ADN ADNegocio» / sin repetición | ✅ — el titular no lleva marca adicional |
| Sin espacios artificiales dentro de la palabra | ✅ — spans adyacentes sin gap |
| Sin segunda versión tipográfica contradictoria | ✅ — un solo componente de marca en el hero |
| Tratamiento idéntico al sidebar autenticado | ✅ — mismo lenguaje (verde #22c55e del landing = familia del acento; sidebar usa tokens de tema `green-400/600` de la misma familia) |

## 5. Evidencia

- `evidencia-003/before/zoom-logo-header.png` — ANTES: wordmark SVG blanco con «g» roída.
- `evidencia-003/after/zoom-logo-header.png` — DESPUÉS: «ADNegocio» con ADN verde + egocio blanco.
- `evidencia-003/after/zoom-header-360.png` y `zoom-header-1920.png` — el tratamiento se mantiene en móvil y escritorio.
- Contrato de regresión: `src/__tests__/components/landing-brand-enhanced.test.tsx`
  («contrato de fuente: identidad única…» exige `BrandWordmark` en el hero y ausencia de
  `AdnWordmark`).
