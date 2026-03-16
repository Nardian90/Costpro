import os
import re
import json
import datetime
import hashlib
import argparse

def extract_description(business_logic):
    if not business_logic: return ""
    match = re.search(r"(?:Descripción|1\.\s+Descripción):\s*(.*?)(?:\n|$)", business_logic, re.IGNORECASE)
    if match: return match.group(1).strip()
    return business_logic.split("\n")[0].strip()

def get_layer(path):
    if not path: return "unknown"
    parts = path.split("/")
    if "components" in parts: return "UI Components"
    if "lib" in parts: return "Business Logic"
    if "app" in parts: return "Application"
    if "hooks" in parts: return "Hooks"
    if "store" in parts: return "State Management"
    if "services" in parts: return "Services"
    if "types" in parts: return "Types"
    return "Infrastructure"


# Configuration
BASE_PATHS = ["src/app", "src/components", "src/lib"]
DOCS_MAP = "docs/mapa_vistas.md"
ARCH_JSON = "public/system_architecture.json"
GRAPH_JSON = "public/architecture_graph.json"
AUDIT_JSON = "public/architecture_audit.json"
AUDIT_LOG = "logs/audit_log.json"
HEALTH_JSON = "public/system_health.json"
TIMELINE_JSON = "public/health_timeline.json"
DOCS_QUALITY_REPORT = "docs/reports/DOCUMENTATION_QUALITY_AUDIT.md"

