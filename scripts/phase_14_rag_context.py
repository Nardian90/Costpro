#!/usr/bin/env python3
"""
phase_14_rag_context.py
Engine 3: AI RAG Context (Optimización)
Objetivo: Generar contexto modular para IA (RAG) mediante chunking, embeddings y summaries.
Cumple con la Regla 7 de Gobernanza v8.0 (No monolithic index).
"""

import json
import os
import sys
import hashlib
import numpy as np
import glob
import shutil
from datetime import datetime, timezone

# Add scripts directory to path for imports
sys.path.append('scripts')
try:
    from commit_artifact import commit_artifact
except ImportError:
    print("Error: No se pudo importar commit_artifact.py")
    sys.exit(1)

# Paths
KNOWLEDGE_DIR = "knowledge/"
EMB_PATH = "ai_context/ai_embeddings/"
IDX_PATH = "ai_context/ai_vector_index/"
SUMMARIES_PATH = "ai_context/summaries/"

def fake_embed(text):
    """Embedding pseudo-aleatorio determinista (de generate_embeddings.py)"""
    # Deterministic hash of the text
    hash_object = hashlib.md5(text.encode('utf-8'))
    hash_hex = hash_object.hexdigest()
    # Convert hex to vector
    vector = np.array([int(hash_hex[i:i+2], 16) for i in range(0, 32, 2)] * 8, dtype=np.float32)
    norm = np.linalg.norm(vector)
    if norm > 0:
        vector = vector / norm
    return vector

def chunk_text(text, max_chars=1000):
    """Chunking simple por caracteres preservando párrafos si es posible"""
    if not text: return []
    chunks = []
    while len(text) > max_chars:
        split_idx = text.rfind('\n', 0, max_chars)
        if split_idx == -1: split_idx = max_chars
        chunks.append(text[:split_idx].strip())
        text = text[split_idx:].strip()
    if text:
        chunks.append(text)
    return chunks

def process_json_artifact(name, data):
    """Divide un objeto JSON en chunks lógicos (ej. por componente o flujo)"""
    chunks = []
    if isinstance(data, list):
        for item in data:
            chunks.append(json.dumps(item, ensure_ascii=False))
    elif isinstance(data, dict):
        # Specific handling for Knowledge Graph
        if 'nodes' in data and 'edges' in data:
            # Chunk nodes and edges separately
            for node in data['nodes']:
                chunks.append(json.dumps({"type": "node", "data": node}, ensure_ascii=False))
            for edge in data['edges']:
                chunks.append(json.dumps({"type": "edge", "data": edge}, ensure_ascii=False))
        else:
            for key, value in data.items():
                chunks.append(f"{key}: {json.dumps(value, ensure_ascii=False)}")
    else:
        chunks.append(str(data))
    return chunks

def generate_domain_summary(domain_name, chunks):
    """Genera un resumen 'inteligente' (simulado) para un dominio"""
    count = len(chunks)
    timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
    return f"Resumen del dominio {domain_name}:\n\n- Total de chunks procesados: {count}\n- Última actualización: {timestamp}\n- Estado: Optimizado para RAG v8.0\n\nEste resumen modular evita la saturación de la ventana de contexto al proporcionar una visión general de alto nivel del dominio {domain_name}."

