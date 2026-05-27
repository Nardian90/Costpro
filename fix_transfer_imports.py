with open('src/services/transfer-service.ts', 'r') as f:
    content = f.read()

# Remove duplicate imports that have different quotes
content = content.replace('import { z } from "zod";\n', '')
content = content.replace('import { uuidRegex } from "@/validation/schemas";\n', '')

# Check if they already exist with single quotes
if "import { z } from 'zod';" not in content:
    content = "import { z } from 'zod';\n" + content
if "import { uuidRegex } from '@/validation/schemas';" not in content:
    content = "import { uuidRegex } from '@/validation/schemas';\n" + content

with open('src/services/transfer-service.ts', 'w') as f:
    f.write(content)
