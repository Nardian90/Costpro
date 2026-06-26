# Tutorial: Cómo Dar de Alta Mi Primer Producto

> **Para quién**: Encargados, administradores y cualquier persona responsable del catálogo.
> **Tiempo**: 8 minutos para aprender, 2 minutos por producto una vez aprendido.
> **Qué aprenderá**: Crear un producto nuevo con su precio, su stock inicial y su código de barras.

## ¿Por qué necesito dar de alta productos?

Antes de poder vender algo en la caja, ese "algo" tiene que existir en el sistema. Piense en el catálogo como una **lista maestra** de todo lo que vende la tienda. Si un producto no está en esa lista, la caja no lo encuentra y no se puede cobrar.

## Mapa visual del flujo

```
┌─────────────────────────────────────────────────┐
│  1. Ir al Catálogo Maestro                     │
│         ↓                                      │
│  2. Clic en "+ Nuevo producto"                 │
│         ↓                                      │
│  3. Llenar campos obligatorios (*)             │
│         ↓                                      │
│  4. Generar código de barras                   │
│         ↓                                      │
│  5. (Opcional) Subir imagen                    │
│         ↓                                      │
│  6. Guardar                                    │
│         ↓                                      │
│  7. Verificar que aparece en la caja (POS)     │
└─────────────────────────────────────────────────┘
```

### Diagrama del formulario

```
┌─────────────────────────────────────────────┐
│  NUEVO PRODUCTO                       [X]   │
├─────────────────────────────────────────────┤
│                                             │
│  Nombre*      : [Leche entera 1L      ]    │
│  SKU*         : [LEC-001              ]    │
│  Categoría*   : [Lácteos           ▼ ]    │
│  Precio venta*: [2.50                 ]    │
│  Precio costo*: [1.80                 ]    │
│  Stock inicial: [24                   ]    │
│  Stock mínimo : [6                    ]    │
│                                             │
│  ─────────────────────────────────────────  │
│                                             │
│  Código de barras: [       ] [Generar]      │
│  Imagen:           [Subir imagen            ]│
│                                             │
│                       [Cancelar] [Guardar]  │
└─────────────────────────────────────────────┘
```


## Paso 1 — Ir al Catálogo

1. En el menú de la izquierda, haga clic en **Multi-Tienda**.
2. En la lista que se abre, busque y haga clic en **Catálogo Maestro** (a veces llamado solo "Catálogo").
3. Verá una tabla con todos los productos que ya existen.

> 💡 Si la tienda es nueva y nunca se ha cargado nada, la tabla estará vacía. Eso es normal la primera vez.

## Paso 2 — Abrir el formulario de nuevo producto

1. Busque arriba a la derecha un botón que dice **"+ Nuevo producto"** o simplemente **"+ Nuevo"**.
2. Haga clic en él.
3. Se abre una ventana con varios campos en blanco. No se asuste: son pocos los obligatorios.

## Paso 3 — Llenar los campos obligatorios

Verá muchos campos, pero **solo los marcados con asterisco (*) son obligatorios**. Los demás son opcionales y puede dejarlos vacíos si no tiene la información.

| Campo | Qué escribir | Ejemplo |
|-------|--------------|---------|
| **Nombre del producto*** | El nombre como lo conoce el cliente. Sea claro y corto. | "Leche entera 1L" |
| **SKU / Código*** | Un código interno único. Si no tiene uno, el sistema puede generar uno. | "LEC-001" |
| **Categoría*** | A qué grupo pertenece. Si no existe, hay que crearla primero. | "Lácteos" |
| **Precio de venta*** | Lo que paga el cliente. Use punto para decimales, no coma. | "2.50" |
| **Precio de costo*** | Lo que a usted le cobra el proveedor. | "1.80" |
| **Stock inicial** | Cuántas unidades tiene ahora mismo en la tienda. | "24" |
| **Stock mínimo** | A partir de qué cantidad el sistema le avisará que está bajo. | "6" |

> ⚠️ **Sobre los precios**: Use siempre **punto** para los decimales, nunca coma. Es decir, escriba **2.50**, no **2,50**. El sistema usa el formato internacional.

