import json

with open('package.json', 'r') as f:
    data = json.load(f)

# Move bun config to top level if it's in dependencies
if 'bun' in data.get('dependencies', {}):
    data['bun'] = data['dependencies'].pop('bun')

# Also ensure it's at the top level
if 'bun' not in data:
    data['bun'] = {
        "lockfile": {
            "print": "text"
        }
    }

with open('package.json', 'w') as f:
    json.dump(data, f, indent=2)
