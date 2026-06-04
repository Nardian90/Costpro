# Tienda Pública: Catálogo en Línea por Tienda

La Tienda Pública es una funcionalidad de CostPro que genera automáticamente un **catálogo en línea visible para los clientes**, asociado a cada tienda registrada en el sistema. A través de una URL pública, los clientes pueden explorar el inventario, buscar productos y consultar precios sin necesidad de acceder al sistema interno.

## ¿Qué es la Tienda Pública?

La Tienda Pública es una página web autogestionada que CostPro crea para cada sucursal. Esta página muestra el catálogo de productos de la tienda en un formato limpio y responsivo, diseñado para que los clientes finales puedan navegar productos, filtrar por categoría y buscar artículos específicos.

A diferencia del terminal POS, la Tienda Pública es **solo de lectura**: los clientes pueden ver productos y precios, pero no pueden realizar compras ni modificar datos.

## Formato de URL

Cada tienda pública se accede mediante una URL única construida con el **slug** de la tienda:

```
https://tudominio.com/tienda/[slug]
```

El **slug** se genera automáticamente a partir del nombre de la tienda, reemplazando espacios por guiones y convirtiendo caracteres a minúsculas. Por ejemplo:

| Nombre de la Tienda | Slug Generado |
|--------------------|---------------|
| `Sucursal Centro` | `sucursal-centro` |
| `Tienda Norte #2` | `tienda-norte-2` |
| `Almacén Principal` | `almacen-principal` |

> **Nota:** El slug se crea al registrar la tienda y no puede editarse manualmente desde la interfaz actual. Si necesitas cambiarlo, contacta al administrador del sistema.

## Cómo Acceder y Compartir el Enlace

Para obtener y compartir el enlace de la Tienda Pública:

1. Navega a **CONFIGURACIÓN > Administrativa > Tiendas**.
2. Selecciona la tienda deseada de la lista.
3. En el detalle de la tienda, localiza el campo **URL Pública** o **Tienda Pública**.
4. Haz clic en **Copiar enlace** para copiar la URL al portapapeles.
5. Comparte el enlace por los canales deseados: WhatsApp, redes sociales, correo electrónico, mensaje de texto.

El enlace es permanente y no requiere que el cliente tenga una cuenta ni inicie sesión en CostPro.

## Características de la Tienda Pública

### Navegación de Productos

La Tienda Pública ofrece las siguientes funcionalidades para los clientes:

- **Grilla de productos:** Los productos se muestran en tarjetas con imagen, nombre, categoría y precio.
- **Búsqueda en tiempo real:** Un campo de búsqueda permite filtrar productos por nombre mientras el cliente escribe.
- **Filtrado por categoría:** Las categorías configuradas en el catálogo aparecen como filtros clicables.
- **Diseño responsivo:** La página se adapta automáticamente a dispositivos móviles, tablets y pantallas de escritorio.
- **Carga rápida:** Optimizada para tiempos de carga mínimos, incluso con catálogos grandes.

### Datos que se Muestran

Cada producto en la Tienda Pública muestra:

| Campo | Origen del dato |
|-------|----------------|
| **Imagen** | Imagen del producto en el catálogo de CostPro |
| **Nombre** | Nombre del producto configurado en el sistema |
| **Precio** | Precio de venta indexado en la tienda activa |
| **Categoría** | Categoría asignada al producto |
| **Stock** | Indicador de disponibilidad (en stock / agotado) |

> **Importante:** La Tienda Pública utiliza los mismos datos del catálogo interno. Cualquier actualización de precio, imagen o categoría en CostPro se refleja automáticamente en la Tienda Pública.

## Configuración de Tienda que Afecta el Frontend

Los siguientes datos de la configuración de la tienda se muestran en la página pública:

| Campo de la Tienda | Uso en la Tienda Pública |
|-------------------|-------------------------|
| **Nombre** | Encabezado principal de la página |
| **Logo** | Imagen corporativa en la cabecera |
| **Dirección** | Sección de información de contacto |
| **Teléfono** | Botón de llamada directa (en móvil) |
| **Email** | Enlace de correo electrónico |
| **Sitio web** | Enlace al sitio web de la empresa |
| **WhatsApp** | Botón de contacto directo por WhatsApp |

Para editar estos datos, navega a **CONFIGURACIÓN > Administrativa > Tiendas** y selecciona la tienda correspondiente.

