#!/usr/bin/env python3
"""
BLINDAJE DEL LANDING — Transform v2: dividir reglas multi-selector de modo.

PROBLEMA: Lightning CSS (Tailwind v4) envuelve las listas de selectores en
:is(...) al compilar. En Chromium, :is(... :not(:has(#landing-root)) ...)
NUNCA coincide (comportamiento verificado empíricamente), de modo que las
reglas de modo multi-selector quedarían muertas para la app interna.

SOLUCIÓN: dividir cada regla cuyo selector contenga 'html.mode-' y tenga
≥2 selectores en reglas de selector único (mismo cuerpo). Los selectores
únicos NO se envuelven en :is() y el matching con :not(:has()) funciona
(verificado: regla .animate-float sí aplica en /privacy).

- Respeta @media anidados, comentarios y paréntesis/corchetes al partir.
- Idempotente por sentinela: si el archivo ya tiene el marcador, no re-procesa.
"""
import re
import sys

FILES = [
    '/home/z/my-project/Costpro/src/styles/modes.css',
    '/home/z/my-project/Costpro/src/app/globals.css',
]
SENTINEL = '/* BLINDAJE-V2: reglas de modo divididas a selector único (evita :is() de Lightning CSS que rompe :not(:has()) en Chromium) */'


def split_top_level(selector_list: str):
    """Divide por comas de nivel superior (respetando () y [])."""
    parts, buf, depth = [], [], 0
    for ch in selector_list:
        if ch in '([':
            depth += 1
        elif ch in ')]':
            depth -= 1
        if ch == ',' and depth == 0:
            parts.append(''.join(buf))
            buf = []
        else:
            buf.append(ch)
    if buf:
        parts.append(''.join(buf))
    return [p.strip() for p in parts if p.strip()]


def process_css(src: str):
    """Recorre el CSS y divide reglas multi-selector de modo."""
    out = []
    i = 0
    n = len(src)
    split_count = 0
    while i < n:
        # comentario
        m = re.match(r'\s*/\*.*?\*/', src[i:], flags=re.S)
        if m:
            out.append(src[i:i + m.end()])
            i += m.end()
            continue
        ws = re.match(r'\s+', src[i:])
        if ws:
            out.append(src[i:i + ws.end()])
            i += ws.end()
            continue
        # @media / @supports / @keyframes / otros at-rules
        if src[i] == '@':
            # encontrar el header hasta { o ;
            j = i
            while j < n and src[j] not in '{;':
                j += 1
            if j < n and src[j] == ';':
                out.append(src[i:j + 1])
                i = j + 1
                continue
            header = src[i:j + 1]  # incluye '{'
            # cuerpo con balance de llaves
            depth, k = 1, j + 1
            while k < n and depth > 0:
                if src[k] == '{':
                    depth += 1
                elif src[k] == '}':
                    depth -= 1
                k += 1
            body = src[j + 1:k - 1]
            if header.lstrip().startswith('@media') or header.lstrip().startswith('@supports'):
                inner, cnt = process_css(body)
                split_count += cnt
                out.append(header + inner + '}')
            else:
                out.append(header + body + '}')
            i = k
            continue
        # regla normal: selector hasta '{'
        j = i
        while j < n and src[j] != '{':
            j += 1
        if j >= n:
            out.append(src[i:])
            break
        header = src[i:j]  # selector list
        depth, k = 1, j + 1
        while k < n and depth > 0:
            if src[k] == '{':
                depth += 1
            elif src[k] == '}':
                depth -= 1
            k += 1
        body = src[j + 1:k - 1]
        sels = split_top_level(header)
        mode_sels = [s for s in sels if 'html.mode-' in s]
        if len(sels) >= 2 and mode_sels:
            # dividir TODAS las reglas multi-selector de modo (uno por línea)
            for s in sels:
                out.append(f'\n{s} {{{body}}}')
            split_count += 1
        else:
            out.append(header + '{' + body + '}')
        i = k
    return ''.join(out), split_count


def main():
    total = 0
    for path in FILES:
        with open(path, 'r', encoding='utf-8') as f:
            src = f.read()
        if SENTINEL.split(' ', 2)[1] in src:
            print(f'{path}: ya procesado (sentinela) — skip')
            continue
        result, cnt = process_css(src)
        # insertar sentinela al inicio
        result = SENTINEL + '\n' + result
        # sanity: balance de llaves
        if result.count('{') != result.count('}'):
            print(f'FATAL {path}: brace imbalance', file=sys.stderr)
            sys.exit(1)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(result)
        print(f'{path}: {cnt} reglas multi-selector divididas')
        total += cnt
    print(f'TOTAL: {total}')


if __name__ == '__main__':
    main()
