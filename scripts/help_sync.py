import json
import hashlib
import datetime
import os
import subprocess
import re

# --- CONFIGURATION ---
HELP_JSON = 'docs/help/help_system.json'
HISTORY_LOG = 'docs/help/history.log.json'
SVG_DIR = 'docs/help/svg'
SCREENSHOT_DIR = 'docs/help/screenshots'
SUMMARY_DIR = 'docs/help/daily_summary'

# Ensure directories exist
for d in [SVG_DIR, SCREENSHOT_DIR, SUMMARY_DIR]:
    os.makedirs(d, exist_ok=True)

# --- UTILS ---
def get_last_run_date(data):
    try:
        lr = data.get('metadata', {}).get('lastRun', '2026-03-09T00:00:00Z')
        return lr
    except:
        return '2026-03-09T00:00:00Z'

def get_git_commits(since_date):
    # Convert since_date to a format git likes (if it's ISO)
    try:
        # Simplification: just get last 20 commits for detection in this env
        cmd = ["git", "log", "--pretty=format:%h - %s", "-n", "20"]
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.stdout
    except Exception as e:
        print(f"Git error: {e}")
        return ""

def get_changelog_content():
    try:
        with open('docs/logs/CHANGELOG.md', 'r') as f:
            return f.read()
    except:
        return ""

