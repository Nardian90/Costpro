# BRAND ASSET INVENTORY — ADNegocio

**ADN-BRAND-REBUILD-001 · 2026-11-18**

## 1. Activos vectoriales nuevos (`public/brand/`, 12 SVG)

| Archivo | Versión | Bytes |
|---|---|---|
| `adnegocio-logo-principal-oscuro.svg` | Logotipo principal (ADN blanco + NEGOCIO verde) | 3,197 |
| `adnegocio-logo-principal-claro.svg` | Logotipo principal sobre claro | 3,197 |
| `adnegocio-logo-mono.svg` | Monocromo negro | 3,197 |
| `adnegocio-logo-blanco-mono.svg` | Monocromo blanco | 3,197 |
| `adnegocio-wordmark-oscuro.svg` | Wordmark ADNegocio (i-dot verde) | 3,873 |
| `adnegocio-wordmark-claro.svg` | Wordmark sobre claro | 3,873 |
| `adnegocio-wordmark-mono.svg` | Wordmark monocromo | 3,873 |
| `adnegocio-monograma.svg` | Símbolo ADN (currentColor) | 657 |
| `adnegocio-isotipo.svg` | Tile favicon/PWA (ADN blanco sobre negro) | 798 |
| `adnegocio-isotipo-verde.svg` | Tile verde sobre oscuro | 798 |
| `adnegocio-isotipo-claro.svg` | Tile blanco sobre tinta | 798 |
| `adnegocio-isotipo-mono.svg` | Tile monocromo | 798 |

Todos: letterformas reales de Space Grotesk Bold (OFL), sin rasterizados,
composición por tinta, `viewBox` exacto, aria-label incluido.

## 2. Componentes React (`src/components/brand/`)

- `AdnBrand.tsx` — `AdnLogo`, `AdnWordmark`, `AdnMonograma`, `AdnIsotipo`.
- `adnPaths.ts` — GENERADO (no editar a mano): paths de ADN, descriptor NEGOCIO y
  wordmark con métricas (`adnInkWidth` 289.43, wordmark 742.43, cap 100).

## 3. Configuración central

- `src/config/brand.ts` — `BRAND` (appName/brandSymbol/brandDescriptor/previousBrand/
  historyNote) + `BRAND_TOKENS` (paleta). Fuente única de verdad.
- `src/config/app.ts` — `BRAND_NAME = 'ADNegocio'` (alineado).

## 4. Favicon / PWA (regenerados desde el isotipo)

| Activo | Estado |
|---|---|
| `public/logo.svg` · `public/icon.svg` | Reemplazados por el isotipo (mismas rutas — metadata intacta) |
| `public/icons/icon-{48,72,96,144,192,512}.png` | Regenerados (tile transparente) |
| `public/icons/icon-512-maskable.png` | Regenerado (zona segura 80%) |
| `public/apple-touch-icon.png` | Nuevo, 180px, fondo opaco |
| `public/manifest.json` | name/short_name/labels → ADNegocio; `web+costpro` intacto |

Verificación por píxeles: esquinas oscuras 4/4, tinta clara/verde presente en todas
las tallas. Generador: `scripts/gen_brand_icons.cjs` (Playwright, omitBackground).

## 5. Identidad en las superficies

| Superficie | Tratamiento |
|---|---|
| Landing hero | Lockup `AdnIsotipo` 46px + `BrandWordmark` texto |
| Landing header (fixed) | Isotipo-chip al inicio → `AdnWordmark` SVG al scroll |
| Sidebar expandido | `ADN` verde + `egocio` (texto, tema-consistente) |
| Sidebar rail | `AdnMonograma` 15px verde |
| Splash de arranque | `ADN` verde + `egocio` blanco |
| Splash de vista | `AdnMonograma` 11px en tile con gradiente |
| Fondo de carga de vista | Texto `ADNEGOCIO` (clase técnica intacta) |
| Documentos generados | Pies/encabezados «ADNegocio — …», filenames `ADNegocio_*` |
| Legales Res.11 | Monograma «ADN» neutro (sc-logo) |

## 6. Generadores (scripts)

- `scripts/gen_brand_assets.py` — SVGs + `adnPaths.ts` (idempotente).
- `scripts/gen_brand_icons.cjs` — PNGs PWA desde el isotipo.
- Hoja de contacto de verificación: `scripts/out/brand-sheet.png` (revisada).
