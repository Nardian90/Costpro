import json
import os
import sys
import shutil
from datetime import datetime, timezone

# Add scripts to path for commit_artifact
sys.path.append('scripts')
try:
    from commit_artifact import commit_artifact
except ImportError:
    print("Error: No se pudo importar commit_artifact.py")
    sys.exit(1)

def load_json(path):
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            try:
                return json.load(f)
            except:
                return []
    return []

def main():
    print("Executing Phase 12: ISO/IEC 26514 Manual Generation...")

    knowledge_dir = "knowledge"
    workflows = load_json(os.path.join(knowledge_dir, "workflows.json"))
    views = load_json(os.path.join(knowledge_dir, "views.json"))
    user_help = load_json(os.path.join(knowledge_dir, "user_help.json"))

    temp_manual_dir = "/tmp/iso_manual"
    if os.path.exists(temp_manual_dir):
        shutil.rmtree(temp_manual_dir)
    os.makedirs(temp_manual_dir)

    # 1. introduction.md
    with open(os.path.join(temp_manual_dir, "introduction.md"), 'w', encoding='utf-8') as f:
        f.write("# Introducción\n\n")
        f.write("Este manual proporciona la documentación de usuario para el sistema CostPro, diseñada conforme al estándar ISO/IEC 26514.\n\n")
        f.write("CostPro es una plataforma de ingeniería de IA empresarial orientada a la gestión de costos, inventarios y conciliación financiera inteligente.\n")

    # 2. system_overview.md
    with open(os.path.join(temp_manual_dir, "system_overview.md"), 'w', encoding='utf-8') as f:
        f.write("# Descripción General del Sistema\n\n")
        f.write("CostPro integra múltiples módulos para optimizar la eficiencia operativa:\n\n")
        for wf in workflows:
            f.write(f"## {wf.get('name')}\n")
            f.write(f"{wf.get('business_goal', 'Optimización de procesos de negocio.')}\n\n")

    # 3. user_tasks.md
    with open(os.path.join(temp_manual_dir, "user_tasks.md"), 'w', encoding='utf-8') as f:
        f.write("# Tareas del Usuario\n\n")
        f.write("Guía rápida de funcionalidades principales y sus propósitos:\n\n")
        for entry in user_help:
            f.write(f"## {entry.get('feature')}\n")
            f.write(f"**Propósito:** {entry.get('descripcion_usuario')}\n\n")
            if entry.get('acciones'):
                f.write("**Acciones clave:**\n")
                for action in entry.get('acciones'):
                    f.write(f"- {action}\n")
                f.write("\n")

    # 4. procedures.md
    with open(os.path.join(temp_manual_dir, "procedures.md"), 'w', encoding='utf-8') as f:
        f.write("# Procedimientos paso a paso\n\n")
        for wf in workflows:
            f.write(f"## Procedimiento: {wf.get('name')}\n")
            steps = wf.get('steps', [])
            for i, step in enumerate(steps, 1):
                f.write(f"{i}. {step}\n")
            f.write("\n")

    # 5. reference.md
    with open(os.path.join(temp_manual_dir, "reference.md"), 'w', encoding='utf-8') as f:
        f.write("# Referencia de Interfaces\n\n")
        for view in views:
            f.write(f"## {view.get('name')}\n")
            f.write(f"**Ruta:** `{view.get('route')}`\n\n")
            if view.get('actions'):
                f.write("**Acciones disponibles:** " + ", ".join(view.get('actions')) + "\n\n")
            if view.get('outputs'):
                f.write("**Salidas esperadas:** " + ", ".join(view.get('outputs')) + "\n\n")

    # 6. glossary.md
    with open(os.path.join(temp_manual_dir, "glossary.md"), 'w', encoding='utf-8') as f:
        f.write("# Glosario de términos\n\n")
        glossary = {
            "IPV": "Control de Inventario y Ventas. Módulo central para la reconciliación.",
            "Matching Engine": "Conciliador Inteligente que cruza datos bancarios con ventas.",
            "Decomposition": "Desglose de productos de un nivel superior (ej. Caja) a uno inferior (ej. Unidad).",
            "Cost Sheet": "Ficha de Costo para el cálculo de rentabilidad y precios.",
            "Bank Ingestion": "Proceso de carga y normalización de extractos bancarios."
        }
        for term, definition in glossary.items():
            f.write(f"**{term}:** {definition}\n\n")

    # Commit artifact (directory)
    res = commit_artifact("iso_manual", temp_manual_dir, 98.0, 12)
    print(f"Phase 12 result: {res}")

    if os.path.exists(temp_manual_dir):
        shutil.rmtree(temp_manual_dir)

if __name__ == "__main__":
    main()
