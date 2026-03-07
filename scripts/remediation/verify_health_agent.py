import os
import json

def check_file(path):
    if os.path.exists(path):
        print(f"✅ Found: {path}")
        return True
    else:
        print(f"❌ Missing: {path}")
        return False

files_to_check = [
    "src/lib/observability/system-health.ts",
    "e2e/system_health_agent.spec.ts",
    "src/lib/ai/tools/definitions.ts",
    "src/lib/ai/tools/registry.ts",
    "src/components/views/terminal/views/health/HealthAgentLogs.tsx",
    "src/components/views/terminal/views/health/SystemHealthView.tsx"
]

all_found = True
for f in files_to_check:
    if not check_file(f):
        all_found = False

if all_found:
    print("\n--- Content Checks ---")

    with open("src/lib/ai/tools/definitions.ts", "r") as f:
        if "run_system_health_check" in f.read():
            print("✅ run_system_health_check tool defined")
        else:
            print("❌ run_system_health_check tool NOT defined")

    with open("src/lib/ai/tools/registry.ts", "r") as f:
        content = f.read()
        if "run_system_health_check:" in content and "logSystemHealth" in content:
             print("✅ run_system_health_check handler implemented")
        else:
             print("❌ run_system_health_check handler NOT implemented correctly")

    with open("src/components/views/terminal/views/health/SystemHealthView.tsx", "r") as f:
        if "HealthAgentLogs" in f.read():
            print("✅ HealthAgentLogs integrated into SystemHealthView")
        else:
            print("❌ HealthAgentLogs NOT integrated into SystemHealthView")
