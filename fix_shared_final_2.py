import sys

file_path = 'src/lib/cost-engine/shared-mapping.ts'
with open(file_path, 'r') as f:
    content = f.read()

# 1. Fix TotalAnexo return
content = content.replace('if (totalPrefix) return "0";', 'if (totalPrefix) return String(total);')

# 2. Fix AnexoI fallback return (at the end of the lambda)
# We need to find the specific 'return "0";' that is at the end of that replace block.
# Since I used sed -i earlier, I might have messed up.

import re
pattern = r'return String\(sum\);\s+\}\s+\}\s+return "0";\s+\}\);'
replacement = 'return String(sum);\n        }\n      }\n\n      return rowData.classification ? "0" : String(total);\n    });'

content = re.sub(pattern, replacement, content)

with open(file_path, 'w') as f:
    f.write(content)
