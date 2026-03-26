#!/usr/bin/env python3
"""
rag_indexer.py (v8.1.0 Stable)
CostPro RAG Indexer - Incremental & Stable
- Delta Detection (sha256)
- Correct Partial State Persistence (File-level)
- Stability Rule (Time limit + Checkpoint)
- Error Tolerance (Retries + Degraded Status)
"""

import os
import json
import hashlib
import numpy as np
import time
from datetime import datetime, timezone
import sys
import subprocess
import glob
import yaml

# Configuración
STATE_PATH = "docs/automation/pipeline_state.yaml"
PREVIOUS_HASHES_FILE = "ai_context/previous_hashes.json"
EMB_PATH = "ai_context/ai_embeddings/"
IDX_PATH = "ai_context/ai_vector_index/"
INDEX_META_FILE = os.path.join(IDX_PATH, "index.meta.json")
STATS_FILE = "ai_context/vector_index_stats.json"
REVIEW_QUEUE = "docs/automation/review_queue.json"

JSON_ARTIFACTS = ["knowledge/components.json", "knowledge/views.json", "knowledge/workflows.json", "knowledge/user_help.json"]
MD_DIRS = ["knowledge/docs/explanation/", "knowledge/docs/how-to/", "knowledge/docs/reference/", "knowledge/docs/tutorials/", "knowledge/iso_manual/"]

TIME_LIMIT_SEC = 480
START_TIME = time.time()

def load_json(path, default=None):
    if not os.path.exists(path): return default if default is not None else {}
    try:
        with open(path, 'r', encoding='utf-8') as f: return json.load(f)
    except: return default if default is not None else {}

def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def get_file_hash(path):
    if not os.path.exists(path): return None
    hasher = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b""): hasher.update(chunk)
    return hasher.hexdigest()

def fake_embed_with_retry(text, max_attempts=3):
    for attempt in range(max_attempts):
        try:
            # Deterministic vector simulation
            h = int(hashlib.sha256(text.encode('utf-8')).hexdigest(), 16) % (10**8)
            v = np.array([(h >> i) & 0xFF for i in range(128)], dtype=np.float32)
            norm = np.linalg.norm(v)
            return v / norm if norm > 0 else v
        except Exception as e:
            if attempt == max_attempts - 1: raise e
            time.sleep(1)

def chunk_file(fpath):
    if fpath.endswith('.json'):
        data = load_json(fpath, [])
        base = os.path.basename(fpath).split('.')[0]
        chunks = []
        if isinstance(data, list):
            for i, item in enumerate(data):
                sid = "".join(c if c.isalnum() else "_" for c in str(item.get('id', item.get('name', i))))
                chunks.append({"id": f"{base}_{sid}", "content": json.dumps(item, sort_keys=True), "metadata": {"source": fpath, "index": i, "domain": base}})
        elif isinstance(data, dict):
            for k, v in data.items():
                chunks.append({"id": f"{base}_{k}", "content": json.dumps({k: v}, sort_keys=True), "metadata": {"source": fpath, "key": k, "domain": base}})
        return chunks
    elif fpath.endswith('.md'):
        with open(fpath, 'r') as f: lines = f.readlines()
        chunks, curr_h, curr_c = [], "Intro", []
        base = os.path.basename(fpath).split('.')[0]
        for line in lines:
            if line.startswith('#'):
                if curr_c:
                    slug = "".join(c if c.isalnum() else "_" for c in curr_h.lower())
                    chunks.append({"id": f"{base}_{slug}", "content": "".join(curr_c), "metadata": {"source": fpath, "header": curr_h}})
                    curr_c = []
                curr_h = line.strip('#').strip()
            curr_c.append(line)
        if curr_c:
            slug = "".join(c if c.isalnum() else "_" for c in curr_h.lower())
            chunks.append({"id": f"{base}_{slug}_end", "content": "".join(curr_c), "metadata": {"source": fpath, "header": curr_h}})
        return chunks
    return []

def append_review_queue(issue_type, message):
    queue = load_json(REVIEW_QUEUE, {"queue": [], "metadata": {"totalReviews": 0, "pendingReviews": 0}})
    entry = {
        "id": f"rag-issue-{int(time.time())}",
        "type": issue_type,
        "message": message,
        "status": "open",
        "createdAt": datetime.now(timezone.utc).isoformat() + 'Z'
    }
    queue["queue"].append(entry)
    queue["metadata"]["pendingReviews"] += 1
    queue["metadata"]["totalReviews"] += 1
    save_json(REVIEW_QUEUE, queue)

