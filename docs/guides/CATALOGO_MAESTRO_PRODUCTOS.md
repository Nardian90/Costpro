# Guía operativa — Catálogo Maestro de Productos de la Organización

**Sistema:** COSTPRO 4 Multitienda
**Misión:** CP-CAT-MAESTRO-002
**Revisión:** 2026-10-30 · rama `feat/catalogo-maestro-gobernanza-docs-20261030` (base `main @ 1799dfb14e`)
**Estado de la funcionalidad descrita:** verificado por inspección de código, migraciones versionadas y suites de pruebas automatizadas (ver §13). Los datos de producción al momento de la revisión: 0 productos maestros y 0 tiendas conectadas — el catálogo está **listo para su primer uso**, aún sin contenido.

---

## 7.1 ¿Qué es el Catálogo Maestro?

El Catálogo Maestro de Productos (en la interfaz: **«Catálogo de la organización»**) guarda **una sola identidad por producto** a nivel de organización: SKU, nombre, descripción, código de barras, unidad de medida, imagen y naturaleza (producto o servicio).

Esa identidad es independiente de los **datos comerciales de cada tienda**. Un mismo producto puede verse así:

| Campo | Catálogo maestro | ENERVIDA | Otra tienda conectada |
| --- | --- | --- | --- |
| SKU | `PAR-500` | `PAR-500` (vinculado) | `PAR-500` (vinculado) |
| Nombre | Paracetamol 500 mg | Paracetamol 500 mg | Paracetamol 500 mg |
| Imagen | compartida | misma imagen | misma imagen |
| Precio | — | 150 CUP | 180 CUP |
| Costo | — | 90 CUP | 105 CUP |
| Existencias | — | 40 | 0 |

El maestro **no tiene** precio, costo ni existencias: solo identidad. Cada tienda conserva su propia fila operativa con su historia de kardex. **Compartir un producto no comparte precios, costos, existencias, proveedores, recepciones, ventas ni movimientos.**

Conceptos clave:

- **Producto maestro**: la identidad compartida de la organización.
- **Producto local**: la fila operativa de una tienda concreta (con su precio, costo, existencias e historial).
- **Activación**: crear la fila local de una tienda a partir de un maestro, con valores por defecto de esa tienda.
- **Conexión**: estado de una tienda habilitada para usar el catálogo de su organización.
- **Gobernador**: usuario con facultades de gobernanza del catálogo de la organización.

## 7.2 Requisitos y permisos

| Acción | Quién puede | Condición |
| --- | --- | --- |
| Ver y buscar el catálogo de la organización | Usuario con acceso a una tienda **conectada** | La tienda activa debe estar conectada |
| Activar un producto en la tienda | Usuario con acceso a la tienda conectada | Tienda conectada |
| Crear producto nuevo (identidad compartida) | Rol **admin, manager o encargado** de la tienda | Tienda conectada |
| Conectar / desconectar tiendas | **Gobernador del catálogo** | Propietario de la organización o autorizado por SuperAdmin |
| Editar identidad compartida (SKU, nombre, imagen…) | Gobernador del catálogo | — |
| Proponer un cambio de identidad | Usuario con acceso a la tienda conectada | Desde un maestro existente |
| Aprobar / rechazar propuestas | Gobernador del catálogo | — |
| Conceder la capacidad de gobernador | Solo **SuperAdmin** | Acción de plataforma |

Notas importantes:

- Los administradores de plataforma **no** gobiernan automáticamente el catálogo de una organización: la capacidad es organizacional.
- Toda escritura se valida **en el servidor** (funciones certificadas con anti-spoofing y auditoría). Ocultar un botón nunca es la única protección.
- **Si no ve una opción**: normalmente su usuario no tiene la capacidad o su tienda no está conectada. El panel de gobernanza muestra en todo momento quién tiene la facultad («Solo lectura…» o «Tienes facultades de gobernanza…»). Para obtener la capacidad, contacte al propietario de su organización (o al SuperAdmin para ser nombrado gobernador).

## 7.3 Cómo acceder

**Ruta verificada 1 — Desde la tienda (consulta y activación):**

1. Inicie sesión y seleccione la tienda.
2. Menú principal → **OPERACIÓN** → **Catálogo**.
3. Botón **«Catálogo de la organización»** (parte superior derecha de la vista, encima de la fila de filtros).

