import os
import re
import json
import datetime
import hashlib

# Configuration
BASE_PATHS = ["src/app", "src/components", "src/lib"]
DOCS_MAP = "docs/mapa_vistas.md"
ARCH_JSON = "public/system_architecture.json"
GRAPH_JSON = "public/architecture_graph.json"
AUDIT_LOG = "logs/audit_log.json"
HEALTH_JSON = "public/system_health.json"
TIMELINE_JSON = "public/health_timeline.json"

def get_type(path):
    if "components/views/terminal/views" in path:
        if path.endswith("View.tsx") or path.endswith("ManagementView.tsx") or "dashboard" in path:
            return "view"
    if "components" in path:
        return "component"
    if "hooks" in path or "/hooks/" in path or re.search(r'/use[A-Z]', path):
        return "hook"
    if "services" in path:
        return "service"
    if "lib" in path:
        return "utility"
    return "unknown"

def resolve_import(import_path, current_file_path):
    # Resolve aliases based on tsconfig.json (@/* -> ./src/*)
    if import_path.startswith("@/"):
        resolved_base = import_path.replace("@/", "src/")
    elif import_path.startswith("."):
        dir_name = os.path.dirname(current_file_path)
        resolved_base = os.path.normpath(os.path.join(dir_name, import_path))
    else:
        # Check if it's a library or unmapped alias
        return None

    # Check common extensions and index files
    extensions = [".tsx", ".ts", ".jsx", ".js", ""]
    index_files = ["/index.ts", "/index.tsx", "/index.js"]

    for ext in extensions:
        full_path = resolved_base + ext
        if os.path.exists(full_path) and os.path.isfile(full_path):
            return full_path

    if os.path.isdir(resolved_base):
        for index_file in index_files:
            full_path = resolved_base + index_file
            if os.path.exists(full_path) and os.path.isfile(full_path):
                return full_path

    return None

def extract_dependencies(content, current_file_path):
    # Match various ES6 import styles
    # import { ... } from '...';
    # import Default from '...';
    # import * as Name from '...';
    # import '...';
    pattern = r'from\s+[\'"]([@\./][^\'"]+)[\'"]|import\s+[\'"]([@\./][^\'"]+)[\'"]'
    matches = re.findall(pattern, content)

    resolved_deps = []
    for m in matches:
        import_path = m[0] if m[0] else m[1]
        resolved = resolve_import(import_path, current_file_path)
        if resolved:
            rel_resolved = os.path.relpath(resolved, start=os.getcwd())
            resolved_deps.append(rel_resolved)

    return list(set(resolved_deps))

def extract_exported_name(content, filename):
    # Heuristic: Find default export or first named export
    default_match = re.search(r'export\s+default\s+(?:function|class|const|let|var)?\s*([a-zA-Z0-9_]+)', content)
    if default_match:
        return default_match.group(1)

    # If no named default export, look for anonymous default or named exports
    if "export default" in content:
        return os.path.splitext(filename)[0]

    named_match = re.search(r'export\s+(?:function|class|const|let|var)\s+([a-zA-Z0-9_]+)', content)
    if named_match:
        return named_match.group(1)

    return os.path.splitext(filename)[0]

def calculate_complexity(content):
    keywords = [r'\bif\b', r'\bfor\b', r'\bwhile\b', r'\bcase\b', r'\b&&\b', r'\b\|\|\b', r'\?']
    complexity = 1
    for kw in keywords:
        complexity += len(re.findall(kw, content))
    return complexity

def calculate_metrics(node, in_degree, out_degree):
    lines = node['lines']
    complexity = node['complexity']

    # couplingScore = normalized( w1 * outDegree + w2 * inDegree + w3 * (lines/200) + w4 * complexity )
    # w1=0.35, w2=0.25, w3=0.2, w4=0.2
    raw_coupling = (0.35 * out_degree +
                    0.25 * in_degree +
                    0.2 * (lines / 200.0) +
                    0.2 * (complexity / 5.0))

    return {
        "inDegree": in_degree,
        "outDegree": out_degree,
        "couplingScore": round(min(10, raw_coupling), 1),
        "lines": lines,
        "cyclomaticComplexity": complexity
    }

