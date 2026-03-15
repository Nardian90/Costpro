2 — PIPELINE DE ARQUITECTURA Y DOCUMENTACIÓN

Archivo:

/docs/automation/ARCHITECTURE_MAINTENANCE_PIPELINE.md
PHASE 1 — COMPONENT DISCOVERY

Escanear:

src/components
src/services
src/hooks
src/store
src/views

Actualizar:

system_architecture.json

Registrar:

componentes
servicios
dominios
rutas
PHASE 2 — DOMAIN MAPPING

Agrupar componentes por dominio:

POS
Inventory
Cost Engine
Reports
AI System

Actualizar:

system_architecture.json
PHASE 3 — DEPENDENCY GRAPH

Analizar:

imports
hooks
providers
stores
engines

Actualizar:

architecture_graph.json

Generar:

nodes
edges
PHASE 4 — METRICS COLLECTION

Calcular:

lines_of_code
cyclomatic_complexity
coupling
fan_in
fan_out

Actualizar:

architecture_audit.json
PHASE 5 — ARCHITECTURE HEALTH

Calcular:

health_score
risk_score
maintainability

Actualizar:

architecture_audit.json
PHASE 6 — BUSINESS LOGIC EXTRACTION

Extraer lógica funcional desde:

componentes
acciones
eventos
hooks

Generar:

technical_description
business_logic

Actualizar:

architecture_audit.json
PHASE 7 — USER LANGUAGE TRANSLATION

Traducir lógica técnica a lenguaje de usuario.

Generar:

user_description
tooltip_help
modal_help

Actualizar:

user_knowledge_base.json
PHASE 8 — VIEW FLOW ANALYSIS

Detectar vistas:

src/views
src/pages

Para cada vista generar:

flujo completo
acciones del usuario
componentes involucrados

Actualizar:

master_user_manual.json
PHASE 9 — MANUAL CONSOLIDATION

Construir documento maestro.

El manual debe explicar:

inicio del sistema
navegación
uso de cada módulo
flujo completo de operación

Actualizar:

master_user_manual.json
PHASE 10 — HELP SYSTEM GENERATION

Crear ayudas reutilizables:

tooltips
modales
tips rápidos

Actualizar:

user_knowledge_base.json
PHASE 11 — C4 ARCHITECTURE DOCUMENTATION

Actualizar:

docs/architecture/C4_MODEL.md

Generar:

C1 contexto
C2 contenedores
C3 componentes
C4 código
PHASE 12 — CONSISTENCY VALIDATION

Verificar coherencia entre:

system_architecture.json
architecture_graph.json
architecture_audit.json
user_knowledge_base.json
master_user_manual.json

Registrar inconsistencias en:

docs/architecture/INTEGRITY_REPORT.md
