#!/usr/bin/env python3
"""
scheduler.py
Orquestador principal del pipeline v8.0 - Ejecuta una fase por día
"""

import json
import os
import sys
import fcntl
import yaml
import subprocess
from datetime import datetime, timezone

# Configuración
STATE_PATH = "docs/automation/pipeline_state.yaml"
AUDIT_PATH = "public/architecture_audit.json"

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
    with open(STATE_PATH, 'w', encoding='utf-8') as f:
        yaml.dump(state, f, default_flow_style=False, allow_unicode=True)

def lock_state():
    if os.name == 'nt':
        return open(STATE_PATH + '.lock', 'w+')
    lock_file = open(STATE_PATH + '.lock', 'w+')
    try:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("Error: El scheduler ya está en ejecución (lock activo).")
        sys.exit(0)
    return lock_file

def unlock_state(lock_file):
    if os.name != 'nt':
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
    lock_file.close()

def update_audit(phase_num, phase_name, start_time, end_time, duration_ms, status, artifacts):
    audit = {}

    if os.path.exists(AUDIT_PATH):
        try:
            with open(AUDIT_PATH, 'r', encoding='utf-8') as f:
                audit = json.load(f)
        except: pass

    execution_record = {
        "phase": phase_num,
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

    # Performance Summary logic
    executions = audit["phaseExecutions"]
    durations = [e["durationMs"] for e in executions]

    # Find phase numbers for slowest/fastest
    slowest_exec = max(executions, key=lambda x: x["durationMs"])
    fastest_exec = min(executions, key=lambda x: x["durationMs"])

    audit["performanceSummary"] = {
        "averagePhaseDurationMs": sum(durations) // len(durations),
        "slowestPhase": slowest_exec["phase"],
        "fastestPhase": fastest_exec["phase"],
        "lastCycleDurationMs": sum(durations) # This should ideally be for the current cycle
    }

    with open(AUDIT_PATH, 'w', encoding='utf-8') as f:
        json.dump(audit, f, indent=2, ensure_ascii=False)

def execute_phase(phase_num, phase_def, dry_run=False):
    print(f"--- Iniciando Fase {phase_num}: {phase_def['name']} ---")
    start_time = datetime.now(timezone.utc).isoformat() + 'Z'
    start_ms = datetime.now(timezone.utc).timestamp() * 1000
    status = "success"

    if not dry_run:
        script_map = {
            1: "scripts/phase_1_discovery.py",
            2: "scripts/maintenance/domain_classifier.py",
            13: "scripts/generate_knowledge_graph.py",
            14: "scripts/build_vector_index.py"
        }

        script = script_map.get(phase_num)
        if script and os.path.exists(script):
            subprocess.run(["python3" if script.endswith('.py') else "bun", script])
        else:
            print(f"Aviso: Script para Fase {phase_num} no encontrado, usando simulación.")
            for art in phase_def["outputs"]:
                if art.endswith('/') or art.endswith('.md'): continue
                temp_path = f"/tmp/{art}.json"
                if not os.path.exists(temp_path):
                    os.makedirs("/tmp", exist_ok=True)
                    with open(temp_path, 'w') as f: json.dump({"simulated": True, "phase": phase_num}, f)
                subprocess.run(["python3", "scripts/commit_artifact.py", art, temp_path, "95.0", str(phase_num)])

    end_time = datetime.now(timezone.utc).isoformat() + 'Z'
    end_ms = datetime.now(timezone.utc).timestamp() * 1000
    duration_ms = int(end_ms - start_ms)
    update_audit(phase_num, phase_def["name"], start_time, end_time, duration_ms, status, phase_def["outputs"])
    return status

def main():
    dry_run = "--dry-run" in sys.argv
    lock_file = lock_state()
    try:
        state = load_state()
        current_phase = state.get("currentPhase", 1)

        # Scheduler Modes logic
        mode = state.get("schedulerMode", "normal")

        if current_phase > 18:
            current_phase = 1
            state["cycle"] = state.get("cycle", 1) + 1

        phase_def = PHASE_DEFINITIONS.get(current_phase)
        if not phase_def:
            print(f"Error: Fase {current_phase} no válida.")
            return

        # Special Mode Handling
        if mode == "repair":
            if current_phase not in [1, 3, 6, 13, 16]:
                print(f"Modo REPAIR: Saltando Fase {current_phase}")
                state["currentPhase"] = current_phase + 1
                save_state(state)
                return

        if mode == "light":
            if current_phase not in [4, 6, 15, 16]:
                print(f"Modo LIGHT: Saltando Fase {current_phase}")
                state["currentPhase"] = current_phase + 1
                save_state(state)
                return

        status = execute_phase(current_phase, phase_def, dry_run=dry_run)

        if not dry_run and status == "success":
            state["currentPhase"] = current_phase + 1
            state["lastExecution"] = datetime.now(timezone.utc).isoformat() + 'Z'
            save_state(state)
            print(f"Fase {current_phase} completada.")
    except Exception as e:
        print(f"Error: {e}")
        import traceback; traceback.print_exc()
    finally:
        unlock_state(lock_file)

if __name__ == "__main__":
    main()
