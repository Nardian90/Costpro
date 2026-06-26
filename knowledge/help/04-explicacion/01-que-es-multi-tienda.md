# Explicación: ¿Qué Significa "Multi-Tienda"?

> **Lea esto cuando**: Quiere entender qué significa que CostPro sea "multi-tienda" y por qué es diferente a un sistema normal.

## La metáfora del centro comercial

Imagine que usted es dueño de un **centro comercial** con 5 tiendas diferentes: una panadería, una cafetería, una tienda de ropa, una ferretería y una librería. Cada tienda:

- Tiene su propio **inventario** (la panadería no vende tornillos).
- Tiene su propio **dinero en caja** (lo que se cobra en la cafetería no se mezcla con la panadería).
- Tiene su propio **personal** (el panadero no atiende la ferretería).
- Tiene su propio **reporte de ventas**.

Pero todas pertenecen al **mismo dueño** (usted), y desde su oficina quiere poder ver:

- ¿Cuál tienda vende más?
- ¿Cuál tiene problemas de inventario?
- ¿Cuál tiene cajeros que rinden bien?
- ¿Cuál está perdiendo dinero?

Esto es exactamente lo que hace **CostPro multi-tienda**. Cada tienda es como un local independiente del centro comercial, y el sistema le permite operar cada una por separado y a la vez ver el consolidado.

## ¿Cómo se ve esto en el sistema?

### Cada tienda tiene su propia "burbuja"

En CostPro, cuando usted está en la **Tienda A**:

- Ve **solo** el inventario de la Tienda A.
- Ve **solo** las ventas de la Tienda A.
- Ve **solo** la caja de la Tienda A.
- Las ventas que haga se registran en la Tienda A.

Si cambia a la **Tienda B**, todo lo anterior cambia: ahora ve los datos de la Tienda B, y las ventas que haga se registran en la Tienda B.

> 💡 **Metáfora para personas mayores**: Es como tener 5 cuadernos de contabilidad, uno por tienda. Cuando usted abre el cuaderno de la panadería, solo ve lo de la panadería. No se mezcla con la ferretería.

### La tienda activa

Arriba del todo, en la barra negra, siempre verá el **nombre de la tienda activa**. Esa es la tienda cuyo cuaderno está abierto ahora mismo. Si quiere cambiar de cuaderno, haga clic en el nombre y elija otra.

### El catálogo maestro es compartido

Hay una excepción: el **catálogo de productos** (la lista maestra de qué productos existen) **es compartido entre todas las tiendas**. Esto significa:

- Si crea un producto "Leche entera 1L" en la Tienda A, ese producto existe también para la Tienda B, C, D y E.
- Pero el **stock** de ese producto es **por tienda**: la Tienda A puede tener 20 unidades, la Tienda B 5, etc.

> 💡 **Por qué**: Es así para que no tenga que crear 5 veces el mismo producto si vende en 5 tiendas. Pero el stock sí es independiente porque cada tienda tiene su propio estante físico.

### Los usuarios pueden pertenecer a varias tiendas

Un cajero llamado Juan puede trabajar en la Tienda A de día y en la Tienda B de noche. El sistema le da acceso a ambas. Cuando Juan entra, ve las dos tiendas en su selector y elige cuál quiere operar.

Otros usuarios, en cambio, pueden tener acceso solo a una tienda. Todo depende de los permisos que el administrador les dé.

### Los reportes pueden ser por tienda o consolidados

Si usted es administrador, puede generar reportes:

- **De una tienda específica**: solo ve los datos de esa tienda.
- **De todas las tiendas**: ve el consolidado. Por ejemplo, las ventas totales de las 5 tiendas juntas.

Esto es muy útil para tomar decisiones estratégicas: *"La Tienda C vende poco, ¿debería cerrarla?"*

## ¿Por qué es importante el aislamiento?

El aislamiento por tienda no es un capricho técnico. Es **fundamental** para que los números cuadren. Imagine si el sistema mezclara todo:

