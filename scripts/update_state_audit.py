import json
import yaml
import os
from datetime import datetime, timezone

STATE_PATH = "docs/automation/pipeline_state.yaml"
AUDIT_PATH = "public/architecture_audit.json"

def update_system_dynamic(phase_num, phase_name, artifacts, status="success", start_time=None):
    now = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    if not start_time:
        start_time = now

    # 1. Update pipeline_state.yaml
    with open(STATE_PATH, 'r', encoding='utf-8') as f:
        state = yaml.safe_load(f)

    next_phase = phase_num + 1
    if next_phase > 18:
        next_phase = 1
        state['cycle'] = state.get('cycle', 1) + 1

    state['currentPhase'] = next_phase
    state['lastExecution'] = now

    with open(STATE_PATH, 'w', encoding='utf-8') as f:
        yaml.dump(state, f, default_flow_style=False, allow_unicode=True)

    # 2. Update architecture_audit.json
    if os.path.exists(AUDIT_PATH):
        try:
            with open(AUDIT_PATH, 'r', encoding='utf-8') as f:
                audit_data = json.load(f)
        except:
            audit_data = {}
    else:
        audit_data = {}

    if "phaseExecutions" not in audit_data:
        audit_data["phaseExecutions"] = []

    # Calculate duration
    try:
        st = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        et = datetime.fromisoformat(now.replace('Z', '+00:00'))
        duration_ms = int((et - st).total_seconds() * 1000)
    except Exception as e:
        print(f"Error calculating duration: {e}")
        duration_ms = 0

    execution_record = {
        "phase": phase_num,
        "phaseName": phase_name,
        "startTime": start_time,
        "endTime": now,
        "durationMs": duration_ms,
        "status": status,
        "artifactsGenerated": artifacts
    }

    audit_data["phaseExecutions"].append(execution_record)

    durations = [e.get("durationMs", 0) for e in audit_data["phaseExecutions"]]
    if durations:
        slowest_idx = max(range(len(audit_data["phaseExecutions"])), key=lambda i: audit_data["phaseExecutions"][i].get("durationMs", 0))
        fastest_idx = min(range(len(audit_data["phaseExecutions"])), key=lambda i: audit_data["phaseExecutions"][i].get("durationMs", 0))

        audit_data["performanceSummary"] = {
            "averagePhaseDurationMs": sum(durations) // len(durations),
            "slowestPhase": audit_data["phaseExecutions"][slowest_idx]["phase"],
            "slowestPhaseDurationMs": audit_data["phaseExecutions"][slowest_idx]["durationMs"],
            "fastestPhase": audit_data["phaseExecutions"][fastest_idx]["phase"],
            "fastestPhaseDurationMs": audit_data["phaseExecutions"][fastest_idx]["durationMs"],
            "lastCycleDurationMs": sum(durations),
            "lastUpdated": now
        }

    with open(AUDIT_PATH, 'w', encoding='utf-8') as f:
        json.dump(audit_data, f, indent=2, ensure_ascii=False)

if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 4:
        update_system_dynamic(int(sys.argv[1]), sys.argv[2], json.loads(sys.argv[3]))
