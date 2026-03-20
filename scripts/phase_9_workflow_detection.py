#!/usr/bin/env python3
"""
phase_9_workflow_detection.py
Detects and maps business workflows by grouping views, components, and services.
"""

import json
import os
import subprocess

VIEWS_PATH = "knowledge/views.json"
COMPONENTS_PATH = "knowledge/components.json"
WORKFLOWS_PATH = "knowledge/workflows.json"
OUTPUT_PATH = "/tmp/workflows.json"

WORKFLOW_DEFINITIONS = [
    {
        "id": "reconciliacion_ipv",
        "name": "Conciliación de Inventario (IPV)",
        "patterns": ["/ipv/", "/intelligentReceipts/"],
        "steps": [
            "Importar extracto bancario en BankIngestion",
            "Verificar catálogo en CatalogTable",
            "Ejecutar MatchingEngine para cruzar datos",
            "Revisar resultados en MatchingAuditView"
        ],
        "business_goal": "Asegurar que cada peso recibido en el banco corresponda a una salida de inventario válida."
    },
    {
        "id": "gestion_costos",
        "name": "Gestión de Fichas de Costo",
        "patterns": ["/cost_sheet/"],
        "steps": [
            "Crear nueva ficha de costo",
            "Agregar insumos y mano de obra",
            "Calcular márgenes y precios sugeridos",
            "Generar reportes y anexos"
        ],
        "business_goal": "Calcular con precisión el costo de producción y establecer precios competitivos."
    },
    {
        "id": "gestion_productos",
        "name": "Gestión de Productos y Precios",
        "patterns": ["/catalog/"],
        "steps": [
            "Crear o importar productos",
            "Definir variaciones permitidas",
            "Organizar por grupos y subgrupos"
        ],
        "business_goal": "Mantener un catálogo actualizado para la automatización del matching."
    },
    {
        "id": "conteo_inventario",
        "name": "Conteo y Ajuste de Inventario",
        "patterns": ["/inventory/", "/inventory_count/"],
        "steps": [
            "Realizar conteo físico de productos",
            "Registrar diferencias en el sistema",
            "Ajustar niveles de stock"
        ],
        "business_goal": "Mantener la integridad de los datos de stock físico contra el sistema."
    },
    {
        "id": "punto_de_venta",
        "name": "Punto de Venta (POS)",
        "patterns": ["/pos/"],
        "steps": [
            "Escanear productos",
            "Gestionar carrito de compras",
            "Procesar pagos y generar facturas"
        ],
        "business_goal": "Agilizar las ventas directas y el registro de ingresos."
    },
    {
        "id": "aprendizaje_conceptos",
        "name": "Aprendizaje y Capacitación (Academy)",
        "patterns": ["/academy/"],
        "steps": [
            "Acceder al módulo Academy",
            "Seleccionar categoría de estudio",
            "Realizar sesiones de repaso con Flashcards",
            "Monitorear progreso en Mastery Dashboard"
        ],
        "business_goal": "Capacitar a los usuarios en el uso del sistema y conceptos contables mediante repetición espaciada."
    },
    {
        "id": "gestion_billetera_digital",
        "name": "Gestión de Billetera y Notificaciones (Wallet)",
        "patterns": ["/wallet/"],
        "steps": [
            "Importar mensajes de texto o archivos de banco",
            "Visualizar registros crudos en la pestaña BD",
            "Analizar métricas financieras en Analytics Dashboard"
        ],
        "business_goal": "Centralizar y analizar el flujo de caja proveniente de notificaciones bancarias digitales."
    }
]

def load_json(path):
    if not os.path.exists(path):
        return []
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def main():
    views = load_json(VIEWS_PATH)
    components = load_json(COMPONENTS_PATH)

    workflows = []

    for wf_def in WORKFLOW_DEFINITIONS:
        wf = {
            "id": wf_def["id"],
            "name": wf_def["name"],
            "steps": wf_def["steps"],
            "business_goal": wf_def["business_goal"],
            "views": [],
            "components": [],
            "services": set(),
            "businessRules": []
        }

        # Match views
        for v in views:
            if any(p in v["id"] for p in wf_def["patterns"]):
                wf["views"].append(v["id"])
                if "servicesUsed" in v:
                    for s in v["servicesUsed"]:
                        wf["services"].add(s)

        # Match components
        for c in components:
            if any(p in c["id"] for p in wf_def["patterns"]):
                wf["components"].append(c["id"])
                if "dependencies" in c:
                    for d in c["dependencies"]:
                        # Simple heuristic: only add if it looks like a service or engine
                        if not d.startswith(".") and not d.startswith("@/components"):
                             wf["services"].add(d)

                if "businessRules" in c:
                    wf["businessRules"].extend(c["businessRules"])

        # Convert set to sorted list
        wf["services"] = sorted(list(wf["services"]))
        workflows.append(wf)

    # Save to temp file
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(workflows, f, indent=2, ensure_ascii=False)

    print(f"Generated {len(workflows)} workflows in {OUTPUT_PATH}")

    # Commit artifact
    # Usage: commit_artifact.py <name> <artifact_path> <confidence_score> <source_phase>
    res = subprocess.run([
        "python3", "scripts/commit_artifact.py",
        "workflows", OUTPUT_PATH, "95.0", "9"
    ], capture_output=True, text=True)

    print(res.stdout)
    if res.stderr:
        print(res.stderr)

if __name__ == "__main__":
    main()
