import re

with open('src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx', 'r') as f:
    content = f.read()

handle_price_search = """    // Increment 0.01 until we hit or exceed target
    let bestMargin = currentMargin;
    for (let m = currentMargin; m <= 500; m += 0.01) {
        if (getPriceForMargin(m) >= targetPrice) {
            bestMargin = m;
            break;
        }
        bestMargin = m;
    }"""

handle_price_replace = """    // Increment 0.01 until we hit or exceed target
    let bestMargin = currentMargin;
    for (let m = currentMargin; m <= 500; m += 0.01) {
        const p = getPriceForMargin(m);
        if (p > targetPrice) {
            break;
        }
        bestMargin = m;
        if (Math.abs(p - targetPrice) < 0.0001) break;
    }"""

content = content.replace(handle_price_search, handle_price_replace)

with open('src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx', 'w') as f:
    f.write(content)