**Ruta verificada 2 — Gobernanza de la organización:**

1. Menú principal → **SISTEMA** → **Organizaciones**.
2. Fila de su organización → **Ver detalle**.
3. Pestaña **«Catálogo»** (junto a Resumen, Tiendas, Usuarios y Configuración).

**Ruta verificada 3 — Alta de producto compartido:**

1. **Catálogo** → alta habitual de **Nuevo producto**.
2. Si la tienda está conectada, el sistema integra el catálogo automáticamente en el alta (ver §7.7).

La ayuda integrada del sistema contiene esta guía en: **Centro de Ayuda (Ayuda) → Cómo Hacer → «Cómo Hacer: Usar el Catálogo de la Organización»**, con documentación complementaria en **Explicación → «¿Qué es el Catálogo Maestro de Productos?»** y **Referencia → «Catálogo maestro: campos compartidos, campos locales y permisos»**.

## 7.4 Cómo configurar el catálogo maestro de una organización

El modelo por organización ya está instalado en la base de datos (tablas, funciones y políticas). La configuración que realiza un usuario es la **conexión de tiendas**:

1. Entre a **SISTEMA → Organizaciones → Ver detalle → pestaña «Catálogo»**.
2. El panel muestra en todo momento:
   - **Quién gobierna** el catálogo (banner de capacidad).
   - **«Tiendas conectadas»** con el estado exacto de cada tienda:
     - «Conectada desde [fecha]»
     - «Sin conexión al catálogo maestro»
     - «Desconectada (productos e historial conservados)»
   - **«Productos maestros»** con búsqueda por SKU o nombre.
   - **«Propuestas pendientes»** de cambio de identidad.
3. Conecte las tiendas que deban usar el catálogo (§7.5).

**Qué significa que una tienda esté conectada**: esa tienda puede consultar el catálogo de la organización, activar productos del maestro y crear productos que enriquecen el maestro. **No** altera su operación diaria: sus productos, precios, existencias y ventas siguen siendo exclusivamente suyos. El botón «Catálogo de la organización» aparece en la vista Catálogo, pero solo da resultados si la tienda está conectada.

**Cómo comprobar que quedó guardado**: la etiqueta de la tienda cambia a «Conectada desde…» de inmediato y la operación queda registrada en la auditoría del sistema (`CATALOG_STORE_CONNECT`).

## 7.5 Cómo conectar una tienda al catálogo

1. Abra la administración de organizaciones: **SISTEMA → Organizaciones**.
2. Seleccione la organización correcta (busque por nombre si hay varias) y pulse **Ver detalle**.
3. Abra la pestaña **«Catálogo»**.
4. En «Tiendas conectadas», identifique la tienda y consulte su estado actual (conectada / sin conexión / desconectada).
5. Pulse **«Conectar»** junto a la tienda.
6. Confirme el resultado: la etiqueta cambia a «Conectada desde…». Las demás tiendas de la organización no se ven afectadas.
7. **Si el servidor rechaza la operación**:
   - «No tienes facultades de gobernanza…» → su usuario no es gobernador; pida al propietario que realice la conexión o que el SuperAdmin le conceda la capacidad.
   - «Tienda no encontrada» → la tienda fue eliminada o reasignada; refresque la lista de organizaciones.

Las tiendas de **otras organizaciones** no pueden consultar ni conectarse a este catálogo: el aislamiento lo garantiza el servidor.

## 7.6 Cómo utilizar el catálogo desde una tienda conectada

**Buscar un producto maestro**

1. **Catálogo → «Catálogo de la organización»**.
2. Escriba en el buscador: funciona por **SKU** (coincidencia inicial), **nombre** (contiene) y **código de barras** (exacto).

**Reconocer uno ya existente**

- Cada fila muestra el SKU, el nombre, la unidad, el código de barras y la **imagen compartida**.
- El estado «activado en esta tienda» indica que ya existe la fila local vinculada; «disponible» indica que aún puede activarla.

**Ver los productos disponibles**

- Sin texto de búsqueda se listan los maestros de la organización (hasta 200). Use el botón de refresco para actualizar.

**Activar un producto para la tienda**

1. Pulse **«Activar»** en el producto disponible.
2. El sistema crea la fila local: existencia **0**, **sin movimientos**, valores de alta por defecto (precio 0, costo 0, mínimo 1). **Nunca** copia precios ni existencias de otra tienda.
3. Si el producto ya estaba activado, se le informa y no se duplica nada.

