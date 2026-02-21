# Aprendizajes: Automatización de Plantillas

- Se descubrió que el encabezado de las fichas de costo soporta fórmulas dinámicas mediante las funciones `GET_ANEXO_FILA_DATO` y `GET_FILA_DATO`.
- La función `GET_ANEXO_FILA_DATO(anexoId, rowIndex, field)` es ideal para que el encabezado (Nombre, Código, UM, Cantidad) se actualice automáticamente basándose en la materia prima principal definida en el Anexo I.
- Para que la integración entre secciones y anexos funcione correctamente mediante la palabra clave `AnexoI`, es fundamental que los registros del anexo tengan la propiedad `classification` coincidente con el prefijo de la fila (ej. "1.1").
- El motor de costos utiliza un sistema de resolución inteligente de prefijos para sumarizar datos de los anexos hacia las filas de las secciones.
