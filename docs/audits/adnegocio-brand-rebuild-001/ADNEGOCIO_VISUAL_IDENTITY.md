# ADNEGOCIO VISUAL IDENTITY

**ADN-BRAND-REBUILD-001 · 2026-11-18**

## 1. Decisión de marca

| Elemento | Valor |
|---|---|
| Nombre oficial | **ADNegocio** (navegador, metadatos, comunicaciones) |
| Símbolo compacto | **ADN** |
| Descriptor | **NEGOCIO** (bajo el símbolo, en verde neón) |
| Denominación histórica | COSTPRO — solo referencias internas/documentales (`previousBrand`) |
| Nota histórica canónica | «ADNegocio, anteriormente COSTPRO» |

ADNegocio representa la evolución del producto: de herramienta de fichas de costo a
**plataforma empresarial integral** (finanzas, ventas, inventario, compras, costo,
multitienda, reportes, control documental).

## 2. Sistema de logotipo (§4 de la misión)

- **A. Logotipo principal** — composición tipográfica: `ADN` dominante (cap 100) +
  `NEGOCIO` debajo (cap 17, tracking editorial 9.5, centrado, verde neón).
- **B. Wordmark** — `ADNegocio` horizontal en una palabra; el punto de la «i»
  (tittle) en verde neón = detalle de identidad propio y discreto.
- **C. Isotipo** — tile redondeado (512, rx 100) negro profundo con `ADN`;
  reconocible a 16 px (verificado en hoja de contacto). Monograma sin tile
  (`currentColor`) para sidebar colapsado y superficies heredadas.
- **D. Versiones de color** — oscuro (ADN blanco + NEGOCIO verde), claro (ADN
  tinta #0A0E12 + NEGOCIO verde), monocromo negro, monocromo blanco, verde sobre
  oscuro (tile isotipo-verde).

### Craft técnico

- Letterformas **vectoriales reales** extraídas de Space Grotesk Bold (la fuente
  display de la plataforma; OFL) — sin capturas rasterizadas, sin dependencia de
  fuentes del sistema, escalables a cualquier resolución.
- Composición por **tinta** (ink extents): la caja abraza la tinta real de los
  glifos (la «A» de Space Grotesk tiene side-bearing negativo).
- SVG ligeros (657–3,873 bytes), `role="img"` + `aria-label`, sin sombras ni
  degradados; color por `fill`/`currentColor`.
- Generador reproducible: `scripts/gen_brand_assets.py` (+ `gen_brand_icons.cjs`
  para los PNG de PWA). `src/components/brand/adnPaths.ts` es GENERADO — no editar.

## 3. Paleta y tokens (§3 de la misión)

| Token | Valor | Uso |
|---|---|---|
| `brand-primary` | `#22C55E` | Verde neón: acciones principales, indicadores, acento de identidad |
| `brand-accent` | `#4ADE80` | Detalles y gradientes sutiles |
| `brand-background` | `#05070A` | Negro profundo (fondo base del landing) |
| `brand-surface` | `#0B1117` | Superficie elevada |
| `brand-border` | `rgba(255,255,255,0.08)` | Bordes sutiles |
| `brand-text` | `#F2F6F4` | Texto principal |
| `brand-muted` | `#8A97A3` | Texto secundario |
| `brand-ink` | `#0A0E12` | Tinta sobre superficies claras |
| Éxito / advertencia / error | `#22C55E` / `#F59E0B` / `#EF4444` | Estados |

- Verde neón como **acento controlado** — nunca superficie completa (mandato §3).
- Contraste verificado: `#22c55e` sobre `#05070A` ≈ 8.6:1; blanco ≈ 17.9:1 (AA/AAA).
- Tipografía: Space Grotesk (display) + Inter (texto).
- Definidos en `src/config/brand.ts` (fuente única) y aplicados al landing vía
  `src/styles/landing-shield.css` (superficie aislada, no hereda temas internos).

## 4. Aislamiento del landing (§11)

El landing conserva el blindaje 2026-10-06: raíz `#landing-root`, tokens fijados
por `:has(#landing-root)` y reglas `.mode-performance/.mode-enhanced` acotadas con
`html:not(:has(#landing-root))`. El fondo del landing pasó de `#020617` a `#05070A`
(identidad), sin tocar los tokens de la aplicación interna.

## 5. Componentes React

`src/components/brand/AdnBrand.tsx`: `AdnLogo`, `AdnWordmark`, `AdnMonograma`,
`AdnIsotipo` — variantes `oscuro | claro | mono | blanco-mono`. Los componentes
reutilizan `src/config/brand.ts`; no hay cadenas de marca independientes nuevas.