def main():
    print("Executing Phase 14: AI Retrieval Context System...")

    # Ensure directories exist
    os.makedirs(EMB_PATH, exist_ok=True)
    os.makedirs(SUMMARIES_PATH, exist_ok=True)
    os.makedirs(IDX_PATH, exist_ok=True)

    artifacts_to_process = {
        "components.json": "Domain Logic",
        "views.json": "UI Flow",
        "workflows.json": "Business Processes",
        "user_help.json": "User Documentation",
        "knowledge_graph.json": "Semantic Graph"
    }

    all_index_entries = []

    # 1. Process structured Knowledge
    for filename, domain in artifacts_to_process.items():
        path = os.path.join(KNOWLEDGE_DIR, filename)
        if not os.path.exists(path):
            print(f"Warning: Artifact not found: {path}")
            continue

        print(f"Processing structured artifact: {filename}")
        with open(path, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError:
                print(f"Error: Failed to parse {filename}")
                continue

        chunks = process_json_artifact(filename, data)

        domain_chunks_text = []
        for i, chunk in enumerate(chunks):
            chunk_id = f"{filename.split('.')[0]}_chunk_{i}"
            vector = fake_embed(chunk)

            emb_file = f"{chunk_id}.npy"
            np.save(os.path.join(EMB_PATH, emb_file), vector)

            meta = {
                "id": chunk_id,
                "source": filename,
                "domain": domain,
                "vectorDimension": 128,
                "model": "fake-embed-v1",
                "createdAt": datetime.now(timezone.utc).isoformat() + 'Z'
            }
            with open(os.path.join(EMB_PATH, f"{chunk_id}.meta.json"), 'w', encoding='utf-8') as f_meta:
                json.dump(meta, f_meta, indent=2)

            all_index_entries.append({
                "id": chunk_id,
                "artifactName": filename,
                "embeddingPath": os.path.join(EMB_PATH, emb_file),
                "domain": domain,
                "createdAt": meta["createdAt"]
            })
            domain_chunks_text.append(chunk)

        # Generate Domain Summary
        summary = generate_domain_summary(domain, domain_chunks_text)
        summary_filename = f"{domain.lower().replace(' ', '_')}_summary.md"
        summary_path = os.path.join(SUMMARIES_PATH, summary_filename)
        with open(summary_path, 'w', encoding='utf-8') as f_sum:
            f_sum.write(f"# Summary: {domain}\n\n{summary}")

    # 2. Process Markdown Documentation
    print("Processing Markdown documentation...")
    doc_paths = glob.glob(f"{KNOWLEDGE_DIR}docs/**/*.md", recursive=True) + glob.glob(f"{KNOWLEDGE_DIR}iso_manual/*.md")
    for doc_path in doc_paths:
        with open(doc_path, 'r', encoding='utf-8') as f:
            content = f.read()

        chunks = chunk_text(content)
        base_name = os.path.basename(doc_path).replace('.md', '')
        rel_path = os.path.relpath(doc_path, KNOWLEDGE_DIR).replace('/', '_').replace('.md', '')

        for i, chunk in enumerate(chunks):
            chunk_id = f"doc_{rel_path}_chunk_{i}"
            vector = fake_embed(chunk)
            emb_file = f"{chunk_id}.npy"
            np.save(os.path.join(EMB_PATH, emb_file), vector)

            meta = {
                "id": chunk_id,
                "source": doc_path,
                "domain": "Documentation",
                "vectorDimension": 128,
                "model": "fake-embed-v1",
                "createdAt": datetime.now(timezone.utc).isoformat() + 'Z'
            }
            with open(os.path.join(EMB_PATH, f"{chunk_id}.meta.json"), 'w', encoding='utf-8') as f_meta:
                json.dump(meta, f_meta, indent=2)

            all_index_entries.append({
                "id": chunk_id,
                "artifactName": base_name,
                "embeddingPath": os.path.join(EMB_PATH, emb_file),
                "domain": "Documentation",
                "createdAt": meta["createdAt"]
            })
            domain_chunks_text.append(chunk)

    # Generate Documentation Summary
    doc_summary = generate_domain_summary("Documentation", domain_chunks_text)
    with open(os.path.join(SUMMARIES_PATH, "documentation_summary.md"), 'w', encoding='utf-8') as f_sum:
        f_sum.write(f"# Summary: Documentation\n\n{doc_summary}")

    # 3. Build Vector Index Metadata
    index_meta = {
        "indexVersion": "1.0.0",
        "totalEntries": len(all_index_entries),
        "shards": 1,
        "entries": all_index_entries,
        "builtAt": datetime.now(timezone.utc).isoformat() + 'Z',
        "lastUpdated": datetime.now(timezone.utc).isoformat() + 'Z'
    }

    # Save to a temporary file for commit_artifact
    temp_index = "/tmp/vector_index.json"
    with open(temp_index, 'w', encoding='utf-8') as f:
        json.dump(index_meta, f, indent=2, ensure_ascii=False)

    # 4. Commit results with Governance
    print("Committing artifacts...")
    res_idx = commit_artifact("vector_index", temp_index, 100.0, 14)
    print(f"Vector Index Commit: {res_idx}")

    # Commit summaries as a directory
    temp_summaries = "/tmp/summaries_commit"
    if os.path.exists(temp_summaries): shutil.rmtree(temp_summaries)
    shutil.copytree(SUMMARIES_PATH, temp_summaries)

    # Pass "summaries" so get_destination_base returns "ai_context/" and joins with "summaries"
    res_sum = commit_artifact("summaries", temp_summaries, 95.0, 14)
    print(f"Summaries Commit: {res_sum}")

    if os.path.exists(temp_index): os.remove(temp_index)
    if os.path.exists(temp_summaries): shutil.rmtree(temp_summaries)

    print(f"PHASE_14_SUCCESS: Generated {len(all_index_entries)} chunks across multiple domains.")

if __name__ == "__main__":
    main()
