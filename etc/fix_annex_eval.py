import sys

with open('src/hooks/logic/useCostSheetCalculator.ts', 'r') as f:
    content = f.read()

bad_block = """    // Basic arithmetic evaluation
    // Advanced arithmetic evaluation with expr-eval
    const parser = new Parser();
    parser.functions.REDONDEO = (val: number, decimals: number = 2) => {
        return new Decimal(val).toDecimalPlaces(decimals).toNumber();
    };
    parser.functions.round = parser.functions.REDONDEO;
    return parser.evaluate(expr);
    return isNaN(Number(trimmed)) ? 0 : Number(trimmed);
  }
};"""

good_block = """    // Advanced arithmetic evaluation with expr-eval
    const parser = new Parser();
    parser.functions.REDONDEO = (val: number, decimals: number = 2) => {
        return new Decimal(val).toDecimalPlaces(decimals).toNumber();
    };
    parser.functions.round = parser.functions.REDONDEO;
    return parser.evaluate(expr);
  } catch (error) {
    return isNaN(Number(trimmed)) ? 0 : Number(trimmed);
  }
};"""

if bad_block in content:
    content = content.replace(bad_block, good_block)
    with open('src/hooks/logic/useCostSheetCalculator.ts', 'w') as f:
        f.write(content)
    print("Fixed annex evaluation syntax")
else:
    print("Bad block not found")
