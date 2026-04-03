import os
import json
import datetime
from datetime import timezone
import subprocess
import sys

# Import components
sys.path.append('scripts')
from commit_artifact import commit_artifact

BASE_PATHS = ["src/app", "src/components", "src/lib", "src/services", "src/store", "src/types", "src/hooks", "src/contracts", "src/types"]

def get_type(path):
    if "components/views/terminal/views" in path:
        if path.endswith("View.tsx") or path.endswith("ManagementView.tsx") or "dashboard" in path:
            return "view"
    if "components" in path:
        return "component"
    if "hooks" in path:
        return "hook"
    if "services" in path:
        return "service"
    if "store" in path:
        return "store"
    if "types" in path:
        return "type"
    if "lib" in path:
        return "utility"
    return "unknown"

def get_layer(path):
    if not path: return "unknown"
    parts = path.split("/")
    if "components" in parts: return "UI Components"
    if "lib" in parts: return "Business Logic"
    if "app" in parts: return "Application"
    if "hooks" in parts: return "Hooks"
    if "store" in parts: return "State Management"
    if "services" in parts: return "Services"
    if "types" in parts: return "Types"
    return "Infrastructure"

def resolve_import(import_path, current_file_path):
    # Normalize paths for comparison
    current_file_path = os.path.normpath(current_file_path)

    if import_path.startswith("@/"):
        resolved = import_path.replace("@/", "src/")
    elif import_path.startswith("."):
        dir_name = os.path.dirname(current_file_path)
        resolved = os.path.normpath(os.path.join(dir_name, import_path))
    else:
        return None

    resolved = os.path.normpath(resolved)

    for ext in [".tsx", ".ts", ".jsx", ".js", ""]:
        full_path = resolved + ext
        if os.path.exists(full_path) and os.path.isfile(full_path):
            return full_path
        if os.path.isdir(full_path):
            for i_ext in ["/index.ts", "/index.tsx", "/index.js"]:
                if os.path.exists(full_path + i_ext):
                    return full_path + i_ext
    return None

def extract_all_dependencies_ast(file_paths):
    batch_size = 50
    all_imports = {}
    for i in range(0, len(file_paths), batch_size):
        batch = file_paths[i:i + batch_size]
        try:
            # Using Bun with --no-install to avoid overhead if possible, or just standard run
            result = subprocess.run(
                ["bun", "run", "scripts/extract_imports.ts"] + batch,
                capture_output=True, text=True
            )
            if result.returncode == 0:
                # Find the line that looks like JSON
                output = result.stdout.strip()
                try:
                    batch_results = json.loads(output)
                    all_imports.update(batch_results)
                except json.JSONDecodeError:
                    # Try splitting lines if there's noise
                    lines = output.split('\n')
                    for line in reversed(lines):
                        if line.startswith('{') and line.endswith('}'):
                            batch_results = json.loads(line)
                            all_imports.update(batch_results)
                            break
            else:
                print(f"Bun error on batch starting with {batch[0]}: {result.stderr}")
        except Exception as e:
            print(f"Error in batch: {e}")
    return all_imports

def path_to_id(path):
    """Generates a unique ID from the relative path"""
    return path.replace("/", "_").replace(".", "_")

def execute_phase_1():
    print("Executing Phase 1: Architecture Discovery (AST-based)...")

    nodes = {}
    file_list = []
    for base in BASE_PATHS:
        if not os.path.exists(base): continue
        for root, _, files in os.walk(base):
            for file in files:
                if file.endswith((".tsx", ".ts", ".js", ".jsx")):
                    if ".test." in file or "__tests__" in root or "node_modules" in root:
                        continue
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, start=os.getcwd())
                    # Normalize for cross-platform and consistency
                    rel_path = os.path.normpath(rel_path)
                    itype = get_type(rel_path)

                    node_id = path_to_id(rel_path)
                    nodes[rel_path] = {"id": node_id, "type": itype, "path": rel_path}
                    file_list.append(rel_path)

    raw_imports = extract_all_dependencies_ast(file_list)
    arch_components = []
    for path, node in nodes.items():
        imports = raw_imports.get(path, [])
        resolved_deps = []
        for imp in imports:
            resolved = resolve_import(imp, path)
            if resolved:
                rel_resolved = os.path.relpath(resolved, start=os.getcwd())
                rel_resolved = os.path.normpath(rel_resolved)
                if rel_resolved in nodes:
                    resolved_deps.append(nodes[rel_resolved]['id'])
                else:
                    # Maybe it's src/store resolving to src/store/index.ts
                    pass

        arch_components.append({
            "id": node["id"],
            "type": node["type"],
            "filePath": node["path"],
            "layer": get_layer(node["path"]),
            "dependencies": list(set(resolved_deps))
        })

    # Save and commit
    temp_arch = "system_architecture.temp.json"
    with open(temp_arch, 'w', encoding='utf-8') as f:
        json.dump({"components": arch_components}, f, indent=2, ensure_ascii=False)
    commit_artifact("system_architecture", temp_arch, 100, 1)

    manifest = {
        "generated_at": datetime.datetime.now(timezone.utc).isoformat(),
        "version": "8.0.0",
        "system": "CostPro",
        "artifacts": {
            "public": ["system_architecture.json", "architecture_manifest.json", "architecture_graph.json", "architecture_audit.json"],
            "knowledge": ["components.json", "views.json", "workflows.json", "knowledge_graph.json"]
        }
    }
    temp_manifest = "architecture_manifest.temp.json"
    with open(temp_manifest, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    commit_artifact("architecture_manifest", temp_manifest, 100, 1)

    if os.path.exists(temp_arch): os.remove(temp_arch)
    if os.path.exists(temp_manifest): os.remove(temp_manifest)
    print("Phase 1 Sub-logic Complete.")

if __name__ == "__main__":
    execute_phase_1()
