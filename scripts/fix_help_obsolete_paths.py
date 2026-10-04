#!/usr/bin/env python3
"""
fix_help_obsolete_paths.py — FASE 23 (help-center-library-evolution)
Sustituciones deterministas de rutas de navegación obsoletas en knowledge/help.
Cada regla: (old, new) — solo se tocan archivos .md de knowledge/help.
"""
import re
from pathlib import Path

BASE = Path('/home/z/my-project/Costpro/knowledge/help')

RULES = [
    # ── Rutas MULTI-TIENDA (sección que ya no existe) → navegación actual ──
    ('`MULTI-TIENDA > Gestión Inventario > Catálogo Maestro`', '`Operación → Almacén → Inventario (tab Catálogo)`'),
    ('`MULTI-TIENDA > Gestión Inventario > Stock Actual`', '`Operación → Almacén → Inventario (tab Stock)`'),
    ('`MULTI-TIENDA > Gestión Inventario > Trazabilidad Stock`', '`Operación → Almacén → Inventario (tab Trazabilidad)`'),
    ('`MULTI-TIENDA > Gestión Inventario > Ajustes Documentales`', '`Operación → Almacén → Ajustes Documentales`'),
    ('`MULTI-TIENDA > Logística > Nueva Recepción`', '`Operación → Logística → Recepciones (botón Nueva recepción)`'),
    ('`MULTI-TIENDA > Logística > Historial de Recepciones`', '`Operación → Logística → Recepciones`'),
    ('`MULTI-TIENDA > Logística > Transferencia Stock`', '`Operación → Logística → Transferencia Stock`'),
    ('`MULTI-TIENDA > Logística > Auditoría Conteo`', '`Ventas → Opciones → Venta por Conteo`'),
    ('`MULTI-TIENDA > Punto de Venta > Terminal de Venta`', '`Operación → Ventas → Vender`'),
    ('`MULTI-TIENDA > Punto de Venta > Historial de Ventas`', '`Operación → Ventas → Opciones → Historial de Ventas`'),
    ('`MULTI-TIENDA > Punto de Venta > Arqueo de Caja`', '`Operación → Ventas → Opciones → Caja`'),
    ('`MULTI-TIENDA > Ventas > Catálogo de Ventas`', '`Operación → Ventas → Opciones → Tabla de Venta`'),
    ('MULTI-TIENDA > Ventas > Catálogo de Ventas', 'Operación → Ventas → Opciones → Tabla de Venta'),
    # ── Configuración (sección ahora llamada SISTEMA / destinos reales) ──
    ('Configuración → Usuarios → Memberships', 'Sistema → Usuarios → Memberships'),
    ('Configuración → Usuarios', 'Sistema → Usuarios'),
    ('Configuración → Ajustes Globales', 'Sistema → Ajustes'),
    ('Configuración → Tiendas', 'Operación → Gestión de Tiendas'),
    ('Configuración → Tareas programadas', 'Reportes (botón Programar)'),
    # ── Nombres retirados del producto ──
    ('Tablas IPV', 'Tabla de Venta'),
]

# Anclas markdown: el TOC debe apuntar al heading renombrado
ANCHOR_RULES = [
    ('(#1-acceder-al-terminal-de-venta)', '(#1-acceder-a-vender)'),
]

changed = {}
for md in BASE.rglob('*.md'):
    text = md.read_text(encoding='utf-8')
    orig = text
    for old, new in RULES:
        text = text.replace(old, new)
    for old, new in ANCHOR_RULES:
        text = text.replace(old, new)
    if text != orig:
        md.write_text(text, encoding='utf-8')
        changed[str(md.relative_to(BASE))] = sum(
            1 for old, _ in RULES if old in orig
        )

print("Archivos modificados:")
for f, n in sorted(changed.items()):
    print(f"  {f}: {n} reglas aplicadas")
print(f"Total: {len(changed)} archivos")

# Verificación: términos que NO deben quedar
leftover = []
for term in ['MULTI-TIENDA >', 'Terminal de Venta', 'Configuración → Usuarios',
             'Configuración → Ajustes Globales', 'Configuración → Tiendas',
             'Configuración → Tareas programadas', 'Tablas IPV']:
    for md in BASE.rglob('*.md'):
        for i, line in enumerate(md.read_text(encoding='utf-8').splitlines(), 1):
            if term in line:
                leftover.append(f"{md.relative_to(BASE)}:{i}: [{term}] {line.strip()[:110]}")

print("\n══ VERIFICACIÓN (restos que requieren fix manual) ══")
for l in leftover:
    print(" ", l)
print(f"Restos: {len(leftover)}")
