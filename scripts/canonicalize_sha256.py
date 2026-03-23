#!/usr/bin/env python3
"""
canonicalize_sha256.py
Genera hash SHA256 determinista para archivos y directorios.
Uso: python canonicalize_sha256.py <path>
"""

import hashlib
import os
import sys
import json

def canonical_json(obj):
    return json.dumps(obj, separators=(',', ':'), sort_keys=True, ensure_ascii=False)

def get_hash(path):
    if os.path.isdir(path):
        hasher = hashlib.sha256()
        for root, dirs, files in os.walk(path):
            for names in sorted(files):
                filepath = os.path.join(root, names)
                with open(filepath, 'rb') as f:
                    while True:
                        data = f.read(65536)
                        if not data:
                            break
                        hasher.update(data)
        return hasher.hexdigest()

    if path.endswith('.json'):
        with open(path, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f)
                content = canonical_json(data).encode('utf-8')
                return hashlib.sha256(content).hexdigest()
            except json.JSONDecodeError:
                pass

    hasher = hashlib.sha256()
    with open(path, 'rb') as f:
        while True:
            data = f.read(65536)
            if not data:
                break
            hasher.update(data)
    return hasher.hexdigest()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python canonicalize_sha256.py <path>")
        sys.exit(1)

    path = sys.argv[1]
    if not os.path.exists(path):
        print(f"Error: Path not found: {path}")
        sys.exit(1)

    print(get_hash(path))
