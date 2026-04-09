#!/usr/bin/env python3
"""
phase_5_metrics.py
Calcula métricas de arquitectura para el pipeline v8.0
Salida: public/architecture_metrics.json
"""

import json
import os
import sys

# Add scripts to path for commit_artifact
sys.path.append('scripts')
from commit_artifact import commit_artifact

ARCHITECTURE_PATH = 'knowledge/architecture/system_architecture.json'
GRAPH_PATH = 'knowledge/architecture/architecture_graph.json'
OUTPUT_PATH = 'knowledge/architecture/architecture_metrics.json'

def calculate_metrics():
    if not os.path.exists(ARCHITECTURE_PATH) or not os.path.exists(GRAPH_PATH):
        print(f"Error: {ARCHITECTURE_PATH} or {GRAPH_PATH} not found.")
        return None

    with open(ARCHITECTURE_PATH, 'r', encoding='utf-8') as f:
        arch = json.load(f)

    with open(GRAPH_PATH, 'r', encoding='utf-8') as f:
        graph = json.load(f)

    nodes = graph.get('nodes', [])
    links = graph.get('links', [])

    # Initialize metrics
    metrics = {}
    for node in nodes:
        node_id = node['id']
        metrics[node_id] = {
            "id": node_id,
            "label": node.get('label', ''),
            "type": node.get('type', 'unknown'),
            "layer": node.get('layer', 'unknown'),
            "fan_in": 0,
            "fan_out": 0,
            "coupling": 0.0,
            "instability": 0.0,
            "dependency_depth": 0
        }

    # Calculate Fan-in and Fan-out
    for link in links:
        source = link.get('source')
        target = link.get('target')

        if source in metrics:
            metrics[source]["fan_out"] += 1
        if target in metrics:
            metrics[target]["fan_in"] += 1

    # Calculate Instability (I = Ce / (Ca + Ce))
    # where Ce = Fan-out (efferent), Ca = Fan-in (afferent)
    for node_id, m in metrics.items():
        ca = m["fan_in"]
        ce = m["fan_out"]
        if (ca + ce) > 0:
            m["instability"] = round(ce / (ca + ce), 3)
            m["coupling"] = round((ca + ce) / 10.0, 2) # Normalized coupling representation
        else:
            m["instability"] = 0.0
            m["coupling"] = 0.0

    # Summary metrics
    summary = {
        "total_components": len(nodes),
        "total_links": len(links),
        "avg_fan_in": round(sum(m["fan_in"] for m in metrics.values()) / len(nodes), 2) if nodes else 0,
        "avg_fan_out": round(sum(m["fan_out"] for m in metrics.values()) / len(nodes), 2) if nodes else 0,
        "avg_instability": round(sum(m["instability"] for m in metrics.values()) / len(nodes), 3) if nodes else 0,
        "layer_distribution": {}
    }

    for m in metrics.values():
        layer = m["layer"]
        summary["layer_distribution"][layer] = summary["layer_distribution"].get(layer, 0) + 1

    return {
        "summary": summary,
        "components": list(metrics.values())
    }

def main():
    results = calculate_metrics()
    if not results:
        sys.exit(1)

    temp_path = 'knowledge/architecture/architecture_metrics.temp.json'
    with open(temp_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    # Use commit_artifact for governance
    res = commit_artifact("architecture_metrics", temp_path, 100, 5)

    if os.path.exists(temp_path):
        os.remove(temp_path)

    if res == "committed":
        print(f"Successfully generated architecture metrics.")
    else:
        print(f"Failed to commit metrics: {res}")
        sys.exit(1)

if __name__ == "__main__":
    main()
