# ARCHITECTURE AI PIPELINE v9.0 — CostPro (Enterprise Clean)
**Autonomous Architecture · Knowledge · Documentation · AI Engineering Brain**
**Versión:** 9.0.0 (Clean Architecture Standard)
**Estándares:** ISO/IEC 26514, Diátaxis Framework
**Arquitectura:** Híbrida (AST Determinista + IA Probabilística + RAG Incremental)
**Estado:** Reorganizado para Productividad Humana

---

## 1. INSTRUCCIONES PARA EL SCHEDULER (JULES / AI AGENT)
**Rol:** Autonomous Architecture & AI Knowledge Maintenance Scheduler
**Fuente de Verdad:** Este archivo (`/docs/automation/ARCHITECTURE_AI_PIPELINE_v8.md`) + `/docs/automation/pipeline_state.yaml`

### Reglas Críticas de Ejecución:
1.  **Limpieza Absoluta:** Ningún archivo temporal o log debe permanecer en la raíz.
2.  **Seguridad de Artefactos:** Los archivos de arquitectura viven en `knowledge/architecture/`. NO en `public/`.
3.  **Centralización de Auditoría:** Todos los reportes de salud (json/md) deben ir a `docs/audits/`.
4.  **Gobernanza:** Ningún artefacto se commita sin `confidenceScore` y `hashSHA256`.

---

## 2. CONFIGURACIÓN DEL ESTADO
**Ruta:** `/docs/automation/pipeline_state.yaml`
Contiene el estado de las fases, umbrales de confianza y configuración del motor RAG.

---

## 3. ARTEFACTOS Y ESTRUCTURA DEL REPOSITORIO (v9.0)

### 3.1 Capa de Arquitectura (Engine 1)
Ubicación: `knowledge/architecture/`
- `system_architecture.json`: Inventario estructural.
- `architecture_manifest.json`: Metadatos del sistema.
- `architecture_graph.json`: Grafo de dependencias AST.
- `_meta/`: Sidecars de versionado y confianza.
- `_archive/`: Histórico para rollbacks.

### 3.2 Capa de Conocimiento e IA (Engine 2)
Ubicación: `knowledge/`
- `components.json`: Lógica de negocio y dominios.
- `views.json`: Flujos de interfaz.
- `workflows.json`: Procesos de negocio.
- `knowledge_graph.json`: Grafo semántico de conocimiento.

### 3.3 Capa de Documentación (Diátaxis)
Ubicación: `knowledge/docs/`
- `tutorials/`: Aprendizaje guiado.
- `how-to/`: Guías de tareas.
- `reference/`: Especificación técnica.
- `explanation/`: Conceptos y decisiones de diseño.

### 3.4 Capa de Calidad y Auditoría (Gobernanza)
Ubicación: `docs/audits/`
- `architecture_audit.json`: Métricas de performance y salud.
- `system_health.json`: Estado actual de integridad.
- `*.md`: Reportes de auditoría humana y de IA.

---

## 4. FASES DEL PIPELINE (Resumen de Rutas)

| Fase | Objetivo | Salida Principal |
| :--- | :--- | :--- |
| 1-6 | Análisis Estático (AST) | `knowledge/architecture/*.json` |
| 7-9 | Extracción de Lógica | `knowledge/*.json` |
| 10 | Diátaxis Layer | `knowledge/docs/**/*` |
| 14 | RAG Context | `ai_context/ai_vector_index/` |
| 15-16| Validación Global | `docs/audits/integrity_report.md` |

---

## 5. MODOS DEL SCHEDULER
- **Normal:** 1 → 18.
- **Repair:** Reconstruye `knowledge/architecture/`.
- **Light:** Solo validación en `docs/audits/`.

---
*Fin del Documento ARCHITECTURE AI PIPELINE v9.0*
