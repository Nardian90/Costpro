import re

file_path = 'src/lib/cost-engine/index.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Update smartTranslate with the safe replacement logic
new_helper = """  const smartTranslate = (formula: string) => {
    let translated = translateFormulaFromSpanish(formula);
    // Support numeric references like 1.1.1 by wrapping them in ref()
    // We match numeric patterns with at least one dot
    return translated.replace(/\\\\b(\\\\d+(\\\\.\\\\d+)+)\\\\b/g, (match, p1, offset, str) => {
        const before = str.substring(0, offset);
        if (before.endsWith("'") || before.endsWith('"')) return match;
        if (before.endsWith("ref('") || before.endsWith('ref("')) return match;
        if (before.endsWith("vh('") || before.endsWith('vh("')) return match;
        const after = str.substring(offset + match.length);
        if (after.startsWith("'") || after.startsWith('"')) return match;
        return `ref('${p1}')`;
    });
  };"""

# I need to handle backslashes correctly for the file write
helper_to_write = """  const smartTranslate = (formula: string) => {
    let translated = translateFormulaFromSpanish(formula);
    // Support numeric references like 1.1.1 by wrapping them in ref()
    // We match numeric patterns with at least one dot
    return translated.replace(/\\b(\\d+(\\.\\d+)+)\\b/g, (match, p1, offset, str) => {
        const before = str.substring(0, offset);
        if (before.endsWith("'") || before.endsWith('"')) return match;
        if (before.match(/ref\\(['"]$/) || before.match(/vh\\(['"]$/)) return match;
        const after = str.substring(offset + match.length);
        if (after.startsWith("'") || after.startsWith('"')) return match;
        return `ref('${p1}')`;
    });
  };"""

import re
pattern = re.compile(r'  const smartTranslate = \(formula: string\) => \{.*?  \};', re.DOTALL)
content = pattern.sub(helper_to_write, content)

with open(file_path, 'w') as f:
    f.write(content)
