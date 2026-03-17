import json
import os
import shutil
import sys
import hashlib
from datetime import datetime, timezone
import yaml

# Configuration
STATE_PATH = "docs/automation/pipeline_state.yaml"
AUDIT_PATH = "public/architecture_audit.json"

def load_config():
    with open(STATE_PATH, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

def canonical_json(obj):
    return json.dumps(obj, separators=(',', ':'), sort_keys=True, ensure_ascii=False)

def sha256_hex(s):
    return hashlib.sha256(s.encode('utf-8')).hexdigest()

def load_meta(name, config):
    meta_path = os.path.join(config["metadataStore"], f"{name}.meta.json")
    if os.path.exists(meta_path):
        with open(meta_path, 'r', encoding='utf-8') as f:
            try:
                return json.load(f)
            except:
                return None
    return None

def bump_version(meta):
    if not meta:
        return "1.0.0"
    version = meta.get("version", "1.0.0").split('.')
    while len(version) < 3: version.append("0")
    major, minor, patch = map(int, version)
    patch += 1
    return f"{major}.{minor}.{patch}"

def append_review_queue(entry, config):
    queue_path = config["reviewQueue"]
    queue = {"queue": [], "metadata": {"totalReviews": 0, "pendingReviews": 0}}
    if os.path.exists(queue_path):
        with open(queue_path, 'r', encoding='utf-8') as f:
            try:
                queue = json.load(f)
            except:
                pass
    queue["queue"].append(entry)
    queue["metadata"]["pendingReviews"] = queue["metadata"].get("pendingReviews", 0) + 1
    queue["metadata"]["totalReviews"] = queue["metadata"].get("totalReviews", 0) + 1
    queue["metadata"]["lastUpdated"] = datetime.now(timezone.utc).isoformat() + 'Z'
    with open(queue_path, 'w', encoding='utf-8') as f:
        json.dump(queue, f, indent=2, ensure_ascii=False)

def rollback_artifact(name, config):
    """Restores the last version from archive if integrity fails"""
    meta = load_meta(name, config)
    if not meta or not meta.get("previousVersions"):
        print(f"ROLLBACK FAILED: No previous version for {name}")
        return False

    last_v = meta["previousVersions"][-1]
    short_hash = last_v["hash"].replace("sha256:", "")[:6]
    archive_name = f"{name}-{last_v['version']}+{short_hash}.json"
    archive_path = os.path.join(config["archiveStore"], archive_name)

    if os.path.exists(archive_path):
        dest_path = os.path.join(config["artifactStore"], f"{name}.json")
        shutil.copy2(archive_path, dest_path)
        print(f"ROLLBACK SUCCESSFUL: Restored {name} v{last_v['version']}")
        return True
    return False

def commit_artifact(name, artifact_path, confidence_score, source_phase, created_by="architecture-scheduler/8.0"):
    config = load_config()

    # Load artifact
    with open(artifact_path, 'r', encoding='utf-8') as f:
        artifact = json.load(f)

    # Integrity Check (Rule 4) - Simplified for this context:
    # If the file is empty or missing critical keys, it's a candidate for immediate rollback if we were replacing.
    # Here we check BEFORE committing.
    if not artifact or (isinstance(artifact, dict) and len(artifact) == 0):
        print(f"INTEGRITY ALERT: Artifact {name} is empty. Triggering rollback logic...")
        if rollback_artifact(name, config):
            return "rolled_back"
        return "failed_integrity"

    canonical = canonical_json(artifact)
    hash_value = sha256_hex(canonical)
    meta = load_meta(name, config)
    version = bump_version(meta)

    meta_obj = {
        "artifactName": name,
        "version": version,
        "hash": f"sha256:{hash_value}",
        "createdAt": datetime.now(timezone.utc).isoformat() + 'Z',
        "createdBy": created_by,
        "sourcePhase": int(source_phase),
        "confidenceScore": float(confidence_score),
        "confidenceModel": "ai-arch-v8.0",
        "reviewRequired": False,
        "provenance": {"inputs": [], "tools": [created_by]},
        "explainabilitySummary": f"Generado automáticamente en Fase {source_phase}",
        "previousVersions": meta.get("previousVersions", []) if meta else []
    }

    if meta:
        meta_obj["previousVersions"].append({
            "version": meta.get("version"),
            "hash": meta.get("hash"),
            "createdAt": meta.get("createdAt")
        })

    os.makedirs(config["metadataStore"], exist_ok=True)
    meta_path = os.path.join(config["metadataStore"], f"{name}.meta.json")

    # Quarantine (Rule 1)
    if float(confidence_score) < config["confidenceThreshold"]:
        short_hash = hash_value[:6]
        quarantine_name = f"{name}-{version}+{short_hash}.json"
        quarantine_path = os.path.join(config["quarantinePath"], quarantine_name)
        os.makedirs(os.path.dirname(quarantine_path), exist_ok=True)
        shutil.copy2(artifact_path, quarantine_path)
        meta_obj["reviewRequired"] = True
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump(meta_obj, f, indent=2, ensure_ascii=False)
        append_review_queue({
            "id": f"rq-{name}-{version}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
            "artifactName": name,
            "candidatePath": quarantine_path,
            "metaPath": meta_path,
            "confidenceScore": float(confidence_score),
            "createdAt": meta_obj["createdAt"],
            "status": "open",
            "priority": "high" if float(confidence_score) < 70 else "normal"
        }, config)
        print(f"QUARANTINED: {quarantine_path}")
        return "quarantined"

    # Successful Commit
    dest_path = os.path.join(config["artifactStore"], f"{name}.json")
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    shutil.copy2(artifact_path, dest_path)

    archive_name = f"{name}-{version}+{hash_value[:6]}.json"
    archive_path = os.path.join(config["archiveStore"], archive_name)
    os.makedirs(config["archiveStore"], exist_ok=True)
    shutil.copy2(artifact_path, archive_path)

    meta_obj["reviewRequired"] = False
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta_obj, f, indent=2, ensure_ascii=False)

    print(f"COMMITTED: {dest_path}")
    return "committed"

if __name__ == "__main__":
    if len(sys.argv) < 5:
        sys.exit(1)
    commit_artifact(sys.argv[1], sys.argv[2], float(sys.argv[3]), int(sys.argv[4]))
