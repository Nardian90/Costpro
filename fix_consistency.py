import os

def fix_file(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    # Robust normalization for classification strings
    new_content = content.replace(
        "String(d.classification || d.label || '').split(' - ')[0].trim()",
        "String(d.classification || d.label || '').split(/[ -]/)[0].trim()"
    )
    new_content = new_content.replace(
        "String(d.classification || d.label || '').split(/[ -]/)[0].trim()",
        "String(d.classification || d.label || '').split(/[ -]/)[0].trim()"
    )

    if new_content != content:
        with open(file_path, 'w') as f:
            f.write(new_content)
            print(f"Fixed {file_path}")

if __name__ == "__main__":
    fix_file('src/lib/cost-engine/shared-mapping.ts')
    fix_file('src/lib/cost-engine/mapper.ts')