- **Caja desordenada**: si un cajero de la Tienda A cierra su caja, no debería ver el dinero de la Tienda B. Si lo viera, nunca cuadraría.
- **Inventario falso**: si la Tienda A vende un producto que "aparece" en el stock de la Tienda B, el cajero de la Tienda B podría prometérselo a un cliente y no tenerlo.
- **Reportes inútiles**: si todos los datos se mezclaran, no podría saber qué tienda es rentable y cuál no.
- **Auditoría imposible**: si un robo ocurre en la Tienda A, la auditoría debe mostrar solo los usuarios de la Tienda A, no los de las otras.

Por eso el sistema es tan estricto: **cada tienda es un mundo aparte** dentro del mismo sistema.

## ¿Cuándo se necesita multi-tienda?

No todas las empresas necesitan multi-tienda. CostPro es multi-tienda desde el diseño, pero usted puede usarlo con una sola tienda perfectamente.

### Multi-tienda es útil cuando:

- Tiene 2 o más sucursales físicas.
- Quiere separar operaciones de dos líneas de negocio (ej: ventas al por mayor y al detal).
- Quiere una tienda principal y otra "de prueba" para experimentar.
- Maneja una tienda física y una tienda online por separado.

### No necesita multi-tienda cuando:

- Tiene un solo local.
- Aunque venda diferentes categorías (alimentos + limpieza), todo es una sola tienda.

> 💡 **Consejo**: Si empieza con una tienda y después abre otra, no se preocupe. CostPro le permite agregar tiendas después sin perder datos. La primera tienda queda intacta y la nueva empieza vacía.

## Cómo se configura una nueva tienda

Si su administrador quiere crear una nueva tienda:

1. Va a **Configuración → Tiendas**.
2. Hace clic en **"+ Nueva tienda"**.
3. Llena:
   - Nombre de la tienda.
   - Slug (la dirección web pública, ej: `/tienda/mi-tienda-centro`).
   - Dirección física.
   - Moneda principal.
   - Plantilla de diseño (4 opciones visuales).
4. Asigna usuarios a la nueva tienda.
5. La tienda queda creada y aparece en el selector de tienda activa.

> ⚠️ **Importante**: Una vez creada, la tienda **no se debe borrar**. Si quiere "desactivarla", cámbiele el estado a "Inactiva". Así se conserva el historial.

## Lo que NO cambia entre tiendas

- **Su usuario y contraseña**: son los mismos en todas las tiendas.
- **El catálogo maestro de productos**: compartido (aunque el stock es por tienda).
- **Los clientes y proveedores**: compartidos (aunque puede filtrarlos por tienda).
- **La configuración global**: tema visual, idioma, etc.
- **Las categorías de productos**: compartidas.

## Lo que SÍ cambia entre tiendas

- **El inventario (stock)** de cada producto.
- **Las ventas** registradas.
- **La caja** y los arqueos.
- **Las recepciones** de mercancía.
- **Las transferencias** (entre tiendas).
- **Los reportes**.
- **Los usuarios asignados** (un usuario puede estar en una tienda pero no en otra).
- **La tienda pública** (cada tienda tiene su propia página web pública).

## Preguntas frecuentes

**¿Puedo mover mercancía de una tienda a otra?**
- Sí, con una **transferencia**. Ver: *Cómo hacer una transferencia*.

**¿Si vendo en la Tienda A, el dinero va a la caja de la Tienda B?**
- No. Cada venta queda en la caja de la tienda donde se hizo. No se mezclan.

**¿Un cliente que compra en la Tienda A, puede devolver en la Tienda B?**
- Técnicamente sí, pero no es recomendable. La devolución debe registrarse en la misma tienda donde se hizo la venta, para que la caja cuadre.

**¿Cómo veo el total de ventas de todas mis tiendas juntas?**
- Genere un reporte de ventas con filtro "Todas las tiendas".
- El reporte muestra el consolidado.

**¿Puedo tener una tienda solo online, sin local físico?**
- Sí. Cree la tienda en el sistema y active su tienda pública. Los clientes compran por la web y usted gestiona el envío.

**¿Si cierro una tienda, pierdo sus datos?**
- No. Marque la tienda como "Inactiva". Los datos quedan para siempre en los reportes consolidados.
- La tienda inactiva ya no aparece en el selector activo, pero el administrador puede verla si marca "ver inactivas".
