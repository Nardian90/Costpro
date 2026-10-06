# Landing — Capturas de producto (Visual Evidence)

Capturas REALES de CostPro usadas por el landing público como evidencia visual
(`FeatureVisual` en `src/components/landing/`).

## Origen

Generadas con browser automation (Playwright) contra la app real corriendo en
local (`pm2`), con un **estado demo controlado** (FASE 2/16 del mandato):

- tiendas ficticias: `Sucursal Habana · Sucursal Vedado · Sucursal Playa`
- productos ficticios (canasta básica genérica, CUP) — sin marcas
- ventas ficticias vía `/api/pos/checkout` (V2), incl. historial de 14 días
- **sin PII**: nombres/emails/teléfonos/direcciones inventados

## Pipeline de regeneración

```bash
# 1) servidor vivo (pm2) + .env con credenciales
node scripts/landing-demo-provision.cjs     # estado demo (idempotente)

# 2) capturas (desktop 1440x900 @2x y móvil 390x844 @2x)
node scripts/landing-captures.mjs           # PNG retina → test-results/
node scripts/landing-captures.mjs tienda-publica   # sólo las indicadas
node scripts/landing-captures-mobile.mjs

# 3) convertir PNG → WebP 1440px q82 en public/landing/capturas/
#    (mismo estándar que public/help/capturas — HELP-SCREENSHOT-STANDARD)
python3 -c "from PIL import Image; ..." # ver convert-captures.py como patrón

# 4) limpieza del estado demo (net zero)
node scripts/landing-demo-cleanup.cjs
```

Contexto del demo: `.e2e-run-contexts/landing-demo-context.json` (gitignored).

## Convenciones

- Desktop: `<vista>.webp` — 1440x900, q82 (~20-90KB c/u)
- Móvil: `<vista>-movil.webp` — 739x1600 vertical (art direction FASE 10:
  en móvil se muestra la versión móvil real de la pantalla, no un desktop
  encogido ilegible)
- `demo-products/` — imágenes de producto ficticias para la vitrina demo
  (sembradas por el provisioner como `image_url`)
