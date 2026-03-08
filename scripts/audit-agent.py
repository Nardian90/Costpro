import os
import re
import json
import datetime
import hashlib
import argparse

# Configuration
BASE_PATHS = ["src/app", "src/components", "src/lib"]
DOCS_MAP = "docs/mapa_vistas.md"
ARCH_JSON = "public/system_architecture.json"
GRAPH_JSON = "public/architecture_graph.json"
AUDIT_LOG = "logs/audit_log.json"
HEALTH_JSON = "public/system_health.json"
TIMELINE_JSON = "public/health_timeline.json"

MANUAL_MAPPING = {
    "CostSheetWizard": "Facilita la creación estandarizada de fichas de costo. Automatiza la aplicación de la Resolución 12/2007 para asegurar que todos los cálculos de precios cumplan con la normativa legal vigente.",
    "FormulaEditor": "Permite la personalización de algoritmos de formación de precios. Es la herramienta para directivos para ajustar márgenes de contribución y coeficientes de gastos indirectos sin intervención técnica.",
    "BankIngestion": "Punto de entrada para la digitalización de la economía. Transforma estados de cuenta bancarios en registros contables, eliminando errores manuales en la conciliación de pagos QR y transferencias.",
    "IncomeReceiptSection": "Garantiza la transparencia fiscal. Genera el Modelo SC-3-01, documento legal indispensable para la declaración de ingresos ante las autoridades pertinentes.",
    "InventoryAdjustmentModal": "Controla las desviaciones de inventario. Cada ajuste requiere una justificación que se audita automáticamente para prevenir mermas no autorizadas o fraudes.",
    "CatalogTable": "El cerebro de los productos. Centraliza el costo unitario y el precio de venta sugerido, asegurando que todos los puntos de venta operen con márgenes unificados.",
    "SystemHealthView": "El panel de control ejecutivo. Traduce métricas técnicas complejas en un Índice de Salud (SHI) que permite a los dueños de negocio entender la estabilidad y seguridad de su inversión tecnológica.",
    "AuditSummary": "El 'ojo que todo lo ve'. Registra cada cambio sensible en el sistema, permitiendo reconstruir eventos en caso de discrepancias operativas o auditorías de seguridad.",
    "CashRegister": "Gestiona el flujo de efectivo en el punto de venta. Permite realizar aperturas, arqueos y cierres de caja, asegurando la integridad financiera de las operaciones diarias.",
    "RoleManager": "Controla el acceso granular al sistema. Define qué acciones puede realizar cada perfil (Admin, Encargado, Cajero, Almacén) según las políticas de seguridad de la empresa.",
    "UserManager": "Administración centralizada de identidades. Permite la creación y gestión de credenciales para el personal, manteniendo la trazabilidad de acciones por usuario.",
    "POSView": "Interfaz de venta rápida diseñada para la eficiencia operativa. Soporta múltiples métodos de pago y descuentos, descontando automáticamente el inventario en tiempo real.",
    "InventoryView": "Panel de control de existencias. Proporciona visibilidad total sobre el stock actual, costos acumulados y alertas de reposición para evitar quiebres de inventario.",
    "PurchaseOrder": "Módulo de reaprovisionamiento. Formaliza la recepción de mercancía de proveedores, actualizando costos y existencias de manera automatizada.",
}

def get_type(path):
    if "components/views/terminal/views" in path:
        if path.endswith("View.tsx") or path.endswith("ManagementView.tsx") or "dashboard" in path:
            return "view"
    if "components" in path:
        return "component"
    if "hooks" in path:
        return "hook"
    if "services" in path:
        return "service"
    if "lib" in path:
        return "utility"
    return "unknown"

def resolve_import(import_path, current_file_path):
    if import_path.startswith("@/"):
        resolved = import_path.replace("@/", "src/")
    elif import_path.startswith("."):
        dir_name = os.path.dirname(current_file_path)
        resolved = os.path.normpath(os.path.join(dir_name, import_path))
    else:
        return None

    for ext in [".tsx", ".ts", ".jsx", ".js", ""]:
        full_path = resolved + ext
        if os.path.exists(full_path) and os.path.isfile(full_path):
            return full_path
        if os.path.isdir(full_path):
            for i_ext in ["/index.ts", "/index.tsx", "/index.js"]:
                if os.path.exists(full_path + i_ext):
                    return full_path + i_ext
    return None

def extract_dependencies(content, current_file_path):
    imports = re.findall(r'from [\'"](.*)[\'"]', content)
    resolved_deps = []
    for imp in imports:
        resolved = resolve_import(imp, current_file_path)
        if resolved:
            rel_resolved = os.path.relpath(resolved, start=os.getcwd())
            resolved_deps.append(rel_resolved)
    return list(set(resolved_deps))

