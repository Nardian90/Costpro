file_path = 'src/lib/cost-engine/index.ts'
with open(file_path, 'r') as f:
    content = f.read()

helper_code = """  const smartTranslate = (formula: string) => {
    let translated = translateFormulaFromSpanish(formula);
    // Support numeric references like 1.1.1 by wrapping them in ref()
    // ONLY if they match a known row classification or ID
    return translated.replace(/\\\\b(\\\\d+(\\\\.\\\\d+)+)\\\\b/g, (match, p1, offset, str) => {
        if (!rowsByClass.has(p1) && !rowsById.has(p1)) return match;
        const before = str.substring(0, offset);
        if (before.endsWith("'") || before.endsWith('"')) return match;
        if (before.match(/ref\\\\(['"]$/) || before.match(/vh\\\\(['"]$/)) return match;
        const after = str.substring(offset + match.length);
        if (after.startsWith("'") || after.startsWith('"')) return match;
        return `ref('${p1}')`;
    });
  };"""

import re
pattern = re.compile(r'  const smartTranslate = \(formula: string\) => \{.*?  \};', re.DOTALL)
new_content = pattern.sub(lambda m: helper_code.replace('\\\\', '\\'), content)

with open(file_path, 'w') as f:
    f.write(new_content)
