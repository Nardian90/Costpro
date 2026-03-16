#!/usr/bin/env python3
"""
commit_artifact.py
Gestiona commit de artefactos con gobernanza completa
Uso: python commit_artifact.py <artifact_name> <artifact_path> <confidence_score> <source_phase>
"""

import json
import os
import shutil
import sys
import hashlib
from datetime import datetime, timezone

# Configuración desde pipeline_state.yaml
STATE = {
    "artifactStore": "public/",
    "metadataStore": "public/_meta/",
    "archiveStore": "public/_archive/",
    "quarantinePath": "docs/automation/quarantine/",
    "reviewQueue": "docs/automation/review_queue.json",
    "confidenceThreshold": 90
}

def canonical_json(obj):
    return json.dumps(obj, separators=(',', ':'), sort_keys=True, ensure_ascii=False)

def sha256_hex(s):
    return hashlib.sha256(s.encode('utf-8')).hexdigest()

def load_meta(name):
    """Carga metadata existente del artefacto"""
    meta_path = os.path.join(STATE["metadataStore"], f"{name}.meta.json")
    if os.path.exists(meta_path):
        with open(meta_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None

def bump_version(meta):
    """Incrementa versión semántica"""
    if not meta:
        return "1.0.0"
    version = meta.get("version", "0.0.0").split('.')
    major, minor, patch = map(int, version)
    patch += 1
    return f"{major}.{minor}.{patch}"

def append_review_queue(entry):
    """Añade entrada a cola de revisión"""
    queue_path = STATE["reviewQueue"]
    queue = {"queue": [], "metadata": {"totalReviews": 0, "pendingReviews": 0}}

    if os.path.exists(queue_path):
        with open(queue_path, 'r', encoding='utf-8') as f:
            queue = json.load(f)

    queue["queue"].append(entry)
    queue["metadata"]["pendingReviews"] += 1
    queue["metadata"]["totalReviews"] += 1
    queue["metadata"]["lastUpdated"] = datetime.now(timezone.utc).isoformat() + 'Z'

    with open(queue_path, 'w', encoding='utf-8') as f:
        json.dump(queue, f, indent=2, ensure_ascii=False)

def commit_artifact(name, artifact_path, confidence_score, source_phase, created_by="architecture-scheduler/8.0"):
    """Commit de artefacto con gobernanza completa"""

    # Cargar artefacto
    with open(artifact_path, 'r', encoding='utf-8') as f:
        artifact = json.load(f)

    # Calcular hash
    canonical = canonical_json(artifact)
    hash_value = sha256_hex(canonical)

    # Cargar metadata existente
    meta = load_meta(name)
    version = bump_version(meta)

    # Construir metadata
    meta_obj = {
        "artifactName": name,
        "version": version,
        "hash": f"sha256:{hash_value}",
        "createdAt": datetime.now(timezone.utc).isoformat() + 'Z',
        "createdBy": created_by,
        "sourcePhase": source_phase,
        "confidenceScore": confidence_score,
        "confidenceModel": "ai-arch-v8.0",
        "reviewRequired": False,
        "provenance": {
            "inputs": [],
            "tools": ["architecture-scheduler/8.0"]
        },
        "explainabilitySummary": f"Generado automáticamente en Fase {source_phase}",
        "previousVersions": meta.get("previousVersions", []) if meta else []
    }

    # Añadir versión anterior al histórico
    if meta:
        meta_obj["previousVersions"].append({
            "version": meta.get("version"),
            "hash": meta.get("hash"),
            "createdAt": meta.get("createdAt")
        })

    meta_path = os.path.join(STATE["metadataStore"], f"{name}.meta.json")

    # Decisión: commit o cuarentena
    if confidence_score < STATE["confidenceThreshold"]:
        # Cuarentena
        short_hash = hash_value[:6]
        quarantine_name = f"{name}-{version}+{short_hash}.json"
        quarantine_path = os.path.join(STATE["quarantinePath"], quarantine_name)

        os.makedirs(os.path.dirname(quarantine_path), exist_ok=True)
        shutil.copy2(artifact_path, quarantine_path)

        meta_obj["reviewRequired"] = True

        # Guardar metadata
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump(meta_obj, f, indent=2, ensure_ascii=False)

        # Añadir a review queue
        append_review_queue({
            "id": f"rq-{name}-{version}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
            "artifactName": name,
            "candidatePath": quarantine_path,
            "metaPath": meta_path,
            "confidenceScore": confidence_score,
            "createdAt": meta_obj["createdAt"],
            "status": "open",
            "priority": "high" if confidence_score < 70 else "normal"
        })

        print(f"QUARANTINED: {quarantine_path}")
        return "quarantined"

    # Commit exitoso
    dest_path = os.path.join(STATE["artifactStore"], f"{name}.json")
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    shutil.copy2(artifact_path, dest_path)

    # Copia a archivo
    archive_name = f"{name}-{version}+{hash_value[:6]}.json"
    archive_path = os.path.join(STATE["archiveStore"], archive_name)
    os.makedirs(STATE["archiveStore"], exist_ok=True)
    shutil.copy2(artifact_path, archive_path)

    meta_obj["reviewRequired"] = False

    # Guardar metadata
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta_obj, f, indent=2, ensure_ascii=False)

    print(f"COMMITTED: {dest_path}")
    print(f"ARCHIVED: {archive_path}")
    return "committed"

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("Uso: python commit_artifact.py <artifact_name> <artifact_path> <confidence_score> <source_phase>")
        sys.exit(1)

    name = sys.argv[1]
    path = sys.argv[2]
    confidence = float(sys.argv[3])
    phase = int(sys.argv[4])

    commit_artifact(name, path, confidence, phase)
