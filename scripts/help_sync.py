import json
import hashlib
import datetime
from datetime import timezone
import os
import subprocess
import re

# --- CONFIGURATION ---
HELP_JSON = 'docs/help/help_system.json'
HISTORY_LOG = 'docs/help/history.log.json'
SVG_DIR = 'docs/help/svg'
SCREENSHOT_DIR = 'docs/help/screenshots'
SUMMARY_DIR = 'docs/help/daily_summary'
CHANGELOG_PATH = 'docs/logs/CHANGELOG.md'
PACKAGE_JSON = 'package.json'

INITIALIZER_ENABLED = True
SECRET_REGEX = re.compile(r"(sk-|pk-|secret|token|password)[\s:=]+[\"']?([a-zA-Z0-9_\-\.]{10,})[\"']?", re.I)

# Ensure directories exist
for d in [SVG_DIR, SCREENSHOT_DIR, SUMMARY_DIR]:
    os.makedirs(d, exist_ok=True)

# --- UTILS ---
def scrub_secrets(text):
    return SECRET_REGEX.sub(r"\1: [REDACTED]", text)

def get_app_version():
    try:
        with open(PACKAGE_JSON, 'r') as f:
            data = json.load(f)
            return data.get('version', '5.8.0')
    except: return '5.8.0'

def get_git_commits(since_date):
    try:
        cmd = ["git", "log", "--since", since_date, "--pretty=format:%h - %s", "--no-merges"]
        result = subprocess.run(cmd, capture_output=True, text=True)
        return scrub_secrets(result.stdout)
    except: return ""

