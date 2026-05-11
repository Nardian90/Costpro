import re

def fix_normalization(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    # 1. Add normalizeClass at top level
    if 'const normalizeClass =' not in content:
        insertion = "\nconst normalizeClass = (s: string) => String(s || '').replace(/\\s+/g, '').toLowerCase();\n"
        content = re.sub(r"(import .* from 'decimal.js';)", r"\1" + insertion, content)

    # 2. Fix assembleFichaJSON normalization
    content = re.sub(
        r"classification: String\(d\.classification \|\| d\.label \|\| ''\)\.split\(.*\)[0]\.trim\(\),",
        "classification: normalizeClass(String(d.classification || d.label || '').split(/[ -]/)[0]),",
        content
    )

    with open(file_path, 'w') as f:
        f.write(content)

if __name__ == "__main__":
    fix_normalization('src/lib/cost-engine/shared-mapping.ts')
