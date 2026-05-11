import re
import os

def fix_file(path):
    with open(file_path, 'r') as f:
        content = f.read()

    # Add normalizeClass if missing
    if 'const normalizeClass =' not in content:
        insertion = "\nconst normalizeClass = (s: string) => String(s || '').replace(/\\s+/g, '').toLowerCase();\n"
        content = content.replace("import Decimal from 'decimal.js';", "import Decimal from 'decimal.js';" + insertion)

    # Use it in assembly
    content = re.sub(
        r"classification: String\(d\.classification \|\| d\.label \|\| ''\)\.split\(/\[ -\]/\)\[0\]\.trim\(\),",
        "classification: normalizeClass(String(d.classification || d.label || '').split(/[ -]/)[0]),",
        content
    )
    # Also handle the variant without regex if it exists
    content = re.sub(
        r"classification: String\(d\.classification \|\| d\.label \|\| ''\)\.split\(' - '\)\[0\]\.trim\(\),",
        "classification: normalizeClass(String(d.classification || d.label || '').split(/[ -]/)[0]),",
        content
    )

    with open(file_path, 'w') as f:
        f.write(content)

if __name__ == "__main__":
    for file_path in ['src/lib/cost-engine/shared-mapping.ts', 'src/lib/cost-engine/mapper.ts']:
        if os.path.exists(file_path):
            fix_file(file_path)
