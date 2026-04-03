#!/usr/bin/env python3
"""
phase_6_health.py
Evalúa la salud de la arquitectura: ciclos, huérfanos e integridad.
Pipeline v8.0 - CostPro
"""

import json
import os
import sys
import yaml
from datetime import datetime, timezone

# Add scripts to path for commit_artifact
sys.path.append('scripts')
from commit_artifact import commit_artifact

GRAPH_PATH = 'knowledge/architecture/architecture_graph.json'
METRICS_PATH = 'knowledge/architecture/architecture_metrics.json'
AUDIT_PATH = 'docs/audits/architecture_audit.json'
STATE_PATH = 'docs/automation/pipeline_state.yaml'

def find_cycles(nodes, links):
    """Detecta ciclos en el grafo usando DFS"""
    adj = {node['id']: [] for node in nodes}
    for link in links:
        u, v = link['source'], link['target']
        if u in adj and v in adj:
            adj[u].append(v)

    cycles = []
    visited = set()
    stack = set()
    path = []

    def dfs(u):
        visited.add(u)
        stack.add(u)
        path.append(u)

        for v in adj.get(u, []):
            if v in stack:
                # Ciclo detectado
                try:
                    idx = path.index(v)
                    cycles.append(path[idx:] + [v])
                except ValueError:
                    pass
                if len(cycles) >= 50: return True
            elif v not in visited:
                if dfs(v): return True

        stack.remove(u)
        path.pop()
        return False

    for node in nodes:
        node_id = node['id']
        if node_id not in visited:
            if dfs(node_id): break

    return cycles

def evaluate_health():
    if not os.path.exists(GRAPH_PATH) or not os.path.exists(METRICS_PATH):
        print(f"Error: Requeridos {GRAPH_PATH} y {METRICS_PATH}")
        return None

    try:
        with open(GRAPH_PATH, 'r', encoding='utf-8') as f:
            graph = json.load(f)

        with open(METRICS_PATH, 'r', encoding='utf-8') as f:
            metrics_data = json.load(f)
    except Exception as e:
        print(f"Error cargando JSONs: {e}")
        return None

    nodes = graph.get('nodes', [])
    links = graph.get('links', [])
    components_metrics = metrics_data.get('components', [])

    # 1. Detectar Ciclos
    cycles = find_cycles(nodes, links)
    num_cycles = len(cycles)

    # 2. Identificar Huérfanos
    # Definición: Nodo sin links entrantes ni salientes
    # Usamos las métricas calculadas en Fase 5
    orphans = [c['id'] for c in components_metrics if c.get('fan_in', 0) == 0 and c.get('fan_out', 0) == 0]
    num_orphans = len(orphans)

    # 3. Calcular Integrity Score
    # Base 100. Penalización: -5 por ciclo, -1 por huérfano.
    penalty = (num_cycles * 5) + (num_orphans * 1)
    integrity_score = max(0, 100 - penalty)

    health_metrics = {
        "integrityScore": float(integrity_score),
        "cyclicDependencies": num_cycles,
        "orphanComponents": num_orphans,
        "details": {
            "cycles": [" -> ".join(c) for c in cycles[:10]], # Top 10 cycles
            "orphanCount": num_orphans
        },
        "updatedAt": datetime.now(timezone.utc).isoformat() + 'Z'
    }

    # 4. Actualizar architecture_audit.json
    audit = {"phaseExecutions": [], "performanceSummary": {}, "healthMetrics": {}}
    if os.path.exists(AUDIT_PATH):
        try:
            with open(AUDIT_PATH, 'r', encoding='utf-8') as f:
                content = json.load(f)
                if isinstance(content, dict):
                    audit = content
        except Exception as e:
            print(f"Aviso: No se pudo leer audit existente: {e}")

    audit["healthMetrics"] = health_metrics

    # Guardar temporalmente para commit_artifact
    temp_audit_path = 'docs/audits/architecture_audit.temp.json'
    with open(temp_audit_path, 'w', encoding='utf-8') as f:
        json.dump(audit, f, indent=2, ensure_ascii=False)

    # Gobernar el cambio
    res = commit_artifact("architecture_audit", temp_audit_path, 100, 6)
    if os.path.exists(temp_audit_path):
        os.remove(temp_audit_path)

    # 5. Regla Crítica: Verificación de Umbral de Reparación
    if os.path.exists(STATE_PATH):
        try:
            with open(STATE_PATH, 'r', encoding='utf-8') as f:
                state = yaml.safe_load(f)

            repair_threshold = state.get('repairThreshold', 80)
            if integrity_score < repair_threshold:
                print(f"ALERTA: integrityScore ({integrity_score}) < repairThreshold ({repair_threshold})")
                if state.get('schedulerMode') != 'repair':
                    print("Cambiando schedulerMode a 'repair'")
                    state['schedulerMode'] = 'repair'
                    with open(STATE_PATH, 'w', encoding='utf-8') as f:
                        yaml.dump(state, f, default_flow_style=False)
        except Exception as e:
            print(f"Error actualizando estado: {e}")

    return health_metrics

if __name__ == "__main__":
    health = evaluate_health()
    if health:
        print(f"Salud Evaluada: Score {health['integrityScore']}, Ciclos: {health['cyclicDependencies']}, Huérfanos: {health['orphanComponents']}")
    else:
        sys.exit(1)
