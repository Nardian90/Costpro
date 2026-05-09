import sys

file_path = 'src/lib/cost-engine/index.ts'
with open(file_path, 'r') as f:
    content = f.read()

# I suspect I'm missing the part that actually populates the adj map in validateFicha
search_text = "ficha.rows.forEach((row) => {\n    const deps = extractDependencies(row, ficha.rows, knownAnnexes);"
# Wait, let me find where it should be.

insertion = """  ficha.rows.forEach((row) => {
    const deps = extractDependencies(row, ficha.rows, knownAnnexes);
    adj.set(row.id, deps);"""

if "adj.set(row.id, deps);" not in content:
    pos = content.find("parser.functions.SUM_ANEXO = () => 0;") + 38
    content = content[:pos] + "\n\n" + insertion + content[pos:]

with open(file_path, 'w') as f:
    f.write(content)
