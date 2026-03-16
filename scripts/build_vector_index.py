#!/usr/bin/env python3
"""
build_vector_index.py
Construye índice vectorial para RAG
Uso: python build_vector_index.py
"""

import os
import json
import glob
from datetime import datetime, timezone

EMB_PATH = "ai_context/ai_embeddings/"
IDX_PATH = "ai_context/ai_vector_index/"

def build_index():
    """Construye índice vectorial desde embeddings existentes"""

    os.makedirs(IDX_PATH, exist_ok=True)

    entries = []

    # Escanear todos los embeddings
    for pattern in ["*.npy", "*.bin", "*.vec"]:
        for embedding_path in glob.glob(os.path.join(EMB_PATH, pattern)):
            artifact_name = os.path.basename(embedding_path).rsplit('.', 1)[0]

            # Cargar metadata del embedding si existe
            meta_path = embedding_path.replace('.npy', '.meta.json')
            meta = {}
            if os.path.exists(meta_path):
                with open(meta_path, 'r', encoding='utf-8') as f:
                    meta = json.load(f)

            entries.append({
                "id": artifact_name,
                "artifactName": artifact_name,
                "embeddingPath": embedding_path,
                "vectorDimension": meta.get("vectorDimension", 128),
                "model": meta.get("model", "unknown"),
                "createdAt": meta.get("createdAt", datetime.now(timezone.utc).isoformat() + 'Z')
            })

    # Construir índice maestro
    index_meta = {
        "indexVersion": "1.0.0",
        "totalEntries": len(entries),
        "shards": 1,
        "entries": entries,
        "builtAt": datetime.now(timezone.utc).isoformat() + 'Z',
        "lastUpdated": datetime.now(timezone.utc).isoformat() + 'Z'
    }

    # Guardar índice
    index_path = os.path.join(IDX_PATH, "index.meta.json")
    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(index_meta, f, indent=2, ensure_ascii=False)

    # Actualizar vector_index.json principal
    vector_index_path = "ai_context/vector_index.json"
    if not os.path.exists(os.path.dirname(vector_index_path)):
        os.makedirs(os.path.dirname(vector_index_path), exist_ok=True)
    with open(vector_index_path, 'w', encoding='utf-8') as f:
        json.dump(index_meta, f, indent=2, ensure_ascii=False)

    print(f"INDEX_BUILT: {len(entries)} entries")
    return index_path

if __name__ == "__main__":
    build_index()