**Comprobar que aparece en el catálogo local**

- Cierre la ventana y busque el producto por SKU en su catálogo local: aparecerá con la identidad compartida (nombre, SKU e imagen) y sus valores comerciales locales.

**Comenzar a usarlo**

- El producto activado se comporta como cualquier producto de la tienda: puede venderse en el POS, recibirse, ajustarse y consultarse en el kardex según los permisos y reglas habituales de cada módulo.

## 7.7 Cómo crear un producto nuevo (tienda conectada)

1. En **Catálogo**, inicie el alta habitual: **Nuevo producto**.
2. Complete SKU, nombre y datos comerciales (precio, costo, moneda). Esos valores comerciales serán **los de su tienda**; no viajan a otras.
3. Al guardar, el sistema verifica primero el SKU contra el catálogo de la organización:
   - **Si ya existe**: se le ofrece **activarlo** (con los valores de su pantalla como valores propios). Si ya está activado aquí, el alta se detiene con un aviso claro.
   - **Si no existe**: se crea la **identidad compartida una sola vez** y la fila local de su tienda en una única operación segura. La imagen, si sube una, queda en su tienda; el gobernador puede promoverla como imagen compartida (§7.8).
4. **Si otra tienda crea el mismo SKU a la vez**: la base de datos impide el duplicado (un solo maestro por organización y SKU). El segundo intento recibe el mensaje «Otra tienda acaba de crear ese SKU…»; la salida segura es actualizar y activar desde «Catálogo de la organización».
5. **Verificación**: el producto aparece como «activado en esta tienda» en «Catálogo de la organización» y como **disponible** para las demás tiendas conectadas (sin existencias ni precios en ellas).

Permisos: rol admin, manager o encargado de la tienda conectada. En tiendas **no conectadas**, el alta funciona como siempre (producto local sin identidad compartida).

## 7.8 Cómo modificar SKU, nombre e imagen

**Quién puede**: solo el **gobernador del catálogo** edita la identidad compartida. Un usuario sin capacidad que intente el cambio recibe el rechazo del servidor, incluso por vía directa.

**Procedimiento verificado:**

1. **SISTEMA → Organizaciones → Ver detalle → «Catálogo»**.
2. En «Productos maestros», busque el producto y pulse **«Editar»**.
3. Modifique los campos: SKU, nombre, código de barras, unidad de medida.
4. Para la imagen:
   - **Promover una imagen local**: elija entre las imágenes ya subidas por las tiendas vinculadas (no duplica archivos: se comparte la misma referencia).
   - **Subir archivo nuevo**: requiere el producto activado en al menos una tienda (la política de almacenamiento exige asociar el archivo a un producto real). El archivo nuevo se propaga a las tiendas vinculadas.
5. Pulse **«Guardar y propagar»**. El cambio:
   - Se aplica a todas las filas locales vinculadas (SKU y nombre se re-coercionan al valor canónico; con la imagen vigente igualmente).
   - Queda **auditado campo a campo** (valor anterior → valor nuevo, autor, tienda de origen).

**Modificaciones compartidas vs. locales**: lo que edita aquí es la identidad (viaja a todas las tiendas conectadas). El precio, el costo y las existencias se editan desde la ficha local de cada tienda, como siempre, y **nunca** se propagan.

**Propuestas**: los usuarios de tienda sin capacidad de gobernador pueden **proponer** cambios (la cola «Propuestas pendientes» del panel muestra campo, valor y fecha). El gobernador **Aprueba** (se aplica y propaga) o **Rechaza** (con nota). El resultado se consulta en la misma pestaña y en la auditoría del sistema.

## 7.9 Datos que siguen siendo propios de cada tienda

| Campo | ¿Compartido? | ¿Quién lo cambia? | ¿Viaja entre tiendas? |
| --- | --- | --- | --- |
| SKU, nombre, descripción | Sí (maestro) | Gobernador | Sí |
| Código de barras | Sí (maestro, único en la organización) | Gobernador | Sí |
| Unidad de medida | Sí (maestro) | Gobernador | Sí |
| Imagen | Sí (referencia al mismo archivo) | Gobernador | Sí |
| Naturaleza (producto/servicio) | Sí (maestro) | Gobernador | Sí |
| Precio de venta y moneda | **No** — fila local | Personal de la tienda | **Nunca** |
| Costo | **No** — fila local | Personal de la tienda | **Nunca** |
| Existencias, stock mínimo | **No** — fila local | Operación de la tienda | **Nunca** |
| Categoría, proveedor locales | **No** — fila local | Personal de la tienda | **Nunca** |
| Recepciones, ventas, vales, ajustes, kardex | **No** — por tienda | Operación de la tienda | **Nunca** |

