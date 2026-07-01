# Referencia: Estados de una Transferencia

> **Use esta tabla** cuando quiera saber en qué estado está una transferencia y qué significa.

## Los 4 estados de una transferencia

| Estado | Significado | Acción requerida |
|--------|-------------|------------------|
| **Pendiente** | Creada como borrador, no enviada. | Revisar y enviar, o anular. |
| **En tránsito** | Enviada de la tienda origen, no confirmada en destino. | Esperar que llegue. Confirmar en destino. |
| **Completada** | Recibida y confirmada en la tienda destino. | Ninguna. Transferencia cerrada. |
| **Anulada** | Cancelada antes de completarse. | Ninguna. Solo quedó registro. |

## Detalle de cada estado

### 1. Pendiente
- **Quién la ve**: El creador (tienda origen).
- **Qué se puede hacer**:
  - **Enviar**: cambia a "En tránsito".
  - **Editar**: cambiar productos, cantidades.
  - **Anular**: cancela la transferencia.
- **Afecta inventario**: No. Mientras esté pendiente, no se mueve nada.
- **Recomendación**: No deje transferencias pendientes por muchos días. O se envían o se anulan.

### 2. En tránsito
- **Quién la ve**: Ambas tiendas (origen y destino).
- **Qué se puede hacer**:
  - En tienda destino: **confirmar recepción** (cambia a Completada) o **registrar discrepancia** (si hay diferencias).
  - En tienda origen: ya no se puede editar ni anular. Solo ver.
- **Afecta inventario**:
  - Origen: **descuenta** el stock (los productos ya salieron).
  - Destino: **no suma** todavía (los productos están en camino).
- **Recomendación**: Si va a tardar más de 7 días en llegar, póngalo en las notas para que el destino sepa que esperar.

### 3. Completada
- **Quién la ve**: Ambas tiendas.
- **Qué se puede hacer**: Solo ver y descargar reporte. No se puede modificar.
- **Afecta inventario**:
  - Origen: ya está descontado (desde "En tránsito").
  - Destino: **suma** el stock (los productos llegaron).
- **Recomendación**: Si detecta un error después de completada, debe hacer un **ajuste de inventario** para corregir.

### 4. Anulada
- **Quién la ve**: Ambas tiendas.
- **Qué se puede hacer**: Solo ver. Queda como registro histórico.
- **Afecta inventario**: Ninguno. Si se anuló en "Pendiente", no se había movido nada. Si se anuló en "En tránsito", debe revertirse manualmente con un ajuste.
- **Recomendación**: Si anula una transferencia "En tránsito", recuerde hacer el ajuste de inventario para devolver el stock a la tienda origen.

## Flujo de estados

```
   [Pendiente]
       │
       ├─→ Enviar ─→ [En tránsito]
       │                  │
       │                  ├─→ Confirmar ─→ [Completada]
       │                  │
       │                  └─→ Anular ─→ [Anulada]
       │
       └─→ Anular ─→ [Anulada]
```

## Discrepancias

Cuando la tienda destino recibe la transferencia y **el conteo físico no coincide** con lo que dice el sistema:

1. El encargado de destino selecciona **"Registrar discrepancia"** en lugar de "Confirmar recepción".
2. Aparece un formulario para anotar qué productos y cuántas unidades difieren.
3. Tipos de discrepancia:
   - **Faltante**: llegaron menos unidades de las que salieron.
   - **Sobrante**: llegaron más unidades (raro, suele ser error de conteo).
   - **Daño**: llegaron productos dañados.
   - **Equivocado**: llegó un producto diferente al que se transfirió.
4. El sistema ajusta automáticamente:
   - Si es faltante: descuenta de la tienda origen (porque ya salió) y NO suma a la tienda destino.
   - Si es sobrante: descuenta de origen y suma más a destino (ambos ajustados).
   - Si es daño: descuenta de origen y NO suma a destino. Se recomienda ajuste adicional con causa "Daño".
   - Si es equivocado: se anula la transferencia y se crea una nueva correcta.
5. La transferencia queda con estado **"Completada con discrepancia"**.
6. Se genera un reporte de discrepancia que se archiva.

## Preguntas frecuentes

**¿Cuánto tiempo puede estar una transferencia "En tránsito"?**
- No hay límite. Pero si pasa de 30 días, el sistema le avisa para que investigue.

**¿Puedo anular una transferencia "Completada"?**
- No. Ya modificó el inventario de ambas tiendas.
- Si necesita revertir, haga una **transferencia inversa** (de destino a origen).

**¿Qué pasa si el transportista pierde la mercancía?**
- La transferencia queda "En tránsito" hasta que se resuelva.
- Si se confirma la pérdida: haga ajuste de inventario en la tienda origen con causa "Robo" o "Diferencia de conteo".
- Anule la transferencia después del ajuste.

**¿Una transferencia genera documentos legales?**
- No es un documento fiscal (como una factura), pero sí es un documento interno válido para auditoría.
- El PDF con código QR sirve como comprobante entre las dos tiendas.

**¿Puedo transferir productos a una tienda de otra empresa?**
- No. Las transferencias son dentro de la misma empresa. Para mover mercancía a otra empresa, use una **venta** normal.

**¿El sistema me avisa si tengo transferencias pendientes de recibir?**
- Sí. Al iniciar sesión en la tienda destino, si hay transferencias "En tránsito" dirigidas a esa tienda, verá un letrero amarillo: *"Tiene N transferencias pendientes de recibir"*.

**¿Cómo encuentro una transferencia específica?**
- Vaya a Multi-Tienda → Transferencias.
- Use los filtros: por fecha, por tienda origen, por tienda destino, por estado.
- Si tiene el folio, búsquelo directamente.
