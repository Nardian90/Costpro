# ✅ Aclaración recibida: Prompt ≠ Pipeline, pero son el mismo proceso

Tienes toda la razón. Para eliminar redundancia y mantener claridad:

| Documento | Propósito | Contenido Clave | Para quién |
| :--- | :--- | :--- | :--- |
| **📄 Pipeline v9.0** | **Referencia técnica** del proceso | Estructura de archivos, esquema de fases, governance, rutas | Humanos + IA (consulta) |
| **🤖 Prompt Scheduler v9.0** | **Motor de ejecución** que dispara la IA | Instrucciones paso a paso, lógica de decisión, manejo de errores | IA (ejecución) |

**Regla de oro:** El Prompt **referencia** al Pipeline, no lo duplica. El Pipeline **describe** qué existe; el Prompt **dice cómo usarlo**.

---

# 📄 ARCHITECTURE AI PIPELINE v9.0 — CostPro (Enterprise Clean)
## Technical Reference Specification

**Versión:** 9.0.0 (Clean Architecture Standard)
**Estado:** Stable · Single Source of Truth
**Última actualización:** 2026-04-01

---

## 1. ESTRUCTURA DEL REPOSITORIO (Rutas Oficiales)

```
/
├── docs/
│   ├── automation/
│   │   ├── pipeline_state.yaml          # Estado del scheduler
│   │   ├── ARCHITECTURE_AI_PIPELINE_v9.md  # Este documento
│   │   ├── phases/                      # Specs modulares por fase
│   │   └── governance/                  # Políticas de gobernanza
│   └── audits/                          # [SALIDA] Reportes de auditoría
│       ├── architecture_audit.json
│       ├── system_health.json
│       ├── integrity_report.md
│       ├── review_queue.json
│       └── quarantine/
├── knowledge/
│   ├── architecture/                    # [SALIDA] Capa AST determinista
│   │   ├── system_architecture.json
│   │   ├── architecture_manifest.json
│   │   ├── architecture_graph.json
│   │   ├── _meta/                       # Sidecars de versionado
│   │   └── _archive/                    # Histórico para rollback
│   ├── components.json                  # [SALIDA] Lógica de negocio
│   ├── views.json                       # [SALIDA] Flujos de interfaz
│   ├── workflows.json                   # [SALIDA] Procesos end-to-end
│   ├── knowledge_graph.json             # [SALIDA] Grafo semántico
│   └── docs/                            # [SALIDA] Documentación Diátaxis
│       ├── tutorials/
│       ├── how-to/
│       ├── reference/
│       └── explanation/
└── ai_context/                          # [SALIDA] Capa RAG
    ├── ai_vector_index/
    ├── previous_hashes.json
    └── vector_index_stats.json
```

**Regla de limpieza:** Prohibido generar archivos en raíz `/`. Todo output va a las carpetas anteriores.

---

## 2. ESQUEMA DE FASES (18 Fases)

| Fase | Engine | Input Principal | Output Principal | Validación Clave |
| :--- | :--- | :--- | :--- | :--- |
| 1 | AST | Código fuente (`src/`) | `knowledge/architecture/system_architecture.json` | IDs únicos, filePaths válidos |
| 2 | AST | system_architecture.json | `knowledge/components.json` (domain) | Todo componente tiene dominio |
| 3 | AST | imports + references | `knowledge/architecture/architecture_graph.json` | Sin ciclos, referencias resolubles |
| 4 | AST | Git history | `knowledge/architecture/architecture_changes.json` | Hash por archivo para delta |
| 5 | AST | architecture_graph.json | `knowledge/architecture/architecture_metrics.json` | Métricas calculables |
| 6 | AST | metrics + graph + components | `docs/audits/architecture_audit.json` | integrityScore calculado |
| 7 | IA | components + código | `knowledge/components.json` (businessRules) | confidenceScore ≥ 90 |
| 8 | IA | UI components + eventos | `knowledge/views.json` | actions/inputs/outputs definidos |
| 9 | IA | services + views + rules | `knowledge/workflows.json` | steps[] secuencial y válido |
| 10 | IA | código + comentarios | `knowledge/docs/{tutorials,how-to,reference,explanation}/` | Clasificación Diátaxis válida |
| 11 | IA | technical docs + businessRules | `knowledge/user_help.json` | Lenguaje no-técnico validado |
| 12 | IA | toda documentación estructurada | `knowledge/docs/iso_manual/*.md` | Conformidad ISO/IEC 26514 |
| 13 | IA | components+views+workflows+docs | `knowledge/knowledge_graph.json` | Grafo conectado, sin nodos huérfanos |
| 14 | RAG | knowledge/ + previous_hashes.json | `ai_context/ai_vector_index/` | Delta detection, incremental |
| 15 | VAL | todos los artefactos | `docs/audits/review_queue.json` | Coherencia cruzada validada |
| 16 | VAL | sistema completo | `docs/audits/INTEGRITY_REPORT.md` | integrityScore final ≥ 85 |
| 17 | EVOL | metrics + knowledge_graph | `docs/audits/ARCHITECTURE_RECOMMENDATIONS.md` | Recomendaciones accionables |
| 18 | EVOL | audit logs + execution stats | `docs/automation/PIPELINE_IMPROVEMENTS.md` | Mejoras específicas del pipeline |

