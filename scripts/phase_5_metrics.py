import os
import json
import sys
import datetime
from datetime import timezone

# Import commit_artifact
sys.path.append('scripts')
from commit_artifact import commit_artifact

def calculate_metrics():
    print("Executing Phase 5: Architecture Metrics...")

    arch_path = "public/system_architecture.json"
    if not os.path.exists(arch_path):
        print(f"Error: {arch_path} not found. Ensure Phase 1 has been executed.")
        sys.exit(1)

    with open(arch_path, 'r', encoding='utf-8') as f:
        arch_data = json.load(f)

    components = arch_data.get("components", [])
    if not components:
        print("No components found in architecture.")
        return

    # Maps
    comp_map = {c['id']: c for c in components}
    fan_in = {c['id']: 0 for c in components}
    fan_out = {c['id']: len(c.get('dependencies', [])) for c in components}

    for c in components:
        for dep in c.get('dependencies', []):
            if dep in fan_in:
                fan_in[dep] += 1

    # Max Depth calculation with memoization
    memo_depth = {}

    def get_depth(node_id, path=None):
        if node_id in memo_depth:
            return memo_depth[node_id]

        if path is None:
            path = set()

        if node_id in path:
            return 0 # Cycle detected

        path.add(node_id)

        comp = comp_map.get(node_id)
        if not comp:
            return 0

        deps = comp.get('dependencies', [])
        if not deps:
            memo_depth[node_id] = 0
            return 0

        max_d = 0
        for d in deps:
            max_d = max(max_d, get_depth(d, path.copy()))

        res = 1 + max_d
        memo_depth[node_id] = res
        return res

    component_metrics = []
    for c in components:
        cid = c['id']
        fi = fan_in[cid]
        fo = fan_out[cid]
        coupling = fi + fo
        instability = fo / coupling if coupling > 0 else 0

        component_metrics.append({
            "id": cid,
            "filePath": c['filePath'],
            "metrics": {
                "fanIn": fi,
                "fanOut": fo,
                "coupling": coupling,
                "instability": round(instability, 3),
                "dependencyDepth": get_depth(cid)
            }
        })

    # Global summary
    total_components = len(components)
    avg_coupling = sum(m['metrics']['coupling'] for m in component_metrics) / total_components if total_components > 0 else 0

    report = {
        "timestamp": datetime.datetime.now(timezone.utc).isoformat() + 'Z',
        "summary": {
            "totalComponents": total_components,
            "averageCoupling": round(avg_coupling, 2),
            "maxFanIn": max(fan_in.values()) if fan_in else 0,
            "maxFanOut": max(fan_out.values()) if fan_out else 0,
            "maxDepth": max(memo_depth.values()) if memo_depth else 0
        },
        "components": component_metrics
    }

    temp_report = "architecture_metrics.temp.json"
    with open(temp_report, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    commit_artifact("architecture_metrics", temp_report, 100, 5)

    if os.path.exists(temp_report):
        os.remove(temp_report)

    print(f"Phase 5 Complete. Metrics calculated for {total_components} components.")

if __name__ == "__main__":
    calculate_metrics()