def main():
    print("--- Phase 14: RAG Indexer (v8.1.0 Stable) ---")
    state = load_json(STATE_PATH)
    rag_conf = state.get("rag_engine", {})
    batch_size = rag_conf.get("batch_size", 50)

    master_index = load_json(INDEX_META_FILE, {"entries": []})
    master_entries = {e["id"]: e for e in master_index.get("entries", [])}

    prev_hashes = load_json(PREVIOUS_HASHES_FILE)
    curr_hashes = prev_hashes.copy()

    all_files = []
    for art in JSON_ARTIFACTS: all_files.append(art)
    for d in MD_DIRS: all_files.extend(glob.glob(os.path.join(d, "*.md")))

    modified_files = [f for f in all_files if get_file_hash(f) != prev_hashes.get(f)]
    if not modified_files:
        print("NO_CHANGES: Todo al día.")
        sys.exit(0)

    print(f"Archivos detectados: {len(modified_files)}")
    checkpoint_reached = False
    processed_files_count = 0
    total_processed_chunks = 0

    for fpath in modified_files:
        if time.time() - START_TIME > TIME_LIMIT_SEC:
            print(f"CHECKPOINT: Tiempo límite excedido antes de {fpath}")
            checkpoint_reached = True
            break

        file_chunks = chunk_file(fpath)
        # Limpiar entradas previas de este archivo en el índice maestro
        stale = [cid for cid, e in master_entries.items() if e["metadata"]["source"] == fpath]
        for sid in stale: del master_entries[sid]

        file_success = True
        for i in range(0, len(file_chunks), batch_size):
            batch = file_chunks[i:i+batch_size]
            for chunk in batch:
                try:
                    v = fake_embed_with_retry(chunk["content"])
                    c_hash = hashlib.md5(chunk["id"].encode()).hexdigest()[:12]
                    e_path = os.path.join(EMB_PATH, f"emb_{c_hash}.npy")
                    np.save(e_path, v)

                    info_path = os.path.join(EMB_PATH, f"chunk_{c_hash}.json")
                    save_json(info_path, chunk)

                    master_entries[chunk["id"]] = {"id": chunk["id"], "embeddingPath": e_path, "chunkPath": info_path, "metadata": chunk["metadata"]}
                    total_processed_chunks += 1
                except Exception as e:
                    print(f"ERROR en {chunk['id']}: {e}")
                    file_success = False
                    break
            if not file_success: break

        if file_success:
            curr_hashes[fpath] = get_file_hash(fpath)
            processed_files_count += 1
        else:
            checkpoint_reached = True
            break

    # Guardar Estado
    save_json(INDEX_META_FILE, {
        "indexVersion": "1.1.0",
        "totalEntries": len(master_entries),
        "entries": list(master_entries.values()),
        "builtAt": datetime.now(timezone.utc).isoformat() + 'Z',
        "status": "partial" if checkpoint_reached else "success"
    })
    save_json(PREVIOUS_HASHES_FILE, curr_hashes)

    stats = {
        "last_update": datetime.now(timezone.utc).isoformat() + 'Z',
        "files_indexed": processed_files_count,
        "chunks_processed": total_processed_chunks,
        "total_index_size": len(master_entries),
        "checkpoint_reached": checkpoint_reached
    }
    save_json(STATS_FILE, stats)

    # Gobernanza
    subprocess.run(["python3", "scripts/commit_artifact.py", "ai_context/vector_index_stats", STATS_FILE, "100.0", "14"])
    subprocess.run(["python3", "scripts/commit_artifact.py", "ai_context/ai_vector_index", INDEX_META_FILE, "100.0", "14"])

    if checkpoint_reached:
        append_review_queue("RAG_PARTIAL", f"Indexación incompleta por tiempo o error. Procesados {processed_files_count} archivos.")
        print("EXIT_STATUS: partial")
    else:
        print(f"EXIT_STATUS: success. Procesados {processed_files_count} archivos.")

if __name__ == "__main__":
    main()
