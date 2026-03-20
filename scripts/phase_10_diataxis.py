import os
import shutil
import sys
import subprocess
import re
from datetime import datetime, timezone

# Add scripts to path for commit_artifact
sys.path.append('scripts')
try:
    from commit_artifact import commit_artifact
except ImportError:
    print("Error: No se pudo importar commit_artifact.py")
    sys.exit(1)

# Categorías Diátaxis
CATEGORIES = {
    "tutorials": {
        "keywords": ["paso a paso", "tutorial", "guía básica", "primeros pasos", "pasos", "step by step", "aprende"],
        "paths": ["docs/guides/"],
        "priority": 1
    },
    "how-to": {
        "keywords": ["cómo", "how to", "procedimiento", "tarea", "guía de uso", "checklist", "instrucciones", "manual", "procedimientos"],
        "paths": ["docs/guides/", "docs/features/"],
        "priority": 2
    },
    "reference": {
        "keywords": ["especificación", "referencia", "esquema", "api", "parámetros", "técnico", "schema", "database", "model", "rules", "audit", "technical", "migración"],
        "paths": ["docs/technical/", "docs/audits/", "docs/ipv/", "docs/ai/"],
        "priority": 3
    },
    "explanation": {
        "keywords": ["conceptos", "arquitectura", "decisiones", "porque", "visión", "filosofía", "explicación", "background", "theory", "reasoning", "strategy", "estrategia", "diseño"],
        "paths": ["docs/architecture/", "docs/technical/"],
        "priority": 4
    }
}

def classify_doc(file_path, content):
    content_lower = content.lower()
    path_lower = file_path.lower()

    scores = {cat: 0 for cat in CATEGORIES}

    for cat, rules in CATEGORIES.items():
        # Score based on keywords
        for kw in rules["keywords"]:
            if kw in content_lower:
                scores[cat] += 2

        # Score based on path
        for p in rules["paths"]:
            if p in path_lower:
                scores[cat] += 3

    # Default to explanation if no clear winner, but pick the highest score
    best_cat = max(scores, key=scores.get)
    if scores[best_cat] == 0:
        if "audit" in path_lower:
            return "reference"
        return "explanation"

    return best_cat

def main():
    print("Executing Phase 10: Diátaxis Documentation Layer...")

    base_docs_dir = "docs"
    output_base = "knowledge/docs"
    temp_base = "/tmp/diataxis_output"

    if os.path.exists(temp_base):
        shutil.rmtree(temp_base)
    os.makedirs(temp_base, exist_ok=True)

    # Categories directories in temp
    for cat in CATEGORIES:
        os.makedirs(os.path.join(temp_base, cat), exist_ok=True)

    doc_count = 0
    classified = {cat: 0 for cat in CATEGORIES}

    # Scan for markdown files
    for root, dirs, files in os.walk(base_docs_dir):
        # Skip quarantine and archive
        if "quarantine" in root or "archive" in root:
            continue

        for file in files:
            if file.endswith(".md"):
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()

                    category = classify_doc(file_path, content)
                    dest_path = os.path.join(temp_base, category, file)

                    # If file exists, append a suffix to avoid collision
                    if os.path.exists(dest_path):
                        name, ext = os.path.splitext(file)
                        dest_path = os.path.join(temp_base, category, f"{name}_{doc_count}{ext}")

                    shutil.copy2(file_path, dest_path)
                    classified[category] += 1
                    doc_count += 1
                except Exception as e:
                    print(f"Error processing {file_path}: {e}")

    print(f"Classified {doc_count} documents: {classified}")

    # Commit artifacts for each category
    overall_status = "success"
    for cat in CATEGORIES:
        cat_temp_dir = os.path.join(temp_base, cat)
        if not os.listdir(cat_temp_dir):
            print(f"Aviso: No se encontraron documentos para {cat}")
            continue

        # Artifact name format: docs/tutorials, docs/how-to, etc.
        artifact_name = f"docs/{cat}"
        res = commit_artifact(artifact_name, cat_temp_dir, 92.0, 10)
        print(f"Commit {artifact_name}: {res}")
        if res == "error":
            overall_status = "failed"

    # Cleanup temp
    if os.path.exists(temp_base):
        shutil.rmtree(temp_base)

    print(f"Phase 10 Complete. Status: {overall_status}")

if __name__ == "__main__":
    main()
