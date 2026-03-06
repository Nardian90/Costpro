import sys
import os

def main():
    # Basic check for component strings in SystemHealthView.tsx
    with open('src/components/views/terminal/views/health/SystemHealthView.tsx', 'r') as f:
        content = f.read()

    components = ['ArchitectureAuditGrid', 'DetailedRelationshipGraph', 'auditSummary', 'system_health.json']
    missing = [c for c in components if c not in content]

    if missing:
        print(f"FAILED: Missing components or references: {', '.join(missing)}")
        sys.exit(1)

    print("SUCCESS: SystemHealthView.tsx contains required components.")

if __name__ == "__main__":
    main()
