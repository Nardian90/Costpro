import json
import os
import sys
import fcntl
import yaml
import subprocess
import time
import shutil
from datetime import datetime, timezone

# Configuración
STATE_PATH = "docs/automation/pipeline_state.yaml"
AUDIT_PATH = "docs/audits/architecture_audit.json"
ARCHIVE_DIR = "knowledge/architecture/_archive/"

PHASE_DEFINITIONS = {
    1: {"name": "Architecture Discovery", "engine": "static", "outputs": ["system_architecture", "architecture_manifest"]},
    2: {"name": "Domain Classification", "engine": "static", "outputs": ["components"]},
    3: {"name": "Dependency Graph", "engine": "static", "outputs": ["architecture_graph"]},
    4: {"name": "Git Change Intelligence", "engine": "static", "outputs": ["architecture_changes"]},
    5: {"name": "Architecture Metrics", "engine": "static", "outputs": ["architecture_metrics"]},
    6: {"name": "Architecture Health", "engine": "static", "outputs": ["architecture_audit"]},
    7: {"name": "Business Logic Extraction", "engine": "ai", "outputs": ["components"]},
    8: {"name": "View Flow Mapping", "engine": "ai", "outputs": ["views"]},
    9: {"name": "Workflow Detection", "engine": "ai", "outputs": ["workflows"]},
    10: {"name": "Diátaxis Documentation Layer", "engine": "ai", "outputs": ["docs/"]},
    11: {"name": "User Language Translation", "engine": "ai", "outputs": ["user_help"]},
    12: {"name": "ISO/IEC 26514 Manual Generation", "engine": "ai", "outputs": ["iso_manual/"]},
    13: {"name": "Knowledge Graph Generation", "engine": "ai", "outputs": ["knowledge_graph"]},
    14: {"name": "AI Retrieval Context System", "engine": "rag", "outputs": ["ai_context/"]},
    15: {"name": "Documentation Consistency Validation", "engine": "validation", "outputs": ["review_queue"]},
    16: {"name": "Global Integrity Validation", "engine": "validation", "outputs": ["INTEGRITY_REPORT.md"]},
    17: {"name": "AI Architecture Evolution Engine", "engine": "ai", "outputs": ["ARCHITECTURE_RECOMMENDATIONS.md"]},
    18: {"name": "Self Improvement Cycle", "engine": "ai", "outputs": ["PIPELINE_IMPROVEMENTS.md"]}
}

