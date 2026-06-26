# Explicación: Por Qué Cada Tienda Ve Solo Sus Datos

> **Lea esto cuando**: Quiere entender por qué el sistema no muestra los datos de todas las tiendas mezclados, y por qué esto es una medida de seguridad y no un defecto.

## La pregunta básica: ¿por qué no veo todo junto?

Si usted es administrador de 5 tiendas, podría pensar: *"Quiero ver TODO junto: las ventas de las 5 tiendas en una sola pantalla, el inventario de las 5 en una sola tabla."*

CostPro **sí** le permite hacer eso, pero **no por defecto**. Por defecto, cada tienda es un "mundo aparte" y usted tiene que cambiar de tienda para ver sus datos.

¿Por qué? Porque si todo estuviera mezclado, habría **5 problemas graves**:

## Problema 1: La caja nunca cuadraría

La caja es **física**: billetes y monedas reales que están en un cajón. Si la Tienda A tiene 1000 pesos en su cajón y la Tienda B tiene 800, usted no puede decir "tengo 1800". Porque esos 1800 están repartidos en dos cajones diferentes.

Si el sistema mezclara las ventas de ambas tiendas en una sola "caja virtual", al final del día el cajero de la Tienda A abriría su cajón y vería 1000 pesos, pero el sistema le diría "deberías tener 1800". Pensaría que faltan 800. **Caos**.

Por eso cada tienda tiene **su propia caja virtual** que coincide con su cajón físico.

## Problema 2: El inventario sería confuso

Imagine que usted busca "Leche entera 1L" en el sistema. Si estuviera todo mezclado, vería:

- Tienda A: 20 unidades.
- Tienda B: 5 unidades.
- Tienda C: 0 unidades.
- Tienda D: 12 unidades.
- Tienda E: 8 unidades.
- **Total: 45 unidades.**

Pero el cliente está parado frente a usted **en la Tienda C**, donde hay 0. Usted no le puede vender leche aunque el "total" diga 45. Esas 45 están repartidas en otras tiendas.

Si el sistema solo le muestra "45", usted promete al cliente que sí hay. Va al estante. No hay. **Cliente enojado**.

Por eso el sistema le muestra **el stock de la tienda donde usted está**, no el total. Si quiere ver el total, tiene que ir al reporte consolidado (donde sí está mezclado, pero **a propósito**).

## Problema 3: Los reportes serían inútiles

Un reporte de ventas mezclado le diría: *"Hoy vendió 5000 pesos"*. Pero ¿en cuál tienda? Si la Tienda A vendió 4000 y la Tienda B vendió 1000, son realidades muy diferentes:

- La Tienda A está teniendo un día excelente.
- La Tienda B está teniendo un día malo.

Si todo se ve junto, usted **no se entera** de que la Tienda B está mal. Solo ve "5000" y piensa que todo está bien. Cuando al final del mes descubra que la Tienda B pierde dinero, será demasiado tarde.

Por eso los reportes son **por tienda** por defecto, y el consolidado es **opcional y explícito**.

## Problema 4: La auditoría sería imposible

Si un robo ocurre en la Tienda A, la auditoría debe mostrar **solo** las acciones de los usuarios que estaban en la Tienda A ese día. Si estuviera todo mezclado, tendría que revisar también las acciones de los cajeros de las otras tiendas, lo cual es irrelevante.

Peor aún: si un cajero de la Tienda B (que no tiene acceso a la Tienda A) ve accidentalmente acciones de la Tienda A en la auditoría, eso sería una **violación de privacidad y seguridad**.

## Problema 5: Los permisos no tendrían sentido

Si usted tiene un cajero que solo trabaja en la Tienda A, ¿por qué debería ver el inventario de la Tienda B? No debe verlo. Es información confidencial.

El sistema le da permisos **por tienda**. Un cajero de la Tienda A no puede ver nada de la Tienda B, ni siquiera saber que existe.

## ¿Cómo se implementa el aislamiento?

### 1. Cada registro tiene un campo "tienda_id"
En la base de datos, cada venta, cada movimiento de inventario, cada recepción, tiene un campo que dice a qué tienda pertenece.

| Venta | tienda_id | Monto |
|-------|-----------|-------|
| V-001 | Tienda A | 250 |
| V-002 | Tienda B | 180 |
| V-003 | Tienda A | 320 |

Cuando usted entra como usuario de la Tienda A, el sistema automáticamente filtra: `WHERE tienda_id = 'Tienda A'`. Solo le muestra V-001 y V-003.