**Expreso**: compartir un producto **no** comparte precios, costos, existencias, proveedores, recepciones, ventas ni movimientos del kardex. Activar un producto nunca genera existencias, recepciones, ventas ni movimientos automáticos en otras tiendas.

## 7.10 Cómo desconectar una tienda y volver a conectarla

**Desconectar** (gobernador, pestaña «Catálogo» → «Desconectar»):

- La tienda deja de ver el catálogo de la organización y de recibir propagaciones de identidad.
- **No se elimina nada**: productos locales (vinculados o no), precios, costos, existencias, recepciones, ventas e historial permanecen intactos.
- El evento queda registrado en la auditoría (`CATALOG_STORE_DISCONNECT`).

**Volver a conectar** (gobernador → «Conectar»):

- Las relaciones anteriores se **recuperan de forma coherente**: los productos que ya estaban vinculados al maestro vuelven a reconocer la identidad compartida, sin duplicados ni re-activaciones.
- No debe hacerse nada manual: **no** re-crear productos, **no** cambiar SKUs a mano, **no** borrar filas locales para «forzar» la reconexión.

## 7.11 Solución de problemas

| Síntoma | Comprobación | Solución | Cuándo escalar |
| --- | --- | --- | --- |
| No aparece «Catálogo de la organización» | ¿Está en la vista Catálogo? | Actualice la página; el botón está arriba a la derecha | Si persiste, avise al administrador |
| «Esta tienda no está conectada…» | Estado del enlace en el modal | El gobernador debe conectar la tienda (§7.5) | Si el gobernador no la ve, escale al SuperAdmin |
| «No tengo permiso para conectar una tienda» | Banner de capacidad en la pestaña «Catálogo» | Solo el gobernador conecta; solicite la capacidad al propietario (SuperAdmin la concede) | — |
| «El SKU ya existe» | Búsqueda en «Catálogo de la organización» | Active el producto existente en lugar de crear otro (§7.6) | Si el maestro está archivado, escale al gobernador |
| El producto está en el maestro pero no en mi catálogo local | Estado «disponible» | Actívelo (§7.6); la fila local se crea al instante | Si la activación falla, anote el mensaje exacto |
| La imagen no se muestra | ¿Tiene imagen compartida el maestro? | El gobernador la promueve o la sube (§7.8) | Si la imagen existe y no carga, avise al administrador (posible archivo ausente) |
| No puedo editar el nombre o el SKU | ¿Es gobernador? | La identidad la edita el gobernador (§7.8); usted puede proponer el cambio | — |
| La tienda está desconectada | Etiqueta «Desconectada (productos e historial conservados)» | El gobernador la reconecta (§7.10); no hay que re-crear nada | — |
| La activación falla | Mensaje del sistema | Actualice la página y reintente | Con error repetido, capture el mensaje y escale |
| Diferencias entre información compartida y local | Recuerde el modelo: identidad vs. datos locales | La identidad se propaga del maestro; el precio/costo/existencia local es de la tienda y es correcto que difiera | Si el SKU/nombre local difiere del maestro estando vinculado, avise al administrador |

**Nunca** como usuario común: borrar registros, editar tablas directamente ni cambiar permisos manualmente. Estas acciones no forman parte de la operación del sistema.

## 7.12 Preguntas frecuentes y glosario

**Glosario**

- **Catálogo maestro (Catálogo de la organización)**: inventario de identidades compartidas de producto de una organización.
- **Producto local**: la fila operativa de un producto dentro de una tienda (precio, costo, existencias, historial).
- **Identidad compartida**: el conjunto de campos canónicos del maestro (SKU, nombre, barcode, unidad, imagen).
- **Activación**: crear la fila local de una tienda a partir de un maestro (existencia 0, sin movimientos, valores por defecto).
- **Conexión**: habilitación de una tienda para usar el catálogo de su organización.
- **Organización**: la empresa (tenant) que agrupa tiendas y usuarios; el catálogo pertenece a la organización.
- **SKU**: identificador de producto usado para la unicidad del maestro (un solo maestro por organización y SKU).
- **Gobernador**: usuario con facultades de gobernanza del catálogo (propietario o autorizado por SuperAdmin).

