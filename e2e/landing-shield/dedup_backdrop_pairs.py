#!/usr/bin/env python3
"""
BLINDAJE DEL LANDING — Transform v3: dedup del par backdrop-filter.

PROBLEMA: Lightning CSS deduplica el par
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
emitiendo SOLO -webkit-backdrop-filter, que Chromium NO aplica sobre la
propiedad estándar → el kill de glass quedaba inerte (regla con css vacío).

FIX: en las reglas acotadas (html.mode-…), eliminar la línea
'-webkit-backdrop-filter: none !important;' cuando la línea anterior es la
declaración estándar equivalente. Lightning conserva la declaración estándar
cuando no va emparejada (verificado en reglas sidebar compiladas).

Idempotente: si no hay pares, no cambia nada.
"""
import sys

PATHS = [
    '/home/z/my-project/Costpro/src/styles/modes.css',
    '/home/z/my-project/Costpro/src/app/globals.css',
]

STD = 'backdrop-filter: none !important;'
WEBKIT = '-webkit-backdrop-filter: none !important;'

def main():
    total = 0
    for path in PATHS:
        with open(path, encoding='utf-8') as f:
            lines = f.read().split('\n')
        out = []
        removed = 0
        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped == WEBKIT and out and out[-1].strip() == STD:
                out.pop()  # elimina la estándar…
                out.append(line.replace(WEBKIT, STD))  # …y reemplaza la -webkit por la estándar
                removed += 1
                continue
            out.append(line)
        with open(path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(out))
        print(f'{path}: {removed} pares deduplicados (se conserva la declaración estándar)')
        total += removed
    print(f'TOTAL: {total}')

if __name__ == '__main__':
    main()