---

## 3. GOBERNANZA (Políticas Obligatorias)

### 3.1 Metadata Sidecar Schema
Cada `archivo.json` requiere `_meta/archivo.meta.json`:
```json
{
  "artifactName": "string",
  "version": "semver",
  "hash": "sha256:...",
  "confidenceScore": 0-100,
  "reviewRequired": boolean,
  "createdAt": "ISO8601",
  "sourcePhase": 1-18
}
```

### 3.2 Reglas de Decisión
| Condición | Acción | Destino |
| :--- | :--- | :--- |
| `confidenceScore ≥ 90` | Commit automático | Ruta oficial (`knowledge/` o `docs/audits/`) |
| `confidenceScore < 90` | Requiere revisión | `docs/audits/quarantine/` + `review_queue.json` |
| `integrityScore cae > 5 pts` | Rollback inmediato | Restaurar desde `_archive/` |
| Fase 14 falla + `non_blocking: true` | Continuar pipeline | Marcar `rag_status: degraded` en audit |

### 3.3 Versionado Semántico
- **MAJOR**: Cambios estructurales en arquitectura → 8.x → 9.0.0
- **MINOR**: Nueva información o nodos → 9.0.0 → 9.1.0
- **PATCH**: Correcciones menores → 9.0.0 → 9.0.1

---

## 4. CONFIGURACIÓN DEL ESTADO (`pipeline_state.yaml`)

```yaml
pipelineVersion: "9.0.0"
currentPhase: 1
lastExecution: "2026-04-01T10:00:00Z"
cycle: 42
schedulerMode: normal  # normal | repair | light
confidenceThreshold: 90
repairThreshold: 80
rag_engine:
  mode: incremental
  batch_size: 50
  non_blocking: true
  max_tokens: 8192
```

---

## 5. MODOS DE EJECUCIÓN

| Modo | Fases Activas | Skip RAG | Propósito |
| :--- | :--- | :--- | :--- |
| `normal` | 1 → 18 secuencial | No | Evolución completa diaria |
| `repair` | 1, 3, 6, 13, 16 | Sí | Reconstruir arquitectura crítica |
| `light` | 4, 6, 15, 16 | Sí | Validación rápida sin cambios mayores |

---

## 6. ESQUEMA DE AUDITORÍA (`architecture_audit.json`)

```json
{
  "phaseExecutions": [{
    "phase": 14,
    "phaseName": "AI Retrieval Context System",
    "startTime": "ISO8601",
    "endTime": "ISO8601",
    "durationMs": 330000,
    "status": "success|skipped|degraded|failed",
    "artifactsGenerated": ["vector_index_stats.json"],
    "ragMetrics": {
      "embedding_calls_count": 50,
      "tokens_used": 12000,
      "files_indexed": 10,
      "cache_hits": 45,
      "api_errors": 0
    }
  }],
  "performanceSummary": {
    "averagePhaseDurationMs": 250000,
    "slowestPhase": 7,
    "lastCycleDurationMs": 4500000,
    "lastUpdated": "ISO8601"
  },
  "systemHealth": {
    "integrityScore": 94.5,
    "documentationCoverage": 87.2,
    "ragIndexStatus": "healthy|degraded|offline",
    "quarantineCount": 2,
    "rollbackCount": 0
  }
}
```

---

## 7. REFERENCIAS MODULARES (Para detalle operativo)

| Área | Archivo | Propósito |
| :--- | :--- | :--- |
| Especificación de fases | `./phases/` | Detalle técnico de cada fase (input/output/validación) |
| Gobernanza | `./governance/policies.md` | Políticas de confidence, versionado, rollback |
| Operaciones | `./ops/` | Checklists, error handling, métricas |
| Esquemas JSON | `./schemas/` | JSON Schema para validación automática |

---

*Fin del Documento de Referencia — ARCHITECTURE AI PIPELINE v9.0*
*Este documento describe QUÉ existe y CÓMO está estructurado. Para instrucciones de ejecución, consultar el Prompt del Scheduler.*
