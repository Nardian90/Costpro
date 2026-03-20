import os
import json
import re
import sys
from datetime import datetime, timezone

# Add scripts to path for commit_artifact
sys.path.append('scripts')
from commit_artifact import commit_artifact

def extract_view_details(file_path):
    if not os.path.exists(file_path):
        return None

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract actions (functions starting with handle or on)
    actions = list(set(re.findall(r'const (handle\w+|on\w+)\s*=', content)))
    actions.extend(list(set(re.findall(r'function (handle\w+|on\w+)\s*\(', content))))

    # Extract inputs (standard UI components)
    inputs = list(set(re.findall(r'<(Input|Select|Checkbox|Switch|Textarea|Calendar|RadioGroup)', content)))

    # Extract outputs (tables, charts, etc)
    outputs = []
    if 'Table' in content or 'data-table' in content: outputs.append('Table')
    if 'Chart' in content or 'ResponsiveContainer' in content: outputs.append('Chart')
    if 'Card' in content: outputs.append('Card List')
    if 'Summary' in content: outputs.append('Summary Panel')

    # Extract sub-components (Imports starting with @/components)
    components = list(set(re.findall(r"import .* from ['\"]@/components/(.*)['\"]", content)))

    # Extract services/hooks
    services = list(set(re.findall(r"import .* from ['\"]@/services/(.*)['\"]", content)))
    hooks = list(set(re.findall(r"import .* from ['\"]@/hooks/(.*)['\"]", content)))
    libs = list(set(re.findall(r"import .* from ['\"]@/lib/(.*)['\"]", content)))

    return {
        "id": file_path,
        "name": os.path.basename(file_path),
        "route": file_path,
        "actions": sorted(list(set(actions))),
        "inputs": sorted(inputs),
        "outputs": sorted(outputs),
        "components": sorted(components),
        "servicesUsed": sorted(list(set(services + hooks + libs)))
    }

def main():
    print("Executing Phase 8: View Flow Mapping...")

    arch_path = "public/system_architecture.json"
    if not os.path.exists(arch_path):
        print(f"Error: {arch_path} not found.")
        sys.exit(1)

    with open(arch_path, 'r', encoding='utf-8') as f:
        arch = json.load(f)

    views = [c for c in arch.get("components", []) if c.get("type") == "view"]

    view_mappings = []
    for view in views:
        path = view.get("filePath")
        details = extract_view_details(path)
        if details:
            view_mappings.append(details)

    output_path = "knowledge/views.temp.json"
    os.makedirs("knowledge", exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(view_mappings, f, indent=2, ensure_ascii=False)

    # Commit artifact
    res = commit_artifact("views", output_path, 95.0, 8)

    if os.path.exists(output_path):
        os.remove(output_path)

    print(f"Phase 8 Complete. Result: {res}")

if __name__ == "__main__":
    main()
