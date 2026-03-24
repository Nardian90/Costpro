# ARCHITECTURE AI PIPELINE v8.1 — CostPro
## Autonomous Architecture · Knowledge · Documentation · AI Engineering Brain

**Versión:** 8.1.0 (Enterprise Stabilized)
**Estándares:** ISO/IEC 26514, Diátaxis Framework
**Arquitectura:** Híbrida (AST Determinista + IA Probabilística + RAG Incremental)
**Estado:** Listo para producción (Copy-Paste)
**Nota:** Incluye correcciones de estabilidad para Fase 14 (RAG Engine).

---

## 1. INSTRUCCIONES PARA EL SCHEDULER (JULES / AI AGENT)

**Rol:** Autonomous Architecture & AI Knowledge Maintenance Scheduler
**Frecuencia:** 1 vez por día (ejecución incremental)
**Fuente de Verdad:** Este archivo (`/docs/automation/ARCHITECTURE_AI_PIPELINE_v8.md`) + `/docs/automation/pipeline_state.yaml`

**Reglas Críticas de Ejecución:**
1.  **Leer Estado:** Siempre iniciar leyendo `/docs/automation/pipeline_state.yaml`.
2.  **Una Fase por Día:** Ejecutar únicamente la fase indicada por `currentPhase` (excepto modo repair).
3.  **Gobernanza:** Ningún artefacto se commita sin `confidenceScore` y `hashSHA256`.
4.  **Cuarentena:** Si `confidenceScore < 90`, el artefacto va a `/docs/automation/quarantine/` y se notifica.
5.  **Determinismo:** Fases 1-6 deben usar análisis estático (AST), no IA generativa pura.
6.  **RAG Estable (Fase 14):** Debe ser **incremental**, **no bloqueante** y ejecutada por script especializado (`rag_indexer.py`), no por generación LLM directa.
7.  **Performance Tracking:** Cada fase debe registrar `startTime`, `endTime`, `durationMs` en `architecture_audit.json`.

---

## 2. ARCHIVO COMPAÑERO OBLIGATORIO (CREAR PRIMERO)

**Ruta:** `/docs/automation/pipeline_state.yaml`
**Contenido:** Copiar y pegar el siguiente bloque YAML exactamente.

```yaml
currentPhase: 1
lastExecution: null
pipelineVersion: 8.1.0
cycle: 1
schedulerMode: normal           # normal | repair | light
documentationModel: ISO_26514 + Diataxis
repairThreshold: 80             # integrityScore < 80 → modo repair
confidenceThreshold: 90         # % (0-100) — mínimo aceptable para artefacts IA
quarantinePath: docs/automation/quarantine/
artifactStore: public/
metadataStore: public/_meta/
archiveStore: public/_archive/
reviewQueue: docs/automation/review_queue.json
ai_embeddings_path: ai_context/ai_embeddings/
ai_vector_index_path: ai_context/ai_vector_index/
humanFeedbackStore: docs/automation/human_feedback.json

# Configuración Específica RAG (Fase 14)
rag_engine:
  mode: incremental           # full | incremental
  last_indexed_hash: ""       # Hash del estado anterior del conocimiento
  batch_size: 50              # Archivos por lote para evitar timeouts
  embedding_model: "text-embedding-3-small" # Modelo dedicado
  retry_policy:
    max_attempts: 3
    backoff_seconds: 60
  non_blocking: true          # Si falla, no detiene el pipeline
```

---

## 3. ARTEFACTOS Y ESTRUCTURA DEL REPOSITORIO

El pipeline mantiene y valida la siguiente estructura de directorios y archivos.

### 3.1 Capa de Arquitectura (Engine 1 - Determinista)
- `public/system_architecture.json` (Inventario estructural)
- `public/architecture_manifest.json` (Metadatos del sistema)
- `public/architecture_graph.json` (Grafo de dependencias AST)
- `public/architecture_audit.json` (Salud, integridad + **Performance Metrics**)

### 3.2 Capa de Conocimiento (Engine 2 - IA)
- `knowledge/components.json` (Lógica de negocio y dominios)
- `knowledge/views.json` (Flujos de interfaz)
- `knowledge/workflows.json` (Procesos de negocio)
- `knowledge/master_user_manual.json` (Manual maestro)
- `knowledge/user_help.json` (Ayuda contextual)

