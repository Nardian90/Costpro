# Auditoría y Resolución de CASH_FILLER en IPV

## Contexto
Se identificó que el mecanismo `CASH_FILLER` en la vista de Desglose de IPV no estaba completando correctamente las transferencias con productos del catálogo. En su lugar, simplemente asignaba el residuo como `CASH`, sin intentar cuadrar con productos reales.

## Problema detectado
1. La lógica original de `applyCashFill` asignaba directamente todo el saldo pendiente a una línea con código de producto `CASH`.
2. No existía un filtrado de productos por valor mínimo (`valor_minimo`).
3. La referencia de la transacción para las líneas de efectivo no incluía el prefijo "Efectivo" solicitado para trazabilidad.

## Solución implementada
Se refactorizó el método `applyCashFill` en `src/lib/ipv/engine.ts` con las siguientes reglas:

1. **Selección de Producto**: Se intenta encontrar el producto más caro del catálogo que sea menor o igual al residuo y mayor o igual al `valor_minimo` configurado.
2. **Residuo como Efectivo**: Si después de asignar el producto queda un saldo (o si no se encontró producto), se crea una línea de efectivo.
3. **Prefijo de Referencia**: La línea de efectivo ahora usa `transaction_ref = "Efectivo " + original_ref`.
4. **Configuración**: Se añadió `valor_minimo: 500` (5.00 pesos/cents) por defecto a la regla `CASH_FILL`.

## Comparación Antes vs Después

| Escenario | Antes (Comportamiento Error) | Después (Solución Aplicada) |
| :--- | :--- | :--- |
| Transferencia de 1000 con residuo | `CASH` 1000, Ref: `REF123`, Residuo 0 | `PROD_X` 800, `CASH` 200, Ref Cash: `Efectivo REF123`, Residuo 0 |
| Transferencia pequeña (< valor_min) | `CASH` 400, Ref: `REF456`, Residuo 0 | `CASH` 400, Ref: `Efectivo REF456`, Residuo 0 |

## Validación Técnica
Se creó y ejecutó con éxito el test unitario `src/test/ipv-cash-filler.test.ts` que verifica:
- La correcta selección de productos.
- La creación de la línea residual de efectivo.
- El formato correcto de las referencias de transacción.
- La cuadratura total de los importes.

---
**Auditado por:** JULES (ai-arch-v9.0)
**Fecha:** 2024-04-06
