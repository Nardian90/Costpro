# ARCHITECTURE MAINTENANCE PIPELINE

## ESTADO DEL PIPELINE
- **currentPhase**: 1
- **lastExecution**: null

## FASES DEL MANTENIMIENTO

### Fase 1: Codebase Scan
Detectar componentes reales del sistema.
**Actualizar**: `/docs/mapa_vistas.md`

---

### Fase 2: Dependency Graph Generation
Generar el grafo de dependencias arquitectónicas.
**Generar**: `/public/architecture_graph.json`
**Detectar**:
- nodes
- edges
- métricas de acoplamiento

---

### Fase 3: System Architecture Update
Sincronizar la arquitectura detectada con el modelo formal.
**Actualizar**: `/public/system_architecture.json`

---

### Fase 4: Documentation Quality Audit
Evaluar la calidad y cobertura de la documentación técnica.
**Actualizar**: `/docs/reports/DOCUMENTATION_QUALITY_AUDIT.md`
**Métrica**: Evaluar documentationQuality (1–10).

---

### Fase 5: ADR Generation
Registrar decisiones arquitectónicas recientes.
**Actualizar carpeta**: `/docs/architecture/ADR/`
**Acción**: Crear registros de decisiones arquitectónicas (Architectural Decision Records).

---

### Fase 6: C4 Architecture Diagrams
Actualizar diagramas de arquitectura en formato C4.
**Actualizar**: `/docs/architecture/diagrams/`
**Archivos**:
- system-context.md
- container-architecture.md
- component-architecture.md

---

### Fase 7: Data Model Documentation
Documentar el esquema de base de datos y relaciones.
**Actualizar**: `/docs/architecture/data-model.md`
**Contenido**: Documentar tablas y relaciones.

---

### Fase 8: AI System Documentation
Documentar la lógica y capacidades del sistema AI.
**Actualizar**: `/docs/architecture/ai-system.md`
**Contenido**: Documentar arquitectura del agente AI.

---

### Fase 9: System Health Evaluation
Calcular el estado de salud general del sistema.
**Actualizar**: `/public/system_health.json`
**Métrica**: Calcular `SystemHealthScore`.

---

### Fase 10: Maintenance Log
Registrar la ejecución y actualizar la línea de tiempo de salud.
**Actualizar**:
- `/logs/audit_log.json`
- `/public/health_timeline.json`

## REGLAS DE EJECUCIÓN
1. **Periodicidad**: El agente debe ejecutar solo una fase por ejecución.
2. **Registro**: Es obligatorio registrar resultados al finalizar cada fase.
3. **Progresión**: Avanzar secuencialmente a la siguiente fase (1 -> 2 -> ... -> 10).
4. **Ciclo**: Reiniciar el ciclo automáticamente a la Fase 1 después de completar la Fase 10.

## RUTAS DEL SISTEMA Y ARCHIVOS A ACTUALIZAR
- `/docs/mapa_vistas.md`
- `/public/architecture_graph.json`
- `/public/system_architecture.json`
- `/docs/reports/DOCUMENTATION_QUALITY_AUDIT.md`
- `/docs/architecture/ADR/`
- `/docs/architecture/diagrams/`
- `/docs/architecture/data-model.md`
- `/docs/architecture/ai-system.md`
- `/public/system_health.json`
- `/logs/audit_log.json`
- `/public/health_timeline.json`

## REGLAS DE SEGURIDAD
- **NO MODIFICAR**: Nunca modificar lógica de negocio.
- **NO ELIMINAR**: Nunca eliminar archivos del sistema.
- **NO DESPLEGAR**: Nunca ejecutar comandos de despliegue.
- **PERMITIDO**: Leer código, analizar arquitectura, generar documentación, registrar auditorías.