### 3.3 Capa Documental (ISO + Diátaxis)
- `knowledge/docs/tutorials/` (Aprendizaje guiado)
- `knowledge/docs/how-to/` (Guías de tareas)
- `knowledge/docs/reference/` (Especificación técnica)
- `knowledge/docs/explanation/` (Conceptos y decisiones)
- `knowledge/iso_manual/` (Manual conforme a ISO/IEC 26514)

### 3.4 Capa de Contexto IA (Engine 3 - RAG Optimizado)
- `knowledge_graph.json` (Grafo semántico)
- `ai_context/` (Contextos modulares)
- `ai_context/ai_embeddings/` (Vectores por chunk - Incremental)
- `ai_context/ai_vector_index/` (Índice de recuperación)
- `ai_context/vector_index_stats.json` (Estadísticas de indexación)
- `ai_context/previous_hashes.json` (Control de cambios para delta)

### 3.5 Gobernanza y Metadata
- `public/_meta/*.meta.json` (Sidecars de versionado y confianza)
- `public/_archive/` (Histórico versionado para rollback)
- `docs/automation/quarantine/` (Artefactos en revisión)
- `docs/automation/review_queue.json` (Cola de revisión humana)

---

## 4. GOBERNANZA DE ARTEFACTOS (REGLAS OBLIGATORIAS)

### 4.1 Versionado Semántico
Todos los artefactos JSON generados deben seguir `MAJOR.MINOR.PATCH`.
- **MAJOR:** Cambios estructurales en arquitectura.
- **MINOR:** Nueva información o nodos agregados.
- **PATCH:** Correcciones menores o regeneración sin cambios estructurales.

### 4.2 Metadata Sidecar
Cada artefacto `nombre.json` debe tener un `public/_meta/nombre.meta.json` con:
```json
{
  "artifactName": "nombre",
  "version": "1.0.0",
  "hash": "sha256:...",
  "confidenceScore": 95.5,
  "reviewRequired": false,
  "createdAt": "ISO8601",
  "sourcePhase": 1
}
```

### 4.3 Política de Confianza (Confidence Score)
- **Umbral:** `confidenceThreshold` (definido en state.yaml, default 90).
- **Si Score < Umbral:**
  1.  `reviewRequired = true`
  2.  Mover archivo a `quarantinePath`.
  3.  Registrar entrada en `reviewQueue`.
  4.  **NO** reemplazar el artefacto activo en `public/`.

### 4.4 Rollback Automático
Si un nuevo artefacto reduce el `integrityScore` del sistema en > 5 puntos o rompe integridad referencial:
1.  Detener commit.
2.  Restaurar última versión válida desde `public/_archive/`.
3.  Registrar evento en `public/architecture_audit.json`.

### 4.5 Performance Metrics (Obligatorio)
Cada ejecución de fase debe registrar timing en `architecture_audit.json`:
```json
{
  "phaseExecutions": [
    {
      "phase": 1,
      "phaseName": "Architecture Discovery",
      "startTime": "2026-03-16T10:00:00Z",
      "endTime": "2026-03-16T10:05:30Z",
      "durationMs": 330000,
      "status": "success",
      "artifactsGenerated": ["system_architecture.json", "architecture_manifest.json"]
    }
  ],
  "performanceSummary": {
    "averagePhaseDurationMs": 250000,
    "slowestPhase": 7,
    "fastestPhase": 4,
    "lastCycleDurationMs": 4500000
  }
}
```

### 4.6 Tolerancia a Fallos en RAG (Fase 14)
- La Fase 14 es **No Bloqueante** para las Fases 1-13 y 15-18.
- Si la Fase 14 falla:
  1.  El pipeline continúa a la Fase 15.
  2.  Se marca `rag_status: degraded` en `architecture_audit.json`.
  3.  El sistema usa el índice vectorial de la versión anterior (que sigue siendo válido).
  4.  Se genera una tarea en `review_queue.json` para reparación asíncrona.
- **Justificación:** La búsqueda semántica es una mejora, pero la integridad arquitectónica (Fases 1-6) es crítica.

---

## 5. FASES DEL PIPELINE (18 FASES)

El pipeline se divide en 3 Motores de Ejecución.

### ENGINE 1: STATIC ANALYZER (Determinista / AST)
*Estas fases NO usan IA generativa para estructura, usan parsers de código.*

