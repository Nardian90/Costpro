#!/usr/bin/env python3
"""
reconcile-execute.py — Ejecutor de la reconciliación del historial de migraciones.

NUNCA se ejecuta contra producción sin --execute --target=prod --yes-i-know.
Por defecto imprime el resumen del inventario y la decisión documentada en
docs/MIGRATION-HISTORY-RECONCILIATION-v2.24.1.md.

Requisitos de la ventana de ejecución (checklist del doc):
  1. Inventario 100% 'materializada-verificada' (scripts/reconcile-inventory.py).
  2. Backup del pre-dump fuera del servidor.
  3. Ventana sin operaciones de caja activas.
  4. Post: supabase db push --dry-run sin pendientes.
"""
import json, sys, os

def main():
    rep = json.load(open('audit/migration-reconciliation.json'))
    print('── RESUMEN DE INVENTARIO ──')
    print('sin registrar:', sum(1 for m in rep['migrations'] if not m['in_history']))
    for k, v in sorted(rep['summary'].items()):
        print(f'  {k}: {v}')
    if os.environ.get('RECONCILE_EXECUTE') != 'yes-i-know' or '--execute' not in sys.argv:
        print()
        print('Sin --execute: SOLO LECTURA. Ver docs/MIGRATION-HISTORY-RECONCILIATION-v2.24.1.md')
        print('para el procedimiento completo (pre-dump, transacción única, recuperación).')
        return 0
    print('La ejecución real requiere que el inventario sea 100% materializada-verificada.')
    if any(rep['summary'].get(k) for k in ('efectos-parciales-o-ausentes', 'firma-distinta', 'no-verificable-por-catalogo')):
        print('ABORTADO: el inventario aún tiene estados no verificados (ver doc).')
        return 1
    print('TODO: insertar filas (transacción única) — implementar cuando el inventario esté limpio.')
    return 0

if __name__ == '__main__':
    sys.exit(main())