def calculate_complexity(content):
    keywords = [r'\bif\b', r'\bfor\b', r'\bwhile\b', r'\bcase\b', r'\b&&\b', r'\b\|\|\b', r'\?']
    complexity = 1
    for kw in keywords:
        complexity += len(re.findall(kw, content))
    return complexity

def load_existing_architecture():
    if not os.path.exists(ARCH_JSON):
        return {}
    try:
        with open(ARCH_JSON, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # Return a map of ID -> item
            return {item['id']: item for item in data.get('architecture', [])}
    except:
        return {}

def get_logic_for_component(name, path, existing_item):
    # 1. Preserve existing manual high-quality documentation if it exists
    if existing_item and existing_item.get('is_documented'):
        # Only preserve if it looks like manual (not inferred)
        # Inferred descriptions usually start with "[No definido en el manual]"
        if not str(existing_item.get('business_logic', '')).startswith("[No definido"):
            return existing_item.get('business_logic'), True, existing_item.get('documentation_quality', 7.0), existing_item.get('openQuestions', [])

    # 2. Check explicit mapping
    if name in MANUAL_MAPPING:
        return MANUAL_MAPPING[name], True, 10.0, existing_item.get('openQuestions', []) if existing_item else []

    # 3. Check path-based inference
    description = ""
    is_documented = False
    quality = 0.0

    if "features/ipv" in path or "views/ipv" in path:
        description = "[No definido en el manual] Componente del módulo IPV (Ingresos, Pagos y Ventas). Se encarga de la gestión de transacciones bancarias y conciliación contable."
        quality = 6.0
    elif "features/inventory" in path or "views/inventory" in path:
        description = "[No definido en el manual] Componente del módulo de Inventario. Soporta el control de existencias y trazabilidad de productos."
        quality = 6.0
    elif "features/pos" in path or "views/pos" in path:
        description = "[No definido en el manual] Componente del Punto de Venta. Facilita la operación comercial y facturación al cliente final."
        quality = 6.0
    elif "features/cost-sheets" in path or "views/cost_sheet" in path:
        description = "[No definido en el manual] Componente del motor de fichas de costo. Participa en el cálculo de formación de precios y márgenes comerciales."
        quality = 6.0
    elif "features/auth" in path or "roles" in path or "auth" in path.lower():
        description = "[No definido en el manual] Componente de Seguridad y Gobernanza. Gestiona permisos, roles y sesiones de usuario."
        quality = 5.0
    elif "components/ui" in path:
        description = "[No definido en el manual] Componente de interfaz de usuario de bajo nivel. Proporciona elementos visuales estandarizados (Shadcn UI)."
        quality = 4.0
    else:
        description = f"[No definido en el manual] Componente técnico {name} encargado de soportar la funcionalidad operativa del módulo {os.path.basename(os.path.dirname(path))}."
        quality = 3.0

    return description, False, quality, existing_item.get('openQuestions', []) if existing_item else []

def calculate_score(path, content, metrics):
    score_arch = 10.0
    score_quality = 10.0
    score_ui = 10.0
    score_integration = 10.0
    issues = []

    lines = content.splitlines()
    loc = len(lines)
    complexity = metrics['cyclomaticComplexity']

    if loc > 500:
        score_arch -= 2.0
        issues.append(f"Archivo extenso ({loc} líneas)")
    if metrics['outDegree'] > 15:
        score_arch -= 1.5
        issues.append(f"Alto acoplamiento saliente ({metrics['outDegree']})")

    if "TODO" in content: score_quality -= 0.5
    if "FIXME" in content: score_quality -= 1.0
    if "console.log" in content:
        score_quality -= 1.0
        issues.append("Uso de console.log detectado")
    if complexity >= 40:
        score_quality -= 3.0
        issues.append(f"Complejidad ciclomática crítica ({complexity})")
    elif complexity >= 25:
        score_quality -= 1.5
        issues.append(f"Complejidad ciclomática alta ({complexity})")

    if path.endswith((".tsx", ".jsx")):
        if "clamp(" not in content and "text-[" not in content:
            score_ui -= 1.0
            issues.append("Falta de tipografía fluida (clamp)")
        if "h-11" not in content and "h-12" not in content and "min-h-[44px]" not in content and ("button" in content.lower() or "Button" in content):
            score_ui -= 1.0
            issues.append("Posible incumplimiento de touch targets (44px)")

    if metrics['outDegree'] > 10:
        score_integration -= 2.0
        issues.append("Exceso de dependencias directas")

    final_score = (score_arch * 0.3) + (score_quality * 0.3) + (score_ui * 0.2) + (score_integration * 0.2)
    return round(max(0, final_score), 1), issues

def get_status_label(score):
    if score >= 9.5: return "Óptimo"
    if score >= 8.0: return "Bueno"
    if score >= 6.0: return "Riesgo"
    return "Crítico"

def get_md_health_status(score):
    if score >= 9.5: return "Óptimo"
    if score >= 6.0: return "Advertencia"
    return "Crítico"

def scan_project():
    nodes = {}
    edges = []
    existing_arch = load_existing_architecture()

    for base in BASE_PATHS:
        if not os.path.exists(base): continue
        for root, _, files in os.walk(base):
            for file in files:
                if file.endswith((".tsx", ".ts", ".js", ".jsx")):
                    if ".test." in file or "__tests__" in root or "node_modules" in root:
                        continue
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, start=os.getcwd())
                    itype = get_type(rel_path)
                    if itype == "unknown": continue

                    try:
                        with open(full_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                    except: continue

                    node_id = os.path.splitext(file)[0]
                    nodes[rel_path] = {
                        "id": node_id,
                        "name": node_id,
                        "type": itype,
                        "path": rel_path,
                        "content": content,
                        "lines": len(content.splitlines()),
                        "complexity": calculate_complexity(content),
                        "dependencies": []
                    }

    for path, node in nodes.items():
        deps = extract_dependencies(node['content'], path)
        node['dependencies'] = deps
        for dep_path in deps:
            if dep_path in nodes:
                edges.append({"from": node['id'], "to": nodes[dep_path]['id']})

    in_degrees = {node['id']: 0 for node in nodes.values()}
    out_degrees = {node['id']: 0 for node in nodes.values()}
    for edge in edges:
        out_degrees[edge['from']] += 1
        in_degrees[edge['to']] += 1

    items = []
    all_issues = []

    for path, node in nodes.items():
        node_id = node['id']
        metrics = {
            "inDegree": in_degrees[node_id],
            "outDegree": out_degrees[node_id],
            "lines": node['lines'],
            "cyclomaticComplexity": node['complexity']
        }

        raw_coupling = (0.35 * metrics['outDegree'] +
                        0.25 * metrics['inDegree'] +
                        0.2 * (metrics['lines'] / 100.0) +
                        0.2 * (metrics['cyclomaticComplexity'] / 5.0))
        metrics['couplingScore'] = round(min(10, raw_coupling), 1)

        score, issues = calculate_score(path, node['content'], metrics)
        logic, is_doc, quality, open_questions = get_logic_for_component(node_id, path, existing_arch.get(node_id))

        item = {
            "id": node_id,
            "name": node_id,
            "type": node['type'],
            "path": path,
            "health": score,
            "status": get_status_label(score),
            "lastAudit": datetime.date.today().isoformat(),
            "business_logic": logic,
            "is_documented": is_doc,
            "documentation_quality": quality,
            "metrics": metrics,
            "dependencies": [nodes[d]['id'] for d in node['dependencies'] if d in nodes]
        }
        if open_questions:
            item["openQuestions"] = open_questions

        items.append(item)
        for issue in issues:
            all_issues.append({"component": node_id, "issue": issue})

    return items, edges, all_issues

def run_phase_1():
    print("Executing Phase 1: Codebase Scan...")
    items, edges, all_issues = scan_project()
    os.makedirs("docs", exist_ok=True)

    # 1. Update docs/mapa_vistas.md
    header = "| Nombre | Ruta | Tipo | Estado Salud | Dependencias | Última Auditoría |\n"
    separator = "| ------ | ---- | ---- | ------------ | ------------ | ---------------- |\n"
    rows = ""
    sorted_items = sorted(items, key=lambda x: (x['type'], x['name']))
    for item in sorted_items:
        health_str = get_md_health_status(item['health'])
        rows += f"| {item['name']} | {item['path']} | {item['type']} | {health_str} | {', '.join(item['dependencies'])} | {item['lastAudit']} |\n"

    with open(DOCS_MAP, 'w', encoding='utf-8') as f:
        f.write("# Mapa Arquitectónico Vivo\n\n")
        f.write(header + separator + rows)

    # 2. Update JSONs and Logs
    update_all_outputs(items, edges, all_issues)
    print(f"Phase 1 complete. Updated {DOCS_MAP}, JSONs and Logs.")

def update_all_outputs(items, edges, all_issues):
    os.makedirs("public", exist_ok=True)
    os.makedirs("logs", exist_ok=True)

    # architecture_graph.json
    graph_stats = {
        "totalNodes": len(items),
        "totalEdges": len(edges),
        "topCoupled": [i['name'] for i in sorted(items, key=lambda x: x['metrics']['couplingScore'], reverse=True)[:5]],
        "communities": []
    }
    graph_data = {"nodes": items, "edges": edges, "graphStats": graph_stats}
    with open(GRAPH_JSON, 'w', encoding='utf-8') as f:
        json.dump(graph_data, f, indent=2, ensure_ascii=False)

    # system_architecture.json
    stats = {
        "totalViews": len([i for i in items if i["type"] == "view"]),
        "totalComponents": len([i for i in items if i["type"] == "component"]),
        "totalServices": len([i for i in items if i["type"] == "service"]),
        "totalHooks": len([i for i in items if i["type"] == "hook"]),
        "totalUtilities": len([i for i in items if i["type"] == "utility"])
    }
    arch_data = {"architecture": items, "stats": stats}
    with open(ARCH_JSON, 'w', encoding='utf-8') as f:
        json.dump(arch_data, f, indent=2, ensure_ascii=False)

    # logs/audit_log.json (Restore logic)
    avg_health = round(sum(i["health"] for i in items) / len(items), 1) if items else 0
    refactor_suggestions = []
    for i in sorted(items, key=lambda x: x['metrics']['couplingScore'], reverse=True)[:5]:
        if i['metrics']['couplingScore'] >= 8.0:
            refactor_suggestions.append({
                "component": i['name'],
                "priority": "high",
                "rationale": f"High coupling ({i['metrics']['couplingScore']}) + Complexity ({i['metrics']['cyclomaticComplexity']})",
                "suggestion": "Consider splitting into sub-components or extracting logic to a dedicated hook/service.",
                "estimatedEffort": "L" if i['metrics']['lines'] > 500 else "M"
            })

    new_log = {
        "date": datetime.date.today().isoformat(),
        "hash": hashlib.sha256(json.dumps(arch_data, sort_keys=True).encode()).hexdigest(),
        "health_score": avg_health,
        "issues_detected": all_issues[:20],
        "refactor_suggestions": refactor_suggestions,
        "system_metrics": stats
    }

    logs = []
    if os.path.exists(AUDIT_LOG):
        try:
            with open(AUDIT_LOG, 'r', encoding='utf-8') as f:
                logs = json.load(f)
                if not isinstance(logs, list): logs = [logs]
        except: pass
    logs.insert(0, new_log)
    with open(AUDIT_LOG, 'w', encoding='utf-8') as f:
        json.dump(logs[:365], f, indent=2, ensure_ascii=False)

    # system_health.json
    health_data = {
        "systemHealth": avg_health,
        "status": "healthy" if avg_health >= 8.0 else "warning" if avg_health >= 6.0 else "critical",
        "trend": "stable",
        "viewsAudited": stats['totalViews'],
        "newViews": 0,
        "criticalIssues": len([i for i in items if i["health"] < 6.0]),
        "warnings": len([i for i in items if 6.0 <= i["health"] < 8.0]),
        "lastAudit": datetime.date.today().isoformat()
    }
    with open(HEALTH_JSON, 'w', encoding='utf-8') as f:
        json.dump(health_data, f, indent=2, ensure_ascii=False)

    # health_timeline.json (Restore logic)
    timeline = []
    if os.path.exists(TIMELINE_JSON):
        try:
            with open(TIMELINE_JSON, 'r', encoding='utf-8') as f:
                timeline_data = json.load(f)
                timeline = timeline_data.get("timeline", [])
        except: pass

    new_event = {
        "date": datetime.date.today().isoformat(),
        "score": avg_health,
        "status": get_status_label(avg_health),
        "actionsPerformed": [
            "Actualización del mapa arquitectónico (Fase 1)",
            "Auditoría de acoplamiento y complejidad"
        ]
    }
    if not timeline or timeline[0]['date'] != new_event['date']:
        timeline.insert(0, new_event)
    else:
        timeline[0] = new_event

    with open(TIMELINE_JSON, 'w', encoding='utf-8') as f:
        json.dump({"timeline": timeline[:10]}, f, indent=2, ensure_ascii=False)

def main():
    parser = argparse.ArgumentParser(description="CostPro Audit Agent - Multi-phase Pipeline")
    parser.add_argument("--phase", type=int, choices=range(1, 11), help="Pipeline phase to execute")
    args = parser.parse_args()

    if args.phase == 1:
        run_phase_1()
    elif args.phase:
        print(f"Phase {args.phase} logic not yet implemented in this version.")
    else:
        # Default behavior: run all as Phase 1 + Output updates
        run_phase_1()

if __name__ == "__main__":
    main()
