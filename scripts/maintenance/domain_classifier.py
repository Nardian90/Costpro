import json
import os
import sys

# Add scripts to path for commit_artifact
sys.path.append('scripts')
from commit_artifact import commit_artifact

COMPONENTS_PATH = 'knowledge/components.json'

DOMAIN_MAPPING = {
    'ipv': ['src/lib/ipv', 'src/components/views/terminal/views/ipv'],
    'cost_engine': ['src/lib/cost-engine', 'src/components/views/terminal/views/cost_sheet'],
    'academy': ['src/lib/academy', 'src/components/views/terminal/views/academy'],
    'wallet': ['src/lib/wallet', 'src/components/views/terminal/views/wallet'],
    'inventory': ['src/components/views/terminal/views/inventory', 'src/lib/inventory-logic.ts', 'src/components/views/terminal/views/inventory_count'],
    'pos': ['src/components/views/terminal/views/pos'],
    'dashboard': ['src/components/views/terminal/views/dashboard'],
    'auth': ['src/components/auth', 'src/lib/auth.ts', 'src/lib/roles.ts', 'src/lib/supabaseClient.ts'],
    'core': ['src/lib/utils.ts', 'src/lib/db.ts', 'src/lib/dexie.ts', 'src/lib/logger.ts', 'src/lib/errorHandler.ts', 'src/lib/sync'],
    'system': ['src/app/system', 'src/components/views/terminal/views/health', 'src/lib/observability'],
    'ui': ['src/components/ui', 'src/components/modals', 'src/components/providers', 'src/components/theme-provider.tsx', 'src/components/ThemeToggle.tsx'],
    'wiki': ['src/components/views/terminal/views/wiki'],
    'cash_closure': ['src/components/views/terminal/views/cash_closure'],
    'reports': ['src/components/views/terminal/views/reports'],
    'users': ['src/components/views/terminal/views/users']
}

def classify_domain(path):
    for domain, patterns in DOMAIN_MAPPING.items():
        for pattern in patterns:
            if pattern in path:
                return domain
    return 'general'

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

    commit_artifact("components", temp_path, 100, 2)

    if os.path.exists(temp_path):
        os.remove(temp_path)

    print(f"Successfully updated {COMPONENTS_PATH} with domain classification.")

if __name__ == "__main__":
    main()
