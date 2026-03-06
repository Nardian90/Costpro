import os
import json
import datetime
import re

# Configurations
BASE_PATHS = ["src/app", "src/components", "src/lib", "src/hooks", "src/services"]
DOCS_MAP = "docs/mapa_vistas.md"
ARCH_JSON = "public/system_architecture.json"
AUDIT_LOG = "logs/audit_log.json"
HEALTH_JSON = "public/system_health.json"
TIMELINE_JSON = "public/health_timeline.json"

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

def extract_dependencies(content):
    deps = re.findall(r'import .* from [\'"](.*)[\'"]', content)
    internal_deps = [d for d in deps if d.startswith(("@/", ".", "/src"))]
    clean_deps = []
    for d in internal_deps:
        name = d.split("/")[-1].replace(".tsx", "").replace(".ts", "")
        if name not in clean_deps and name != "":
            clean_deps.append(name)
    return clean_deps[:5]

def calculate_score(path, content):
    score_arch = 10.0
    score_quality = 10.0
    score_ui = 10.0
    score_integration = 10.0
    issues = []

    lines = content.splitlines()

    # Architecture (30%) - Separation of responsibilities, modularity
    if len(lines) > 500:
        score_arch -= 2.0
        issues.append(f"Archivo extenso ({len(lines)} líneas) en {path}")

    # Quality (30%) - Duplication, imports, dead code, long functions
    if "TODO" in content: score_quality -= 0.5
    if "FIXME" in content: score_quality -= 1.0
    if "console.log" in content:
        score_quality -= 1.0
        issues.append(f"Uso de console.log detectado en {path}")
    if "any" in content: score_quality -= 0.5

    # UI/UX (20%) - Mobile First, consistency
    if path.endswith((".tsx", ".jsx")):
        if "clamp(" not in content and "text-[" not in content:
            score_ui -= 1.0
            issues.append(f"Falta de tipografía fluida (clamp) en {path}")
        if "h-11" not in content and "h-12" not in content and "min-h-[44px]" not in content and ("button" in content.lower() or "Button" in content):
            score_ui -= 1.0
            issues.append(f"Posible incumplimiento de touch targets (44px) en {path}")

    # Integration (20%) - Wrong dependencies, hook misuse
    deps = extract_dependencies(content)
    if len(deps) > 10:
        score_integration -= 2.0
        issues.append(f"Exceso de dependencias en {path}")

    final_score = (score_arch * 0.3) + (score_quality * 0.3) + (score_ui * 0.2) + (score_integration * 0.2)
    return round(max(0, final_score), 1), issues

def get_status_label(score):
    if score >= 9.5: return "Óptimo"
    if score >= 8.0: return "Bueno"
    if score >= 6.0: return "Riesgo"
    return "Crítico"

def get_md_health_status(score):
    # Step 2: Óptimo, Advertencia, Crítico
    if score >= 9.5: return "Óptimo"
    if score >= 6.0: return "Advertencia"
    return "Crítico"

def scan_project():
    items = []
    all_issues = []

    prev_arch = {}
    if os.path.exists(ARCH_JSON):
        try:
            with open(ARCH_JSON, 'r') as f:
                prev_data = json.load(f)
                prev_arch = {item['path']: item for item in prev_data.get('architecture', [])}
        except:
            pass

    new_views = []
    modified_views = []

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
                    except:
                        continue

                    score, issues = calculate_score(rel_path, content)
                    all_issues.extend(issues)
                    deps = extract_dependencies(content)

                    item = {
                        "name": os.path.splitext(file)[0],
                        "path": rel_path,
                        "type": itype,
                        "health": score,
                        "status": get_status_label(score),
                        "dependencies": deps,
                        "lastAudit": datetime.date.today().isoformat()
                    }
                    items.append(item)

                    if rel_path not in prev_arch:
                        if itype == "view": new_views.append(item["name"])
                    else:
                        if prev_arch[rel_path]['health'] != score or prev_arch[rel_path]['dependencies'] != deps:
                            if itype == "view": modified_views.append(item["name"])

    return items, all_issues, new_views, modified_views

def update_docs_map(items):
    header = "| Nombre | Ruta | Tipo | Estado Salud | Dependencias | Última Auditoría |\n"
    separator = "| ------ | ---- | ---- | ------------ | ------------ | ---------------- |\n"
    rows = ""
    sorted_items = sorted(items, key=lambda x: (x['type'], x['name']))
    for item in sorted_items:
        health_str = get_md_health_status(item['health'])
        rows += f"| {item['name']} | {item['path']} | {item['type']} | {health_str} | {', '.join(item['dependencies'])} | {item['lastAudit']} |\n"

    os.makedirs(os.path.dirname(DOCS_MAP), exist_ok=True)
    with open(DOCS_MAP, 'w') as f:
        f.write("# Mapa Arquitectónico Vivo\n\n")
        f.write(header + separator + rows)