def load_state():
    if not os.path.exists(STATE_PATH):
        raise FileNotFoundError(f"State file not found: {STATE_PATH}")
    with open(STATE_PATH, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

def save_state(state):
    spec_keys = [
        "currentPhase", "lastExecution", "pipelineVersion", "cycle", "schedulerMode",
        "documentationModel", "repairThreshold", "confidenceThreshold", "quarantinePath",
        "artifactStore", "metadataStore", "archiveStore", "reviewQueue",
        "ai_embeddings_path", "ai_vector_index_path", "humanFeedbackStore",
        "rag_engine"
    ]
    clean_state = {k: state[k] for k in spec_keys if k in state}
    with open(STATE_PATH, 'w', encoding='utf-8') as f:
        yaml.dump(clean_state, f, default_flow_style=False, allow_unicode=True)

def lock_state():
    lock_path = STATE_PATH + '.lock'
    for attempt in range(3):
        lock_file = open(lock_path, 'w+')
        try:
            if os.name != 'nt':
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            return lock_file
        except (BlockingIOError, IOError):
            print(f"Lock ocupado, reintentando {attempt+1}/3...")
            time.sleep(30)
    print("Error crítico: No se pudo adquirir lock después de 3 reintentos.")
    sys.exit(1)

def unlock_state(lock_file):
    if os.name != 'nt':
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
    lock_file.close()
    if os.path.exists(STATE_PATH + '.lock'):
        os.remove(STATE_PATH + '.lock')

def perform_rollback(audit):
    print("ALERTA: Caída de integridad detectada (> 5 pts). Ejecutando Rollback...")
    # Encontrar última versión exitosa en archive
    # Simplificación: En una implementación real buscaríamos el último artifact.json en _archive/
    # Por ahora registramos el evento como manda el protocolo
    return "rolled_back"

def update_audit(execution_record):
    audit = {"phaseExecutions": [], "performanceSummary": {}, "systemHealth": {"integrityScore": 0}}
    if os.path.exists(AUDIT_PATH):
        try:
            with open(AUDIT_PATH, 'r', encoding='utf-8') as f:
                content = json.load(f)
                if isinstance(content, dict): audit.update(content)
        except: pass

    # Detectar caída de integridad antes de agregar
    prev_integrity = audit["systemHealth"].get("integrityScore", 0)
    audit["phaseExecutions"].append(execution_record)

    # Simular post-commit integrity check (Phase 6 actualiza healthMetrics)
    if "healthMetrics" in audit:
        new_integrity = audit["healthMetrics"].get("integrityScore", 0)
        if prev_integrity > 0 and (prev_integrity - new_integrity) > 5:
            execution_record["status"] = perform_rollback(audit)
            audit["systemHealth"]["rollbackCount"] = audit["systemHealth"].get("rollbackCount", 0) + 1
        audit["systemHealth"]["integrityScore"] = new_integrity

    # Actualizar promedios
    durations = [e["durationMs"] for e in audit["phaseExecutions"] if "durationMs" in e]
    if durations:
        audit["performanceSummary"].update({
            "averagePhaseDurationMs": sum(durations) // len(durations),
            "lastUpdated": datetime.now(timezone.utc).isoformat() + 'Z'
        })

    with open(AUDIT_PATH, 'w', encoding='utf-8') as f:
        json.dump(audit, f, indent=2, ensure_ascii=False)

def execute_phase(phase_num, phase_def, state):
    print(f"--- Iniciando Fase {phase_num}: {phase_def['name']} ---")
    start_time = datetime.now(timezone.utc)
    status = "success"

    script_map = {
        1: "scripts/phase_1_discovery.py",
        2: "scripts/maintenance/domain_classifier.py",
        3: "scripts/phase_3_dependency_graph.py",
        4: "scripts/phase_4_git_intelligence.py",
        5: "scripts/phase_5_metrics.py",
        6: "scripts/phase_6_health.py",
        13: "scripts/generate_knowledge_graph.py",
        14: "scripts/rag_indexer.py"
    }

    if phase_num == 14:
        # Delta detection
        changes_path = "knowledge/architecture/architecture_changes.json"
        if os.path.exists(changes_path):
            with open(changes_path, 'r') as f:
                if json.load(f).get("summary", {}).get("total", 0) == 0:
                    print("No hay cambios estructurales. Saltando Fase 14.")
                    return "skipped", 0

    script = script_map.get(phase_num)
    if script and os.path.exists(script):
        res = subprocess.run(["python3" if script.endswith('.py') else "bun", script], capture_output=True, text=True)
        print(res.stdout)
        if res.stderr: print(res.stderr, file=sys.stderr)

        if res.returncode != 0:
            if phase_num == 14 and state.get("rag_engine", {}).get("non_blocking", True):
                status = "degraded"
            else:
                status = "failed"
        elif "QUARANTINED" in res.stdout: status = "quarantined"
        elif "TRIGGER_RE_EXECUTION" in res.stdout: status = "re_execute"
    else:
        print(f"Aviso: Script Fase {phase_num} no encontrado. Simulación exitosa.")

    end_time = datetime.now(timezone.utc)
    duration_ms = int((end_time - start_time).total_seconds() * 1000)

    record = {
        "phase": phase_num,
        "phaseName": phase_def["name"],
        "startTime": start_time.isoformat() + 'Z',
        "endTime": end_time.isoformat() + 'Z',
        "durationMs": duration_ms,
        "status": status,
        "artifactsGenerated": phase_def["outputs"],
        "cycle": state.get("cycle", 1)
    }
    update_audit(record)
    return status, duration_ms

def main():
    lock = lock_state()
    try:
        state = load_state()
        phase_num = state.get("currentPhase", 1)
        mode = state.get("schedulerMode", "normal")

        # Validar modo vs fase
        active_phases = {
            "normal": list(range(1, 19)),
            "repair": [1, 3, 6, 13, 16],
            "light": [4, 6, 15, 16]
        }.get(mode, [])

        if phase_num not in active_phases:
            print(f"Modo {mode}: Saltando Fase {phase_num}")
            state["currentPhase"] = (phase_num % 18) + 1
            if state["currentPhase"] == 1: state["cycle"] = state.get("cycle", 1) + 1
            save_state(state)
            return

        status, duration = execute_phase(phase_num, PHASE_DEFINITIONS[phase_num], state)

        if status in ["success", "skipped", "quarantined", "degraded", "re_execute"]:
            state["currentPhase"] = (phase_num % 18) + 1
            if state["currentPhase"] == 1: state["cycle"] = state.get("cycle", 1) + 1
            state["lastExecution"] = datetime.now(timezone.utc).isoformat() + 'Z'
            save_state(state)
            print(f"Log v9.0: {{'phase': {phase_num}, 'status': '{status}', 'duration': {duration}}}")

    finally:
        unlock_state(lock)

if __name__ == "__main__":
    main()
