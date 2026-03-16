# ARCHITECTURE_AI_PIPELINE.md
Pipeline escalonado diario para Scheduler AI - Nivel 10/10

---
currentPhase: 13
lastExecution: 2026-03-16
pipelineVersion: 1.1.0
---

Fases (ejecutar 1 fase por día):

1. architecture discovery
   - Escanear todos los componentes, vistas, servicios y módulos
   - Detectar dependencias y relaciones

2. domain classification
   - Clasificar componentes y servicios por dominio funcional

3. dependency graph
   - Generar grafo de dependencias y relaciones técnicas
   - Actualizar architecture_graph.json

4. git change analysis
   - Detectar cambios recientes en el repositorio
   - Identificar nuevos componentes, eliminaciones o renombramientos

5. metrics collection
   - Recopilar métricas de uso y cobertura de componentes y workflows

6. architecture health
   - Validar integridad de artefactos y consistencia de versiones
   - Activar repair_mode si se detectan inconsistencias

7. business logic extraction
   - Extraer lógica de negocio de componentes y servicios
   - Actualizar knowledge/components.json

8. user language translation
   - Generar descripciones comprensibles para usuarios finales
   - Actualizar knowledge/user_help.json

9. view flow mapping
   - Mapear flujo de usuario, acciones y componentes visibles
   - Actualizar knowledge/views.json

10. workflow detection
    - Detectar y generar procesos completos del negocio
    - Actualizar knowledge/workflows.json

11. manual generation
    - Construir y actualizar knowledge/master_user_manual.json

12. knowledge graph generation
    - Generar relaciones entre componentes, vistas, workflows, servicios y acciones
    - Actualizar knowledge_graph.json

13. ai context index generation
    - Crear resúmenes optimizados para IA
    - Actualizar ai_context_index.json

14. consistency validation
    - Verificar coherencia global de todos los artefactos
    - Registrar inconsistencias en docs/architecture/INTEGRITY_REPORT.md

Notas de ejecución diaria:
- Cada día se ejecuta **solo una fase** según currentPhase
- currentPhase se incrementa automáticamente cada día
- Cuando currentPhase > 14, reinicia en 1
- Esto permite mantener arquitectura y documentación actualizada de manera gradual y consistente