**FASE 1 — Architecture Discovery**
- **Objetivo:** Escaneo determinista del repositorio.
- **Acción:** Parsear AST de `src/`, `components/`, `services/`.
- **Salida:** `public/system_architecture.json`, `public/architecture_manifest.json`.
- **Timing:** Registrar `startTime`, `endTime`, `durationMs` en audit.

**FASE 2 — Domain Classification**
- **Objetivo:** Clasificar componentes por dominio funcional.
- **Dominios:** UI, Domain, Engine, Infrastructure, Integration, Data.
- **Salida:** `knowledge/components.json`.
- **Timing:** Registrar en audit.

**FASE 3 — Dependency Graph**
- **Objetivo:** Construir grafo de dependencias técnico.
- **Acción:** Analizar imports/exports estáticos.
- **Salida:** `public/architecture_graph.json`.
- **Timing:** Registrar en audit.

**FASE 4 — Git Change Intelligence**
- **Objetivo:** Detectar cambios recientes en el repo.
- **Acción:** Analizar historial Git (nuevos, borrados, refactor).
- **Salida:** `architecture_changes.json`.
- **Regla:** Si hay cambio estructural mayor → Forzar re-ejecución de Fases 1 y 3.
- **Importante:** Genera `delta_hash` usado por la Fase 14.
- **Timing:** Registrar en audit.

**FASE 5 — Architecture Metrics**
- **Objetivo:** Calcular métricas cuantitativas.
- **Métricas:** Fan-in, Fan-out, Profundidad de dependencias, Cobertura.
- **Salida:** `architecture_metrics.json`.
- **Timing:** Registrar en audit.

**FASE 6 — Architecture Health**
- **Objetivo:** Evaluar salud global del sistema.
- **Cálculo:** `integrityScore`, `cyclicDependencies`, `orphanComponents`.
- **Salida:** `public/architecture_audit.json` (incluye performance metrics).
- **Regla Crítica:** Si `integrityScore < repairThreshold` → `schedulerMode = repair`.
- **Timing:** Registrar en audit.

### ENGINE 2: AI INTERPRETATION (Probabilístico / IA)
*Estas fases usan IA para interpretar lógica, negocio y documentación.*

**FASE 7 — Business Logic Extraction**
- **Objetivo:** Extraer reglas de negocio del código.
- **Acción:** IA analiza funciones para detectar validaciones, cálculos, reglas contables.
- **Salida:** Actualiza `knowledge/components.json` (campo `businessRules`).
- **Requerido:** `confidenceScore` en metadata.
- **Timing:** Registrar en audit.

**FASE 8 — View Flow Mapping**
- **Objetivo:** Mapear interacción usuario-interfaz.
- **Acción:** Detectar acciones, formularios, eventos, navegación.
- **Salida:** `knowledge/views.json`.
- **Timing:** Registrar en audit.

**FASE 9 — Workflow Detection**
- **Objetivo:** Detectar procesos de negocio completos.
- **Ejemplos:** Importación bancaria, Conciliación, Matching IPV.
- **Salida:** `knowledge/workflows.json`.
- **Timing:** Registrar en audit.

**FASE 10 — Diátaxis Documentation Layer**
- **Objetivo:** Clasificar documentación según framework Diátaxis.
- **Acción:** Generar/Actualizar carpetas específicas.
- **Salida:**
  - `knowledge/docs/tutorials/` (Aprendizaje)
  - `knowledge/docs/how-to/` (Tareas)
  - `knowledge/docs/reference/` (Técnico)
  - `knowledge/docs/explanation/` (Conceptos)
- **Timing:** Registrar en audit.

**FASE 11 — User Language Translation**
- **Objetivo:** Traducir tecnicismos a lenguaje de usuario final.
- **Salida:** `knowledge/user_help.json`.
- **Timing:** Registrar en audit.

**FASE 12 — ISO/IEC 26514 Manual Generation**
- **Objetivo:** Generar manual conforme a estándar ISO.
- **Estructura Requerida:**
  - `introduction.md`
  - `system_overview.md`
  - `user_tasks.md`
  - `procedures.md`
  - `reference.md`
  - `glossary.md`
- **Salida:** `knowledge/iso_manual/`.
- **Timing:** Registrar en audit.

**FASE 13 — Knowledge Graph Generation**
- **Objetivo:** Construir grafo semántico de conocimiento.
- **Nodos:** Componente, Vista, Workflow, Regla, Servicio.
- **Salida:** `knowledge_graph.json`.
- **Timing:** Registrar en audit.

