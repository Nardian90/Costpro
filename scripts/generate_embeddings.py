#!/usr/bin/env python3
"""
generate_embeddings.py
Genera embeddings vectoriales para artefactos
Uso: python generate_embeddings.py <artifact_path> <output_path>
NOTA: Reemplazar fake_embed con modelo real de embeddings
"""

import json
import os
import sys
import numpy as np
from datetime import datetime, timezone

def fake_embed(text):
    """
    Embedding pseudo-aleatorio determinista (REEMPLAZAR CON MODELO REAL)
    Modelos recomendados: OpenAI text-embedding-ada-002, HuggingFace sentence-transformers
    """
    hash_value = abs(hash(text)) % (10**8)
    vector = np.array([(hash_value >> i) & 0xFF for i in range(128)], dtype=np.float32)
    norm = np.linalg.norm(vector)
    if norm > 0:
        vector = vector / norm
    return vector

def embed_artifact(artifact_path, output_path):
    """Genera embedding para artefacto JSON"""

    with open(artifact_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Convertir a texto para embedding
    text = json.dumps(data, sort_keys=True, ensure_ascii=False)

    # Generar vector
    vector = fake_embed(text)

    # Crear directorio si no existe
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Guardar embedding
    np.save(output_path, vector)

    # Guardar metadata del embedding
    meta_path = output_path.replace('.npy', '.meta.json')
    embedding_meta = {
        "artifactPath": artifact_path,
        "embeddingPath": output_path,
        "vectorDimension": len(vector),
        "model": "fake-embed-v1",
        "createdAt": datetime.now(timezone.utc).isoformat() + 'Z'
    }

    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(embedding_meta, f, indent=2, ensure_ascii=False)

    print(f"EMBEDDED: {output_path}")
    return output_path

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python generate_embeddings.py <artifact_path> <output_path>")
        sys.exit(1)

    artifact_path = sys.argv[1]
    output_path = sys.argv[2]

    embed_artifact(artifact_path, output_path)
