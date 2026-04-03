#!/usr/bin/env python3
"""
commit_artifact.py
Gestiona commit de artefactos con gobernanza completa v8.0
Soporta JSON, Markdown y Directorios.
"""

import json
import os
import shutil
import sys
import hashlib
import yaml
from datetime import datetime, timezone

# Configuration
STATE_PATH = "docs/automation/pipeline_state.yaml"

def load_config():
    config = {
        "artifactStore": "public/",
        "metadataStore": "public/_meta/",
        "archiveStore": "public/_archive/",
        "quarantinePath": "docs/automation/quarantine/",
        "reviewQueue": "docs/automation/review_queue.json",
        "confidenceThreshold": 90
    }
    if os.path.exists(STATE_PATH):
        with open(STATE_PATH, 'r', encoding='utf-8') as f:
            raw = yaml.safe_load(f)
            if raw:
                for key in config.keys():
                    if key in raw:
                        config[key] = raw[key]
                # Also capture any other keys from raw that might be needed
                for key, value in raw.items():
                    if key not in config:
                        config[key] = value
    return config

STATE = load_config()

def get_destination_base(name, source_phase):
    if name == "architecture_audit":
        return "docs/audits/"
    if name in ["system_architecture", "architecture_manifest", "architecture_graph", "architecture_changes", "architecture_metrics"]:
        return STATE.get("artifactStore", "public/")
    if name in ["components", "views", "workflows", "master_user_manual", "user_help"]:
        return "knowledge/"
    if name == "knowledge_graph":
        return "knowledge/"
    if name.startswith("docs/") or name == "iso_manual":
        return "knowledge/"
    if name.startswith("ai_context") or name == "vector_index":
        return "ai_context/"
    if source_phase <= 6: return STATE.get("artifactStore", "public/")
    if source_phase <= 13: return "knowledge/"
    return STATE.get("artifactStore", "public/")

def canonical_json(obj):
    return json.dumps(obj, separators=(',', ':'), sort_keys=True, ensure_ascii=False)

def sha256_hex(s):
    if isinstance(s, str):
        return hashlib.sha256(s.encode('utf-8')).hexdigest()
    return hashlib.sha256(s).hexdigest()

def get_file_hash(path):
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
                return sha256_hex(canonical_json(data))
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

def load_meta(name):
    meta_path = os.path.join(STATE["metadataStore"], f"{name.replace('/', '_')}.meta.json")
    if os.path.exists(meta_path):
        with open(meta_path, 'r', encoding='utf-8') as f:
            try:
                return json.load(f)
            except:
                return None
    return None

def bump_version(meta, current_hash):
    if not meta:
        return "1.0.0"

    if meta.get("hash") == f"sha256:{current_hash}":
        return meta.get("version", "1.0.0")

    version = meta.get("version", "1.0.0").split('.')
    while len(version) < 3: version.append("0")
    major, minor, patch = map(int, version)
    patch += 1
    return f"{major}.{minor}.{patch}"

def append_review_queue(entry):
    queue_path = STATE["reviewQueue"]
    queue = {"queue": [], "metadata": {"totalReviews": 0, "pendingReviews": 0}}
    if os.path.exists(queue_path):
        try:
            with open(queue_path, 'r', encoding='utf-8') as f:
                queue = json.load(f)
        except: pass
    queue["queue"].append(entry)
    queue["metadata"]["pendingReviews"] = queue["metadata"].get("pendingReviews", 0) + 1
    queue["metadata"]["totalReviews"] = queue["metadata"].get("totalReviews", 0) + 1
    queue["metadata"]["lastUpdated"] = datetime.now(timezone.utc).isoformat() + 'Z'
    with open(queue_path, 'w', encoding='utf-8') as f:
        json.dump(queue, f, indent=2, ensure_ascii=False)