### 2. Cada usuario tiene un "alcance" (scope)
Cuando usted inicia sesión, el sistema verifica a qué tiendas tiene acceso. Si solo tiene acceso a la Tienda A, el sistema bloquea cualquier intento de ver datos de la Tienda B.

Aunque usted cambie la URL manualmente a `/tienda-b/ventas`, el sistema le dirá: *"No tiene acceso a esta tienda"*.

### 3. La tienda activa se guarda en la sesión
Cuando usted selecciona "Tienda A" en el selector, esa información se guarda. Hasta que usted cambie de tienda, todas las consultas se hacen con ese filtro.

### 4. Los reportes consolidados requieren permiso especial
Solo admin y manager pueden generar reportes de "Todas las tiendas". Los demás roles solo pueden ver su propia tienda.

## Excepciones al aislamiento

Hay algunos datos que **sí** se comparten entre tiendas:

### 1. El catálogo maestro de productos
- La lista de productos y sus datos básicos (nombre, SKU, categoría) es compartida.
- Pero el **stock** es por tienda.
- Y los **precios** pueden ser por tienda (configurable).

### 2. Los clientes
- Un cliente registrado puede comprar en cualquiera de sus tiendas.
- El sistema lleva el historial consolidado del cliente.

### 3. Los proveedores
- Los proveedores son compartidos.
- Pero las recepciones son por tienda.

### 4. Los usuarios
- Un usuario puede pertenecer a varias tiendas con diferentes roles en cada una.
- El usuario es el mismo, solo cambia su "membresía" en cada tienda.

## ¿Cómo veo el consolidado cuando lo necesito?

Como administrador o manager, usted **sí** puede ver datos consolidados:

### En reportes
- Genere un reporte (ventas, ganancias, etc.).
- En el filtro "Tienda", elija **"Todas las tiendas"**.
- El sistema le muestra el consolidado.

### En el Dashboard OCC
- El OCC tiene una vista **"consolidada"** que muestra KPIs de todas las tiendas.
- Compare tiendas entre sí.
- Identifique cuál está mejor y cuál peor.

### En el módulo Multi-Tienda Dashboard
- Vista especial que muestra anillos de progreso para cada tienda.
- Sparklines (gráficos pequeños) con tendencia de cada tienda.
- Tabla comparativa.

## Preguntas frecuentes

**¿Puedo mover un producto de una tienda a otra sin hacer transferencia?**
- No. La única forma de mover inventario entre tiendas es mediante una transferencia.
- Esto es para que el sistema siempre cuadre: si sale de A, tiene que entrar en B.

**¿Si cambio el precio de un producto en la Tienda A, cambia también en la Tienda B?**
- Depende de la configuración:
  - Si los precios son **por tienda** (default): no cambia en B.
  - Si los precios son **compartidos**: cambia en B también.
- El administrador decide esto al crear el producto.

**¿Puedo desactivar el aislamiento para ver todo mezclado?**
- No. El aislamiento es una característica de seguridad que no se puede desactivar.
- Pero los reportes consolidados le dan la vista mezclada cuando la necesita.

**¿Si un cliente devuelve un producto en la tienda equivocada, qué pasa?**
- El sistema le permite registrar la devolución, pero queda como "anomalía".
- Lo correcto es anular la venta en la tienda original y hacer una nueva venta en la tienda donde se devuelve.
- Si esto ocurre con frecuencia, considere capacitar al personal.

**¿Cómo se si un usuario está intentando acceder a otra tienda?**
- La auditoría registra los intentos fallidos de acceso.
- Si ve muchos intentos de un usuario a tiendas donde no tiene acceso, investigue.

**¿El aislamiento afecta el rendimiento?**
- No significativamente. Las bases de datos modernas filtran por "tienda_id" de forma muy eficiente.
- Es como buscar en un directorio telefónico solo las personas cuyo apellido empieza con "P". Es rápido.

**¿Si tengo una sola tienda, el aislamiento me afecta?**
- No. Con una sola tienda, todo es de esa tienda y no se nota el aislamiento.
- Es como tener una sola habitación en una casa: no hay puertas internas pero la estructura es la misma.

**¿Puedo crear una tienda "virtual" para separar líneas de negocio?**
- Sí. Algunos negocios crean tiendas virtuales:
  - "Tienda Mayorista" para ventas al por mayor.
  - "Tienda Minorista" para ventas al detal.
  - "Tienda Online" para ventas por web.
- Aunque sea el mismo local físico, el sistema las trata como tiendas separadas y los datos quedan aislados.
