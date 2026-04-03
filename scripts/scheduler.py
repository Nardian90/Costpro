import json
import os
import sys
import fcntl
import yaml
import subprocess
from datetime import datetime, timezone

# Configuración
STATE_PATH = "docs/automation/pipeline_state.yaml"
AUDIT_PATH = "docs/audits/architecture_audit.json"

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
    # Preserve the original structure and keys from the v8.1 spec
    spec_keys = [
        "currentPhase", "lastExecution", "pipelineVersion", "cycle", "schedulerMode",
        "documentationModel", "repairThreshold", "confidenceThreshold", "quarantinePath",
        "artifactStore", "metadataStore", "archiveStore", "reviewQueue",
        "ai_embeddings_path", "ai_vector_index_path", "humanFeedbackStore",
        "rag_engine"
    ]

    clean_state = {}
    for k in spec_keys:
        if k in state:
            clean_state[k] = state[k]

    with open(STATE_PATH, 'w', encoding='utf-8') as f:
        yaml.dump(clean_state, f, default_flow_style=False, allow_unicode=True)

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
    lock_path = STATE_PATH + '.lock'
    if os.path.exists(lock_path):
        os.remove(lock_path)

def update_audit(phase_num, phase_name, start_time, end_time, duration_ms, status, artifacts, cycle):
    audit = {
        "phaseExecutions": [],
        "performanceSummary": {
            "averagePhaseDurationMs": 0,
            "slowestPhase": 0,
            "slowestPhaseDurationMs": 0,
            "fastestPhase": 0,
            "fastestPhaseDurationMs": 0,
            "lastCycleDurationMs": 0,
            "lastUpdated": ""
        },
        "systemHealth": {
            "integrityScore": 0,
            "documentationCoverage": 0,
            "ragIndexStatus": "offline",
            "quarantineCount": 0,
            "rollbackCount": 0
        }
    }

    if os.path.exists(AUDIT_PATH):
        try:
            with open(AUDIT_PATH, 'r', encoding='utf-8') as f:
                content = json.load(f)
                if isinstance(content, dict):
                    # Prioritize keeping existing structure
                    for k in audit:
                        if k in content:
                            audit[k] = content[k]
                    # Also keep other keys like healthMetrics if present
                    for k in content:
                        if k not in audit:
                            audit[k] = content[k]
        except: pass

    execution_record = {
        "phase": phase_num,
        "phaseName": phase_name,
        "startTime": start_time,
        "endTime": end_time,
        "durationMs": duration_ms,
        "status": status,
        "artifactsGenerated": artifacts,
        "cycle": cycle
    }

    audit["phaseExecutions"].append(execution_record)

    # Performance Summary logic
    executions = audit["phaseExecutions"]
    durations = [e["durationMs"] for e in executions if "durationMs" in e]

    if durations:
        slowest_exec = max(executions, key=lambda x: x.get("durationMs", 0))
        fastest_exec = min(executions, key=lambda x: x.get("durationMs", 0))
        current_cycle_durations = [e["durationMs"] for e in executions if e.get("cycle") == cycle]

        audit["performanceSummary"].update({
            "averagePhaseDurationMs": sum(durations) // len(durations),
            "slowestPhase": slowest_exec["phase"],
            "slowestPhaseDurationMs": slowest_exec["durationMs"],
            "fastestPhase": fastest_exec["phase"],
            "fastestPhaseDurationMs": fastest_exec["durationMs"],
            "lastCycleDurationMs": sum(current_cycle_durations),
            "lastUpdated": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
        })

    # Sync systemHealth with healthMetrics if healthMetrics was updated by phase_6
    if "healthMetrics" in audit:
        audit["systemHealth"]["integrityScore"] = audit["healthMetrics"].get("integrityScore", 0)
        audit["systemHealth"]["quarantineCount"] = audit["healthMetrics"].get("quarantineCount", 0)

    with open(AUDIT_PATH, 'w', encoding='utf-8') as f:
        json.dump(audit, f, indent=2, ensure_ascii=False)

