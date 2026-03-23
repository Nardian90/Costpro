#!/usr/bin/env python3
import os
import json
import numpy as np

def verify_phase_14():
    print("Verifying Phase 14 outputs...")

    # 1. Check directories
    dirs = ["ai_context/ai_embeddings/", "ai_context/summaries/", "ai_context/ai_vector_index/"]
    for d in dirs:
        if not os.path.exists(d):
            print(f"FAILED: Directory {d} not found.")
            return False
        print(f"OK: Directory {d} exists.")

    # 2. Check summaries
    summaries = os.listdir("ai_context/summaries/")
    if not summaries:
        print("FAILED: No summaries generated.")
        return False
    print(f"OK: Found {len(summaries)} summaries.")

    # 3. Check embeddings
    embeddings = [f for f in os.listdir("ai_context/ai_embeddings/") if f.endswith('.npy')]
    if not embeddings:
        print("FAILED: No embeddings generated.")
        return False
    print(f"OK: Found {len(embeddings)} embeddings.")

    # 4. Check vector_index.json
    index_path = "ai_context/vector_index.json"
    if not os.path.exists(index_path):
        print("FAILED: ai_context/vector_index.json not found.")
        return False

    with open(index_path, 'r') as f:
        index = json.load(f)
        if "entries" not in index or len(index["entries"]) == 0:
            print("FAILED: Vector index is empty or invalid.")
            return False
        print(f"OK: Vector index contains {len(index['entries'])} entries.")

    # 5. Check metadata sidecars
    meta_files = [f for f in os.listdir("public/_meta/") if "vector_index" in f or "summaries" in f]
    print(f"OK: Found metadata for Phase 14 artifacts: {meta_files}")

    print("\nPHASE 14 VERIFICATION SUCCESSFUL")
    return True

if __name__ == "__main__":
    if verify_phase_14():
        exit(0)
    else:
        exit(1)
