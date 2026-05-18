import re

with open('src/lib/export/pdf-generator.ts', 'r') as f:
    content = f.read()

# Fix sections.forEach(s =>
content = content.replace('sections.forEach(s =>', 'sections.forEach((s: any) =>')
# Fix sections.forEach(s => in comparativo
content = content.replace('sections.forEach(s =>', 'sections.forEach((s: any) =>')
# Fix sections.forEach(s => in exportacion
content = content.replace('sections.forEach(s =>', 'sections.forEach((s: any) =>')

# Fix rs.forEach(r =>
content = content.replace('rs.forEach(r =>', 'rs.forEach((r: any) =>')

# Fix undefined indigo variable (it was supposed to be a number)
# Let's look for where indigo was used
# biRows.push([{ content: `${s.label} / ${translate(s.label)}`, colSpan: 10, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }]);
# headStyles: { fillColor: [75, 0, indigo], fontSize: 6 } as any,
content = content.replace('headStyles: { fillColor: [75, 0, indigo], fontSize: 6 }', 'headStyles: { fillColor: [75, 0, 130], fontSize: 6 }')

with open('src/lib/export/pdf-generator.ts', 'w') as f:
    f.write(content)