def estimate_health_score(path, content, metrics):
    arch = 10.0
    quality = 10.0
    ui_ux = 10.0
    integration = 10.0

    # Architecture (30%)
    if metrics['outDegree'] > 15: arch -= 3.0
    if metrics['lines'] > 500: arch -= 2.0

    # CodeQuality (30%)
    if metrics['cyclomaticComplexity'] >= 40: quality -= 4.0
    elif metrics['cyclomaticComplexity'] >= 25: quality -= 2.0
    if "TODO" in content: quality -= 0.5
    if "console.log" in content: quality -= 1.0

    # UI_UX (20%)
    if path.endswith((".tsx", ".jsx")):
        if "clamp(" not in content: ui_ux -= 1.0
        if "useMobile" in content: ui_ux += 1.0
        if not any(x in content for x in ["h-11", "h-12", "min-h-[44px]", "size-11"]):
            if "button" in content.lower(): ui_ux -= 1.0
    ui_ux = min(10.0, max(0, ui_ux))

    # Integration (20%)
    if metrics['outDegree'] > 10: integration -= 2.0
    if "supabase" in content.lower() and "/views/" in path: integration -= 1.0

    score = (0.3 * arch) + (0.3 * quality) + (0.2 * ui_ux) + (0.2 * integration)
    return round(max(0, score), 1)

def get_status_label(score):
    if score >= 9.5: return "Óptimo"
    if score >= 8.0: return "Bueno"
    if score >= 6.0: return "Advertencia"
    return "Crítico"

def detect_communities(nodes):
    communities = {}
    for node in nodes.values():
        parts = node['path'].split('/')
        if "views" in parts:
            idx = parts.index("views")
            if idx + 1 < len(parts):
                comm_name = parts[idx+1]
                communities[comm_name] = communities.get(comm_name, 0) + 1

    return [{"id": i + 1, "label": name, "size": size} for i, (name, size) in enumerate(communities.items())]

def scan_project():
    nodes = {}

    for base in BASE_PATHS:
        if not os.path.exists(base): continue
        for root, _, files in os.walk(base):
            for file in files:
                if file.endswith((".tsx", ".ts", ".js", ".jsx")):
                    if any(x in root or x in file for x in [".test.", "__tests__", "node_modules"]):
                        continue
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, start=os.getcwd())
                    itype = get_type(rel_path)
                    if itype == "unknown": continue

                    try:
                        with open(full_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                    except: continue

                    name = extract_exported_name(content, file)
                    nodes[rel_path] = {
                        "id": name,
                        "name": name,
                        "type": itype,
                        "path": rel_path,
                        "content": content,
                        "lines": len(content.splitlines()),
                        "complexity": calculate_complexity(content)
                    }

    edges = []
    in_degrees = {node['id']: 0 for node in nodes.values()}
    out_degrees = {node['id']: 0 for node in nodes.values()}

    for path, node in nodes.items():
        deps = extract_dependencies(node['content'], path)
        node['resolved_dependencies'] = []
        for dep_path in deps:
            if dep_path in nodes:
                dep_id = nodes[dep_path]['id']
                edges.append({"from": node['id'], "to": dep_id})
                node['resolved_dependencies'].append(dep_id)
                out_degrees[node['id']] += 1
                in_degrees[dep_id] += 1

    items = []
    for path, node in nodes.items():
        metrics = calculate_metrics(node, in_degrees[node['id']], out_degrees[node['id']])
        health = estimate_health_score(path, node['content'], metrics)

        items.append({
            "id": node['id'],
            "name": node['name'],
            "type": node['type'],
            "path": node['path'],
            "health": health,
            "status": get_status_label(health),
            "lastAudit": datetime.date.today().isoformat(),
            "metrics": metrics,
            "dependencies": list(set(node['resolved_dependencies'])),
            "owner": "team-core"
        })

    return items, edges

def get_data_hash(data, skip_keys=['lastAudit']):
    def normalize(obj):
        if isinstance(obj, dict):
            return {k: normalize(v) for k, v in sorted(obj.items()) if k not in skip_keys}
        if isinstance(obj, list):
            return [normalize(x) for x in obj]
        return obj

    normalized_data = normalize(data)
    return hashlib.sha256(json.dumps(normalized_data, sort_keys=True).encode()).hexdigest()

def write_json_idempotent(filepath, data, skip_keys=['lastAudit']):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    new_hash = get_data_hash(data, skip_keys)

    if os.path.exists(filepath):
        try:
            with open(filepath, 'r') as f:
                old_data = json.load(f)
                if get_data_hash(old_data, skip_keys) == new_hash:
                    return False # No change
        except: pass

    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2, sort_keys=True)
    return True

