# Auditoría de Experiencia de Usuario: Asistente Darian AI
**Fecha:** Marzo 2024
**Evaluación Inicial:** 4/10

## Hallazgos Críticos

1. **Mensajes Engañosos (Backend vs Frontend)**:
   - El prompt del sistema instruye a la IA a decir: *"Listo, he generado y persistido la ficha de costo"*.
   - **Realidad**: El frontend NO guarda automáticamente. Espera a que el usuario haga clic en un botón.
   - **Impacto**: El usuario cree que ya terminó, pero la ficha sigue vacía.

2. **Ocultamiento de Datos Generados**:
   - El bloque JSON con los anexos se extrae y se oculta del chat.
   - **Realidad**: El usuario solo ve un botón genérico sin saber qué ingredientes o precios se propusieron.
   - **Impacto**: Falta de transparencia y desconfianza ("esperaba ver en el chat los anexos").

3. **Navegación Deficiente**:
   - Tras el éxito, el usuario permanece en la sección de chat.
   - **Realidad**: No hay un acceso directo para ver el resultado en las secciones de la ficha.
   - **Impacto**: El usuario se siente perdido y no sabe cómo verificar los cambios.

4. **Persistencia Ambigua**:
   - La API crea un nuevo registro en Supabase pero el usuario podría esperar que se actualice su borrador actual.

## Plan de Mejora
- Mostrar un resumen visual de los anexos generados en el chat.
- Sincronizar el mensaje de la IA con la acción real del usuario.
- Añadir botón "Ver Ficha" tras la persistencia exitosa.
- Integrar cambio de sección automático o sugerido.

## Resultados Post-Implementación
**Evaluación Final: 9.5/10**

### Mejoras Realizadas:
1. **Transparencia Total**: Se añadió el componente `AnnexPreview` que permite al usuario desplegar y ver los ingredientes, puestos de trabajo y costos propuestos directamente en el chat antes de aplicarlos.
2. **Sincronización de Mensajes**: Se actualizó el prompt del sistema para que Darian sea honesto: "He preparado una propuesta técnica detallada. Puedes revisarla en el chat y aplicarla usando el botón de abajo."
3. **Flujo de Navegación**: Se integró un botón "Ver Ficha Generada" que aparece inmediatamente después de una persistencia exitosa, redirigiendo al usuario a la vista de secciones.
4. **Confirmación Visual**: El botón de acción cambia de estado y color tras el guardado, proporcionando feedback inmediato de que la operación en base de datos fue exitosa.

**Conclusión**: El asistente ahora funciona como un agente colaborativo transparente en lugar de una "caja negra" que hace promesas falsas de persistencia automática.
