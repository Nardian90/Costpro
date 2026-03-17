import os
import re

def clean_ipv_view():
    path = 'src/components/views/terminal/views/ipv/IPVView.tsx'
    if not os.path.exists(path):
        print(f"File not found: {path}")
        return
    with open(path, 'r') as f:
        lines = f.readlines()

    # Remove all MatchingAuditView imports
    new_lines = [line for line in lines if 'import { MatchingAuditView }' not in line]

    # Find lucide-react import end
    for i, line in enumerate(new_lines):
        if "} from 'lucide-react';" in line:
            new_lines.insert(i + 1, "import { MatchingAuditView } from './MatchingAuditView';\n")
            break

    with open(path, 'w') as f:
        f.writelines(new_lines)
    print("Cleaned IPVView.tsx")

def clean_engine():
    path = 'src/lib/ipv/engine.ts'
    if not os.path.exists(path):
        print(f"File not found: {path}")
        return
    with open(path, 'r') as f:
        content = f.read()

    # Check for duplicate isComplete in matchTransaction
    # The first one is at line 399 (approx)
    # The second one was at 415 (which I should have deleted)

    # I'll just use a more surgical approach
    lines = content.split('\n')
    is_complete_count = 0
    new_lines = []
    for line in lines:
        if 'const isComplete = Math.abs(remaining_cents) < 0.001;' in line:
            is_complete_count += 1
            if is_complete_count > 1:
                print(f"Removing duplicate isComplete at line {len(new_lines)+1}")
                continue
        new_lines.append(line)

    with open(path, 'w') as f:
        f.write('\n'.join(new_lines))
    print("Cleaned engine.ts")

clean_ipv_view()
clean_engine()
