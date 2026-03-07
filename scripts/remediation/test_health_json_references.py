import json
import os

def test_file(path, expected_keys):
    if not os.path.exists(path):
        print(f"FAILED: {path} not found.")
        return False
    try:
        with open(path, 'r') as f:
            data = json.load(f)
        missing = [k for k in expected_keys if k not in data]
        if missing:
            print(f"FAILED: {path} missing keys: {', '.join(missing)}")
            return False
        return True
    except Exception as e:
        print(f"FAILED: Error reading {path}: {str(e)}")
        return False

def main():
    s1 = test_file('public/system_health.json', ['systemHealth', 'status', 'viewsAudited', 'lastAudit'])
    s2 = test_file('public/system_architecture.json', ['architecture', 'stats'])
    s3 = test_file('public/architecture_graph.json', ['nodes', 'edges', 'graphStats'])

    if all([s1, s2, s3]):
        print("SUCCESS: JSON references and keys are correct.")
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()
