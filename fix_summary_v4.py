import re

with open('src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx', 'r') as f:
    content = f.read()

handle_price_search = """    // Use tax factor to estimate relationship: Price = (Cost + Utility) * Factor
    const taxFactor = totalPrice / (totalCost + utility);

    // Iterative refinement for exact price match (step 0.01%)
    // Starting with algebraic estimate for speed
    let currentMargin = (((targetPrice / totalPrice) * (totalCost + utility) - totalCost) / totalCost) * 100;
    currentMargin = Math.max(0, currentMargin - 1); // Start slightly below

    const getPriceForMargin = (m: number) => (totalCost * (1 + m / 100)) * taxFactor;

    // Increment 0.01 until we hit or exceed target
    let bestMargin = currentMargin;
    for (let m = currentMargin; m <= 500; m += 0.01) {
        const p = getPriceForMargin(m);
        if (p > targetPrice) {
            break;
        }
        bestMargin = m;
        if (Math.abs(p - targetPrice) < 0.0001) break;
    }"""

handle_price_replace = """    // Use tax factor to estimate relationship: Price = (Cost + Utility) * Factor
    const baseVal = totalCost + utility;
    if (baseVal <= 0) return;
    const taxFactor = totalPrice / baseVal;

    // Iterative refinement for exact price match (step 0.01%)
    // Starting with algebraic estimate for speed
    let startMargin = (((targetPrice / totalPrice) * baseVal - totalCost) / totalCost) * 100;
    startMargin = Math.max(0, startMargin - 2); // Start safely below

    const getPriceForMargin = (m: number) => (totalCost * (1 + m / 100)) * taxFactor;

    // Increment 0.01 until we hit or exceed target
    let bestMargin = startMargin;
    for (let m = startMargin; m <= 500; m += 0.01) {
        const p = getPriceForMargin(m);
        if (p > targetPrice) {
            break;
        }
        bestMargin = m;
        if (Math.abs(p - targetPrice) < 0.01) break; // Close enough for 2 decimals
    }"""

content = content.replace(handle_price_search, handle_price_replace)

with open('src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx', 'w') as f:
    f.write(content)
