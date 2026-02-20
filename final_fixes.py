import sys

# 1. Fix expr-eval string return in evaluateHeaderExpression
with open('src/hooks/logic/useCostSheetCalculator.ts', 'r') as f:
    content = f.read()

header_eval_old = """        return parser.evaluate(expr);
    } catch (e) {
        console.error("Error evaluating header expression:", e);
        return expression;
    }"""

header_eval_new = """        return parser.evaluate(expr);
    } catch (e) {
        // If evaluation fails (e.g. result is a string like "FC-999" which is not a valid math expression),
        // return the processed string as is.
        return expr;
    }"""

if header_eval_old in content:
    content = content.replace(header_eval_old, header_eval_new)

# 2. Fix evaluateAnnexExpression too (same logic)
annex_eval_old = """    return parser.evaluate(expr);
  } catch (error) {
    return isNaN(Number(trimmed)) ? 0 : Number(trimmed);
  }"""

annex_eval_new = """    return parser.evaluate(expr);
  } catch (error) {
    // Return processed expr if evaluation fails
    return expr;
  }"""

if annex_eval_old in content:
    content = content.replace(annex_eval_old, annex_eval_new)

with open('src/hooks/logic/useCostSheetCalculator.ts', 'w') as f:
    f.write(content)

# 3. Fix Annex Total fallback in computeRowTotal
with open('src/lib/cost-engine/index.ts', 'r') as f:
    content_idx = f.read()

annex_fallback_old = """            if (sum.gte(0)) {
                baseTotalValue = sum;
                note += `Using prefix match for ${row.classification} from ${base.anexoId} as base. `;
            } else {
                baseTotalValue = new Decimal(0);
                note += `No matches for ${row.classification} in ${base.anexoId}. `;
            }"""

annex_fallback_new = """            if (sum.gte(0)) {
                baseTotalValue = sum;
                note += `Using prefix match for ${row.classification} from ${base.anexoId} as base. `;
            } else {
                // Fallback to total of annex if no prefix match found
                baseTotalValue = new Decimal(annexTotals.get(base.anexoId) || 0);
                note += `No prefix match for ${row.classification} in ${base.anexoId}, using Annex Total. `;
            }"""

if annex_fallback_old in content_idx:
    content_idx = content_idx.replace(annex_fallback_old, annex_fallback_new)
    with open('src/lib/cost-engine/index.ts', 'w') as f:
        f.write(content_idx)

print("Applied final fixes")
