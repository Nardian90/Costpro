#!/usr/bin/env python3
"""first-load-js.py — Calcula el JS de primera carga por ruta desde build-manifest.json
de Next.js 16 (Turbopack). Uso: python3 first-load-js.py [.next/build-manifest.json]"""
import json, os, sys

BASE = '/home/z/my-project/Costpro/.next'
mf_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE, 'build-manifest.json')
mf = json.load(open(mf_path))

def size(path):
    try:
        return os.path.getsize(os.path.join(BASE, path))
    except OSError:
        return 0

pages = mf.get('pages', {})
# Polyfill + framework chunks van en la primera carga de TODAS las rutas
polyfill_files = mf.get('polyfillFiles', [])
polyfill_kb = sum(size(f) for f in polyfill_files) / 1024

rows = []
for route, files in pages.items():
    js = [f for f in files if f.endswith('.js')]
    css = [f for f in files if f.endswith('.css')]
    js_kb = sum(size(f) for f in js) / 1024
    css_kb = sum(size(f) for f in css) / 1024
    rows.append((route, len(files), js_kb, css_kb))

rows.sort(key=lambda r: -r[2])
print(f"{'Ruta':<38}{'Archivos':>9}{'JS (KB)':>10}{'CSS (KB)':>10}")
print('-' * 67)
for route, n, js_kb, css_kb in rows:
    print(f"{route:<38}{n:>9}{js_kb:>10.0f}{css_kb:>10.1f}")
print('-' * 67)
print(f"polyfillFiles: {polyfill_kb:.0f} KB | total chunks en .next/static: "
      f"{sum(os.path.getsize(os.path.join(dp, f)) for dp, dn, fn in os.walk(os.path.join(BASE, 'static')) for f in fn) / 1024 / 1024:.1f} MB")
