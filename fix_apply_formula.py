import re

with open('src/components/views/terminal/views/cost_sheet/CostSheetInteractiveTable.tsx', 'r') as f:
    content = f.read()

# Match the applySuggestedFormula block and replace it with a clean version
# We need to be careful with the closure over path, row, updateValues, etc.

pattern = r"(const applySuggestedFormula = \(\) => \{)(.*?)(\};)"
replacement = r"""const applySuggestedFormula = () => {
    const findInRow = (r: any): any => {
      if (r.id === row.id) return r;
      if (r.children) {
        for (const child of r.children) {
          const found = findInRow(child);
          if (found) return found;
        }
      }
      return null;
    };

    const findInSections = (sections: any[]): any => {
      for (const s of sections) {
        for (const r of s.rows) {
          const found = findInRow(r);
          if (found) return found;
        }
      }
      return null;
    };

    const suggestedRow = findInSections((reinicioTemplate as any).sections);
    if (suggestedRow) {
      const updates: any[] = [];

      const totalFormula = suggestedRow.totalFormula || suggestedRow.formula;
      if (totalFormula) {
        updates.push({ path: [...path, 'totalFormula'], value: totalFormula });
        updates.push({ path: [...path, 'formula'], value: totalFormula });
        updates.push({ path: [...path, 'calculationMethod'], value: 'FORMULA' });
      }

      if (suggestedRow.vhFormula) {
        updates.push({ path: [...path, 'vhFormula'], value: suggestedRow.vhFormula });
      }

      if (updates.length > 0) {
        updateValues(updates);
        toast.success(`Metodología aplicada a: ${row.label}`);
      } else {
        toast.info("No hay una fórmula específica sugerida para esta fila.");
      }
    } else {
      toast.error("No se encontró una fila equivalente en la plantilla de referencia.");
    }
  };"""

# We need a non-greedy or more specific match for the function body
# Since there are multiple "};" in the file, we look for the one that ends the function.
# Looking at the previous grep, suggestedRow is at the end.

# Actually, let's just find the whole block from "const applySuggestedFormula = () => {" to "  };"
# and replace it.

start_marker = "const applySuggestedFormula = () => {"
end_marker = "  const hasChildren = row.children && row.children.length > 0;"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    new_content = content[:start_idx] + replacement + "\n\n\n" + content[end_idx:]
    with open('src/components/views/terminal/views/cost_sheet/CostSheetInteractiveTable.tsx', 'w') as f:
        f.write(new_content)
    print("Successfully patched applySuggestedFormula")
else:
    print(f"Failed to find markers: start={start_idx}, end={end_idx}")
