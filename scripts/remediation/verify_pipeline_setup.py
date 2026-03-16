import os
import yaml
import json
import subprocess

def test_setup():
    print("Validating Architecture AI Pipeline v8.0 Setup...")

    # 1. Directories
    dirs = [
        'docs/automation/quarantine',
        'public/_meta',
        'public/_archive',
        'ai_context/ai_embeddings',
        'ai_context/ai_vector_index',
        'knowledge/docs/tutorials'
    ]
    for d in dirs:
        assert os.path.exists(d), f"Missing directory: {d}"
    print("✅ Directories verified.")

    # 2. Config Files
    with open('docs/automation/pipeline_state.yaml', 'r') as f:
        state = yaml.safe_load(f)
        assert state['pipelineVersion'] == '8.0.0'
    print("✅ Configuration verified.")

    # 3. Scripts
    scripts = ['scripts/canonicalize_sha256.py', 'scripts/run_phase_template.py']
    for s in scripts:
        assert os.access(s, os.X_OK), f"Script not executable: {s}"
    print("✅ Scripts verified.")

if __name__ == "__main__":
    try:
        test_setup()
        print("PIPELINE SETUP VALIDATED SUCCESSFULLY")
    except Exception as e:
        print(f"VALIDATION FAILED: {e}")
        exit(1)
