#!/usr/bin/env python3
"""
canonicalize_sha256.py
Genera hash SHA256 determinista de archivos JSON
Uso: python canonicalize_sha256.py <archivo.json>
"""

import json
import hashlib
import sys
from datetime import datetime, timezone

def canonical_json(obj):
    """Convierte objeto a JSON canónico (ordenado, sin espacios)"""
    return json.dumps(obj, separators=(',', ':'), sort_keys=True, ensure_ascii=False)

def sha256_hex(s: str):
    """Calcula hash SHA256 de string"""
    return hashlib.sha256(s.encode('utf-8')).hexdigest()

def calculate_hash(file_path):
    """Calcula hash de archivo JSON"""
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    canonical = canonical_json(data)
    return sha256_hex(canonical)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Error: Proporcionar ruta de archivo JSON")
        sys.exit(1)

    file_path = sys.argv[1]
    try:
        hash_value = calculate_hash(file_path)
        print(f"sha256:{hash_value}")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
