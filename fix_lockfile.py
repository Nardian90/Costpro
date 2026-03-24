import json
import sys

def fix_json(filename):
    try:
        with open(filename, 'r') as f:
            content = f.read()
        # Very crude fix for trailing commas in simple JSON
        # This is risky but since we're in a pinch...
        # Better: just use json.loads and json.dump if possible, but loads fails on trailing commas.

        # Try to find where it's broken
        try:
            data = json.loads(content)
            print(f"{filename} is already valid.")
            return
        except json.JSONDecodeError as e:
            print(f"Error in {filename}: {e}")
            # Attempt to fix trailing commas before closing braces/brackets
            import re
            fixed = re.sub(r',\s*([}\]])', r'\1', content)
            try:
                data = json.loads(fixed)
                with open(filename, 'w') as f:
                    json.dump(data, f, indent=2)
                print(f"Fixed {filename}")
            except Exception as e2:
                print(f"Failed to fix {filename}: {e2}")

fix_json('bun.lock')
fix_json('package-lock.json')
