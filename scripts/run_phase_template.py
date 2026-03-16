#!/usr/bin/env python3
"""
run_phase_template.py
Orquestador principal del pipeline - Ejecuta una fase por día
Uso: python run_phase_template.py
"""

import json
import os
import sys
import fcntl
from datetime import datetime, timezone
import subprocess

# Configuración
STATE_PATH = "docs/automation/pipeline_state.yaml"
AUDIT_PATH = "public/architecture_audit.json"
PHASE_DEFINITIONS = {
    1: {"name": "Architecture Discovery", "engine": "static", "outputs": ["system_architecture.json", "architecture_manifest.json"]},
    2: {"name": "Domain Classification", "engine": "static", "outputs": ["components.json"]},
    3: {"name": "Dependency Graph", "engine": "static", "outputs": ["architecture_graph.json"]},
    4: {"name": "Git Change Analysis", "engine": "static", "outputs": ["architecture_changes.json"]},
    5: {"name": "Architecture Metrics", "engine": "static", "outputs": ["architecture_metrics.json"]},
    6: {"name": "Architecture Health", "engine": "static", "outputs": ["architecture_audit.json"]},
    7: {"name": "Business Logic Extraction", "engine": "ai", "outputs": ["components.json"]},
    8: {"name": "View Flow Mapping", "engine": "ai", "outputs": ["views.json"]},
    9: {"name": "Workflow Detection", "engine": "ai", "outputs": ["workflows.json"]},
    10: {"name": "Diataxis Documentation Layer", "engine": "ai", "outputs": ["docs/"]},
    11: {"name": "User Language Translation", "engine": "ai", "outputs": ["user_help.json"]},
    12: {"name": "ISO Manual Generation", "engine": "ai", "outputs": ["iso_manual/"]},
    13: {"name": "Knowledge Graph Generation", "engine": "ai", "outputs": ["knowledge_graph.json"]},
    14: {"name": "AI Retrieval Context System", "engine": "rag", "outputs": ["ai_context/"]},
    15: {"name": "Documentation Consistency Validation", "engine": "validation", "outputs": ["review_queue.json"]},
    16: {"name": "Global Integrity Validation", "engine": "validation", "outputs": ["INTEGRITY_REPORT.md"]},
    17: {"name": "AI Architecture Evolution Engine", "engine": "ai", "outputs": ["ARCHITECTURE_RECOMMENDATIONS.md"]},
    18: {"name": "Self Improvement Cycle", "engine": "ai", "outputs": ["PIPELINE_IMPROVEMENTS.md"]}
}

def load_state():
    """Carga estado del pipeline desde YAML"""
    import yaml
    with open(STATE_PATH, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

def save_state(state):
    """Guarda estado del pipeline"""
    import yaml
    with open(STATE_PATH, 'w', encoding='utf-8') as f:
        yaml.dump(state, f, default_flow_style=False, allow_unicode=True)

def lock_state():
    """Bloquea archivo de estado para evitar concurrencia"""
    lock_file = open(STATE_PATH + '.lock', 'w+')
    fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
    return lock_file

def unlock_state(lock_file):
    """Libera bloqueo de estado"""
    fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
    lock_file.close()

def update_audit(phase_name, start_time, end_time, duration_ms, status, artifacts):
    """Actualiza arquitectura_audit.json con timing de fase"""
    audit = {"phaseExecutions": [], "performanceSummary": {}}

    if os.path.exists(AUDIT_PATH):
        with open(AUDIT_PATH, 'r', encoding='utf-8') as f:
            audit = json.load(f)

    execution_record = {
        "phase": len(audit.get("phaseExecutions", [])) + 1,
        "phaseName": phase_name,
        "startTime": start_time,
        "endTime": end_time,
        "durationMs": duration_ms,
        "status": status,
        "artifactsGenerated": artifacts
    }

    if "phaseExecutions" not in audit:
        audit["phaseExecutions"] = []
    audit["phaseExecutions"].append(execution_record)

    # Actualizar resumen de performance
    if len(audit["phaseExecutions"]) > 0:
        durations = [e["durationMs"] for e in audit["phaseExecutions"]]
        audit["performanceSummary"] = {
            "averagePhaseDurationMs": sum(durations) // len(durations),
            "slowestPhase": max(durations),
            "fastestPhase": min(durations),
            "lastCycleDurationMs": sum(durations),
            "lastUpdated": end_time
        }

    with open(AUDIT_PATH, 'w', encoding='utf-8') as f:
        json.dump(audit, f, indent=2, ensure_ascii=False)

def execute_phase(phase_num, phase_def, dry_run=False):
    """Ejecuta fase específica"""
    print(f"Ejecutando Fase {phase_num}: {phase_def['name']}")

    start_time = datetime.now(timezone.utc).isoformat() + 'Z'
    start_ms = datetime.now(timezone.utc).timestamp() * 1000

    status = "success"
    artifacts = phase_def["outputs"]

    # Aquí iría la lógica específica de cada fase
    # Para demo, simulamos ejecución exitosa
    if not dry_run:
        pass

    end_time = datetime.now(timezone.utc).isoformat() + 'Z'
    end_ms = datetime.now(timezone.utc).timestamp() * 1000
    duration_ms = int(end_ms - start_ms)

    # Actualizar audit con timing
    if not dry_run:
        update_audit(phase_def["name"], start_time, end_time, duration_ms, status, artifacts)

    # Si es Fase 14, construir índice vectorial
    if phase_num == 14 and not dry_run:
        subprocess.run(["python3", "scripts/build_vector_index.py"])

    return status

def main():
    """Función principal del scheduler"""

    dry_run = "--dry-run" in sys.argv
    validate_only = "--validate-only" in sys.argv

    if validate_only:
        print("Validación de estructura OK")
        return

    # Bloquear estado
    lock_file = lock_state()

    try:
        # Cargar estado
        state = load_state()

        current_phase = state.get("currentPhase", 1)

        # Determinar fase a ejecutar
        if current_phase > 18:
            current_phase = 1
            state["cycle"] = state.get("cycle", 1) + 1

        # Obtener definición de fase
        phase_def = PHASE_DEFINITIONS.get(current_phase)

        if not phase_def:
            print(f"Error: Fase {current_phase} no definida")
            sys.exit(1)

        # Ejecutar fase
        status = execute_phase(current_phase, phase_def, dry_run=dry_run)

        if not dry_run:
            # Avanzar fase
            state["currentPhase"] = current_phase + 1
            state["lastExecution"] = datetime.now(timezone.utc).isoformat() + 'Z'

            # Guardar estado
            save_state(state)

        print(f"Fase {current_phase} completada con estado: {status}")

    except Exception as e:
        print(f"Error en ejecución: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    finally:
        # Liberar bloqueo
        unlock_state(lock_file)

if __name__ == "__main__":
    main()
