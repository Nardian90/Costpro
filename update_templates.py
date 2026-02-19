import re
import os

files = ['src/lib/data/costpro-reinicio.ts', 'src/lib/data/costpro-ejemplo.ts']

for file_path in files:
    with open(file_path, 'r') as f:
        content = f.read()

    # 1. Simplify ref('X.Y.Z') or ref('X.Y') -> X.Y.Z / X.Y
    content = re.sub(r"ref\('(\d+(\.\d+)+)'\)", r"\1", content)

    # 2. Simplify vh('X.Y.Z') -> vh(X.Y.Z)
    content = re.sub(r"vh\('(\d+(\.\d+)+)'\)", r"vh(\1)", content)

    # 3. Handle single level ref('12') -> if user really wants to eliminate ref(''),
    # but as discussed it's risky for the parser.
    # However, in the TEMPLATE, we can keep it for now or change it if we improve parser.
    # The user said "Eliminar ref('')".

    # Let's see if we can simplify some more.
    # ref('12') -> 12.0? No.

    # Let's also handle ref("12") (double quotes)
    content = re.sub(r'ref\("(\d+(\.\d+)+)"\)', r"\1", content)

    # And vh("12")
    content = re.sub(r'vh\("(\d+(\.\d+)+)"\)', r"vh(\1)", content)

    with open(file_path, 'w') as f:
        f.write(content)

print("Templates updated.")
