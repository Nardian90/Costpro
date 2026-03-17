import os
import yaml
import json
import datetime
from datetime import timezone
import subprocess
import sys

# Constants
STATE_PATH = "docs/automation/pipeline_state.yaml"
AUDIT_PATH = "public/architecture_audit.json"

PHASE_DEFINITIONS = {
    1: {"name": "Architecture Discovery", "script": "scripts/phase_1_discovery.py", "outputs": ["system_architecture.json", "architecture_manifest.json"]},
}

def load_state():
    with open(STATE_PATH, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

def save_state(state):
    with open(STATE_PATH, 'w', encoding='utf-8') as f:
        yaml.dump(state, f, default_flow_style=False, allow_unicode=True)

def main():
    print("--- JULES SCHEDULER v8.0 ---")
    try:
        state = load_state()
    except Exception as e:
        print(f"CRITICAL: Failed to read pipeline_state.yaml: {e}")
        sys.exit(1)

    current_phase_num = state.get("currentPhase", 1)
    mode = state.get("schedulerMode", "normal")

    print(f"Current Phase: {current_phase_num}")
    print(f"Mode: {mode}")

    if current_phase_num == 1:
        phase_def = PHASE_DEFINITIONS.get(1)
        print(f"Executing Phase 1: {phase_def['name']}")
        try:
            subprocess.run([sys.executable, phase_def["script"]], check=True)
            print(f"Phase 1 completed successfully.")
        except subprocess.CalledProcessError as e:
            print(f"Error executing Phase 1: {e}")
            sys.exit(1)
    else:
        print(f"Phase {current_phase_num} not implemented in this runner.")
        sys.exit(0)

if __name__ == "__main__":
    main()