> **Tip:** Asegúrate de que el número de WhatsApp esté en formato internacional (ej. `+5355551234`) para que el botón de contacto funcione correctamente en todos los países.

## Plantillas Visuales

La Tienda Pública dispone de 4 plantillas visuales que definen el estilo de la página:

| Plantilla | Identificador | Descripción |
|-----------|---------------|-------------|
| **En Construcción** | `construccion` | Muestra una página de "próximamente" con el logo de la tienda. Ideal para tiendas que aún no desean mostrar su catálogo al público. |
| **Minimalista** | `minimalista` | Diseño limpio con fondo blanco, tipografía simple y disposición en grilla básica. Prioriza la velocidad de carga y la claridad. |
| **Moderna** | `moderna` | Diseño contemporáneo con sombras sutiles, tarjetas con bordes redondeados y transiciones suaves. Equilibra estética y funcionalidad. |
| **Clásica** | `clasica` | Diseño formal con estructura tabular, tipografía serif y presentación tipo catálogo impreso. Adecuada para negocios tradicionales o sector B2B. |

### Selección de Plantilla

1. Navega a **CONFIGURACIÓN > Administrativa > Tiendas**.
2. Selecciona la tienda y busca la sección **Plantilla Pública** o **Tienda Pública**.
3. Elige la plantilla deseada del menú desplegable.
4. Guarda los cambios. La Tienda Pública se actualiza inmediatamente.

> **Tip:** Usa la plantilla **En Construcción** mientras configuras el catálogo y los datos de la tienda. Una vez que todo esté listo, cambia a **Moderna** o **Minimalista** para publicar el catálogo.

## Diferencia entre Tienda Pública y Terminal POS

Es importante entender la distinción entre ambos conceptos:

| Aspecto | Tienda Pública | Terminal POS |
|---------|---------------|--------------|
| **Audiencia** | Clientes externos | Personal de la tienda |
| **Autenticación** | No requerida | Requiere inicio de sesión |
| **Funcionalidad** | Solo lectura (búsqueda, filtrado) | Operaciones completas (ventas, cobro, cierre) |
| **Acceso** | URL pública abierta | Desde el módulo MULTI-TIENDA |
| **Datos** | Catálogo de productos visible | Inventario completo, ventas, cierres |
| **Propósito** | Exhibición de productos al público | Registro y procesamiento de transacciones |

La Tienda Pública es una extensión del catálogo hacia afuera, mientras que el terminal POS es la herramienta operativa interna de la sucursal.

## Mejores Prácticas para Gestionar una Tienda Pública

### Lanzamiento Inicial

1. **Completa los datos de la tienda:** Asegúrate de que nombre, dirección, teléfono, email, WhatsApp y logo estén correctamente configurados antes de publicar.
2. **Revisa las imágenes de producto:** La Tienda Pública muestra las mismas imágenes del catálogo interno. Verifica que todos los productos tengan imágenes claras y representativas.
3. **Verifica los precios:** Confirma que los precios indexados sean los que deseas mostrar al público.
4. **Usa En Construcción mientras preparas:** Activa la plantilla `construccion` mientras completas la configuración. Cambia a una plantilla visible solo cuando todo esté listo.

### Mantenimiento Continuo

- **Actualiza el catálogo regularmente:** Los cambios en CostPro se reflejan en la Tienda Pública de forma inmediata. Mantén precios, stock e imágenes actualizados.
- **Monitorea productos agotados:** Los productos sin stock se marcan automáticamente como agotados en la Tienda Pública. Si un producto está descontinuado, considéralo ocultar del catálogo en lugar de dejarlo como agotado.
- **Actualiza datos de contacto:** Si cambia el teléfono, dirección o WhatsApp de la tienda, actualízalo en la configuración para que los clientes siempre tengan información correcta.

### Promoción

- **Incluye el enlace en la firma de correo** de todos los empleados de la tienda.
- **Comparte el enlace en redes sociales** cuando actualices el catálogo o agregues productos nuevos.
- **Agrega el enlace a perfiles de Google Business** y directorios locales.
- **Genera un código QR** con la URL de la Tienda Pública e imprímelo en tarjetas de presentación, empaques o cartelería física del local.

> **Nota:** La Tienda Pública no permite transacciones en línea. Si un cliente desea comprar un producto que vio en el catálogo, debe contactar a la tienda por los canales configurados (WhatsApp, teléfono) o visitarlo personalmente.
