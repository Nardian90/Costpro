#!/usr/bin/env python3
"""Añade términos de búsqueda de usuario a search-keywords.json (índice de alias del Centro de Ayuda).
Misión auditoría ayuda — servidores recibidos + inventario físico + ventas/caja."""
import json, collections

P = 'knowledge/help/search-keywords.json'
with open(P) as f:
    idx = json.load(f, object_pairs_hook=collections.OrderedDict)

NEW = {
    # Servicios Recibidos (post PR #1463)
    "servicios": ["help/02-como-hacer/14-como-recibir-servicio.md"],
    "servicio": ["help/02-como-hacer/14-como-recibir-servicio.md"],
    "servicios recibidos": ["help/02-como-hacer/14-como-recibir-servicio.md"],
    "recibir servicio": ["help/02-como-hacer/14-como-recibir-servicio.md"],
    "gasto": ["help/02-como-hacer/14-como-recibir-servicio.md"],
    "gastos": ["help/02-como-hacer/14-como-recibir-servicio.md"],
    "flete": ["help/02-como-hacer/14-como-recibir-servicio.md"],
    "transporte": ["help/02-como-hacer/14-como-recibir-servicio.md"],
    "aduana": ["help/02-como-hacer/14-como-recibir-servicio.md"],
    "estiba": ["help/02-como-hacer/14-como-recibir-servicio.md"],
    "pago a proveedores": ["help/02-como-hacer/14-como-recibir-servicio.md", "help/02-como-hacer/23-como-consultar-cuentas.md"],
    "wac": ["help/02-como-hacer/14-como-recibir-servicio.md", "help/02-gestion/estructura-costo-y-costeo-dinamico.md"],
    "costo promedio": ["help/02-gestion/estructura-costo-y-costeo-dinamico.md", "help/02-como-hacer/14-como-recibir-servicio.md"],
    # Inventario Físico (módulo nuevo)
    "inventario fisico": ["help/02-como-hacer/25-como-hacer-inventario-fisico.md"],
    "inventario físico": ["help/02-como-hacer/25-como-hacer-inventario-fisico.md"],
    "conteo fisico": ["help/02-como-hacer/25-como-hacer-inventario-fisico.md"],
    "conteo físico": ["help/02-como-hacer/25-como-hacer-inventario-fisico.md"],
    "corte de inventario": ["help/02-como-hacer/25-como-hacer-inventario-fisico.md"],
    "conteo ciego": ["help/02-como-hacer/25-como-hacer-inventario-fisico.md"],
    "if-": ["help/02-como-hacer/25-como-hacer-inventario-fisico.md"],
    # Caja / arqueo
    "arqueo de caja": ["help/02-como-hacer/03-como-cerrar-caja.md"],
    "turno": ["help/02-como-hacer/03-como-cerrar-caja.md"],
    "fondo inicial": ["help/02-como-hacer/03-como-cerrar-caja.md"],
    "reporte entrega": ["help/02-como-hacer/03-como-cerrar-caja.md"],
    # Ventas / POS
    "transf. exterior": ["help/03-referencia/06-metodos-pago.md"],
    "zelle": ["help/03-referencia/06-metodos-pago.md", "help/02-como-hacer/12-como-usar-tasa-cambio.md"],
    "tasa de cambio": ["help/02-como-hacer/12-como-usar-tasa-cambio.md"],
    "tasas": ["help/02-como-hacer/12-como-usar-tasa-cambio.md"],
    "revertir venta": ["help/02-como-hacer/11-como-ver-historial-ventas.md"],
    "deshacer venta": ["help/02-como-hacer/11-como-ver-historial-ventas.md"],
    "nota de credito": ["help/02-como-hacer/19-como-procesar-devolucion.md"],
    # Inventario general
    "vales de salida": ["help/02-como-hacer/24-como-emitir-vale-salida.md"],
    "vale de salida": ["help/02-como-hacer/24-como-emitir-vale-salida.md"],
    "transferencia stock": ["help/02-como-hacer/05-como-hacer-transferencia.md"],
    "ajustes documentales": ["help/02-como-hacer/10-como-ajustar-inventario.md", "help/03-referencia/07-causas-ajuste.md"],
    "orden de compra": ["help/02-como-hacer/06-como-crear-orden-compra.md"],
    "oc": ["help/02-como-hacer/06-como-crear-orden-compra.md"],
    "ordenes de produccion": ["help/02-como-hacer/16-como-crear-orden-produccion.md"],
    "comisiones": ["help/02-como-hacer/13-como-pagar-comisiones.md"],
}

added = 0
for term, paths in NEW.items():
    if term in idx:
        for pth in paths:
            if pth not in idx[term]:
                idx[term].append(pth)
                added += 1
    else:
        idx[term] = paths
        added += 1

# mantener comentario _comentario primero: reconstruir ordenado (py3.7 dict preserva inserción)
with open(P, 'w') as f:
    json.dump(idx, f, ensure_ascii=False, indent=1)
    f.write('\n')
print(f"Añadidos/actualizados {added} términos. Total: {len([t for t in idx if not t.startswith('_')])}")
