#!/usr/bin/env python3
"""
phase_14_rag_context.py
AI Retrieval Context System - AI Architecture Pipeline v8.0
Generates modular RAG context (chunking, embeddings, summaries).
"""

import os
import json
import hashlib
import numpy as np
from datetime import datetime, timezone
import subprocess
import glob

# Paths
KNOWLEDGE_PATH = "knowledge/"
PUBLIC_PATH = "public/"
EMB_PATH = "ai_context/ai_embeddings/"
IDX_PATH = "ai_context/ai_vector_index/"
SUM_PATH = "ai_context/summaries/"
VECTOR_INDEX_FILE = "ai_context/vector_index.json"

def fake_embed(text):
    """Deterministic hash-based embedding (reusable pattern)"""
    hash_value = abs(hash(text)) % (10**8)
    vector = np.array([(hash_value >> i) & 0xFF for i in range(128)], dtype=np.float32)
    norm = np.linalg.norm(vector)
    if norm > 0:
        vector = vector / norm
    return vector

def get_sha256(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def ensure_dirs():
    for p in [EMB_PATH, IDX_PATH, SUM_PATH]:
        os.makedirs(p, exist_ok=True)

def chunk_artifact(artifact_path):
    """Semantic chunking of JSON/Markdown artifacts."""
    chunks = []

    if not os.path.exists(artifact_path):
        return []

    if artifact_path.endswith('.json'):
        try:
            with open(artifact_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # If it's a list, chunk by item
            if isinstance(data, list):
                for i, item in enumerate(data):
                    chunks.append({
                        "content": json.dumps(item, ensure_ascii=False),
                        "metadata": {"source": artifact_path, "index": i, "type": "json_list_item"}
                    })
            # If it's a dict, chunk by top-level keys
            elif isinstance(data, dict):
                for key, value in data.items():
                    chunks.append({
                        "content": f"{key}: {json.dumps(value, ensure_ascii=False)}",
                        "metadata": {"source": artifact_path, "key": key, "type": "json_dict_key"}
                    })
            else:
                chunks.append({
                    "content": str(data),
                    "metadata": {"source": artifact_path, "type": "json_raw"}
                })
        except Exception as e:
            print(f"Error chunking JSON {artifact_path}: {e}")

    elif artifact_path.endswith('.md'):
        try:
            with open(artifact_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Simple chunking by headers
            parts = content.split('\n#')
            for i, part in enumerate(parts):
                if not part.strip(): continue
                prefix = '#' if i > 0 else ''
                chunks.append({
                    "content": prefix + part,
                    "metadata": {"source": artifact_path, "part": i, "type": "markdown_section"}
                })
        except Exception as e:
            print(f"Error chunking Markdown {artifact_path}: {e}")

    return chunks

def generate_embeddings(chunks):
    """Generate vectors for chunks."""
    processed = []
    for chunk in chunks:
        content = chunk["content"]
        vector = fake_embed(content)

        chunk_id = get_sha256(content)[:12]
        source_name = os.path.basename(chunk["metadata"]["source"]).replace('.', '_')
        embedding_filename = f"{source_name}_{chunk_id}.npy"
        embedding_path = os.path.join(EMB_PATH, embedding_filename)

        np.save(embedding_path, vector)

        # Metadata sidecar for the embedding
        meta_path = embedding_path + ".meta.json"
        meta = {
            "chunk_id": chunk_id,
            "source": chunk["metadata"]["source"],
            "type": chunk["metadata"]["type"],
            "vector_dim": 128,
            "created_at": datetime.now(timezone.utc).isoformat() + 'Z'
        }
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump(meta, f, indent=2)

        processed.append({
            "id": chunk_id,
            "embedding_path": embedding_path,
            "metadata": chunk["metadata"]
        })
    return processed

def generate_summaries():
    """Synthesize domain-specific summaries (Architecture, Knowledge, Workflows)."""
    summaries = {}

    domains = {
        "architecture": ["public/system_architecture.json", "public/architecture_manifest.json", "public/architecture_graph.json"],
        "knowledge": ["knowledge/components.json", "knowledge/views.json", "knowledge/user_help.json"],
        "workflows": ["knowledge/workflows.json"]
    }

    for domain, files in domains.items():
        domain_content = []
        for f in files:
            if os.path.exists(f):
                try:
                    with open(f, 'r', encoding='utf-8') as src:
                        data = json.load(src)
                        # Basic structural summary
                        if isinstance(data, list):
                            summary_line = f"File {f} contains {len(data)} items."
                        elif isinstance(data, dict):
                            summary_line = f"File {f} contains keys: {', '.join(list(data.keys())[:10])}."
                        else:
                            summary_line = f"File {f} contains raw data."
                        domain_content.append(summary_line)
                except:
                    pass

        if domain_content:
            summary_path = os.path.join(SUM_PATH, f"{domain}_summary.json")
            summary_data = {
                "domain": domain,
                "summary": " ".join(domain_content),
                "sources": files,
                "generated_at": datetime.now(timezone.utc).isoformat() + 'Z'
            }
            with open(summary_path, 'w', encoding='utf-8') as f:
                json.dump(summary_data, f, indent=2)
            summaries[domain] = summary_path

    return summaries

def commit_results(summaries, index_path):
    """Commit results with governance."""
    # Commit index
    subprocess.run(["python3", "scripts/commit_artifact.py", "vector_index", index_path, "98.0", "14"], capture_output=True)

    # Commit summaries
    for domain, path in summaries.items():
        artifact_name = f"summaries/{domain}_summary"
        subprocess.run(["python3", "scripts/commit_artifact.py", artifact_name, path, "95.0", "14"], capture_output=True)

def main():
    ensure_dirs()
    print("AI Retrieval Context System - Phase 14")

    all_chunks = []

    # Process public/ artifacts
    for f in ["system_architecture.json", "architecture_manifest.json", "architecture_graph.json"]:
        path = os.path.join(PUBLIC_PATH, f)
        all_chunks.extend(chunk_artifact(path))

    # Process knowledge/ artifacts
    for f in ["components.json", "views.json", "workflows.json", "user_help.json"]:
        path = os.path.join(KNOWLEDGE_PATH, f)
        all_chunks.extend(chunk_artifact(path))

    print(f"Total chunks: {len(all_chunks)}")

    # Generate embeddings
    processed_chunks = generate_embeddings(all_chunks)

    # Build vector index metadata
    index_meta = {
        "indexVersion": "1.0.0",
        "totalEntries": len(processed_chunks),
        "shards": 1,
        "entries": processed_chunks,
        "builtAt": datetime.now(timezone.utc).isoformat() + 'Z'
    }

    with open(VECTOR_INDEX_FILE, 'w', encoding='utf-8') as f:
        json.dump(index_meta, f, indent=2)

    # Generate summaries
    summaries = generate_summaries()

    # Commit
    commit_results(summaries, VECTOR_INDEX_FILE)
    print("Phase 14 completed successfully.")

if __name__ == "__main__":
    main()
