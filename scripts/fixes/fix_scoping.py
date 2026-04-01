import sys
import re

with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'r') as f:
    content = f.read()

# Pattern for the misplaced highlight in the wrapper div
misplaced_pattern = r'className=\{cn\(\s+\(annex\.coefficient && annex\.coefficient !== 1 && \(.*?\)\) && "ring-1 ring-primary/30 bg-primary/5",'

# Search for both occurrences of this pattern and replace with just className={cn(
content = re.sub(misplaced_pattern, 'className={cn(', content, flags=re.DOTALL)

with open('src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx', 'w') as f:
    f.write(content)
