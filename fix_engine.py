import os

def fix_engine_normalization(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    # 1. Add normalize function
    if 'const normalizeClass =' not in content:
        # Simple string replacement after the first import
        insertion = "\nconst normalizeClass = (s: string) => String(s || '').replace(/\\s+/g, '').toLowerCase();\n"
        content = content.replace("import Decimal from 'decimal.js';", "import Decimal from 'decimal.js';" + insertion)

    # 2. Update getAnnexSumForPrefix to use normalization
    # Let's find the function by parts to be more resilient
    pattern_start = "const getAnnexSumForPrefix = (anexoId: string, prefix: string): Decimal => {"
    new_fn = """    const getAnnexSumForPrefix = (anexoId: string, prefix: string): Decimal => {
        const classSumMap = annexSumMap.get(anexoId);
        if (!classSumMap) return new Decimal(0);

        const normPrefix = normalizeClass(prefix);
        let sum = new Decimal(0);
        let found = false;
        classSumMap.forEach((val, classification) => {
            const normClass = normalizeClass(classification);
            if (normClass === normPrefix || normClass.startsWith(normPrefix + '.')) {
                sum = sum.plus(val);
                found = true;
            }
        });
        return found ? sum : (new Decimal(-1));
    };"""

    # Find the end of the old function
    start_idx = content.find(pattern_start)
    if start_idx != -1:
        end_idx = content.find("};", start_idx) + 2
        content = content[:start_idx] + new_fn + content[end_idx:]

    with open(file_path, 'w') as f:
        f.write(content)

if __name__ == "__main__":
    fix_engine_normalization('src/lib/cost-engine/index.ts')