**FASE 17 — AI Architecture Evolution Engine**
- **Objetivo:** Proponer mejoras arquitectónicas.
- **Detección:** High coupling, lógica duplicada, workflows complejos.
- **Salida:** `docs/architecture/ARCHITECTURE_RECOMMENDATIONS.md`.
- **Timing:** Registrar en audit.

**FASE 18 — Self Improvement Cycle**
- **Objetivo:** Analizar y mejorar el propio pipeline.
- **Detección:** Fases lentas, errores recurrentes, baja confianza.
- **Salida:** `docs/automation/PIPELINE_IMPROVEMENTS.md`.
- **Timing:** Registrar en audit.

### ENGINE 3: AI RAG CONTEXT (Optimizado & Incremental)
*Evita saturar ventana de contexto de LLM. Ejecución vía script especializado.*

**FASE 14 — AI Retrieval Context System (Stable)**
- **Objetivo:** Actualizar índice vectorial RAG de forma incremental y eficiente.
- **Motor:** Script Python especializado (`rag_indexer.py`), NO generación LLM directa.
- **Acción:**
  1.  **Delta Detection:** Comparar hash de archivos en `knowledge/` y `public/` contra `last_indexed_hash` (de Fase 4).
  2.  **Selective Chunking:** Solo procesar archivos nuevos o modificados.
  3.  **Batched Embedding:** Enviar solicitudes a la API de embeddings en lotes de `batch_size` (ej. 50 chunks).
  4.  **Upsert Index:** Actualizar `ai_context/ai_vector_index/` sin borrar lo existente.
  5.  **Cache Validation:** Si un archivo no cambió, reutilizar su vector existente.
- **Salida:**
  - `ai_context/ai_embeddings/*.json` (Solo nuevos/actualizados)
  - `ai_context/ai_vector_index/manifest.json` (Mapa de IDs a archivos)
  - `ai_context/vector_index_stats.json` (Conteo total, últimos actualizados)
- **Regla de Estabilidad:**
  - Si el proceso excede el 80% del tiempo asignado, guardar checkpoint y continuar en siguiente ciclo (Estado `partial`).
  - Si falla la API de embeddings > 3 veces → Marcar `rag_status: degraded`, registrar en audit, **NO bloquear** pipeline.
  - Si **NO hay cambios** detectados en Fase 4 → Marcar Fase 14 como `SKIPPED` (duración 0ms).
- **Timing:** Registrar en audit (incluye `embedding_calls_count` y `tokens_used`).

### VALIDACIONES FINALES

**FASE 15 — Documentation Consistency Validation**
- **Objetivo:** Validar coherencia cruzada.
- **Check:** Vistas sin workflow, componentes sin docs, referencias rotas.
- **Timing:** Registrar en audit.

**FASE 16 — Global Integrity Validation**
- **Objetivo:** Validación final de integridad del sistema.
- **Salida:** `docs/architecture/INTEGRITY_REPORT.md`.
- **Acción:** Cierre del ciclo diario.
- **Timing:** Registrar en audit.

---

## 6. FLUJO DIARIO DE EJECUCIÓN (STEP-BY-STEP)

1.  **Lock:** Bloquear `/docs/automation/pipeline_state.yaml` para evitar concurrencia.
2.  **Read:** Leer `currentPhase`, `schedulerMode`, `confidenceThreshold`, `rag_engine`.
3.  **Start Timer:** Registrar `phaseStartTime = now()`.
4.  **Determine:**
    -   Si `currentPhase > 18` → `currentPhase = 1`, `cycle += 1`.
    -   Si `schedulerMode = repair` → Ejecutar solo fases [1, 3, 6, 13, 16] (Skip 14).
    -   Si `schedulerMode = light` → Ejecutar solo fases [4, 6, 15, 16] (Skip 14).
    -   Si `normal` y `currentPhase == 14`:
        -   Verificar `architecture_changes.json` (Fase 4).
        -   Si **NO hay cambios**: Marcar Fase 14 `SKIPPED`, avanzar a 15.
        -   Si **HAY cambios**: Ejecutar script `rag_indexer.py`.
    -   Si `normal` y `currentPhase != 14` → Ejecutar `currentPhase`.
