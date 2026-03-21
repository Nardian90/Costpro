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

def main():
    print("Executing Phase 12: ISO/IEC 26514 Manual Generation...")

    knowledge_dir = "knowledge"
    workflows_path = os.path.join(knowledge_dir, "workflows.json")
    views_path = os.path.join(knowledge_dir, "views.json")
    user_help_path = os.path.join(knowledge_dir, "user_help.json")

    # Load data
    workflows = []
    if os.path.exists(workflows_path):
        with open(workflows_path, 'r', encoding='utf-8') as f:
            workflows = json.load(f)

    views = []
    if os.path.exists(views_path):
        with open(views_path, 'r', encoding='utf-8') as f:
            views = json.load(f)

    user_help = []
    if os.path.exists(user_help_path):
        with open(user_help_path, 'r', encoding='utf-8') as f:
            user_help = json.load(f)

    # Prepare output directory
    output_dir = "/tmp/iso_manual"
    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)
    os.makedirs(output_dir)

    # 1. introduction.md
    intro_content = """# Introducción

Este manual proporciona la documentación de usuario para el sistema **CostPro**, diseñada siguiendo el estándar **ISO/IEC 26514**.

## Propósito
El propósito de este manual es guiar a los usuarios en el uso efectivo de las herramientas de gestión de costos, inventario y conciliación bancaria.

## Audiencia
Este documento está dirigido a administradores de negocios, contadores y personal operativo que utiliza el sistema CostPro para la gestión diaria.
"""
    with open(os.path.join(output_dir, "introduction.md"), 'w', encoding='utf-8') as f:
        f.write(intro_content)

    # 2. system_overview.md
    overview_content = "# Visión General del Sistema\n\n"
    overview_content += "CostPro es una plataforma integrada para la gestión empresarial que incluye los siguientes módulos principales:\n\n"

    for wf in workflows:
        overview_content += f"### {wf.get('name')}\n"
        overview_content += f"{wf.get('business_goal')}\n\n"

    with open(os.path.join(output_dir, "system_overview.md"), 'w', encoding='utf-8') as f:
        f.write(overview_content)

    # 3. user_tasks.md
    tasks_content = "# Tareas del Usuario\n\n"
    tasks_content += "El sistema permite realizar las siguientes tareas principales organizadas por procesos de negocio:\n\n"

    for wf in workflows:
        tasks_content += f"## {wf.get('name')}\n"
        for step in wf.get('steps', []):
            tasks_content += f"- {step}\n"
        tasks_content += "\n"

    with open(os.path.join(output_dir, "user_tasks.md"), 'w', encoding='utf-8') as f:
        f.write(tasks_content)

    # 4. procedures.md
    proc_content = "# Procedimientos Paso a Paso\n\n"

    for help_item in user_help:
        feature = help_item.get('feature')
        desc = help_item.get('descripcion_usuario')
        actions = help_item.get('acciones', [])

        if actions:
            proc_content += f"## Cómo gestionar {feature}\n"
            proc_content += f"{desc}\n\n"
            proc_content += "### Pasos:\n"
            for i, action in enumerate(actions, 1):
                proc_content += f"{i}. {action}\n"
            proc_content += "\n"

    with open(os.path.join(output_dir, "procedures.md"), 'w', encoding='utf-8') as f:
        f.write(proc_content)

    # 5. reference.md
    ref_content = "# Referencia de Pantallas y Componentes\n\n"

    for view in views:
        name = view.get('name', 'Pantalla').replace('.tsx', '')
        if "test" in name.lower() or "mock" in name.lower():
            continue

        ref_content += f"## {name}\n"
        ref_content += f"Ruta: `{view.get('route')}`\n\n"

        actions = view.get('actions', [])
        if actions:
            ref_content += "### Acciones Disponibles:\n"
            for action in actions:
                ref_content += f"- {action}\n"
            ref_content += "\n"

        inputs = view.get('inputs', [])
        if inputs:
            ref_content += "### Entradas de Datos:\n"
            for inp in inputs:
                ref_content += f"- {inp}\n"
            ref_content += "\n"

    with open(os.path.join(output_dir, "reference.md"), 'w', encoding='utf-8') as f:
        f.write(ref_content)

    # 6. glossary.md
    glossary_content = "# Glosario de Términos\n\n"
    glossary_content += "| Término | Descripción |\n"
    glossary_content += "| :--- | :--- |\n"

    for help_item in user_help:
        feature = help_item.get('feature')
        desc = help_item.get('descripcion_usuario')
        if feature and desc:
            short_desc = desc.split('.')[0] + '.'
            glossary_content += f"| {feature} | {short_desc} |\n"

    with open(os.path.join(output_dir, "glossary.md"), 'w', encoding='utf-8') as f:
        f.write(glossary_content)

    # Commit artifact
    res = commit_artifact("iso_manual", output_dir, 98.0, 12)
    print(f"Phase 12 result: {res}")

    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)

if __name__ == "__main__":
    main()
