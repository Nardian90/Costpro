import json
import os
import sys
from datetime import datetime, timezone

# Add scripts to path for commit_artifact
sys.path.append('scripts')
try:
    from commit_artifact import commit_artifact
except ImportError:
    print("Error: No se pudo importar commit_artifact.py")
    sys.exit(1)

TRANSLATION_MAP = {
    "Matching Engine": "Conciliador Inteligente",
    "IPV": "Control de Inventario y Ventas",
    "Bank Ingestion": "Carga de Extractos Bancarios",
    "Catalog Table": "Catálogo de Productos",
    "Matching Audit": "Auditoría de Cruces",
    "Intelligent Receipt": "Recepción Inteligente",
    "Product Movements": "Movimientos de Producto",
    "Decomposition": "Desglose de Productos",
    "Reconciliation": "Conciliación",
    "Income Receipt": "Vale de Ingreso",
    "Statement": "Estado de Cuenta",
    "Workflow": "Proceso de Negocio",
    "Wallet": "Billetera Digital",
    "Cost Sheet": "Ficha de Costo",
    "Inventory Count": "Conteo de Inventario",
    "Terminal": "Punto de Venta",
    "Dashboard": "Panel de Control",
    "MatchingTrace": "Rastro de Conciliación",
    "Pivot": "Tabla Dinámica",
    "Manual Reconciliation": "Conciliación Manual",
    "QR Report": "Reporte de Transferencias QR"
}

def translate(text):
    if not isinstance(text, str):
        return text
    translated = text
    for tech, user in TRANSLATION_MAP.items():
        translated = translated.replace(tech, user)
    return translated

def main():
    print("Executing Phase 11: User Language Translation...")

    knowledge_dir = "knowledge"
    workflows_path = os.path.join(knowledge_dir, "workflows.json")
    views_path = os.path.join(knowledge_dir, "views.json")

    user_help = []

    # 1. Process Workflows
    if os.path.exists(workflows_path):
        with open(workflows_path, 'r', encoding='utf-8') as f:
            workflows = json.load(f)
            for wf in workflows:
                entry = {
                    "feature": translate(wf.get("name", "Proceso Desconocido")),
                    "descripcion_usuario": translate(wf.get("business_goal", "Sin descripción disponible.")),
                    "acciones": [translate(step) for step in wf.get("steps", [])],
                    "resultados": [f"Cumplimiento de: {translate(wf.get('business_goal', 'Objetivo final'))}"]
                }
                user_help.append(entry)

    # 2. Process Views (if not already covered by workflows)
    if os.path.exists(views_path):
        with open(views_path, 'r', encoding='utf-8') as f:
            views = json.load(f)
            workflow_views = set()
            if os.path.exists(workflows_path):
                with open(workflows_path, 'r') as f_wf:
                    wfs = json.load(f_wf)
                    for w in wfs:
                        for v in w.get("views", []):
                            workflow_views.add(v)

            for view in views:
                # If view is very technical or already in a workflow, we might skip or generalize
                route = view.get("route", "")
                if route in workflow_views:
                    continue

                name = view.get("name", "Pantalla")
                if "test" in name.lower() or "mock" in name.lower():
                    continue

                entry = {
                    "feature": translate(name.replace(".tsx", "")),
                    "descripcion_usuario": f"Interfaz para gestionar {translate(name.replace('.tsx', ''))}.",
                    "acciones": [translate(a) for a in view.get("actions", [])] + [translate(i) for i in view.get("inputs", [])],
                    "resultados": [translate(o) for o in view.get("outputs", [])]
                }
                user_help.append(entry)

    # Save temporary file
    temp_path = "/tmp/user_help.json"
    with open(temp_path, 'w', encoding='utf-8') as f:
        json.dump(user_help, f, indent=2, ensure_ascii=False)

    # Commit artifact
    res = commit_artifact("user_help", temp_path, 95.0, 11)
    print(f"Phase 11 result: {res}")

    if os.path.exists(temp_path):
        os.remove(temp_path)

if __name__ == "__main__":
    main()