> ⚠️ **Sobre el stock inicial**: Si la tienda ya existía y usted está migrando los productos al sistema, ponga aquí el conteo físico real que hizo. Si no sabe el stock, deje "0" y después haga un ajuste (lea **Cómo ajustar inventario**).

## Paso 4 — Generar el código de barras (opcional pero recomendado)

1. En el formulario, busque la sección que dice **"Código de barras"**.
2. Si el producto ya trae un código de barras del fabricante (en la etiqueta), escríbalo ahí.
3. Si no trae código, haga clic en el botón **"Generar"**. El sistema creará un código único automáticamente.
4. Más tarde podrá imprimir etiquetas con ese código (lea **Cómo imprimir etiquetas con código de barras**).

## Paso 5 — Agregar imagen (opcional)

1. Busque la sección **"Imagen del producto"**.
2. Haga clic en **"Subir imagen"**.
3. Seleccione una foto desde su computadora. Formatos válidos: JPG, PNG.
4. La imagen aparece en miniatura. Esto ayuda a reconocer el producto en la caja.

> 💡 **Tip para personas mayores**: La imagen no es obligatoria, pero ayuda mucho al cajero a identificar productos parecidos. Si no tiene cámara o no sabe sacar fotos, no se preocupe: con el nombre bien escrito es suficiente.

## Paso 6 — Guardar el producto

1. Revise todos los campos obligatorios. Asegúrese de que no falte ninguno.
2. Haga clic en el botón **"Guardar"** (abajo a la derecha, en verde).
3. Aparece un mensaje verde que dice *"Producto creado correctamente"*.
4. La ventana se cierra sola y verá el nuevo producto en la tabla del catálogo.

> ⚠️ **Si al guardar aparece un mensaje rojo**: Léalo con calma. Lo más común es:
> - *"Ya existe un producto con ese SKU"*: cambie el código y vuelva a intentar.
> - *"La categoría no existe"*: primero cree la categoría en Configuración → Categorías.
> - *"Precio inválido"*: revise que usó punto y no coma en los decimales.

## Paso 7 — Verificar que aparezca en la caja

Para confirmar que el producto quedó bien cargado:

1. Vaya a **Multi-Tienda → Terminal POS**.
2. En la barra de búsqueda, escriba el nombre del producto que acaba de crear.
3. Debe aparecer en la lista. Si aparece, ¡todo está perfecto!
4. Si no aparece, espere 5 segundos y vuelva a intentar (a veces tarda en refrescar).

---

## Preguntas frecuentes

**¿Puedo cambiar el precio después?**
- Sí. Vaya al Catálogo, busque el producto, haga clic en el lápiz (editar), cambie el precio y guarde.
- El nuevo precio se aplica a las próximas ventas. Las ventas anteriores no cambian.

**¿Puedo dar de alta muchos productos de una sola vez?**
- Sí, con un archivo Excel. Lea **Cómo importar el catálogo desde Excel** en la sección Referencia.

**¿Qué pasa si me equivoco en el nombre?**
- Edite el producto (lápiz), corrija el nombre y guarde. El sistema guarda el historial de cambios.

**¿Puedo borrar un producto?**
- No se recomienda borrar. Lo correcto es **desactivarlo** (en la edición, marque "Producto inactivo").
- Así el producto desaparece de la caja pero se conserva el historial para los reportes.

**¿Qué es una "variante"?**
- Es el mismo producto en diferentes presentaciones. Por ejemplo: "Refresco 250ml", "Refresco 500ml", "Refresco 1L".
- Cada variante tiene su propio SKU, su propio precio y su propio stock.
- Para crear variantes, primero cree el producto base y luego use la pestaña **"Variantes"**.

---

## ¿Qué hacer ahora?

- Para imprimir etiquetas con código de barras: lea **Cómo imprimir etiquetas**.
- Para ajustar el inventario si el conteo real no coincide: lea **Cómo ajustar el inventario**.
- Para aprender a vender lo que acaba de cargar: lea **Tutorial: Cómo hacer mi primera venta**.
