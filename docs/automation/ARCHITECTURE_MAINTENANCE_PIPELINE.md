PHASE 1 — COMPONENT DISCOVERY

Escanear:

src/components
src/services
src/hooks
src/views

Actualizar:

system_architecture.json
PHASE 2 — DEPENDENCY MAPPING

Analizar:

imports
hooks
stores
providers

Generar:

architecture_graph.json
PHASE 3 — METRICS COLLECTION

Calcular:

lines_of_code
cyclomatic_complexity
coupling_score

Actualizar:

architecture_audit.json
PHASE 4 — DOCUMENTATION QUALITY

Evaluar:

descriptions
business_logic
documentation_quality

Actualizar:

architecture_audit.json
PHASE 5 — ARCHITECTURE HEALTH

Calcular:

health_score
risk_score
complexity_index

Actualizar:

architecture_audit.json
PHASE 6 — OPEN QUESTIONS GENERATION

Detectar áreas ambiguas del sistema.

Actualizar:

architecture_audit.json
PHASE 7 — C4 MODEL GENERATION

Actualizar:

docs/architecture/C4_MODEL.md
PHASE 8 — ADR UPDATE

Actualizar:

docs/architecture/ADR/
PHASE 9 — SYSTEM HEALTH REPORT

Generar:

docs/architecture/SYSTEM_HEALTH_REPORT.md
PHASE 10 — CONSISTENCY VALIDATION

Verificar coherencia entre:

system_architecture.json
architecture_graph.json
architecture_audit.json

Si existen inconsistencias:

registrar en:

docs/architecture/INTEGRITY_REPORT.md
