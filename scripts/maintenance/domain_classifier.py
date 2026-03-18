import json
import os
import sys

# Add scripts to path for commit_artifact
sys.path.append('scripts')
from commit_artifact import commit_artifact

COMPONENTS_PATH = 'knowledge/components.json'

# Mandatory Domains v8.0: UI, Domain, Engine, Infrastructure, Integration, Data
DOMAIN_MAPPING = {
    'Engine': [
        'engine.ts', 'cost-engine', 'sm2.ts', 'health-engine.ts', 'mri-engine.ts'
    ],
    'Data': [
        'src/types', 'src/contracts', 'src/validation/schemas', 'schemas.ts', 'src/lib/dexie.ts'
    ],
    'Infrastructure': [
        'src/lib/db.ts', 'src/lib/supabaseClient.ts', 'src/lib/auth.ts',
        'src/lib/logger.ts', 'src/lib/errorHandler.ts', 'src/lib/sync',
        'src/lib/observability', 'src/store', 'src/components/providers'
    ],
    'Integration': [
        'src/app/api', 'src/lib/ai/adapters', 'import-service', 'export-service'
    ],
    'UI': [
        'src/components/ui', 'src/components/modals', 'src/components/views',
        'src/app/', 'src/hooks/ui', 'ThemeHandler', 'ThemeProvider', 'ThemeToggle'
    ],
    'Domain': [
        'src/lib/', 'src/services', 'src/hooks/logic', 'src/hooks/api'
    ]
}

def classify_domain(path):
    # Check Engine first as it's the most specific
    for pattern in DOMAIN_MAPPING['Engine']:
        if pattern in path:
            return 'Engine'

    # Check Data
    for pattern in DOMAIN_MAPPING['Data']:
        if pattern in path:
            return 'Data'

    # Check Integration
    for pattern in DOMAIN_MAPPING['Integration']:
        if pattern in path:
            return 'Integration'

    # Check Infrastructure
    for pattern in DOMAIN_MAPPING['Infrastructure']:
        if pattern in path:
            return 'Infrastructure'

    # Check UI
    for pattern in DOMAIN_MAPPING['UI']:
        if pattern in path:
            return 'UI'

    # Check Domain
    for pattern in DOMAIN_MAPPING['Domain']:
        if pattern in path:
            return 'Domain'

    return 'Domain' # Default fallback for v8.0

def main():
    if not os.path.exists(COMPONENTS_PATH):
        print(f"Error: {COMPONENTS_PATH} not found.")
        return

    with open(COMPONENTS_PATH, 'r', encoding='utf-8') as f:
        components = json.load(f)

    for comp in components:
        comp['domain'] = classify_domain(comp.get('id', ''))

    temp_path = 'knowledge/components.temp.json'
    with open(temp_path, 'w', encoding='utf-8') as f:
        json.dump(components, f, indent=2, ensure_ascii=False)

    # Use commit_artifact for governance
    commit_artifact("components", temp_path, 100, 2)

    if os.path.exists(temp_path):
        os.remove(temp_path)

    print(f"Successfully updated {COMPONENTS_PATH} with domain classification v8.0 (6-domain standard).")

if __name__ == "__main__":
    main()
