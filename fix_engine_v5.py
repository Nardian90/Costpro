import re

file_path = 'src/lib/cost-engine/index.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Remove the debugging log and fix the regex
old_helper = r"""  const allRefs = \[\.\.\.Array\.from\(rowsByClass\.keys\(\)\), \.\.\.Array\.from\(rowsById\.keys\(\)\)\]
    \.filter\(k => k && k\.length > 0\)
    \.sort\(\(a, b\) => b\.length - a\.length\);

  const smartTranslate = \(formula: string\) => \{
    let translated = translateFormulaFromSpanish\(formula\);
    allRefs\.forEach\(r => \{
        if \(!/\^\[\\d\.\]\+\$\/\.test\(r\)\) return;
        const escaped = r\.replace\(/\[\.\*\+\?\^\\\$ \(\)\|\[\\\]\\\\\]/g, '\\\\\$&\');
        try \{
            const regex = new RegExp\(`\(\?<!ref\\\\\( \['"\]\|vh\\\\\( \['"\]\| \['"\]\)\\b\$\{escaped\}\\b\(\?! \['"\]\)`, 'g'\);
            const prev = translated; translated = translated\.replace\(regex, `ref\('\$\{r\}'\)`\); if \(prev !== translated\) console\.log\(`SmartRef: \$\{prev\} -> \$\{translated\}`\);
        \} catch \(e\) \{\}
    \}\);
    return translated;
  \};"""

# I'll just use a direct string replacement for the whole helper block
new_helper = """  const allRefs = [...Array.from(rowsByClass.keys()), ...Array.from(rowsById.keys())]
    .filter(k => k && k.length > 0)
    .sort((a, b) => b.length - a.length);

  const smartTranslate = (formula: string) => {
    let translated = translateFormulaFromSpanish(formula);
    allRefs.forEach(r => {
        if (!/^[\\d.]+$/.test(r)) return;
        const escaped = r.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
        try {
            // Safer approach: match numeric references that are not part of a word or quoted
            // We use lookbehind and lookahead to ensure it's not already in ref() or quoted
            const regex = new RegExp(`(?<![a-zA-Z0-9._'"\\(\\\\)])${escaped}(?![a-zA-Z0-9._'"\\(\\\\)])`, 'g');
            translated = translated.replace(regex, `ref('${r}')`);
        } catch (e) {}
    });
    return translated;
  };"""

# Use re.sub with DOTALL to find the old helper
content = re.sub(r'  const allRefs = .*?  \};', new_helper, content, flags=re.DOTALL)

with open(file_path, 'w') as f:
    f.write(content)
