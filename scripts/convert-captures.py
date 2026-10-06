#!/usr/bin/env python3
"""
convert-captures.py — PNG (retina 2880px) → WebP 1440px q82
Convierte las capturas del Centro de Ayuda al formato final que se sirve
desde public/help/capturas/ (estándar HELP-SCREENSHOT-STANDARD).

Uso:
  python3 scripts/convert-captures.py            # todo el directorio PNG
  python3 scripts/convert-captures.py pos caja   # sólo las que coincidan
"""
import sys
from pathlib import Path
from PIL import Image

SRC = Path('/home/z/my-project/scripts/captures-png')
DST = Path('/home/z/my-project/Costpro/public/help/capturas')
TARGET_WIDTH = 1440
QUALITY = 82

def main():
    filters = sys.argv[1:]
    DST.mkdir(parents=True, exist_ok=True)
    pngs = sorted(SRC.glob('*.png'))
    if filters:
        pngs = [p for p in pngs if any(f in p.stem for f in filters)]
    if not pngs:
        print('Nada que convertir'); return

    total_src = total_out = 0
    for p in pngs:
        img = Image.open(p).convert('RGB')
        if img.width != TARGET_WIDTH:
            ratio = TARGET_WIDTH / img.width
            img = img.resize((TARGET_WIDTH, round(img.height * ratio)), Image.LANCZOS)
        out = DST / f"{p.stem}.webp"
        img.save(out, 'WEBP', quality=QUALITY, method=6)
        s1, s2 = p.stat().st_size, out.stat().st_size
        total_src += s1; total_out += s2
        print(f"  {p.stem}.webp  {img.width}x{img.height}  {s1//1024}KB → {s2//1024}KB")
    print(f"\n{len(pngs)} imágenes · {total_src//1024//1024}MB PNG → {total_out//1024//1024}MB WebP · salida: {DST}")

if __name__ == '__main__':
    main()