def main():
    items, edges = scan_project()

    # 1. architecture_graph.json
    graph_stats = {
        "totalNodes": len(items),
        "totalEdges": len(edges),
        "topCoupled": [i['name'] for i in sorted(items, key=lambda x: x['metrics']['couplingScore'], reverse=True)[:5]],
        "communities": detect_communities({i['path']: i for i in items})
    }
    graph_data = {"nodes": items, "edges": edges, "graphStats": graph_stats}
    write_json_idempotent(GRAPH_JSON, graph_data)

    # 2. system_architecture.json
    stats = {
        "totalViews": len([i for i in items if i["type"] == "view"]),
        "totalComponents": len([i for i in items if i["type"] == "component"]),
        "totalServices": len([i for i in items if i["type"] == "service"]),
        "totalHooks": len([i for i in items if i["type"] == "hook"]),
        "totalUtilities": len([i for i in items if i["type"] == "utility"])
    }
    arch_data = {"architecture": items, "stats": stats}
    write_json_idempotent(ARCH_JSON, arch_data)

    # 3. docs/mapa_vistas.md
    type_order = {"view": 0, "component": 1, "hook": 2, "service": 3, "utility": 4}
    sorted_items = sorted(items, key=lambda x: (type_order.get(x['type'], 9), x['name']))
    md_content = "# Mapa Arquitectónico Vivo\n\n| Nombre | Ruta | Tipo | Estado Salud | Dependencias | Última Auditoría |\n| ------ | ---- | ---- | ------------ | ------------ | ---------------- |\n"
    for item in sorted_items:
        status = "Advertencia" if item['status'] == "Riesgo" else item['status']
        md_content += f"| {item['name']} | {item['path']} | {item['type']} | {status} | {', '.join(item['dependencies'][:5])} | {item['lastAudit']} |\n"

    with open(DOCS_MAP, 'w') as f:
        f.write(md_content)

    # 4. logs/audit_log.json
    avg_health = round(sum(i["health"] for i in items) / len(items), 1) if items else 0
    issues = []
    suggestions = []
    for i in items:
        if i['metrics']['cyclomaticComplexity'] >= 40:
            issues.append({"id": f"ISS-{i['id']}", "component": i['name'], "severity": "critical", "summary": f"High complexity ({i['metrics']['cyclomaticComplexity']})"})
        if i['metrics']['couplingScore'] >= 8.0:
            suggestions.append({
                "component": i['name'], "priority": "high",
                "rationale": f"High coupling ({i['metrics']['couplingScore']})",
                "suggestion": "Split module; extract logic to service.", "estimatedEffort": "L" if i['metrics']['lines'] > 500 else "M"
            })

    new_log = {
        "date": datetime.date.today().isoformat(),
        "hash": get_data_hash(arch_data),
        "health_score": avg_health,
        "issues_detected": issues[:20],
        "refactor_suggestions": suggestions[:10],
        "system_metrics": stats
    }

    logs = []
    if os.path.exists(AUDIT_LOG):
        try:
            with open(AUDIT_LOG, 'r') as f:
                logs = json.load(f)
                if isinstance(logs, dict): logs = [logs]
        except: pass

    if not logs or logs[0].get('hash') != new_log['hash']:
        logs.insert(0, new_log)
        with open(AUDIT_LOG, 'w') as f:
            json.dump(logs[:365], f, indent=2)

    # 5. system_health.json & 6. health_timeline.json
    health_data = {
        "systemHealth": avg_health, "status": "healthy" if avg_health >= 8.0 else "warning",
        "trend": "stable", "viewsAudited": stats['totalViews'], "lastAudit": datetime.date.today().isoformat()
    }
    write_json_idempotent(HEALTH_JSON, health_data)

    timeline = []
    if os.path.exists(TIMELINE_JSON):
        try:
            with open(TIMELINE_JSON, 'r') as f:
                timeline = json.load(f).get("timeline", [])
        except: pass

    new_event = {"date": datetime.date.today().isoformat(), "score": avg_health, "status": get_status_label(avg_health)}
    if not timeline or timeline[0]['date'] != new_event['date']:
        timeline.insert(0, new_event)
        with open(TIMELINE_JSON, 'w') as f:
            json.dump({"timeline": timeline[:5]}, f, indent=2)

    print(f"SystemHealth: {avg_health}")

if __name__ == "__main__":
    main()
