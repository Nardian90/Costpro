file_path = 'src/lib/cost-engine/index.ts'
with open(file_path, 'r') as f:
    content = f.read()

helper_code = """  const smartTranslate = (formula: string) => {
    let translated = translateFormulaFromSpanish(formula);
    // Support numeric references like 1.1.1 by wrapping them in ref()
    return translated.replace(/\\\\b(\\\\d+(\\\\.\\\\d+)+)\\\\b/g, (match, p1, offset, str) => {
        const before = str.substring(0, offset);
        if (before.endsWith("'") || before.endsWith('"')) return match;
        if (before.match(/ref\\\\(['"]$/) || before.match(/vh\\\\(['"]$/)) return match;
        const after = str.substring(offset + match.length);
        if (after.startsWith("'") || after.startsWith('"')) return match;
        return `ref('${p1}')`;
    });
  };"""

# Use string replace to avoid regex issues in Python
start_marker = "  const smartTranslate = (formula: string) => {"
# We need to find the specific one that is currently in the file
# which is the simplified one from fix_engine_v7
current_middle = "    try {\\n        return translateFormulaFromSpanish(formula);\\n    } catch (e) {\\n        return formula;\\n    }"
# Actually let's just find by start and end markers

import re
pattern = re.compile(r'  const smartTranslate = \(formula: string\) => \{.*?  \};', re.DOTALL)
# We'll use a lambda for sub to avoid escape interpretation
new_content = pattern.sub(lambda m: helper_code.replace('\\\\', '\\'), content)

with open(file_path, 'w') as f:
    f.write(new_content)
