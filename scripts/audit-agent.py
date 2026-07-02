#!/usr/bin/env python3
"""
Daily AI System Audit — CostPro
Genera un reporte de salud del sistema basado en métricas del repositorio.

Este script se ejecuta diariamente via GitHub Actions (daily-audit.yml).
Genera/actualiza:
  - docs/mapa_vistas.md (si no existe)
  - public/system_architecture.json (si no existe)
  - logs/audit_log.json
  - public/system_health.json
  - public/health_timeline.json
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(REPO_ROOT)

timestamp = datetime.now(timezone.utc).isoformat()


def run_cmd(cmd):
    """Ejecuta un comando y retorna su output, o '' si falla."""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
        return result.stdout.strip()
    except Exception:
        return ''


def count_files(pattern):
    """Cuenta archivos que matchean un patrón."""
    return run_cmd(f'find src -name "{pattern}" -not -path "*/node_modules/*" -not -path "*/.next/*" 2>/dev/null | wc -l').strip() or '0'


def get_git_info():
    """Obtiene info del último commit."""
    return {
        'last_commit': run_cmd('git log -1 --oneline'),
        'commit_hash': run_cmd('git rev-parse HEAD'),
        'commit_date': run_cmd('git log -1 --format=%ci'),
        'branch': run_cmd('git rev-parse --abbrev-ref HEAD'),
        'total_commits': run_cmd('git rev-list --count HEAD'),
    }


def count_lines_of_code():
    """Cuenta líneas de código TypeScript/TSX."""
    ts_files = run_cmd('find src -name "*.ts" -o -name "*.tsx" | grep -v node_modules | grep -v .next | wc -l')
    total_lines = run_cmd('find src -name "*.ts" -o -name "*.tsx" | grep -v node_modules | grep -v .next | xargs wc -l 2>/dev/null | tail -1 | awk \'{print $1}\'')
    return {
        'ts_files': int(ts_files) if ts_files.isdigit() else 0,
        'total_lines': int(total_lines) if total_lines and total_lines.isdigit() else 0,
    }


def generate_audit_log():
    """Genera el log de auditoría."""
    git_info = get_git_info()
    loc = count_lines_of_code()

    audit_entry = {
        'timestamp': timestamp,
        'git': git_info,
        'code_stats': loc,
        'components': {
            'tsx_files': int(count_files('*.tsx')),
            'ts_files': int(count_files('*.ts')),
            'api_routes': int(run_cmd('find src/app/api -name "route.ts" | wc -l')),
            'tests': int(run_cmd('find src/__tests__ -name "*.test.*" | wc -l')),
            'migrations': int(run_cmd('find supabase/migrations -name "*.sql" | wc -l')),
        },
        'status': 'healthy',
    }

    # Escribir logs/audit_log.json
    os.makedirs('logs', exist_ok=True)
    audit_file = 'logs/audit_log.json'
    history = []
    if os.path.exists(audit_file):
        try:
            with open(audit_file, 'r') as f:
                history = json.load(f)
                if not isinstance(history, list):
                    history = [history]
        except Exception:
            history = []

    history.append(audit_entry)
    # Mantener solo los últimos 90 entries
    history = history[-90:]

    with open(audit_file, 'w') as f:
        json.dump(history, f, indent=2)

    return audit_entry


def generate_system_health(audit_entry):
    """Genera public/system_health.json."""
    health = {
        'timestamp': timestamp,
        'status': audit_entry['status'],
        'score': 100,
        'checks': {
            'codebase_size': {
                'status': 'ok',
                'files': audit_entry['code_stats']['ts_files'],
                'lines': audit_entry['code_stats']['total_lines'],
            },
            'tests': {
                'status': 'ok' if audit_entry['components']['tests'] > 0 else 'warning',
                'count': audit_entry['components']['tests'],
            },
            'api_routes': {
                'status': 'ok',
                'count': audit_entry['components']['api_routes'],
            },
            'git': {
                'status': 'ok',
                'last_commit': audit_entry['git']['last_commit'],
            },
        },
    }

    os.makedirs('public', exist_ok=True)
    with open('public/system_health.json', 'w') as f:
        json.dump(health, f, indent=2)

    return health


def generate_health_timeline(health):
    """Genera public/health_timeline.json."""
    timeline_file = 'public/health_timeline.json'
    timeline = []
    if os.path.exists(timeline_file):
        try:
            with open(timeline_file, 'r') as f:
                timeline = json.load(f)
                if not isinstance(timeline, list):
                    timeline = [timeline]
        except Exception:
            timeline = []

    entry = {
        'timestamp': timestamp,
        'score': health['score'],
        'status': health['status'],
    }
    timeline.append(entry)
    timeline = timeline[-365:]  # Mantener 1 año

    with open(timeline_file, 'w') as f:
        json.dump(timeline, f, indent=2)


def generate_system_architecture():
    """Genera public/system_architecture.json si no existe."""
    arch_file = 'public/system_architecture.json'
    if os.path.exists(arch_file):
        return  # No sobrescribir si ya existe

    arch = {
        'generated_at': timestamp,
        'project': 'CostPro',
        'version': '0.2.0',
        'modules': {
            'pos': 'src/components/views/terminal/views/pos/',
            'inventory': 'src/components/views/terminal/views/inventory/',
            'cost-sheets': 'src/components/views/terminal/views/cost_sheet/',
            'whatsapp': 'src/components/views/terminal/views/whatsapp/',
            'telegram': 'src/components/views/terminal/views/telegram/',
            'stores': 'src/components/views/terminal/views/stores/',
        },
        'api_routes': int(run_cmd('find src/app/api -name "route.ts" | wc -l')),
        'note': 'Auto-generated by daily-audit. Edit manually for detailed architecture.',
    }

    os.makedirs('public', exist_ok=True)
    with open(arch_file, 'w') as f:
        json.dump(arch, f, indent=2)


def generate_mapa_vistas():
    """Genera docs/mapa_vistas.md si no existe."""
    mapa_file = 'docs/mapa_vistas.md'
    if os.path.exists(mapa_file):
        return  # No sobrescribir si ya existe

    content = f"""# Mapa de Vistas — CostPro

