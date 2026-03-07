import sys

with open('src/hooks/logic/useCostSheetCalculator.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if "const evaluateAnnexExpression =" in line:
        new_lines.append(line)
        idx = lines.index(line)
        # We'll just replace the whole function body to be safe
        new_lines.append("  if (expression === undefined || expression === null || expression === '') return 0;\n")
        new_lines.append("  if (typeof expression === 'number') return expression;\n")
        new_lines.append("  const trimmed = String(expression).trim();\n")
        new_lines.append("  if (trimmed === '') return 0;\n")
        new_lines.append("  if (/^-?\\d*\\.?\\d+$/.test(trimmed)) {\n")
        new_lines.append("    return parseFloat(trimmed);\n")
        new_lines.append("  }\n")
        new_lines.append("  let expr = '';\n")
        new_lines.append("  try {\n")
        new_lines.append("    expr = trimmed;\n")
        new_lines.append("    if (expr.startsWith('=')) expr = expr.substring(1);\n")

        # Skip until the end of original function header replacements
        # Actually, let's just find the closing brace of evaluateAnnexExpression
        continue

    # I'll just rewrite the whole file carefully with a template if it gets too messy
    new_lines.append(line)

# Actually, let's use a simpler approach. I know the content of the functions.
