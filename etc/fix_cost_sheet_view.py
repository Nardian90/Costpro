import re

file_path = 'src/components/views/terminal/views/cost_sheet/CostSheetView.tsx'
with open(file_path, 'r') as f:
    lines = f.readlines()

# Ensure 'use client' is at the top
content = "".join(lines)
content = content.replace("'use client';", "")
content = content.replace('"use client";', "")
content = "'use client';\n" + content.strip() + "\n"

# Add Sparkles to lucide-react imports
# Search for import { ..., BarChart3, ... } from 'lucide-react';
# and add Sparkles
lucide_pattern = r"import\s+\{([^}]+)\}\s+from\s+'lucide-react';"
def add_sparkles(match):
    imports = match.group(1)
    if 'Sparkles' not in imports:
        return f"import {{ {imports.strip()}, Sparkles }} from 'lucide-react';"
    return match.group(0)

content = re.sub(lucide_pattern, add_sparkles, content)

with open(file_path, 'w') as f:
    f.write(content)
