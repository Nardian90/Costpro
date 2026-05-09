import sys

file_path = 'src/lib/cost-engine/shared-mapping.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Fix the matching logic in evaluateAnnexExpressionShared
old_match = "String(d.classification || d.label || '').split(/[ -]/)[0].trim() === rowClass"
new_match = "(String(d.classification || d.label || '').split(/[ -]/)[0].trim() === rowClass || String(d.classification || d.label || '').split(/[ -]/)[0].trim().startsWith(rowClass + '.'))"

content = content.replace(old_match, new_match)

with open(file_path, 'w') as f:
    f.write(content)