MANUAL_MAPPING = {
    "deepseek-adapter": {
        "logic": """### Descripción
Adaptador especializado para el modelo DeepSeek. Implementa la interfaz AIAdapter para procesamiento de lenguaje natural y generación de fichas de costo.

### Propósito
Proveer una alternativa de bajo costo y alta eficiencia para tareas de razonamiento lógico y estructuración de datos.

### Impacto en el Negocio
Reduce los costos operativos de IA manteniendo la calidad del análisis de costos.""",
        "quality": 9.0,
        "openQuestions": ["¿Cómo manejar los timeouts específicos de este proveedor?"]
    },
    "useStoresView": {
        "logic": """### Descripción
Hook de gestión reactiva para la terminal de tiendas. Orquesta la selección de sucursales, filtrado de estados operativos y sincronización con el estado global de la aplicación.

### Propósito
Centralizar la lógica de navegación y estado de las tiendas para evitar duplicidad en componentes de UI.

### Flujo Funcional
1. Carga tiendas desde el StoreContext.
2. Aplica filtros de búsqueda y estado.
3. Gestiona la persistencia de la selección actual en localStorage.

### Impacto en el Negocio
Optimiza la velocidad de despacho permitiendo a los cajeros cambiar rápidamente entre almacenes sin recargar la aplicación.""",
        "quality": 9.0,
        "openQuestions": [
            "¿Deberíamos implementar un pre-fetching de inventario al seleccionar una tienda?",
            "¿Es necesario persistir los filtros de búsqueda entre sesiones?"
        ]
    },
    "MatchingEngine": {
        "logic": """### Descripción
Motor de reconciliación algorítmica (IPV). Ejecuta una estrategia de 7 pases para vincular transacciones bancarias con movimientos de producto.

### Propósito
Garantizar la integridad financiera automatizando la detección de discrepancias entre ventas declaradas y depósitos bancarios.

### Flujo Funcional
- PASS 1: Referencia exacta.
- PASS 2: Suma exacta (backtracking).
- PASS 5: Tolerancia de cuadre (cents).

### Impacto en el Negocio
Reduce el tiempo de auditoría manual en un 85% y detecta fugas de capital en tiempo real.""",
        "quality": 10.0,
        "openQuestions": [
            "¿El PASS 2 debería limitarse a un máximo de 5 elementos para evitar latencia?",
            "¿Cómo manejar transacciones bancarias que cubren múltiples días de ventas?"
        ]
    },
    "InventoryView": {
        "logic": """### Descripción
Panel de control ejecutivo para la gestión de existencias. Visualiza niveles de stock, alertas de reposición y valorización de inventario.

### Propósito
Proporcionar visibilidad total del capital inmovilizado y asegurar la continuidad operativa mediante reabastecimiento inteligente.

### Flujo Funcional
Integra datos de movimientos locales (Dexie) con el catálogo maestro de Supabase.

### Impacto en el Negocio
Previene quiebres de stock y sobre-inventario, optimizando el flujo de caja del negocio.""",
        "quality": 8.5,
        "openQuestions": [
            "¿Debería integrarse una alerta push para niveles críticos de stock?"
        ]
    },
        "CatalogTable": {
        "logic": """### Descripción
Componente central para la visualización y gestión del catálogo de productos. Proporciona una interfaz tabular con capacidades de filtrado avanzado, edición en línea y visualización de métricas de inventario (Inicial, Entrada, Salida, Ventas, Final).

### Propósito
Actuar como la fuente de verdad única para la disponibilidad y precios de productos en el punto de venta.

### Flujo Funcional
1. Recupera datos de productos desde Dexie.
2. Calcula balances de inventario en tiempo real basados en movimientos.
3. Permite la exportación de datos a Excel para auditorías externas.

### Impacto en el Negocio
Garantiza la coherencia de precios y stock en toda la organización, reduciendo errores de facturación y facilitando el reaprovisionamiento.""",
        "quality": 9.0,
        "openQuestions": ["¿Deberíamos implementar edición masiva de precios por categoría?"]
    },
    "BankIngestion": {
        "logic": """### Descripción
Módulo de procesamiento de estados de cuenta bancarios. Automatiza la extracción y normalización de transacciones desde reportes en formato texto o SMS.

### Propósito
Eliminar la carga manual de datos bancarios y preparar la información para el motor de conciliación IPV.

### Flujo Funcional
- Parser: Identifica bloques de transacciones mediante expresiones regulares dinámicas.
- Normalizador: Estandariza campos (fecha, monto, referencia, tipo).
- Almacenamiento: Persiste transacciones en la tabla bank_statements de Dexie.

### Impacto en el Negocio
Ahorra horas de trabajo administrativo y asegura que el 100% de los ingresos digitales sean auditados contra las ventas del POS.""",
        "quality": 9.5,
        "openQuestions": ["¿Es necesario soportar nuevos formatos de bancos internacionales?"]
    },
    "POSView": {
        "logic": """### Descripción
Interfaz principal del punto de venta. Diseñada para operaciones de alta velocidad con soporte para escaneo de códigos de barras y múltiples métodos de pago.

### Propósito
Facilitar la transacción comercial minimizando el tiempo de espera del cliente y asegurando la integridad del inventario.

### Flujo Funcional
1. Construcción del carrito de compras.
2. Aplicación de reglas de negocio (descuentos, impuestos).
3. Finalización de venta y generación de comprobante (SC-3-01).

### Impacto en el Negocio
Es el generador primario de ingresos del sistema. Su estabilidad y velocidad impactan directamente en la satisfacción del cliente y la eficiencia del cajero.""",
        "quality": 8.5,
        "openQuestions": ["¿Debería integrarse soporte para básculas de peso en tiempo real?"]
    },    "CostSheetWizard": "Facilita la creación estandarizada de fichas de costo. Automatiza la aplicación de la Resolución 12/2007 para asegurar que todos los cálculos de precios cumplan con la normativa legal vigente.",
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
    if os.path.exists(ARCH_JSON):
        try:
            with open(ARCH_JSON, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return {item['id']: item for item in data.get('architecture', [])}
        except: return {}
    return {}

def get_logic_for_component(node_id, path, existing_item):
    if existing_item and existing_item.get('is_documented'):
        # Preserve manual high-quality documentation
        if not str(existing_item.get('business_logic', '')).startswith("[No definido"):
             return (existing_item.get('business_logic'),
                    True,
                    existing_item.get('documentation_quality', 10),
                    existing_item.get('openQuestions', []))

    # Check explicit mapping
    if node_id in MANUAL_MAPPING:
        mapping = MANUAL_MAPPING[node_id]
        if isinstance(mapping, dict):
            return (mapping.get('logic', ''),
                    True,
                    mapping.get('quality', 10.0),
                    mapping.get('openQuestions', []))
        return mapping, True, 10.0, existing_item.get('openQuestions', []) if existing_item else []

    # Default logic for undocumented components
    itype = get_type(path)
    parts = path.split('/')
    module = parts[4] if len(parts) > 4 else parts[1] if len(parts) > 1 else "root"
    logic = f"[No definido en el manual] Componente técnico {node_id} encargado de soportar la funcionalidad operativa del módulo {module}."
    return logic, False, 3.0, existing_item.get('openQuestions', []) if existing_item else []

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
    items, _, _ = scan_project()
    os.makedirs("docs", exist_ok=True)

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
    print(f"Phase 1 complete. Updated {DOCS_MAP}.")

def run_phase_2():
    print("Executing Phase 2: Dependency Graph Generation...")
    items, edges, _ = scan_project()
    os.makedirs("public", exist_ok=True)

    graph_stats = {
        "totalNodes": len(items),
        "totalEdges": len(edges),
        "topCoupled": [i['name'] for i in sorted(items, key=lambda x: x['metrics']['couplingScore'], reverse=True)[:5]],
        "communities": []
    }
    graph_data = {"nodes": [{"id": i["id"], "type": i["type"]} for i in items], "edges": edges, "graphStats": graph_stats}
    with open(GRAPH_JSON, 'w', encoding='utf-8') as f:
        json.dump(graph_data, f, indent=2, ensure_ascii=False)
    print(f"Phase 2 complete. Generated {GRAPH_JSON}.")

def run_phase_3():
    print("Executing Phase 3: System Architecture and Audit Update...")
    items, _, _ = scan_project()
    os.makedirs("public", exist_ok=True)

    # 1. system_architecture.json
    arch_components = []
    for i in items:
        arch_components.append({
            "component_id": i["id"],
            "type": i["type"],
            "path": i["path"],
            "layer": get_layer(i["path"]),
            "description": extract_description(i.get("business_logic", ""))
        })

    with open(ARCH_JSON, 'w', encoding='utf-8') as f:
        json.dump({"components": arch_components}, f, indent=2, ensure_ascii=False)

    # 2. architecture_audit.json
    audit_data = []
    for i in items:
        m = i.get("metrics", {})
        audit_data.append({
            "component_id": i["id"],
            "health": i["health"],
            "lines": m.get("lines"),
            "cyclomaticComplexity": m.get("cyclomaticComplexity"),
            "couplingScore": m.get("couplingScore"),
            "documentation_quality": i.get("documentation_quality"),
            "openQuestions": i.get("openQuestions", []),
            "technical_risk": "Low",
            "complexity": "Medium"
        })

    with open(AUDIT_JSON, 'w', encoding='utf-8') as f:
        json.dump({"audit": audit_data}, f, indent=2, ensure_ascii=False)

    print(f"Phase 3 complete. Updated {ARCH_JSON} and {AUDIT_JSON}.")


def run_phase_4():
    print("Executing Phase 4: Documentation Quality Audit...")
    items, _, _ = scan_project()
    os.makedirs(os.path.dirname(DOCS_QUALITY_REPORT), exist_ok=True)

    total = len(items)
    documented = len([i for i in items if i.get('is_documented')])
    avg_quality = round(sum(i.get('documentation_quality', 0) for i in items) / total, 2) if total else 0
    coverage = round((documented / total) * 100, 1) if total else 0

    modules = {}
    for i in items:
        parts = i['path'].split('/')
        module = parts[4] if len(parts) > 4 else parts[1] if len(parts) > 1 else "root"
        if module not in modules:
            modules[module] = {"total": 0, "documented": 0, "quality_sum": 0}
        modules[module]["total"] += 1
        if i.get('is_documented'):
            modules[module]["documented"] += 1
        modules[module]["quality_sum"] += i.get('documentation_quality', 0)

    module_stats = []
    for name, stats in sorted(modules.items()):
        m_avg = round(stats["quality_sum"] / stats["total"], 2)
        status = "Alcanzado" if m_avg >= 7.0 else "En progreso"
        module_stats.append(f"| **{name.capitalize()}** | **{m_avg}** | 7.0-8.0 | {status} |")

    report = f"""# Auditoría de Calidad de Documentación - Ejecución Automática

## 1. Resumen Ejecutivo
**Fecha:** {datetime.date.today().isoformat()}
**Promedio Global de Calidad:** **{avg_quality}**
**Cobertura de Documentación:** {documented} / {total} ({coverage}%)

---

## 2. Desglose por Módulo
| Módulo | Calidad Actual | Meta | Estado |
| :--- | :---: | :---: | :--- |
{chr(10).join(module_stats)}

---

## 3. Conclusión
El sistema mantiene un nivel de documentación de {avg_quality}/10.
Se requiere atención en los componentes con puntuación inferior a 7.0 para asegurar la transferencia de conocimiento y sostenibilidad del software.

---

## 4. Próximos Pasos
- Identificar utilidades críticas con documentación base (3.0) para mejora inmediata.
- Sincronizar descripciones de lógica de negocio en componentes de UI recientemente agregados.
"""
    with open(DOCS_QUALITY_REPORT, 'w', encoding='utf-8') as f:
        f.write(report)
    print(f"Phase 4 complete. Updated {DOCS_QUALITY_REPORT}.")

def run_phase_5():
    print("Executing Phase 5: ADR Generation...")
    adr_dir = "docs/architecture/ADR"
    os.makedirs(adr_dir, exist_ok=True)

    adrs = [
        {
            "id": "ADR-001",
            "title": "Uso de Variables Semánticas para Temas",
            "status": "Accepted",
            "date": "2026-03-12",
            "context": "El sistema soporta múltiples temas (fast-light, fast-dark, neumo). Los colores hardcodeados rompen la consistencia visual.",
            "decision": "Se prohíbe el uso de colores hardcodeados (hex, Tailwind colors como bg-white). Se deben usar variables semánticas como bg-background, text-foreground.",
            "consequences": "Mayor facilidad para el mantenimiento de temas y consistencia visual garantizada."
        },
        {
            "id": "ADR-002",
            "title": "Seguridad de API Keys de AI",
            "status": "Accepted",
            "date": "2026-03-12",
            "context": "El sistema utiliza múltiples proveedores de AI (Gemini, GPT, DeepSeek).",
            "decision": "Las llaves de API nunca deben estar en el código. Se deben obtener de variables de entorno o de la base de datos (Supabase ai_api_keys).",
            "consequences": "Mejora la seguridad y permite la rotación de llaves sin desplegar nuevo código."
        },
        {
            "id": "ADR-003",
            "title": "Estandarización de Generación de IDs",
            "status": "Accepted",
            "date": "2026-03-12",
            "context": "El uso del paquete 'uuid' ha causado conflictos de resolución en entornos Next.js/Turbopack.",
            "decision": "Se estandariza el uso de crypto.randomUUID() o generadores internos basados en Date.now() y Math.random() para evitar dependencias externas problemáticas.",
            "consequences": "Eliminación de errores de compilación relacionados con ESM/CJS en la generación de IDs."
        }
    ]

    for adr in adrs:
        filepath = os.path.join(adr_dir, f"{adr['id']}-{adr['title'].replace(' ', '_')}.md")
        content = f"""# {adr['id']}: {adr['title']}

**Estado:** {adr['status']}
**Fecha:** {adr['date']}

## Contexto
{adr['context']}

## Decisión
{adr['decision']}

## Consecuencias
{adr['consequences']}
"""
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

    print(f"Phase 5 complete. Generated {len(adrs)} ADRs in {adr_dir}.")

def run_phase_6():
    print("Executing Phase 6: C4 Architecture Diagrams...")
    diag_dir = "docs/architecture/diagrams"
    os.makedirs(diag_dir, exist_ok=True)

    # 1. System Context Diagram
    context_md = """# C4 System Context Diagram

```mermaid
graph TD
    User((Usuario Final))
    System[CostPro: Sistema de Gestión]
    Supabase[Supabase: Auth & Data]
    BankAPIs[APIs Bancarias]

    User -- "Gestiona costos, ventas e inventario" --> System
    System -- "Almacena datos y autentica" --> Supabase
    System -- "Consulta estados de cuenta" --> BankAPIs
```
"""
    with open(os.path.join(diag_dir, "system-context.md"), 'w', encoding='utf-8') as f:
        f.write(context_md)

    # 2. Container Diagram
    container_md = """# C4 Container Diagram

```mermaid
graph TB
    subgraph Client [Cliente - Navegador/PWA]
        Frontend[Frontend: Next.js + React]
        IDB[(Local Storage: IndexedDB)]
        SW[Service Worker: Offline Sync]
    end

    subgraph Backend [Backend - Supabase]
        Auth[Auth Service]
        Database[(PostgreSQL Database)]
        Functions[Edge Functions]
        Storage[Object Storage]
    end

    Frontend -- "CRUD / Realtime" --> Database
    Frontend -- "Persistencia Local" --> IDB
    Frontend -- "Gestión de Sesión" --> Auth
    Frontend -- "Lógica Pesada / IA" --> Functions
    SW -- "Sincronización" --> Frontend
    SW -- "Caché Offline" --> IDB
```
"""
    with open(os.path.join(diag_dir, "container-architecture.md"), 'w', encoding='utf-8') as f:
        f.write(container_md)

    # 3. Component Diagram (Core Modules)
    component_md = """# C4 Component Diagram (Frontend Core)

```mermaid
graph LR
    subgraph UI_Shell [Shell de la Terminal]
        TerminalShell[TerminalShell.tsx]
        Sidebar[Sidebar.tsx]
        Header[Header.tsx]
    end

    subgraph Engines [Motores de Lógica]
        IPVEngine[IPV Engine: engine.ts]
        CostEngine[Cost Engine: cost-engine/]
        AIOrch[AI Orchestrator: orchestrator.ts]
    end

    subgraph State_Management [Gestión de Estado]
        Zustand[Zustand Stores]
        Dexie[Dexie.js: Local DB]
        ReactQuery[TanStack Query: Cache]
    end

    TerminalShell -- "Orquesta" --> Engines
    Engines -- "Persistencia" --> Dexie
    Engines -- "Estado Global" --> Zustand
    TerminalShell -- "Datos Remotos" --> ReactQuery
```
"""
    with open(os.path.join(diag_dir, "component-architecture.md"), 'w', encoding='utf-8') as f:
        f.write(component_md)

    print(f"Phase 6 complete. Updated C4 diagrams in {diag_dir}.")

def run_phase_7():
    print("Executing Phase 7: Data Model Documentation...")
    dexie_path = "src/lib/dexie.ts"
    prisma_path = "prisma/schema.prisma"
    output_path = "docs/architecture/data-model.md"
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    dexie_mapping = {
        "bank_statements": "BankTransaction",
        "products": "Product",
        "matching_rules": "MatchingRule",
        "reconciliation_lines": "ReconciliationLine",
        "product_movements": "ProductMovement",
        "ipv_reports": "DailyIPVReport",
        "cash_adjustments": "CashAdjustment",
        "daily_aggregates": "DailyAggregate",
        "matching_cache": "MatchingCache",
        "ingestion_errors": "IngestionError",
        "ipv_settings": "IPVSettings",
        "matching_logs": "MatchingLog"
    }

    dexie_tables = []
    if os.path.exists(dexie_path):
        with open(dexie_path, 'r', encoding='utf-8') as f:
            content = f.read()
            # More robust regex to handle nested braces in interfaces
            interfaces = re.findall(r'export interface (\w+) \{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}', content, re.DOTALL)
            interface_map = {name: body.strip() for name, body in interfaces}

            stores_match = re.search(r'\.stores\(\{(.*?)\}\)', content, re.DOTALL)
            if stores_match:
                stores_raw = stores_match.group(1)
                for line in stores_raw.split('\n'):
                    line = line.strip()
                    if not line or line.startswith('//'): continue
                    if ':' in line:
                        parts = line.split(':')
                        table_name = parts[0].strip().strip("'\"")
                        indexes = parts[1].strip().strip("'\",")

                        interface_name = dexie_mapping.get(table_name)
                        fields = interface_map.get(interface_name, "Fields not found")
                        dexie_tables.append({
                            "name": table_name,
                            "indexes": indexes,
                            "fields": fields,
                            "interface": interface_name
                        })

    prisma_models = []
    if os.path.exists(prisma_path):
        with open(prisma_path, 'r', encoding='utf-8') as f:
            content = f.read()
            models = re.findall(r'model (\w+) \{(.*?)\}', content, re.DOTALL)
            for name, body in models:
                prisma_models.append({
                    "name": name,
                    "fields": body.strip()
                })

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write("# Documentación del Modelo de Datos\n\n")
        f.write("## 1. Persistencia Local (IndexedDB via Dexie.js)\n")
        f.write("El sistema utiliza Dexie.js para la gestión de datos locales, permitiendo capacidades offline y alto rendimiento en el cliente.\n\n")
        for table in dexie_tables:
            f.write(f"### Tabla: `{table['name']}`\n")
            f.write(f"**Índices:** `{table['indexes']}`\n\n")
            f.write("```typescript\n")
            f.write(f"// Interface: {table['interface']}\n")
            f.write(f"interface {table['interface']} {{\n")
            f.write(f"  {table['fields']}\n")
            f.write("}\n")
            f.write("```\n\n")

        f.write("## 2. Persistencia Remota (PostgreSQL via Prisma/Supabase)\n")
        f.write("La persistencia global y sincronizada se maneja a través de Supabase con Prisma ORM.\n\n")
        for model in prisma_models:
            f.write(f"### Modelo: `{model['name']}`\n\n")
            f.write("```prisma\n")
            f.write(f"model {model['name']} {{\n")
            f.write(f"  {model['fields']}\n")
            f.write("}\n")
            f.write("```\n\n")

    print(f"Phase 7 complete. Updated {output_path}.")
def run_phase_8():
    print("Executing Phase 8: User Language Translation...")
    components_path = "knowledge/components.json"
    user_help_path = "knowledge/user_help.json"

    if not os.path.exists(components_path):
        print(f"Error: {components_path} not found.")
        return

    with open(components_path, "r", encoding="utf-8") as f:
        components = json.load(f)

    user_help = []
    for comp in components:
        name = comp.get("name", "Component")
        tech_desc = comp.get("technical_description", "Módulo técnico.")

        # Logic to "translate" based on common patterns
        if "IPV" in name or "Matching" in name:
            user_desc = f"Herramienta para la conciliación de inventarios y ventas (IPV). Permite cuadrar los registros bancarios con el stock físico."
            tooltip = "Conciliación de inventarios y ventas."
            modal = "Este módulo automatiza el cruce de información entre lo vendido y lo que realmente hay en almacén."
        elif "Cost" in name:
            user_desc = "Gestión y cálculo de fichas de costo para productos y servicios."
            tooltip = "Cálculo de fichas de costo."
            modal = "Permite desglosar cada gasto asociado a la producción para obtener márgenes de ganancia precisos."
        elif "Auth" in name or "Login" in name:
            user_desc = "Sistema de seguridad y acceso de usuarios."
            tooltip = "Acceso y seguridad."
            modal = "Protege la información del negocio mediante el control de identidades y permisos."
        elif "UI" in name or ".tsx" in name:
            user_desc = f"Elemento de la interfaz de usuario para interactuar con {name}."
            tooltip = f"Interactuar con {name}."
            modal = f"Proporciona los controles visuales necesarios para realizar operaciones en el sistema."
        else:
            user_desc = f"Módulo del sistema para gestionar {name}."
            tooltip = f"Gestionar {name}."
            modal = f"Ayuda a realizar tareas operativas relacionadas con {name} de manera eficiente."

        help_entry = {
            "component_id": comp.get("id"),
            "user_description": user_desc,
            "tooltip_help": tooltip,
            "modal_help": modal,
            "quick_description": tooltip
        }
        user_help.append(help_entry)

        # Update original component as well
        comp["user_description"] = user_desc

    with open(user_help_path, "w", encoding="utf-8") as f:
        json.dump(user_help, f, indent=2, ensure_ascii=False)

    with open(components_path, "w", encoding="utf-8") as f:
        json.dump(components, f, indent=2, ensure_ascii=False)

    print(f"Phase 8 complete. Updated {user_help_path} and {components_path}.")


def run_phase_9():
    print("Executing Phase 9: System Health Evaluation...")
    items, _, _ = scan_project()
    os.makedirs("public", exist_ok=True)

    avg_health = round(sum(i["health"] for i in items) / len(items), 1) if items else 0
    health_data = {
        "systemHealth": avg_health,
        "status": "healthy" if avg_health >= 8.0 else "warning" if avg_health >= 6.0 else "critical",
        "trend": "stable",
        "viewsAudited": len([i for i in items if i["type"] == "view"]),
        "newViews": 0,
        "criticalIssues": len([i for i in items if i["health"] < 6.0]),
        "warnings": len([i for i in items if 6.0 <= i["health"] < 8.0]),
        "lastAudit": datetime.date.today().isoformat()
    }
    with open(HEALTH_JSON, 'w', encoding='utf-8') as f:
        json.dump(health_data, f, indent=2, ensure_ascii=False)
    print(f"Phase 9 complete. Updated {HEALTH_JSON}.")

def run_phase_10():
    print("Executing Phase 10: Maintenance Log...")
    items, edges, all_issues = scan_project()
    os.makedirs("logs", exist_ok=True)
    os.makedirs("public", exist_ok=True)

    avg_health = round(sum(i["health"] for i in items) / len(items), 1) if items else 0

    stats = {
        "totalViews": len([i for i in items if i["type"] == "view"]),
        "totalComponents": len([i for i in items if i["type"] == "component"]),
        "totalServices": len([i for i in items if i["type"] == "service"]),
        "totalHooks": len([i for i in items if i["type"] == "hook"]),
        "totalUtilities": len([i for i in items if i["type"] == "utility"])
    }

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
        "hash": hashlib.sha256(json.dumps(items, sort_keys=True, default=str).encode()).hexdigest(),
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
            "Ciclo de mantenimiento completado",
            "Auditoría de acoplamiento y complejidad"
        ]
    }
    if not timeline or timeline[0]['date'] != new_event['date']:
        timeline.insert(0, new_event)
    else:
        timeline[0] = new_event

    with open(TIMELINE_JSON, 'w', encoding='utf-8') as f:
        json.dump({"timeline": timeline[:10]}, f, indent=2, ensure_ascii=False)
    print(f"Phase 10 complete. Updated {AUDIT_LOG} and {TIMELINE_JSON}.")

def main():
    parser = argparse.ArgumentParser(description="CostPro Audit Agent - Multi-phase Pipeline")
    parser.add_argument("--phase", type=int, choices=range(1, 11), help="Pipeline phase to execute")
    args = parser.parse_args()

    if args.phase == 1:
        run_phase_1()
    elif args.phase == 2:
        run_phase_2()
    elif args.phase == 3:
        run_phase_3()
    elif args.phase == 4:
        run_phase_4()
    elif args.phase == 5:
        run_phase_5()
    elif args.phase == 6:
        run_phase_6()
    elif args.phase == 7:
        run_phase_7()
    elif args.phase == 8:
        run_phase_8()
    elif args.phase == 9:
        run_phase_9()
    elif args.phase == 10:
        run_phase_10()
    elif args.phase:
        print(f"Phase {args.phase} logic not yet implemented in this version.")
    else:
        # Default behavior: run all as Phase 1
        run_phase_1()

if __name__ == "__main__":
    main()