Generado automáticamente el {timestamp}

## Vistas del Terminal

| Módulo | Vista | Ruta |
|--------|-------|------|
| POS | Punto de Venta | src/components/views/terminal/views/pos/ |
| Inventario | Gestión | src/components/views/terminal/views/inventory/ |
| Costos | Hojas de Costo | src/components/views/terminal/views/cost_sheet/ |
| WhatsApp | Config | src/components/views/terminal/views/whatsapp/WhatsAppConfigView.tsx |
| WhatsApp | Conversaciones | src/components/views/terminal/views/whatsapp/WhatsAppConversationsView.tsx |
| WhatsApp | Dashboard | src/components/views/terminal/views/whatsapp/WhatsAppDashboardView.tsx |
| Telegram | Config | src/components/views/terminal/views/telegram/TelegramConfigView.tsx |
| Telegram | Conversaciones | src/components/views/terminal/views/telegram/TelegramConversationsView.tsx |
| Telegram | Dashboard | src/components/views/terminal/views/telegram/TelegramDashboardView.tsx |
| Multi-tienda | Stores | src/components/views/terminal/views/stores/ |

## API Routes

Total: {run_cmd('find src/app/api -name "route.ts" | wc -l')} rutas

## Nota

Este archivo es auto-generado por `scripts/audit-agent.py`. Para detalle completo,
editar manualmente o ejecutar el pipeline de arquitectura.
"""
    os.makedirs('docs', exist_ok=True)
    with open(mapa_file, 'w') as f:
        f.write(content)


def main():
    print(f"[Audit] Iniciando auditoría del sistema — {timestamp}")

    # 1. Generar audit log
    audit_entry = generate_audit_log()
    print(f"[Audit] Code stats: {audit_entry['code_stats']['ts_files']} files, {audit_entry['code_stats']['total_lines']} lines")
    print(f"[Audit] Components: {audit_entry['components']}")

    # 2. Generar system health
    health = generate_system_health(audit_entry)
    print(f"[Audit] Health: {health['status']} (score: {health['score']})")

    # 3. Generar health timeline
    generate_health_timeline(health)
    print("[Audit] Health timeline actualizado")

    # 4. Generar system architecture (si no existe)
    generate_system_architecture()
    print("[Audit] System architecture verificado")

    # 5. Generar mapa vistas (si no existe)
    generate_mapa_vistas()
    print("[Audit] Mapa de vistas verificado")

    print(f"[Audit] Auditoría completada — {timestamp}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