def commit_artifact(name, artifact_path, confidence_score, source_phase, created_by="architecture-scheduler/9.0"):
    if not os.path.exists(artifact_path):
        print(f"Error: Artifact path not found: {artifact_path}")
        return "error"

    hash_value = get_file_hash(artifact_path)
    meta = load_meta(name)
    version = bump_version(meta, hash_value)

    meta_obj = {
        "artifactName": name,
        "version": version,
        "hash": f"sha256:{hash_value}",
        "confidenceScore": float(confidence_score),
        "reviewRequired": False,
        "createdAt": datetime.now(timezone.utc).isoformat() + 'Z',
        "sourcePhase": int(source_phase),
        "createdBy": created_by,
        "confidenceModel": "ai-arch-v9.0",
        "provenance": {"inputs": [], "tools": ["architecture-scheduler/9.0"]},
        "explainabilitySummary": f"Generado automáticamente en Fase {source_phase}",
        "previousVersions": meta.get("previousVersions", []) if meta else []
    }

    if meta and meta.get("hash") != f"sha256:{hash_value}":
        meta_obj["previousVersions"].append({
            "version": meta.get("version"),
            "hash": meta.get("hash"),
            "createdAt": meta.get("createdAt")
        })

    os.makedirs(STATE["metadataStore"], exist_ok=True)
    meta_path = os.path.join(STATE["metadataStore"], f"{name.replace('/', '_')}.meta.json")

    confidence_threshold = STATE.get("confidenceThreshold", 90)

    if confidence_score < confidence_threshold:
        short_hash = hash_value[:6]
        ext = os.path.splitext(artifact_path)[1] if not os.path.isdir(artifact_path) else ""
        quarantine_name = f"{name.replace('/', '_')}-{version}+{short_hash}{ext}"
        quarantine_path = os.path.join(STATE["quarantinePath"], quarantine_name)
        os.makedirs(os.path.dirname(quarantine_path), exist_ok=True)
        if os.path.isdir(artifact_path):
            shutil.copytree(artifact_path, quarantine_path, dirs_exist_ok=True)
        else:
            shutil.copy2(artifact_path, quarantine_path)

        meta_obj["reviewRequired"] = True
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump(meta_obj, f, indent=2, ensure_ascii=False)

        append_review_queue({
            "id": f"rq-{name.replace('/', '_')}-{version}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
            "artifactName": name,
            "candidatePath": quarantine_path,
            "metaPath": meta_path,
            "confidenceScore": float(confidence_score),
            "createdAt": meta_obj["createdAt"],
            "status": "open",
            "priority": "high" if confidence_score < 70 else "normal"
        })
        print(f"QUARANTINED: {quarantine_path}")
        return "quarantined"

    dest_base = get_destination_base(name, source_phase)
    ext = os.path.splitext(artifact_path)[1] if not os.path.isdir(artifact_path) else ""
    dest_filename = name if name.endswith(ext) else name + ext
    dest_path = os.path.normpath(os.path.join(dest_base, dest_filename))

    if os.path.isdir(artifact_path):
        if os.path.exists(dest_path):
            shutil.rmtree(dest_path)
        dirname = os.path.dirname(dest_path)
        if dirname:
            os.makedirs(dirname, exist_ok=True)
        shutil.copytree(artifact_path, dest_path)
    else:
        dirname = os.path.dirname(dest_path)
        if dirname:
            os.makedirs(dirname, exist_ok=True)
        shutil.copy2(artifact_path, dest_path)

    short_hash = hash_value[:6]
    archive_name = f"{name.replace('/', '_')}-{version}+{short_hash}{ext}"
    archive_path = os.path.join(STATE["archiveStore"], archive_name)
    os.makedirs(STATE["archiveStore"], exist_ok=True)
    if os.path.isdir(artifact_path):
        if os.path.exists(archive_path):
            shutil.rmtree(archive_path)
        shutil.copytree(artifact_path, archive_path)
    else:
        shutil.copy2(artifact_path, archive_path)

    meta_obj["reviewRequired"] = False
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta_obj, f, indent=2, ensure_ascii=False)

    print(f"COMMITTED: {dest_path}")
    return "committed"

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("Usage: commit_artifact.py <name> <artifact_path> <confidence_score> <source_phase>")
        sys.exit(1)
    commit_artifact(sys.argv[1], sys.argv[2], float(sys.argv[3]), int(sys.argv[4]))
