import sys

with open('src/hooks/logic/useCostSheetCalculator.ts', 'r') as f:
    content = f.read()

# Add import
if "import { Parser } from 'expr-eval';" not in content:
    content = content.replace("import Decimal from 'decimal.js';", "import Decimal from 'decimal.js';\nimport { Parser } from 'expr-eval';")

# Replace evaluation logic in evaluateHeaderExpression
header_eval_old = """        // Basic arithmetic evaluation
        if (/^[0-9.+\-*/() ]+$/.test(expr)) {
            return new Function(`return ${expr}`)();
        }"""

header_eval_new = """        // Advanced arithmetic evaluation with expr-eval
        const parser = new Parser();
        parser.functions.REDONDEO = (val: number, decimals: number = 2) => {
            return new Decimal(val).toDecimalPlaces(decimals).toNumber();
        };
        // Also map standard round for compatibility
        parser.functions.round = parser.functions.REDONDEO;

        return parser.evaluate(expr);"""

if header_eval_old in content:
    content = content.replace(header_eval_old, header_eval_new)

# Same for evaluateAnnexExpression if it exists in a similar form
annex_eval_old = """    // Basic arithmetic
    if (/^[0-9.+\-*/() ]+$/.test(expr)) {
      return new Function(`return ${expr}`)();
    }"""

annex_eval_new = """    // Advanced arithmetic evaluation with expr-eval
    const parser = new Parser();
    parser.functions.REDONDEO = (val: number, decimals: number = 2) => {
        return new Decimal(val).toDecimalPlaces(decimals).toNumber();
    };
    parser.functions.round = parser.functions.REDONDEO;

    return parser.evaluate(expr);"""

if annex_eval_old in content:
    content = content.replace(annex_eval_old, annex_eval_new)

with open('src/hooks/logic/useCostSheetCalculator.ts', 'w') as f:
    f.write(content)
print("Calculator hooks optimized successfully")
