import json
import os

def load_json(path):
    if not os.path.exists(path):
        print(f"Warning: {path} not found.")
        return None
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def validate():
    arch = load_json('public/system_architecture.json')
    components_doc = load_json('knowledge/components.json')
    views = load_json('knowledge/views.json')
    workflows = load_json('knowledge/workflows.json')

    results = {
        "orphan_views": [],
        "undocumented_components": [],
        "broken_references": []
    }

    # 1. Orphan Views (Views not in any workflow)
    if views and workflows:
        view_ids = {v['id'] for v in views}
        workflow_views = set()
        for wf in workflows:
            for v in wf.get('views', []):
                workflow_views.add(v)

        results["orphan_views"] = sorted(list(view_ids - workflow_views))

    # 2. Undocumented Components (In arch but not in components.json)
    if arch and components_doc:
        # Comparison logic: system_architecture uses relative file paths as IDs (mostly),
        # while components.json uses them as "id".
        # We check if the filePath of a component is documented in components.json.
        arch_comp_paths = {c['filePath'] for c in arch['components']}
        documented_ids = {c['id'] for c in components_doc}

        results["undocumented_components"] = sorted(list(arch_comp_paths - documented_ids))

    # 3. Broken References (Dependencies pointing to non-existent components)
    if arch:
        arch_comp_ids = {c['id'] for c in arch['components']}
        for c in arch['components']:
            for dep in c.get('dependencies', []):
                if dep not in arch_comp_ids:
                    # Ignore common external libraries
                    if not dep.startswith(('react', 'next', 'lucide', 'framer', 'date-fns', 'sonner', '@tanstack', 'uuid', 'papaparse', 'xlsx', 'decimal.js', 'expr-eval', 'immer', 'zustand')):
                        results["broken_references"].append(f"{c['id']} -> {dep}")

    return results

if __name__ == "__main__":
    findings = validate()
    print(json.dumps(findings, indent=2))