def execute_phase(phase_num, phase_def, cycle, dry_run=False):
    print(f"--- Iniciando Fase {phase_num}: {phase_def['name']} ---")
    start_time = datetime.now(timezone.utc).isoformat() + 'Z'
    start_ms = datetime.now(timezone.utc).timestamp() * 1000
    status = "success"

    if not dry_run:
        script_map = {
            1: "scripts/phase_1_discovery.py",
            3: "scripts/phase_3_dependency_graph.py",
            4: "scripts/phase_4_git_intelligence.py",
            2: "scripts/maintenance/domain_classifier.py",
            6: "scripts/phase_6_health.py",
            13: "scripts/generate_knowledge_graph.py",
            14: "scripts/rag_indexer.py",
            8: "scripts/phase_8_view_mapping.py",
            9: "scripts/phase_9_workflow_detection.py",
            5: "scripts/phase_5_metrics.py",
            10: "scripts/phase_10_diataxis.py",
            11: "scripts/phase_11_user_translation.py",
            12: "scripts/phase_12_iso_manual.py"
        }

        # v8.1 Special Handling for Phase 14
        if phase_num == 14:
            changes_path = "public/architecture_changes.json"
            has_changes = True
            if os.path.exists(changes_path):
                try:
                    with open(changes_path, 'r') as f:
                        changes = json.load(f)
                        if changes.get("summary", {}).get("total", 0) == 0:
                            has_changes = False
                except: pass

            if not has_changes:
                print("Modo v8.1: Saltando Fase 14 por falta de cambios.")
                status = "skipped"
                end_time = datetime.now(timezone.utc).isoformat() + 'Z'
                end_ms = datetime.now(timezone.utc).timestamp() * 1000
                duration_ms = int(end_ms - start_ms)
                update_audit(phase_num, phase_def["name"], start_time, end_time, duration_ms, status, phase_def["outputs"], cycle)
                return status

        script = script_map.get(phase_num)
        if script and os.path.exists(script):
            res = subprocess.run(["python3" if script.endswith('.py') else "bun", script], capture_output=True, text=True)
            print(res.stdout)
            if res.stderr: print(res.stderr, file=sys.stderr)

            if "TRIGGER_RE_EXECUTION" in res.stdout:
                status = "re_execute"
            elif "QUARANTINED" in res.stdout:
                status = "quarantined"
            elif "NO_CHANGES" in res.stdout:
                status = "skipped"
            elif "EXIT_STATUS: partial" in res.stdout:
                status = "degraded"
            elif res.returncode != 0:
                # v8.1 Non-blocking Phase 14
                state = load_state()
                rag_conf = state.get("rag_engine", {})
                if phase_num == 14 and rag_conf.get("non_blocking", True):
                    print("Aviso: Fase 14 falló pero es NO bloqueante. Marcando como degraded.")
                    status = "degraded"
                else:
                    status = "failed"
        else:
            print(f"Aviso: Script para Fase {phase_num} no encontrado, usando simulación.")
            for art in phase_def["outputs"]:
                if art.endswith('/') or art.endswith('.md'): continue
                temp_path = f"/tmp/{art}.json"
                if not os.path.exists(temp_path):
                    os.makedirs("/tmp", exist_ok=True)
                    with open(temp_path, 'w') as f: json.dump({"simulated": True, "phase": phase_num}, f)

                res = subprocess.run(["python3", "scripts/commit_artifact.py", art, temp_path, "95.0", str(phase_num)], capture_output=True, text=True)
                print(res.stdout)
                if "QUARANTINED" in res.stdout:
                    status = "quarantined"

    end_time = datetime.now(timezone.utc).isoformat() + 'Z'
    end_ms = datetime.now(timezone.utc).timestamp() * 1000
    duration_ms = int(end_ms - start_ms)
    update_audit(phase_num, phase_def["name"], start_time, end_time, duration_ms, status, phase_def["outputs"], cycle)
    return status

def main():
    dry_run = "--dry-run" in sys.argv
    lock_file = lock_state()
    try:
        state = load_state()

        current_phase = state.get("currentPhase", 1)
        cycle = state.get("cycle", 1)
        mode = state.get("schedulerMode", "normal")

        if current_phase > 18:
            current_phase = 1
            cycle += 1
            state["cycle"] = cycle
            state["currentPhase"] = current_phase

        phase_def = PHASE_DEFINITIONS.get(current_phase)
        if not phase_def:
            print(f"Error: Fase {current_phase} no válida.")
            return

        # Special Mode Handling
        if mode == "repair" and current_phase not in [1, 3, 6, 13, 16]:
            print(f"Modo REPAIR: Saltando Fase {current_phase}")
            state["currentPhase"] = current_phase + 1
            save_state(state)
            return

        if mode == "light" and current_phase not in [4, 6, 15, 16]:
            print(f"Modo LIGHT: Saltando Fase {current_phase}")
            state["currentPhase"] = current_phase + 1
            save_state(state)
            return

        status = execute_phase(current_phase, phase_def, cycle, dry_run=dry_run)

        if not dry_run:
            # Reload state to capture any changes made by the phase script (e.g. repair mode)
            new_state = load_state()
            # Merge some local values that we want to keep
            new_state["currentPhase"] = current_phase
            new_state["cycle"] = cycle

            timestamp = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
            if status == "re_execute":
                print("Major change detected. Resetting to Phase 1.")
                new_state["currentPhase"] = 1
                new_state["lastExecution"] = timestamp
                save_state(new_state)
            elif status in ["success", "quarantined", "committed", "skipped", "degraded"]:
                new_state["currentPhase"] = current_phase + 1
                new_state["lastExecution"] = timestamp
                save_state(new_state)
                print(f"Fase {current_phase} completada con estado: {status}")
            else:
                print(f"Fase {current_phase} falló. No se incrementa currentPhase.")
    except Exception as e:
        print(f"Error: {e}")
        import traceback; traceback.print_exc()
    finally:
        unlock_state(lock_file)

if __name__ == "__main__":
    main()
