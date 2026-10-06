#!/usr/bin/env python3
"""
BLINDAJE DEL LANDING — Transform mecánico de src/styles/modes.css
Prefija TODOS los selectores .mode-performance / .mode-enhanced con
html.mode-XXX:not(:has(#landing-root)) para que las reglas de modo de la
app interna NUNCA alcancen al landing (app y landing nunca coexisten).

- Idempotente: si una línea ya contiene 'html.mode-', no se re-procesa.
- Salta comentarios de bloque (state machine) para no reescribir doc.
"""
import re
import sys

PATH = '/home/z/my-project/Costpro/src/styles/modes.css'

def transform_line(line: str) -> str:
    if 'html.mode-' in line:
        return line  # ya transformado (idempotencia)
    line = line.replace(
        '.mode-performance',
        'html.mode-performance:not(:has(#landing-root))'
    )
    line = line.replace(
        '.mode-enhanced',
        'html.mode-enhanced:not(:has(#landing-root))'
    )
    return line

def main() -> None:
    with open(PATH, 'r', encoding='utf-8') as f:
        src = f.read()

    out_lines = []
    in_comment = False
    replaced = 0
    for raw in src.split('\n'):
        line = raw
        has_open = '/*' in line
        has_close = '*/' in line
        if in_comment:
            if has_close:
                idx = line.index('*/') + 2
                head, tail = line[:idx], line[idx:]
                if tail.strip():
                    before = tail
                    tail = transform_line(tail)
                    if tail != before:
                        replaced += 1
                line = head + tail
                in_comment = False
            out_lines.append(line)
            continue
        if has_open:
            if has_close and line.index('/*') < line.index('*/'):
                parts = re.split(r'(/\*.*?\*/)', line)
                new_parts = []
                for p in parts:
                    if p.startswith('/*'):
                        new_parts.append(p)
                    else:
                        before = p
                        p2 = transform_line(p)
                        if p2 != before:
                            replaced += 1
                        new_parts.append(p2)
                line = ''.join(new_parts)
            else:
                idx = line.index('/*')
                head, tail = line[:idx], line[idx:]
                if head.strip():
                    before = head
                    head = transform_line(head)
                    if head != before:
                        replaced += 1
                line = head + tail
                in_comment = True
            out_lines.append(line)
            continue
        before = line
        line = transform_line(line)
        if line != before:
            replaced += 1
        out_lines.append(line)

    result = '\n'.join(out_lines)

    if result.count('{') != src.count('{') or result.count('}') != src.count('}'):
        print('FATAL: brace balance changed', file=sys.stderr)
        sys.exit(1)

    with open(PATH, 'w', encoding='utf-8') as f:
        f.write(result)

    # Verificación: ocurrencias sin prefijar fuera de comentarios
    in_comment = False
    unprefixed = []
    for i, raw in enumerate(result.split('\n'), 1):
        work = ''
        pos = 0
        in_line_comment = in_comment
        while True:
            o = raw.find('/*', pos)
            c = raw.find('*/', pos)
            if in_line_comment:
                if c == -1:
                    break
                pos = c + 2
                in_line_comment = False
            else:
                if o == -1:
                    work += raw[pos:]
                    break
                work += raw[pos:o]
                pos = o + 2
                in_line_comment = True
        if in_comment and '*/' not in raw:
            continue
        if in_comment and '*/' in raw:
            in_comment = False
            continue
        if '/*' in raw and '*/' not in raw:
            in_comment = True
        if work and ('.mode-performance' in work or '.mode-enhanced' in work):
            if 'html.mode-' not in work:
                unprefixed.append((i, work.strip()[:80]))

    print(f'Líneas transformadas: {replaced}')
    if unprefixed:
        print('ADVERTENCIA — selectores sin prefijo fuera de comentarios:')
        for i, s in unprefixed[:10]:
            print(f'  L{i}: {s}')
        sys.exit(2)
    print('OK: todos los selectores de modo llevan html.mode-…:not(:has(#landing-root))')

if __name__ == '__main__':
    main()
