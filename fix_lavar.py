import re

def fix_lavar_template(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    # 1. Update classifications in Anexo I to match main rows
    content = content.replace("1.1.1 - De ello: - Insumos (MP)", "1.1 - Insumos (MP)")
    content = content.replace("1.3 - - Energía", "1.3 - Energía")

    # 2. Add an item for Water (1.4) since it was missing or mapped to 1.1.1
    # Looking at original data:
    # { "classification": "1.1.1", "description": "Agua", ... }
    # Let's change it to 1.4
    content = re.sub(
        r'\{[^}]*"description":\s*"Agua"[^}]*\}',
        lambda m: m.group(0).replace("1.1 - Insumos (MP)", "1.4 - Agua"),
        content
    )

    # 3. Update Anexo II classification
    content = content.replace("2.1.1 - De ello: Salarios", "2.1 - Salarios")

    # 4. Update Anexo III classification
    content = content.replace("3.1.1.5 - -Aparatos y eq. técnicos", "3.1.5 - Aparatos y eq. técnicos")

    with open(file_path, 'w') as f:
        f.write(content)

if __name__ == "__main__":
    fix_lavar_template('src/lib/data/template-lavar.ts')