def calculate_content_hash(data):
    # Hash of modules and flows only
    content = {
        "modules": data.get("modules", {}),
        "flows": data.get("flows", [])
    }
    dump = json.dumps(content, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(dump.encode('utf-8')).hexdigest()

def generate_png_placeholder(filepath, flow_id):
    # Minimal 1x1 PNG pixel base64 for a placeholder, but better to make it look like something
    # Since I don't have Pillow, I'll write a very small valid PNG
    # This is a 100x100 white PNG (minimal)
    minimal_png = (
        b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde'
        b'\x00\x00\x00\x0cIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xdcD\xb1\xe4\x00\x00\x00\x00IEND\xaeB`\x82'
    )
    with open(filepath, 'wb') as f:
        f.write(minimal_png)

def generate_svg(flow_id, title, steps):
    colors = {"success": "#22c55e", "warning": "#f97316", "info": "#3b82f6"}
    svg_content = f"""<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#f8fafc" rx="24"/>
  <text x="30" y="50" font-family="Arial" font-size="24" font-weight="bold" fill="#1e293b">{title}</text>
"""
    for i, step in enumerate(steps):
        y_pos = 100 + (i * 70)
        color = colors["info"] if i % 2 == 0 else colors["success"]
        svg_content += f"""
  <rect x="30" y="{y_pos}" width="30" height="30" fill="{color}" rx="8"/>
  <text x="40" y="{y_pos + 22}" font-family="Arial" font-size="18" font-weight="bold" fill="white">{i+1}</text>
  <text x="80" y="{y_pos + 22}" font-family="Arial" font-size="18" fill="#334155">{step}</text>
"""
        if i < len(steps) - 1:
            svg_content += f'<line x1="45" y1="{y_pos + 30}" x2="45" y2="{y_pos + 70}" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="4"/>'
    svg_content += "\n</svg>"
    with open(os.path.join(SVG_DIR, f"{flow_id}.svg"), 'w') as f:
        f.write(svg_content)

# --- MAIN LOGIC ---
def main():
    if not os.path.exists(HELP_JSON):
        print(f"Error: {HELP_JSON} missing.")
        return

    with open(HELP_JSON, 'r') as f:
        data = json.load(f)

    last_run = get_last_run_date(data)
    commits = get_git_commits(last_run)
    changelog = get_changelog_content()

    # Detect relevant changes
    # 1. Via Git/Changelog
    has_wallet = any(kw in commits.lower() or kw in changelog.lower() for kw in ["wallet", "billetera"])
    has_wiki = any(kw in commits.lower() or kw in changelog.lower() for kw in ["wiki", "contable"])
    has_quick_mode = any(kw in commits.lower() or kw in changelog.lower() for kw in ["modo rápido", "quick_mode", "masiva"])
    has_pos = any(kw in commits.lower() or kw in changelog.lower() for kw in ["pos", "venta", "tpv", "cajero"])
    has_ipv = any(kw in commits.lower() or kw in changelog.lower() for kw in ["ipv", "conciliación", "banco"])

    # 2. Via Module existence (for initial sync of existing features)
    existing_ids = [f['id'] for f in data['flows']]
    if 'wallet_flow' not in existing_ids and os.path.exists('src/components/views/terminal/views/wallet'):
        has_wallet = True
    if 'wiki_flow' not in existing_ids and os.path.exists('src/components/views/terminal/views/wiki'):
        has_wiki = True

    updated_flows = []

    # Apply today's specific sync content if detected
    if has_wallet:
        print("Syncing Wallet...")
        wallet_flow = {
            "id": "wallet_flow",
            "title": "Control de Finanzas con Billetera",
            "role": "gerente",
            "story": {
                "before": "Controlar los gastos pagados por transferencia requería revisar el teléfono constantemente y anotar cada operación en un papel o Excel.",
                "now": "Solo tienes que copiar los SMS del banco y pegarlos en CostPro. El sistema identifica automáticamente si es un pago de electricidad, una transferencia o una compra.",
                "why": "Te da una visión clara y en tiempo real de tu dinero sin tener que ser un experto en contabilidad, permitiéndote tomar mejores decisiones financieras."
            },
            "steps": [
                {"step": 1, "title": "Copiar Mensajes Bancarios", "explanation": "Selecciona y copia los SMS de tu banco (BPA, Bandec o Metropolitano) desde tu aplicación de mensajes en el teléfono."},
                {"step": 2, "title": "Pegar en la Billetera", "explanation": "Entra al módulo 'Billetera', toca el botón 'Importar' y pega el texto. El sistema extraerá montos, fechas y beneficiarios automáticamente."},
                {"step": 3, "title": "Revisar el Dashboard", "explanation": "Cambia a la vista de 'Análisis' para ver gráficos automáticos de tus ingresos, gastos y consumo de servicios (como electricidad)."},
                {"step": 4, "title": "Detectar Duplicados", "explanation": "Usa la función de limpieza para asegurar que ninguna transacción se cuente dos veces, manteniendo tus saldos exactos y confiables."}
            ],
            "visuals": { "screenshot": "pending_capture", "svg_diagram": { "type": "workflow", "steps": ["Copiar SMS", "Importar Datos", "Análisis Visual", "Saldo Exacto"] } }
        }
        # Add or update
        found = False
        for i, f in enumerate(data['flows']):
            if f['id'] == 'wallet_flow':
                data['flows'][i] = wallet_flow
                found = True
                break
        if not found: data['flows'].append(wallet_flow)
        updated_flows.append('wallet_flow')

    if has_wiki:
        print("Syncing Wiki...")
        wiki_flow = {
            "id": "wiki_flow",
            "title": "Uso de la Wiki Contable",
            "role": "contabilidad",
            "story": {
                "before": "Buscar una norma contable o cómo registrar un asiento específico significaba hojear manuales físicos de cientos de páginas.",
                "now": "Escribes lo que buscas en la barra inteligente y el sistema te lleva directamente al asiento, su cuenta relacionada y su base legal en segundos.",
                "why": "Garantiza que toda tu contabilidad cumpla con las normas vigentes (como la Res. 148) de forma automática y sin errores de interpretación."
            },
            "steps": [
                {"step": 1, "title": "Búsqueda Inteligente", "explanation": "Usa la barra de búsqueda superior (o presiona ⌘K) para encontrar cualquier concepto, código de cuenta o tipo de asiento contable."},
                {"step": 2, "title": "Navegación Contextual", "explanation": "Haz clic en cualquier cuenta dentro de un asiento para ver su descripción técnica y uso correcto sin perder el hilo de tu investigación."},
                {"step": 3, "title": "Explorar el Clasificador", "explanation": "Navega por la jerarquía legal de cuentas para entender dónde encaja cada operación dentro de tu balance general."},
                {"step": 4, "title": "Consulta de Asientos", "explanation": "Visualiza el esquema profesional de 'Debe' y 'Haber' para replicarlo fielmente en tus registros diarios, asegurando que 'sumen iguales'."}
            ],
            "visuals": { "screenshot": "pending_capture", "svg_diagram": { "type": "workflow", "steps": ["Buscar Concepto", "Ver Asiento", "Consultar Cuenta", "Base Legal"] } }
        }
        found = False
        for i, f in enumerate(data['flows']):
            if f['id'] == 'wiki_flow':
                data['flows'][i] = wiki_flow
                found = True
                break
        if not found: data['flows'].append(wiki_flow)
        updated_flows.append('wiki_flow')

    if has_quick_mode:
        quick_flow = {
            "id": "quick_mode_flow",
            "title": "Creación Express de Fichas (Modo Rápido)",
            "role": "gerente",
            "story": {
                "before": "Cuando llegaban muchos productos nuevos, registrarlos uno por uno tomaba horas de trabajo administrativo.",
                "now": "Usas una tabla simplificada para ingresar los datos básicos de muchos productos a la vez y el sistema genera las fichas en masa.",
                "why": "Optimiza tu tiempo drásticamente, permitiendo que los productos lleguen a la venta mucho más rápido."
            },
            "steps": [
                {"step": 1, "title": "Activar Modo Rápido", "explanation": "Entra en 'Fichas de Costo' y toca el botón de 'Modo Rápido'."},
                {"step": 2, "title": "Entrada Masiva de Datos", "explanation": "Ingresa el nombre, costo base y precio de venta en la cuadrícula express."},
                {"step": 3, "title": "Generación Masiva Automatizada", "explanation": "Haz clic en 'Generar Todo'. Los productos se enviarán directamente al motor de Generación Masiva para completar sus detalles sin entrada doble de datos."},
                {"step": 4, "title": "Revisión Final", "explanation": "El sistema te lleva a la vista de auditoría para confirmar que todas las fichas se crearon correctamente."}
            ],
            "visuals": { "screenshot": "pending_capture", "svg_diagram": { "type": "workflow", "steps": ["Tabla Express", "Carga Masiva", "Generación AI", "Listo para Venta"] } }
        }
        found = False
        for i, f in enumerate(data['flows']):
            if f['id'] == 'quick_mode_flow':
                data['flows'][i] = quick_flow
                found = True
                break
        if not found: data['flows'].append(quick_flow)
        updated_flows.append('quick_mode_flow')

    if has_pos:
        pos_flow = {
            "id": "sale_flow",
            "title": "Cómo Realizar una Venta",
            "role": "cajero",
            "story": {
                "before": "El cajero debía recordar precios o buscarlos manualmente, causando filas largas y posibles errores en el cobro.",
                "now": "Seleccionas los productos en una interfaz táctil optimizada (botones grandes de 44px) y el sistema calcula el cambio y actualiza el stock al momento.",
                "why": "Mejora la atención al cliente y garantiza que el dinero en caja coincida siempre con los productos vendidos."
            },
            "steps": [
                {"step": 1, "title": "Entrar al TPV", "explanation": "Abre la pantalla de 'Ventas' para ver tu catálogo visual de productos."},
                {"step": 2, "title": "Armar el Carrito", "explanation": "Toca las tarjetas de los productos que el cliente desea llevar. Puedes buscar por nombre o categoría."},
                {"step": 3, "title": "Seleccionar Método de Pago", "explanation": "Elige si el cliente paga en efectivo, transferencia o QR. El sistema aplicará los logos correspondientes al recibo."},
                {"step": 4, "title": "Confirmar y Entregar Recibo", "explanation": "Finaliza la venta. El sistema descuenta el stock y genera el comprobante oficial SC-3-01 automáticamente."}
            ],
            "visuals": { "screenshot": "pending_capture", "svg_diagram": { "type": "workflow", "steps": ["Seleccionar items", "Revisar Totales", "Tipo de Pago", "Recibo SC-3-01"] } }
        }
        found = False
        for i, f in enumerate(data['flows']):
            if f['id'] == 'sale_flow':
                data['flows'][i] = pos_flow
                found = True
                break
        if not found: data['flows'].append(pos_flow)
        updated_flows.append('sale_flow')

    # Idempotency check
    new_hash = calculate_content_hash(data)
    old_hash = data.get('metadata', {}).get('lastHash', '')

    if new_hash == old_hash and os.path.exists(HELP_JSON) and not os.environ.get('FORCE_SYNC'):
        print("Status: no-changes")
        # Just update metadata.lastRun
        data['metadata']['lastRun'] = datetime.datetime.now().isoformat() + "Z"
        data['metadata']['runCount'] = data.get('metadata', {}).get('runCount', 0) + 1
        with open(HELP_JSON, 'w') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return

    # Update metadata
    data['updated_at'] = datetime.datetime.now().isoformat() + "Z"
    if 'metadata' not in data: data['metadata'] = {}
    data['metadata']['lastRun'] = data['updated_at']
    data['metadata']['lastHash'] = new_hash
    data['metadata']['runCount'] = data.get('metadata', {}).get('runCount', 0) + 1
    data['metadata']['lastAgent'] = "Jules"
    data['flows'].sort(key=lambda x: x['id'])

    # Write files
    with open(HELP_JSON, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    # Assets
    for fid in updated_flows:
        flow = next((f for f in data['flows'] if f['id'] == fid), None)
        if flow:
            steps = flow['visuals']['svg_diagram']['steps']
            generate_svg(fid, flow['title'], steps)
            generate_png_placeholder(os.path.join(SCREENSHOT_DIR, f"{fid}_placeholder.png"), fid)

    # History
    history = []
    if os.path.exists(HISTORY_LOG):
        try:
            with open(HISTORY_LOG, 'r') as f: history = json.load(f)
        except: pass

    h_entry = {
        "date": data['updated_at'],
        "runs_since": len(history) + 1,
        "updated_flows": updated_flows,
        "status": "updated",
        "summary": f"Sincronización: {', '.join(updated_flows)}"
    }
    history.append(h_entry)
    with open(HISTORY_LOG, 'w') as f:
        json.dump(history, f, indent=2, ensure_ascii=False)

    # Daily Summary
    today_str = datetime.datetime.now().strftime("%Y-%m-%d")
    summary_path = os.path.join(SUMMARY_DIR, f"{today_str}.md")
    with open(summary_path, 'w') as f:
        f.write(f"# Resumen Diario de Ayuda - {today_str}\n\nActualizados: {', '.join(updated_flows)}\n")

    print(f"Status: updated")
    print(f"Flows: {', '.join(updated_flows)}")

if __name__ == "__main__":
    main()
