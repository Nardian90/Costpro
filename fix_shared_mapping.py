import sys

file_path = 'src/lib/cost-engine/shared-mapping.ts'
with open(file_path, 'r') as f:
    lines = f.readlines()

new_lines = []
skip = 0
for i, line in enumerate(lines):
    if skip > 0:
        skip -= 1
        continue

    # Target the block around lines 507-512
    if "if (formula) formaCalculo = 'FORMULA';" in line and "// Base Calculation mapping" in lines[i+2]:
        # We found the spot.
        # Check if it's the right one by looking at context.
        # Original lines:
        # 507:       // Only override to FORMULA if the formula is meaningful (not auto-generated for a pinned row)
        # 508:       if (formula) formaCalculo = 'FORMULA';
        # 509:
        # 510:       // Base Calculation mapping
        # 511:       let baseCalculo: BaseRef | null = null;
        # 512:       const baseRefId = r.baseDeCalculoRef || r.base_ref;

        new_lines.append("      // Base Calculation mapping\n")
        new_lines.append("      let baseCalculo: BaseRef | null = null;\n")
        new_lines.append("\n")
        new_lines.append("      // Detect shorthand annex references like \"AnexoI\", \"AnexoII\", \"AnexoIII\", etc.\n")
        new_lines.append("      // These are NOT math formulas — they are direct imports from the named Annex.\n")
        new_lines.append("      const ANEXO_SHORTHAND_REGEX = /^Anexo([IVXLC]+)$/i;\n")
        new_lines.append("      const annexShorthandMatch = formula ? ANEXO_SHORTHAND_REGEX.exec(formula.trim()) : null;\n")
        new_lines.append("\n")
        new_lines.append("      if (annexShorthandMatch) {\n")
        new_lines.append("        const romanId = annexShorthandMatch[1].toUpperCase(); // e.g. \"I\", \"II\", \"III\"\n")
        new_lines.append("        baseCalculo = { type: 'ANEXO', anexoId: romanId };\n")
        new_lines.append("        formaCalculo = 'IMPORTAR_ANEXO';\n")
        new_lines.append("        formula = undefined; // Clear formula so the engine doesn't try to evaluate it\n")
        new_lines.append("      }\n")
        new_lines.append("\n")
        new_lines.append("      // Only override to FORMULA if the formula is meaningful (not auto-generated for a pinned row)\n")
        new_lines.append("      if (formula) formaCalculo = 'FORMULA';\n")
        new_lines.append("\n")
        new_lines.append("      const baseRefId = r.baseDeCalculoRef || r.base_ref;\n")

        skip = 4 # Skip the original lines that we replaced (508, 509, 510, 511, 512) -> actually 5 lines?
        # Let's count:
        # i is 508 (0-indexed 507)
        # lines[i] is "      if (formula) formaCalculo = 'FORMULA';\n"
        # lines[i+1] is "\n"
        # lines[i+2] is "      // Base Calculation mapping\n"
        # lines[i+3] is "      let baseCalculo: BaseRef | null = null;\n"
        # lines[i+4] is "      const baseRefId = r.baseDeCalculoRef || r.base_ref;\n"
        # We replace all of these.
        continue
    else:
        new_lines.append(line)

with open(file_path, 'w') as f:
    f.writelines(new_lines)
