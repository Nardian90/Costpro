#!/usr/bin/env python3
"""
convert-landing-captures.py — PNG retina (2880x1800 / 780x1688) → WebP de ALTA
calidad para public/landing/capturas/.

FIX CALIDAD (2026-10-06, PR feat/landing-product-demo):
  La conversión anterior downscaleaba a 1440px y comprimía a ~q60-70 (archivos
  de 18-56 KB) → texto despixelado/borroso en el landing, agravado por un
  `sizes` de next/image menor que el ancho real de render (~976px) que
  forzaba upscale del navegador.

  Estándar nuevo (LANDING-SCREENSHOT-STANDARD):
   - Desktop: 2880x1800 PNG  → 2560x1600 WebP q90 method=6
     (2560px cubre el render máximo ~976px CSS @ DPR2 ≈ 1952px device + margen)
   - Móvil:   780x1688 PNG   → 780x1688 WebP q90 method=6 (sin downscale:
     el render móvil es ~100vw ≈ 430px CSS máx @ DPR3 ≈ 1290px)
   - next/image re-codifica los derivados; con source q90 la degradación
     en cadena es imperceptible para texto de UI.

Uso:
  python3 scripts/convert-landing-captures.py              # todo
  python3 scripts/convert-landing-captures.py dashboard inventario-stock
  python3 scripts/convert-landing-captures.py --mobile
"""
import sys
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parent.parent
SRC_DESKTOP = REPO / 'test-results' / 'landing-captures-png'
SRC_MOBILE = REPO / 'test-results' / 'landing-captures-mobile-png'
DST = REPO / 'public' / 'landing' / 'capturas'

# Las capturas que el landing realmente consume (src/components/landing/*)
DESKTOP = [
    'dashboard', 'selector-tiendas', 'pos-terminal', 'inventario-stock',
    'estructura-costo', 'reportes', 'tienda-publica', 'tienda-publica-productos',
]
MOBILE = [
    'dashboard', 'selector-tiendas', 'pos-terminal', 'inventario-stock',
    'estructura-costo', 'reportes', 'tienda-publica',
]

TARGET_DESKTOP_W = 2560
QUALITY = 90


def convert(src_png: Path, dst_webp: Path, target_w: int | None) -> tuple[int, int]:
    img = Image.open(src_png).convert('RGB')
    if target_w and img.width != target_w:
        ratio = target_w / img.width
        img = img.resize((target_w, round(img.height * ratio)), Image.LANCZOS)
    img.save(dst_webp, 'WEBP', quality=QUALITY, method=6)
    return src_png.stat().st_size, dst_webp.stat().st_size


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    mobile_only = '--mobile' in sys.argv
    DST.mkdir(parents=True, exist_ok=True)
    total_out = 0
    n = 0

    jobs: list[tuple[Path, Path, int | None]] = []
    if not mobile_only:
        for name in DESKTOP:
            if args and name not in args:
                continue
            jobs.append((SRC_DESKTOP / f'{name}.png', DST / f'{name}.webp', TARGET_DESKTOP_W))
    for name in MOBILE:
        if args and name not in args:
            continue
        jobs.append((SRC_MOBILE / f'{name}.png', DST / f'{name}-movil.webp', None))

    if not jobs:
        print('Nada que convertir (¿falta correr landing-captures*.mjs?)')
        return

    for src, dst, tw in jobs:
        if not src.exists():
            print(f'  ✗ falta {src.relative_to(REPO)}')
            continue
        s1, s2 = convert(src, dst, tw)
        total_out += s2
        n += 1
        print(f'  ✓ {dst.name:<34} {Image.open(dst).size[0]}x{Image.open(dst).size[1]}  {s1 // 1024}KB → {s2 // 1024}KB')
    print(f'\n{n} WebP · {total_out // 1024}KB totales · salida: {DST.relative_to(REPO)}')


if __name__ == '__main__':
    main()
