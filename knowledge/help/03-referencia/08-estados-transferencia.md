# Referencia: Estados de una Transferencia

> **Use esta tabla** cuando quiera saber en qué estado está una transferencia de stock y qué acciones tiene disponibles.

## Los 4 estados de una transferencia

| Estado | Significado | Siguiente acción |
|--------|-------------|------------------|
| **Pendiente** | Solicitud enviada por la tienda origen; stock **reservado** en origen. | Destino: **Confirmar Recepción**. Origen: **Cancelar Transferencia**. |
| **Confirmada** | El destino recibió: stock descontado de origen y sumado a destino en el mismo acto. | Origen (con rol): **Revertir**. Ambas: **Duplicar**. |
| **Cancelada** | Solicitud anulada antes de confirmarse. | Ninguna. El stock reservado se liberó. |
| **Revertida** | Una confirmada que se deshizo: el stock regresó a origen. | Ninguna. Queda con rastro de auditoría. |

## Detalle de cada estado

### 1. Pendiente
- **Quién la ve**: la tienda origen (pestaña Salientes) y la tienda destino (pestaña Entrantes).
- **Inventario**: origen tiene el stock **reservado** — no disponible para ventas, vales u otras transferencias, pero todavía en la tienda.
- **Qué se puede hacer**:
  - Destino: **Confirmar Recepción** (pasa a Confirmada).
  - Origen: **Cancelar Transferencia** (pasa a Cancelada y libera la reserva).
- **Recomendación**: no deje transferencias pendientes por muchos días; el stock reservado queda bloqueado para el resto de operaciones.

### 2. Confirmada
- **Inventario**: origen **descuenta** y destino **suma**, atómicamente al confirmar. No existe un estado intermedio con el stock "en camino".
- **Qué se puede hacer**:
  - **Revertir** (usuario con rol en la tienda origen): devuelve el stock a origen; pasa a Revertida.
  - **Duplicar**: crea una nueva transferencia Pendiente con las mismas líneas.
  - **Exportar PDF** del detalle como comprobante interno.

### 3. Cancelada
- **Inventario**: sin cambios; la reserva se liberó al cancelar.
- No se puede reactivar. Si necesita reenviar, use **Duplicar** desde el detalle o cree una nueva.

### 4. Revertida
- **Inventario**: el stock volvió a la tienda origen (se generan los movimientos inversos en el Kardex de ambas tiendas).
- Útil cuando el destino confirma por error o la mercancía regresa física.

## Transiciones válidas

```
            ┌──────────────► Cancelada (origen cancela)
Pendiente ──┤
            └──────────────► Confirmada (destino confirma)
                               │
                               └──────────────► Revertida (origen revierte)
```

- Solo las **Pendientes** se cancelan.
- Solo las **Confirmadas** se revierten.
- No hay edición de líneas una vez enviada la solicitud: si cambió el contenido, cancele y cree otra.

## Preguntas frecuentes

**¿Existe el estado "En tránsito"?**
No. Mientras está Pendiente, el stock sigue contando en origen (reservado). El descontado y la suma en destino ocurren en el mismo momento de la confirmación.

**¿Puedo recibir menos de lo enviado?**
La confirmación aplica las cantidades tal cual están en el documento. Si llegó menos, confirme y registre la diferencia como **Ajuste Documental** en la tienda que corresponda.

**¿Quién puede confirmar y quién revertir?**
Confirmar: un usuario con acceso a la **tienda destino**. Revertir: un usuario con rol en la **tienda origen**.

## Información relacionada

- **Cómo transferir stock entre tiendas** — la guía paso a paso.
- **Cómo ajustar el inventario** — diferencias posteriores a la recepción.
- **Kardex y trazabilidad** — dónde ver los movimientos generados (transfer_out / transfer_in).
