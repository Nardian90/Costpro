import os

with open('src/services/transfer-service.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
imported_z = False
imported_uuid = False

for line in lines:
    if "import { z }" in line:
        imported_z = True
    if "import { uuidRegex }" in line or "from '@/validation/schemas'" in line:
        if "uuidRegex" in line:
            imported_uuid = True
    new_lines.append(line)

# Add missing imports if needed
if not imported_z:
    new_lines.insert(0, "import { z } from 'zod';\n")
if not imported_uuid:
    # Check if we can add it to existing schemas import
    found = False
    for i, line in enumerate(new_lines):
        if "from '@/validation/schemas'" in line and "confirmTransferParamsSchema" in line:
            new_lines[i] = line.replace("confirmTransferParamsSchema", "confirmTransferParamsSchema,\n  uuidRegex")
            found = True
            break
    if not found:
        new_lines.insert(1, "import { uuidRegex } from '@/validation/schemas';\n")

with open('src/services/transfer-service.ts', 'w') as f:
    f.writelines(new_lines)

print("Fixed transfer-service.ts imports")
