import sys

file_path = 'src/components/views/terminal/views/ipv/IPVView.tsx'
with open(file_path, 'r') as f:
    lines = f.readlines()

new_lines = []
imported = False
for line in lines:
    new_lines.append(line)
    if not imported and "from './CatalogTable';" in line:
        new_lines.append("import MovementsView from './MovementsView';\n")
        imported = True

with open(file_path, 'w') as f:
    f.writelines(new_lines)