**Preguntas frecuentes**

- **¿Al compartir un producto se comparte el precio?** No. El precio, el costo, la moneda y las existencias son locales de cada tienda.
- **¿La imagen se sube dos veces?** No. La imagen compartida es una referencia al mismo archivo del almacén; todas las tiendas muestran el mismo activo y al reemplazarlo las vinculadas reciben la referencia nueva (el archivo anterior se conserva mientras haya referencias válidas).
- **¿Cambiar el nombre del maestro cambia mis ventas?** No. El nombre se actualiza en las filas vinculadas; las ventas, recepciones y kardex históricos permanecen como están.
- **¿Puedo tener un producto solo en mi tienda?** Sí. Los productos locales no vinculados siguen funcionando; solo el alta en tienda conectada crea identidad compartida.
- **¿Otra organización ve mi catálogo?** No. El aislamiento entre organizaciones está garantizado por las políticas de seguridad del servidor.

## 7.13 Estado funcional y limitaciones

**Entorno de verificación**: repositorio `Nardian90/Costpro`, rama `feat/catalogo-maestro-gobernanza-docs-20261030` sobre `main @ 1799dfb14e`; suites automatizadas del proyecto (vitest) y verificación de solo lectura sobre la base de producción (0 maestros y 0 conexiones al 2026-10-30).

**Operativo y probado (implementado + pruebas automatizadas):**

- Acceso desde la vista Catálogo (botón «Catálogo de la organización») y desde Organizaciones (pestaña «Catálogo»).
- Estado de conexión por tienda; conectar/desconectar con confirmación (gobernador, validado en servidor).
- Búsqueda de maestros por SKU/nombre/barcode; estados «disponible» / «activado en esta tienda».
- Activación con defaults locales y existencia 0 (sin movimientos ni copias de otras tiendas).
- Alta con identidad compartida desde tienda conectada; dedup por SKU previo; carrera de SKU con salida segura.
- Edición de identidad compartida por el gobernador con propagación de SKU/nombre y auditoría por campo.
- Propuestas y revisión (aprobar/rechazar) por el gobernador.
- Imagen compartida por referencia; GC de imágenes condicionado a referencias vivas (no se borran archivos aún usados).
- Aislamiento entre organizaciones (RLS y RPC fail-closed; 291 pruebas de contrato de migraciones en verde).
- Ayuda integrada con 3 documentos nuevos e índice de búsquedas (8 términos verificados).

**Preparado, pendiente de aplicación a producción (requiere autorización):**

- Migración versionada `20261030120000_cp_catalogo_master_image_propagation.sql`: propaga el **reemplazo de imagen** del maestro a las filas ya vinculadas. Hasta su aplicación, el reemplazo de imagen actualiza el maestro y las altas futuras, pero las tiendas ya activadas conservan la imagen anterior (las referencias no se rompen: el archivo anterior no se borra mientras lo use el maestro u otra tienda). Plan de ejecución: ventana autorizada, `supabase migration up` controlado o aplicación por SQL versionado con verificación del guard incluido.

**Limitaciones conocidas:**

- La concesión de gobernador (`grant_catalog_governor`) se realiza por el SuperAdmin a nivel de plataforma (sin panel dedicado todavía).
- La subida de imagen compartida nueva exige el producto activado en al menos una tienda (requisito de la política de almacenamiento); la **promoción** de imágenes locales existentes no tiene ese requisito.
- La desconexión y reconexión están verificadas a nivel de contrato (RPC + pruebas); el recorrido E2E aislado con usuarios reales para el catálogo completo no forma parte del smoke set actual (queda como trabajo futuro).
- En producción el catálogo está **vacío** hasta que el propietario conecte una tienda y cree/active productos; no se conectó ninguna tienda real durante esta misión (requiere autorización del propietario).

---

*Guía generada en la misión CP-CAT-MAESTRO-002. Toda descripción corresponde a funciones implementadas y verificadas en el commit indicado; las funciones proyectadas se listan explícitamente como pendientes.*
