import json
import os

def generate():
    components = []
    if os.path.exists('knowledge/components.json'):
        with open('knowledge/components.json', 'r', encoding='utf-8') as f:
            components = json.load(f)

    views = []
    if os.path.exists('knowledge/views.json'):
        with open('knowledge/views.json', 'r', encoding='utf-8') as f:
            views = json.load(f)

    workflows = []
    if os.path.exists('knowledge/workflows.json'):
        with open('knowledge/workflows.json', 'r', encoding='utf-8') as f:
            workflows = json.load(f)

    nodes = []
    edges = []
    seen_nodes = set()

    def add_node(node_id, label, group):
        if not node_id: return
        if node_id not in seen_nodes:
            nodes.append({"id": node_id, "label": label, "group": group})
            seen_nodes.add(node_id)

    # Process Components
    for comp in components:
        comp_id = comp.get('id')
        name = comp.get('name')
        if not comp_id: continue
        add_node(comp_id, name, "component")

        for dep in comp.get('dependencies', []):
            edges.append({"source": comp_id, "target": dep, "type": "depends_on"})

    # Process Views
    for view in views:
        view_id = view.get('id')
        name = view.get('name')
        if not view_id: continue
        add_node(view_id, name, "view")

        for comp_ref in view.get('components', []):
            edges.append({"source": view_id, "target": comp_ref, "type": "contains"})

    # Process Workflows
    for wf in workflows:
        wf_id = wf.get('id')
        name = wf.get('name')
        if not wf_id: continue
        add_node(wf_id, name, "workflow")

        for step in wf.get('steps', []):
            # Simple heuristic
            for v in views:
                if v.get('name') and v['name'].lower() in step.lower():
                    edges.append({"source": wf_id, "target": v['id'], "type": "executes"})
            for c in components:
                if c.get('name') and c['name'].lower() in step.lower():
                    edges.append({"source": wf_id, "target": c['id'], "type": "executes"})

    output = {"nodes": nodes, "edges": edges}

    os.makedirs('knowledge', exist_ok=True)
    with open('knowledge/knowledge_graph.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print("Knowledge Graph generated successfully at knowledge/knowledge_graph.json")

if __name__ == "__main__":
    generate()
