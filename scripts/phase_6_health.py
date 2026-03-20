import os
import json
import sys
import datetime
import yaml
from datetime import timezone

# Import commit_artifact
sys.path.append('scripts')
from commit_artifact import commit_artifact

STATE_PATH = "docs/automation/pipeline_state.yaml"
METRICS_PATH = "public/architecture_metrics.json"
ARCH_PATH = "public/system_architecture.json"

def detect_cycles(components):
    comp_map = {c['id']: c for c in components}
    visited = set()
    stack = set()
    cycles = []

    def dfs(node_id, current_path):
        if node_id in stack:
            # Cycle detected
            try:
                idx = current_path.index(node_id)
                cycle = current_path[idx:] + [node_id]
                if cycle not in cycles:
                    cycles.append(cycle)
            except ValueError:
                pass
            return

        if node_id in visited:
            return

        visited.add(node_id)
        stack.add(node_id)
        current_path.append(node_id)

        comp = comp_map.get(node_id)
        if comp:
            for dep in comp.get('dependencies', []):
                dfs(dep, list(current_path))

        stack.remove(node_id)

    for c in components:
        if c['id'] not in visited:
            dfs(c['id'], [])

    return cycles

def calculate_health():
    print("Executing Phase 6: Architecture Health...")

    if not os.path.exists(METRICS_PATH):
        print(f"Error: {METRICS_PATH} not found. Ensure Phase 5 has been executed.")
        sys.exit(1)

    with open(METRICS_PATH, 'r', encoding='utf-8') as f:
        metrics_data = json.load(f)

    if not os.path.exists(ARCH_PATH):
        print(f"Error: {ARCH_PATH} not found. Ensure Phase 1 has been executed.")
        sys.exit(1)

    with open(ARCH_PATH, 'r', encoding='utf-8') as f:
        arch_data = json.load(f)

    components_metrics = metrics_data.get("components", [])
    summary_metrics = metrics_data.get("summary", {})
    full_components = arch_data.get("components", [])

    # 1. Detect Cycles
    cycles = detect_cycles(full_components)

    # 2. Detect Orphans (Fan-in == 0 and Fan-out == 0)
    orphans = []
    for m in components_metrics:
        if m['metrics']['fanIn'] == 0 and m['metrics']['fanOut'] == 0:
            orphans.append(m['id'])

    # 3. Calculate Integrity Score (0-100)
    base_score = 100
    penalty_cycles = len(cycles) * 5
    penalty_orphans = len(orphans) * 0.5

    avg_coupling = summary_metrics.get("averageCoupling", 0)
    penalty_coupling = max(0, (avg_coupling - 10) * 2)

    integrity_score = max(0, base_score - penalty_cycles - penalty_orphans - penalty_coupling)
    integrity_score = round(integrity_score, 2)

    health_report = {
        "timestamp": datetime.datetime.now(timezone.utc).isoformat() + 'Z',
        "integrityScore": integrity_score,
        "metrics": {
            "totalCycles": len(cycles),
            "totalOrphans": len(orphans),
            "averageCoupling": avg_coupling
        },
        "issues": {
            "cycles": cycles[:10], # Limit for visibility
            "orphans": orphans
        },
        "status": "HEALTHY" if integrity_score >= 85 else "DEGRADED" if integrity_score >= 70 else "CRITICAL"
    }

    temp_report = "architecture_health.temp.json"
    with open(temp_report, 'w', encoding='utf-8') as f:
        json.dump(health_report, f, indent=2, ensure_ascii=False)

    commit_artifact("architecture_health", temp_report, 100, 6)

    if os.path.exists(temp_report):
        os.remove(temp_report)

    # Check Repair Threshold
    if os.path.exists(STATE_PATH):
        with open(STATE_PATH, 'r', encoding='utf-8') as f:
            state = yaml.safe_load(f)

        repair_threshold = state.get("repairThreshold", 80)

        if integrity_score < repair_threshold:
            print(f"Integrity Score {integrity_score} below threshold {repair_threshold}. Setting mode to REPAIR.")
            state["schedulerMode"] = "repair"
            with open(STATE_PATH, 'w', encoding='utf-8') as f:
                yaml.dump(state, f, default_flow_style=False, allow_unicode=True)

    print(f"Phase 6 Complete. Integrity Score: {integrity_score}")

if __name__ == "__main__":
    calculate_health()
