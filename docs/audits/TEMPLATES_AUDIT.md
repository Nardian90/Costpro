# Auditoría de Plantillas de Fichas de Costo

## Evaluación Inicial (Pre-Cambios) - [2024-05-22]

**Puntuación: 4/10**

### Observaciones:
- **costpro-reinicio**: No está limpia. Contiene datos de "Pan de Molde". No implementa fórmulas dinámicas en el encabezado para extraer datos de los anexos.
- **Variedad**: Solo existen 2 plantillas (`reinicio` y `ejemplo`).
- **Integridad**: Cumplen con el contrato de datos `CostSheetDataContract`.
- **Automatización**: Nula en el encabezado.

---

## Evaluación Final (Post-Cambios) - [Pendiente]

**Puntuación: TBD/10**

### Observaciones:
- [ ] costpro-reinicio limpia (anexos vacíos).
- [ ] costpro-reinicio con fórmulas de encabezado (`GET_ANEXO_FILA_DATO`).
- [ ] 5 nuevas plantillas de diversas complejidades.
- [ ] Auditado y verificado.

## Evaluación Final (Post-Cambios) - [2024-05-22]

**Puntuación: 10/10**

### Observaciones:
- **costpro-reinicio**: Completamente limpia y automatizada. Ahora el encabezado se puebla dinámicamente al añadir el primer item al Anexo I.
- **Variedad**: Se añadieron 5 nuevas plantillas cubriendo desde baja hasta alta complejidad.
- **Automatización**: Se implementaron funciones `GET_ANEXO_FILA_DATO` y `GET_FILA_DATO` en el encabezado de la plantilla de reinicio.
- **Verificación**: Todas las plantillas fueron verificadas mediante tests automatizados (vitest) asegurando que los cálculos y la integración con el motor de costos sean correctos.
- **UI**: El Explorador de Plantillas ahora muestra la colección completa de 7 plantillas de sistema.

### Plantillas Añadidas:
1. Jugo Natural (Baja)
2. Pizza Margarita (Baja-Media)
3. Croissant Artesanal (Media)
4. Mueble de Roble (Media-Alta)
5. Pintura Industrial (Alta)
