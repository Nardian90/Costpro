#!/usr/bin/env python3
"""
phase_14_rag_context.py
Genera contexto modular para RAG (Retrieval Augmented Generation) v8.0.
Implementa chunking semántico, generación de embeddings deterministas y resúmenes por dominio.
"""

import os
import json
import hashlib
import numpy as np
from datetime import datetime, timezone
import sys
import subprocess
import glob

# Configuración de Rutas
EMB_PATH = "ai_context/ai_embeddings/"
SUM_PATH = "ai_context/summaries/"
VECTOR_INDEX_FILE = "ai_context/vector_index.json"

JSON_ARTIFACTS = [
    "knowledge/components.json",
    "knowledge/views.json",
    "knowledge/workflows.json",
    "knowledge/user_help.json"
]

MD_DIRS = [
    "knowledge/docs/explanation/",
    "knowledge/docs/how-to/",
    "knowledge/docs/reference/",
    "knowledge/docs/tutorials/",
    "knowledge/iso_manual/"
]

def fake_embed(text):
    """
    Embedding pseudo-aleatorio determinista (fake-embed-v1).
    En producción, esto se reemplazaría por una llamada a OpenAI o HuggingFace.
    """
    hash_value = int(hashlib.sha256(text.encode('utf-8')).hexdigest(), 16) % (10**8)
    vector = np.array([(hash_value >> i) & 0xFF for i in range(128)], dtype=np.float32)
    norm = np.linalg.norm(vector)
    if norm > 0:
        vector = vector / norm
    return vector

def chunk_json(filepath):
    """Chunking semántico estructural para artefactos JSON."""
    if not os.path.exists(filepath):
        return []
    with open(filepath, 'r', encoding='utf-8') as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError:
            print(f"Error: No se pudo parsear {filepath}")
            return []

    chunks = []
    base_name = os.path.basename(filepath).split('.')[0]

    if isinstance(data, list):
        for i, item in enumerate(data):
            # Usar un campo identificador si existe, si no, el índice
            item_id = item.get('id', item.get('name', str(i)))
            # Limpiar el item_id para que sea un slug válido
            safe_id = "".join([c if c.isalnum() else "_" for c in str(item_id)])
            chunk_id = f"{base_name}_{safe_id}"
            chunks.append({
                "id": chunk_id,
                "content": json.dumps(item, ensure_ascii=False, sort_keys=True),
                "metadata": {
                    "source": filepath,
                    "index": i,
                    "type": "json_item",
                    "domain": base_name
                }
            })
    elif isinstance(data, dict):
        for key, value in data.items():
            chunk_id = f"{base_name}_{key}"
            chunks.append({
                "id": chunk_id,
                "content": json.dumps({key: value}, ensure_ascii=False, sort_keys=True),
                "metadata": {
                    "source": filepath,
                    "key": key,
                    "type": "json_key",
                    "domain": base_name
                }
            })
    return chunks

def chunk_markdown(filepath):
    """Chunking basado en encabezados para archivos Markdown."""
    if not os.path.exists(filepath):
        return []
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    chunks = []
    lines = content.split('\n')
    current_header = "Introduction"
    current_chunk_lines = []

    filename = os.path.basename(filepath).split('.')[0]

    for i, line in enumerate(lines):
        if line.startswith('#'):
            # Guardar el chunk anterior si tiene contenido
            if current_chunk_lines and any(l.strip() for l in current_chunk_lines):
                # Generar un ID basado en el encabezado o posición
                header_slug = "".join([c if c.isalnum() else "_" for c in current_header.lower()])
                chunk_id = f"{filename}_{header_slug}"
                chunks.append({
                    "id": chunk_id,
                    "content": '\n'.join(current_chunk_lines),
                    "metadata": {
                        "source": filepath,
                        "header": current_header,
                        "type": "md_section",
                        "line_start": i - len(current_chunk_lines)
                    }
                })
                current_chunk_lines = []
            current_header = line.strip('#').strip()
        current_chunk_lines.append(line)

    # Guardar el último fragmento
    if current_chunk_lines and any(l.strip() for l in current_chunk_lines):
        header_slug = "".join([c if c.isalnum() else "_" for c in current_header.lower()])
        chunk_id = f"{filename}_{header_slug}_end"
        chunks.append({
            "id": chunk_id,
            "content": '\n'.join(current_chunk_lines),
            "metadata": {
                "source": filepath,
                "header": current_header,
                "type": "md_section"
            }
        })

    return chunks