def calculate_content_hash(data):
    content = {k: v for k, v in data.items() if k != 'metadata'}
    dump = json.dumps(content, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(dump.encode('utf-8')).hexdigest()

def generate_png_placeholder(filepath, flow_id):
    if os.path.exists(filepath): return
    # Minimal valid PNG of 1200x700 (solid white)
    # 1200x700 white PNG header + minimal IDAT
    minimal_png = (
        b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x04\xb0\x00\x00\x02\xbc\x08\x02\x00\x00\x00\x1f\xdd\xef\x10'
        b'\x00\x00\x00\x0cIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xdcD\xb1\xe4\x00\x00\x00\x00IEND\xaeB`\x82'
    )
    with open(filepath, 'wb') as f: f.write(minimal_png)

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
    with open(os.path.join(SVG_DIR, f"{flow_id}.svg"), 'w') as f: f.write(svg_content)

def initialize_help_system():
    print("Initializing help_system.json...")
    base_data = {
        "app": "CostPro", "version": get_app_version(), "updated_at": datetime.datetime.now().isoformat() + "Z",
        "modules": {
            "terminal": "Operaciones diarias.", "multitienda": "Control de sucursales.", "ipv": "Conciliación e IPV."
        },
        "flows": [], "visual_assets": {"screenshots": [], "svg_diagrams": []},
        "history": {"documentation_changes": []},
        "metadata": {
            "lastRun": "2026-03-09T00:00:00Z", "lastHash": "", "runCount": 0, "lastAgent": "Jules"
        }
    }
    with open(HELP_JSON, 'w') as f: json.dump(base_data, f, indent=2, ensure_ascii=False)
    return base_data

def main():
    if not os.path.exists(HELP_JSON):
        if INITIALIZER_ENABLED: data = initialize_help_system()
        else: return
    else:
        with open(HELP_JSON, 'r') as f: data = json.load(f)

    # Fuzzy scheduler check (22-26h)
    last_run_str = data.get('metadata', {}).get('lastRun')
    if last_run_str:
        last_run = datetime.datetime.fromisoformat(last_run_str.replace('Z', ''))
        now = datetime.datetime.now()
        diff = (now - last_run).total_seconds() / 3600
        if 0 < diff < 22 and not os.environ.get('FORCE_SYNC'):
            print(f"Skipping: Only {diff:.1f}h since last run.")
            return

    app_version = get_app_version()
    commits = get_git_commits(data['metadata']['lastRun'])
    changelog = scrub_secrets(open(CHANGELOG_PATH).read())

    updated_flows = []

    # Modules to check
    checks = [
        ("wallet_flow", ["wallet", "billetera"], "Billetera", "gerente", "Control de finanzas."),
        ("wiki_flow", ["wiki", "contable"], "Wiki Contable", "contabilidad", "Guía normativa."),
        ("sale_flow", ["pos", "venta", "tpv"], "Venta POS", "cajero", "Operación de caja."),
        ("ipv_reconciliation_flow", ["ipv", "conciliación"], "IPV", "contabilidad", "Conciliación bancaria.")
    ]

    # Specific 5.7.25 "Modo Rápido"
    if "Modo Rápido" in commits or "[5.7.25]" in changelog:
        fid = "quick_mode_flow"
        quick_flow = {
            "id": fid, "title": "Creación Express y Generación Masiva", "role": "gerente",
            "story": {
                "before": "Registrar productos nuevos tomaba horas de duplicidad.",
                "now": "Usas una tabla express que transfiere automáticamente todo al motor de Generación Masiva.",
                "why": "Elimina el re-trabajo y acelera la venta."
            },
            "steps": [
                {"step": 1, "title": "Modo Rápido", "explanation": "Abre la cuadrícula express en Fichas."},
                {"step": 2, "title": "Ingreso Masivo", "explanation": "Escribe datos básicos tipo Excel."},
                {"step": 3, "title": "Transferencia", "explanation": "Los datos viajan solos a Generación Masiva."},
                {"step": 4, "title": "Auditoría", "explanation": "Revisa el resultado final completado por IA."}
            ],
            "visuals": {
                "screenshot": "pending_capture",
                "svg_diagram": { "type": "workflow", "steps": ["Tabla Express", "Auto-Transferencia", "Generación Masiva", "Auditoría Final"] }
            }
        }
        for i, f in enumerate(data['flows']):
            if f['id'] == fid: data['flows'][i] = quick_flow; break
        else: data['flows'].append(quick_flow)
        updated_flows.append(fid)
        if not any(h['version'] == "5.7.25" for h in data['history']['documentation_changes']):
            data['history']['documentation_changes'].append({
                "version": "5.7.25", "date": datetime.datetime.now().strftime("%Y-%m-%d"),
                "description": "Integración de Modo Rápido con Generación Masiva."
            })

    # Update version
    if app_version > data['version']: data['version'] = app_version

    # Idempotency
    new_hash = calculate_content_hash(data)
    if new_hash == data['metadata'].get('lastHash') and not os.environ.get('FORCE_SYNC'):
        print("Status: no-changes")
        data['metadata']['lastRun'] = datetime.datetime.now().isoformat() + "Z"
        json.dump(data, open(HELP_JSON, 'w'), indent=2, ensure_ascii=False)
        return

    # Metadata & Save
    data['updated_at'] = datetime.datetime.now().isoformat() + "Z"
    data['metadata'].update({
        "lastRun": data['updated_at'], "lastHash": new_hash,
        "runCount": data['metadata'].get('runCount', 0) + 1, "lastAgent": "Jules"
    })
    data['flows'].sort(key=lambda x: x['id'])
    json.dump(data, open(HELP_JSON, 'w'), indent=2, ensure_ascii=False)

    # Assets, History, Summary
    for fid in updated_flows:
        flow = next(f for f in data['flows'] if f['id'] == fid)
        generate_svg(fid, flow['title'], flow['visuals']['svg_diagram']['steps'])
        generate_png_placeholder(os.path.join(SCREENSHOT_DIR, f"{fid}_placeholder.png"), fid)

    history = []
    if os.path.exists(HISTORY_LOG):
        try: history = json.load(open(HISTORY_LOG))
        except: pass
    history.append({
        "date": data['updated_at'], "runs_since": len(history) + 1,
        "updated_flows": updated_flows, "status": "updated",
        "summary": f"Sincronización v{data['version']}: {', '.join(updated_flows)}"
    })
    json.dump(history, open(HISTORY_LOG, 'w'), indent=2, ensure_ascii=False)

    today_str = datetime.datetime.now().strftime("%Y-%m-%d")
    with open(os.path.join(SUMMARY_DIR, f"{today_str}.md"), 'w') as f:
        f.write(f"# Resumen Diario de Ayuda - {today_str}\n\n")
        for fid in updated_flows:
            flow = next(f for f in data['flows'] if f['id'] == fid)
            f.write(f"### 🚀 {flow['title']}\n**Antes:** {flow['story']['before']}\n**Ahora:** {flow['story']['now']}\n")
            f.write(f"Diagrama: [SVG](../svg/{fid}.svg) | Placeholder: [Capture](../screenshots/{fid}_placeholder.png)\n\n")
        f.write("\n---\n*Sincronizado por Jules (CostPro)*")

    # Git Commit
    subprocess.run(["git", "add", HELP_JSON, HISTORY_LOG, SUMMARY_DIR, SVG_DIR, SCREENSHOT_DIR])
    subprocess.run(["git", "commit", "-m", f"docs(help): update help system — {', '.join(updated_flows)}"])
    print(f"Status: updated. Flows: {', '.join(updated_flows)}")

if __name__ == "__main__": main()
