import re

file_path = 'src/lib/cost-engine/formula-utils.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Improved logic:
# 1. Simplify Syntax: Recognize numeric cell references
# We'll support X.Y and X.Y.Z etc.
# We'll also handle the case where they are already in ref() to avoid double wrapping.
logic = """
  // 1. Simplify Syntax: Recognize numeric cell references (e.g. 1.1, 1.1.1)
  // We avoid matching numbers that are clearly literals (like 0.5, 100, etc.) if possible,
  // but in this engine, most decimals are references.
  // We use a regex that looks for numeric patterns that are not part of a larger number or ref()

  // First, handle vh(ID) -> vh('ID') if not already quoted
  translated = translated.replace(/\\bvh\\(([^'\\)]+)\\)/gi, (match, p1) => {
      const id = p1.trim();
      if (id.startsWith("'") || id.startsWith('"')) return match;
      return `vh('${id}')`;
  });

  // Then, replace X.Y.Z or X.Y that are NOT already inside ref('')
  // We look for patterns like 1.1 or 1.1.1 that are NOT preceded by ref(' or "
  // And NOT followed by ' or "
  // Positive lookbehind for ref(' or ref(" is not supported in all JS environments, so we do it carefully.

  // Actually, a simpler way is to replace all X.Y.Z first, then fix any ref('ref('...'))')
  // But let's use a regex that matches if it's NOT surrounded by quotes.
  translated = translated.replace(/(?<!['"])\\b(\\d+(\\.\\d+)+)\\b(?!['"])/g, "ref('$1')");

  // For single level like '12', it's still safer to use ref('12') unless we are sure.
  // But the user said "1.1.1 + 1.1.2".
"""

if "let translated = formula;" in content:
    content = content.replace("let translated = formula;", "let translated = formula;" + logic)

with open(file_path, 'w') as f:
    f.write(content)