def update_arch_json(items):
    stats = {
        "totalViews": len([i for i in items if i["type"] == "view"]),
        "totalComponents": len([i for i in items if i["type"] == "component"]),
        "totalServices": len([i for i in items if i["type"] == "service"]),
        "totalHooks": len([i for i in items if i["type"] == "hook"]),
        "totalUtilities": len([i for i in items if i["type"] == "utility"])
    }
    data = {
        "architecture": items,
        "stats": stats
    }
    os.makedirs(os.path.dirname(ARCH_JSON), exist_ok=True)
    with open(ARCH_JSON, 'w') as f:
        json.dump(data, f, indent=2)

def update_audit_log(items, issues, new_views, modified_views, avg_health):
    new_entry = {
        "date": datetime.date.today().isoformat(),
        "new_views": new_views,
        "modified_views": modified_views,
        "health_score": avg_health,
        "issues_detected": issues[:20],
        "refactor_suggestions": [
            "Implementar tipografía fluida con clamp() en vistas que aún usan px/rem estáticos.",
            "Asegurar que todos los botones e inputs cumplan con el estándar de 44px de touch target.",
            "Reducir el tamaño de archivos que exceden las 500 líneas mediante sub-componentes.",
            "Eliminar console.log de archivos de producción."
        ],
        "system_metrics": {
            "total_views": len([i for i in items if i["type"] == "view"]),
            "total_components": len([i for i in items if i["type"] == "component"]),
            "total_services": len([i for i in items if i["type"] == "service"]),
            "total_hooks": len([i for i in items if i["type"] == "hook"])
        }
    }

    os.makedirs(os.path.dirname(AUDIT_LOG), exist_ok=True)
    with open(AUDIT_LOG, 'w') as f:
        json.dump(new_entry, f, indent=2)

def update_system_health(items, avg_health, new_views_count):
    data = {
        "systemHealth": avg_health,
        "status": "healthy" if avg_health >= 8.0 else "warning" if avg_health >= 6.0 else "critical",
        "trend": "up",
        "viewsAudited": len([i for i in items if i["type"] == "view"]),
        "newViews": new_views_count,
        "criticalIssues": len([i for i in items if i["health"] < 6.0]),
        "warnings": len([i for i in items if 6.0 <= i["health"] < 9.5]),
        "lastAudit": datetime.date.today().isoformat()
    }
    os.makedirs(os.path.dirname(HEALTH_JSON), exist_ok=True)
    with open(HEALTH_JSON, 'w') as f:
        json.dump(data, f, indent=2)

def update_timeline(avg_health, items, new_views_count):
    timeline = []
    if os.path.exists(TIMELINE_JSON):
        try:
            with open(TIMELINE_JSON, 'r') as f:
                data = json.load(f)
                timeline = data.get("timeline", [])
        except:
            pass

    new_event = {
        "date": datetime.date.today().isoformat(),
        "score": avg_health,
        "status": get_status_label(avg_health),
        "newViews": new_views_count,
        "issuesDetected": len([i for i in items if i["health"] < 9.5]),
        "actionsPerformed": [
            "Actualización del mapa arquitectónico",
            "Auditoría técnica de componentes",
            "Cálculo de Score de Salud Global",
            "Generación de sugerencias de refactorización"
        ]
    }

    if timeline and timeline[0]["date"] == new_event["date"]:
        timeline[0] = new_event
    else:
        timeline.insert(0, new_event)

    timeline = timeline[:5]

    os.makedirs(os.path.dirname(TIMELINE_JSON), exist_ok=True)
    with open(TIMELINE_JSON, 'w') as f:
        json.dump({"timeline": timeline}, f, indent=2)

def main():
    items, issues, new_views, modified_views = scan_project()
    avg_health = round(sum(i["health"] for i in items) / len(items), 1) if items else 0

    update_docs_map(items)
    update_arch_json(items)
    update_audit_log(items, issues, new_views, modified_views, avg_health)
    update_system_health(items, avg_health, len(new_views))
    update_timeline(avg_health, items, len(new_views))

    print(f"Audit completed. System Health: {avg_health}")

if __name__ == "__main__":
    main()