def generate_summary(domain_name, chunks):
    """Genera un resumen estructurado del dominio basado en los chunks."""
    summary = {
        "domain": domain_name,
        "totalChunks": len(chunks),
        "sources": sorted(list(set([c["metadata"]["source"] for c in chunks]))),
        "description": f"Resumen de contexto para el dominio {domain_name}. Procesa {len(chunks)} bloques semánticos.",
        "generatedAt": datetime.now(timezone.utc).isoformat() + 'Z',
        "version": "1.0.0"
    }
    return summary

def main():
    print("--- Inciando Fase 14: AI Retrieval Context System ---")

    # Asegurar directorios temporales
    os.makedirs(EMB_PATH, exist_ok=True)
    os.makedirs(SUM_PATH, exist_ok=True)

    all_chunks = []

    # 1. Chunking de Artefactos JSON
    for art in JSON_ARTIFACTS:
        print(f"Chunking JSON: {art}")
        all_chunks.extend(chunk_json(art))

    # 2. Chunking de Archivos Markdown
    for md_dir in MD_DIRS:
        for md_file in glob.glob(os.path.join(md_dir, "*.md")):
            print(f"Chunking MD: {md_file}")
            all_chunks.extend(chunk_markdown(md_file))

    if not all_chunks:
        print("Error: No se generaron chunks. Verifique los archivos de origen.")
        sys.exit(1)

    print(f"Total de chunks generados: {len(all_chunks)}")

    # 3. Generación de Embeddings y Guardado de Chunks
    index_entries = []
    for chunk in all_chunks:
        # Generar vector
        vector = fake_embed(chunk["content"])

        # ID determinista para el archivo basado en el chunk ID
        chunk_hash = hashlib.md5(chunk["id"].encode()).hexdigest()[:12]
        emb_filename = f"emb_{chunk_hash}.npy"
        emb_fullpath = os.path.join(EMB_PATH, emb_filename)

        # Guardar vector (formato numpy)
        np.save(emb_fullpath, vector)

        # Guardar contenido del chunk por separado para recuperación
        chunk_info_filename = f"chunk_{chunk_hash}.json"
        chunk_info_path = os.path.join(EMB_PATH, chunk_info_filename)
        with open(chunk_info_path, 'w', encoding='utf-8') as f:
            json.dump(chunk, f, indent=2, ensure_ascii=False)

        index_entries.append({
            "id": chunk["id"],
            "embeddingPath": emb_fullpath,
            "chunkPath": chunk_info_path,
            "metadata": chunk["metadata"]
        })

    # 4. Generación de Resúmenes por Dominio
    domain_mapping = {
        "Architecture": ["public/", "knowledge/components.json"],
        "Knowledge": ["knowledge/views.json", "knowledge/workflows.json"],
        "Documentation": ["knowledge/docs/", "knowledge/iso_manual/"],
        "UserHelp": ["knowledge/user_help.json"]
    }

    for domain, patterns in domain_mapping.items():
        domain_chunks = [c for c in all_chunks if any(p in c["metadata"]["source"] for p in patterns)]
        if domain_chunks:
            summary = generate_summary(domain, domain_chunks)
            sum_filename = f"{domain.lower()}_summary.json"
            sum_filepath = os.path.join(SUM_PATH, sum_filename)
            with open(sum_filepath, 'w', encoding='utf-8') as f:
                json.dump(summary, f, indent=2, ensure_ascii=False)

            # Commitear resumen via gobernanza
            subprocess.run([
                "python3", "scripts/commit_artifact.py",
                f"summaries/{domain.lower()}_summary",
                sum_filepath, "98.0", "14"
            ])

    # 5. Construcción del Índice Vectorial
    index_meta = {
        "indexVersion": "1.1.0",
        "totalEntries": len(index_entries),
        "entries": index_entries,
        "builtAt": datetime.now(timezone.utc).isoformat() + 'Z',
        "embeddingModel": "fake-embed-v1",
        "dimension": 128
    }

    # Guardar índice en ruta temporal antes de commit
    temp_index = "/tmp/vector_index.json"
    with open(temp_index, 'w', encoding='utf-8') as f:
        json.dump(index_meta, f, indent=2, ensure_ascii=False)

    # Commitear índice via gobernanza
    subprocess.run(["python3", "scripts/commit_artifact.py", "vector_index", temp_index, "100.0", "14"])

    # 6. Commitear todos los embeddings y chunks como un artefacto de directorio
    subprocess.run([
        "python3", "scripts/commit_artifact.py",
        "ai_embeddings", EMB_PATH, "100.0", "14"
    ])

    print(f"Fase 14 Finalizada. Índice con {len(index_entries)} entradas desplegado.")

if __name__ == "__main__":
    main()