5.  **Execute:**
    -   Validar inputs.
    -   Ejecutar lógica (AST, IA o Script RAG según fase).
    -   Generar artefacto temporal.
    -   Calcular `confidenceScore` y `hashSHA256`.
    -   Generar metadata sidecar.
6.  **Stop Timer:** Registrar `phaseEndTime = now()`, calcular `durationMs`.
7.  **Validate:**
    -   Si `confidenceScore < threshold` (y fase no es 14) → Mover a `quarantine/`, actualizar `review_queue.json`, **NO COMMIT**.
    -   Si `integrityScore` baja > 5 puntos → **ROLLBACK** a versión anterior.
    -   Si todo OK → Mover a `public/`, copiar a `_archive/`, actualizar `_meta/`.
8.  **Update Audit:** Registrar timing en `public/architecture_audit.json`:
    ```json
    {
      "phase": <currentPhase>,
      "phaseName": "<phaseName>",
      "startTime": "<ISO8601>",
      "endTime": "<ISO8601>",
      "durationMs": <integer>,
      "status": "success|failed|quarantined|skipped",
      "artifactsGenerated": [...]
    }
    ```
9.  **Update State:** Incrementar `currentPhase`, actualizar `lastExecution` en `pipeline_state.yaml`.
10. **Unlock:** Liberar lock del estado y emitir log estructurado.
11. **RAG Trigger (Solo Fase 14):**
    -   Invocar `rag_indexer.py` como subprocess.
    -   Capturar `stderr` para detectar fallos de API.
    -   Si `non_blocking: true` y falla → Continuar a Fase 15 con warning.

---

## 7. MODOS DEL SCHEDULER

| Modo | Condición | Fases Activas | Propósito |
| :--- | :--- | :--- | :--- |
| **Normal** | Default | 1 → 18 (Secuencial) | Evolución completa diaria. |
| **Repair** | `integrityScore < 80` | 1, 3, 6, 13, 16 | Reconstruir arquitectura y grafo crítico. (Skip 14) |
| **Light** | Sin cambios Git mayores | 4, 6, 15, 16 | Validación rápida sin regeneración pesada. (Skip 14) |

---

## 8. CHECKLIST DE IMPLEMENTACIÓN TÉCNICA

- [ ] Crear `/docs/automation/pipeline_state.yaml` con el contenido de la Sección 2 (incluye `rag_engine`).
- [ ] Crear directorios: `ai_context/ai_embeddings/`, `ai_context/ai_vector_index/`, `public/_meta/`, `public/_archive/`.
- [ ] Implementar script `canonicalize_sha256.py` para hashing determinista.
- [ ] Implementar script `commit_artifact.py` con lógica de cuarentena y versionado.
- [ ] **CRÍTICO:** Implementar script `rag_indexer.py` (con lógica incremental, batching y manejo de errores).
- [ ] **CRÍTICO:** Implementar lógica de `delta_detection` (comparar hashes actuales vs `previous_hashes.json`).
- [ ] Implementar timing capture en cada fase (start/end/duration).
- [ ] Actualizar `architecture_audit.json` con estructura de performance metrics.
- [ ] Configurar Job Diario (Cron/Cloud Scheduler) para ejecutar el scheduler.
- [ ] Configurar Webhook para notificar `review_queue.json` (Slack/Jira/Email).
- [ ] Definir equipo de revisión humana para artefactos en cuarentena.
- [ ] Ejecutar prueba de Dry-Run para validar rollback y fallo no bloqueante de Fase 14.

---

## 9. RESULTADO ESPERADO

Al implementar este pipeline v8.1, CostPro tendrá:
1.  **Arquitectura Viva:** Documentación técnica 100% sincronizada con el código (AST).
2.  **Documentación Profesional:** Cumplimiento ISO/IEC 26514 y experiencia de usuario Diátaxis.
3.  **IA Confiable y Eficiente:** Contexto RAG **incremental** que evita alucinaciones, saturación de ventana y timeouts.
4.  **Gobernanza:** Control de calidad con scores de confianza, versionado y rollback automático.
5.  **Auto-Evolución:** El sistema recomienda mejoras arquitectónicas y optimiza su propio pipeline.
6.  **Performance Visibility:** Métricas de timing por fase para identificar cuellos de botella.
7.  **Estabilidad Operativa:** La Fase 14 ya no bloquea el pipeline si falla el servicio de embeddings.

---
*Fin del Documento ARCHITECTURE AI PIPELINE v8.1*
