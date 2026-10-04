# Cómo Hacer: Usar la Venta por Conteo

> **Necesita esto cuando**: Prefiere contar las existencias físicas al final del día y que el sistema calcule las ventas por diferencia.

## Qué es

La **Venta por Conteo** es una alternativa al registro de ventas una por una: en lugar de cobrar cada venta en el POS, usted cuenta el stock físico de los productos y el sistema calcula qué se vendió comparando el conteo contra el stock del sistema.

## Dónde está

```
Operación → Ventas → Opciones → Venta por Conteo
```

También la encuentra con la paleta de comandos (`Ctrl + K`) escribiendo "conteo".

## Para qué sirve

- Cerrar el día de un punto de venta que no registra ventas individuales.
- Conciliar el inventario físico con el del sistema de forma periódica.
- Detectar faltantes y resolverlos documentados, con trazabilidad.

## Cómo usarla

1. Abra **Venta por Conteo**.
2. Registre el conteo físico de cada producto:
   - Agregue productos al conteo con el botón **"Agregar producto al conteo"**, o
   - Use **"Importar conteo desde archivo Excel"** si levantó el conteo en una planilla.
3. Presione **Finalizar**.
4. El sistema compara cada producto:
   - **Sistema**: la cantidad que debería haber según el inventario.
   - **Contado**: la cantidad que usted contó físicamente.
5. Si hay diferencias, el sistema muestra las acciones de ajuste propuestas para cada producto.
6. En los faltantes, la sección **"Resolución de Faltante (Venta)"** le permite resolver la diferencia como venta.
7. Confirme para aplicar los ajustes. Los movimientos quedan documentados con la diferencia total del conteo.

## Qué significa cada dato

| Dato | Significado |
|------|-------------|
| **Sistema** | Cantidad esperada según el inventario de la tienda activa |
| **Contado** | Cantidad física que usted contó |
| **Diferencia** | Contado − Sistema (positivo = sobrante, negativo = faltante) |
| **Diferencia total** | Resumen monetario del conteo |

## Precauciones

- Cuente con la tienda activa correcta: los ajustes aplican a la tienda seleccionada en la barra superior.
- Revise las diferencias **antes de confirmar**: los ajustes generan movimientos de inventario documentados.
- Use **"Restablecer conteo a todos los productos"** con cuidado: borra los conteos cargados.

## Preguntas frecuentes

**¿Reemplaza al POS?**
- No. Son dos formas de trabajar. La venta por conteo es útil cuando no se registra cada venta individual; el POS registra cada transacción con su recibo.

**¿Puedo importar el conteo desde Excel?**
- Sí. Use **"Importar conteo desde archivo Excel"** y siga el formato que indica la propia vista.
