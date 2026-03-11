# Lógica de Variantes de Productos y Descomposición Automática

## Concepto de Variantes
Para maximizar el cuadre (Matching) de transacciones, el sistema permite agrupar productos que son variantes del mismo artículo (ej: Caja, Paquete, Unidad) mediante el campo `id_grupo`.

### Campos Clave en el Catálogo (Excel)
- **cod**: Identificador único del producto.
- **id_grupo**: (NUEVO) Identificador común para todas las variantes del mismo producto (ej: "BIG_BON").
- **contenido_paquete**: Define cuántas unidades del "siguiente" producto menor contiene esta variante.
- **precio_cents**: El precio unitario de esta variante.

## Reglas de Negocio para la Descomposición
1.  **Jerarquía de Precios**: Dentro de un mismo `id_grupo`, los productos se ordenan por `precio_cents` de mayor a menor.
2.  **Flujo de Descomposición**: Si el motor de matching necesita un producto "A" y no hay stock, buscará el producto "B" inmediatamente superior en precio dentro del mismo grupo que sí tenga stock.
3.  **Factor de Conversión**: 1 unidad del producto superior se convierte en `N` unidades del producto inferior, donde `N` es el valor de `contenido_paquete` del producto superior.
4.  **Registro de Movimiento**: Cada vez que ocurre una descomposición, se crea un registro en la tabla `product_movements` con el tipo `DECOMPOSITION`.

## Ejemplo de Importación
| cod | id_grupo | descripcion | precio_cents | contenido_paquete | stock_inicial_manual |
|-----|----------|-------------|--------------|-------------------|----------------------|
| 2   | BIG_BON  | BIG BON CAJA| 13825        | 8                 | 15                   |
| 3   | BIG_BON  | BIG BON PQT | 1730         | 40                | 1                    |
| 4   | BIG_BON  | BOMBON      | 45           | 1                 | 2                    |

**Interpretación**:
- 1 Caja (cod 2) contiene 8 Paquetes (cod 3).
- 1 Paquete (cod 3) contiene 40 Bombones (cod 4).

Si entra una transferencia por 45 cts y el stock de BOMBON es 0, el sistema:
1. Busca stock en BIG BON PQT.
2. Si hay 1 PQT, resta 1 de PQT y suma 40 a BOMBON.
3. Realiza el matching del BOMBON.
4. Registra el movimiento: "Descomposición: 1 BIG BON PQT -> 40 BOMBON".

## Beneficios
- **Mayor % de Cuadre**: Permite satisfacer ventas de productos menores usando stock de formatos mayores.
- **Trazabilidad**: Todos los cambios automáticos de inventario quedan registrados en la pestaña "Movimientos".
