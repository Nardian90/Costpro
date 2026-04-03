import os
import json
import sys

# Import commit_artifact
sys.path.append('scripts')
from commit_artifact import commit_artifact

def execute_phase_3():
    print("Executing Phase 3: Dependency Graph Generation...")

    arch_path = "knowledge/architecture/system_architecture.json"
    if not os.path.exists(arch_path):
        print(f"Error: {arch_path} not found. Ensure Phase 1 has been executed.")
        sys.exit(1)

    with open(arch_path, 'r', encoding='utf-8') as f:
        arch_data = json.load(f)

    components = arch_data.get("components", [])

    nodes = []
    links = []

    for comp in components:
        nodes.append({
            "id": comp["id"],
            "label": os.path.basename(comp["filePath"]),
            "type": comp["type"],
            "layer": comp["layer"]
        })

        for dep in comp.get("dependencies", []):
            links.append({
                "source": comp["id"],
                "target": dep
            })

    graph_data = {
        "nodes": nodes,
        "links": links,
        "metadata": {
            "nodeCount": len(nodes),
            "linkCount": len(links),
            "source": arch_path
        }
    }

    temp_graph = "architecture_graph.temp.json"
    with open(temp_graph, 'w', encoding='utf-8') as f:
        json.dump(graph_data, f, indent=2, ensure_ascii=False)

    print(f"Graph generated: {len(nodes)} nodes, {len(links)} links.")
    commit_artifact("architecture_graph", temp_graph, 100, 3)

    if os.path.exists(temp_graph):
        os.remove(temp_graph)

    print("Phase 3 Complete.")

if __name__ == "__main__":
    execute_phase_3()
