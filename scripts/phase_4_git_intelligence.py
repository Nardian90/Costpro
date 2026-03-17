#!/usr/bin/env python3
"""
phase_4_git_intelligence.py
Detects recent changes in the repository using Git history.
Identifies major structural changes to trigger re-execution of discovery phases.
"""

import os
import json
import subprocess
import sys
import yaml
from datetime import datetime, timezone

# Import commit_artifact
sys.path.append('scripts')
from commit_artifact import commit_artifact

STATE_PATH = "docs/automation/pipeline_state.yaml"

def load_state():
    if not os.path.exists(STATE_PATH):
        return {}
    with open(STATE_PATH, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

def get_git_changes(since_iso):
    """Returns a list of changed files with their status since the given ISO date."""
    try:
        # git log --since="2026-03-17T22:36:40Z" --name-status --pretty=format:
        cmd = ["git", "log", f"--since={since_iso}", "--name-status", "--pretty=format:"]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        lines = result.stdout.strip().split('\n')

        changes = []
        for line in lines:
            if not line.strip(): continue
            parts = line.split('\t')
            if len(parts) >= 2:
                status, path = parts[0], parts[1]
                changes.append({"status": status, "path": path})
        return changes
    except subprocess.CalledProcessError as e:
        print(f"Error running git log: {e}", file=sys.stderr)
        return []

def is_major_change(changes):
    """Heuristic to determine if a major structural change occurred."""
    if len(changes) > 20:
        return True, "More than 20 files changed."

    structural_files = [
        "package.json",
        "package-lock.json",
        "prisma/schema.prisma",
        "next.config.js",
        "tailwind.config.js",
        "tsconfig.json"
    ]

    for change in changes:
        if any(sf in change["path"] for sf in structural_files):
            return True, f"Structural file changed: {change['path']}"

    return False, "Minor changes detected."

def execute_phase_4():
    print("Executing Phase 4: Git Change Intelligence...")

    state = load_state()
    last_execution = state.get("lastExecution")

    # If no last execution, assume full scan or just very recent
    if not last_execution:
        print("No lastExecution found in state. Checking last 24h.")
        last_execution = (datetime.now(timezone.utc)).isoformat() # This is too recent, let's fallback to a day ago
        # Actually, let's use a dummy date if it's the first time
        last_execution = "1970-01-01T00:00:00Z"

    changes = get_git_changes(last_execution)

    added = [c["path"] for c in changes if c["status"] == 'A']
    modified = [c["path"] for c in changes if c["status"] == 'M']
    deleted = [c["path"] for c in changes if c["status"] == 'D']

    major, reason = is_major_change(changes)

    changes_report = {
        "timestamp": datetime.now(timezone.utc).isoformat() + 'Z',
        "since": last_execution,
        "summary": {
            "total": len(changes),
            "added": len(added),
            "modified": len(modified),
            "deleted": len(deleted)
        },
        "majorChange": major,
        "reason": reason,
        "files": {
            "added": added,
            "modified": modified,
            "deleted": deleted
        }
    }

    temp_report = "architecture_changes.temp.json"
    with open(temp_report, 'w', encoding='utf-8') as f:
        json.dump(changes_report, f, indent=2, ensure_ascii=False)

    print(f"Detected {len(changes)} changes. Major: {major} ({reason})")
    commit_artifact("architecture_changes", temp_report, 100, 4)

    if os.path.exists(temp_report):
        os.remove(temp_report)

    if major:
        print("TRIGGER_RE_EXECUTION")

    print("Phase 4 Complete.")

if __name__ == "__main__":
    execute_phase_4()
