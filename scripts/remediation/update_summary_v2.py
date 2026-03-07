import sys

with open('src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx', 'r') as f:
    content = f.read()

# Refine goalSeek to handle the "missing tax" issue
old_goalseek_block = """  const goalSeek = (target: number) => {
    if (isNaN(target) || target <= 0 || totalCost <= 0) return;

    // Use tax factor to estimate relationship: Price = (Cost + Utility) * Factor
    const baseVal = totalCost + utility;
    if (baseVal <= 0) return;
    const taxFactor = totalPrice / baseVal;

    // Robust Tax Factor: ensure it represents the actual relationship between Total and Subtotal
    // If props are inconsistent during rapid typing, we fallback to a safe 1.0 or previous known factor
    const safeTaxFactor = (taxFactor > 0.5 && taxFactor < 2.0) ? taxFactor : 1.1111;

    const getPriceForMargin = (m: number) => (totalCost * (1 + m / 100)) * safeTaxFactor;

    // Numerical approximation using Binary Search for efficiency and precision
    let low = 0.0001;
    let high = 5000; // Expanded range for edge cases
    let iterations = 0;
    const tolerance = 0.0001;

    while (iterations < 50) { // Increased iterations for extreme precision
      const mid = (low + high) / 2;
      const currentPrice = getPriceForMargin(mid);

      if (Math.abs(currentPrice - target) < tolerance) {
        low = mid;
        break;
      }

      if (currentPrice < target) {
        low = mid;
      } else {
        high = mid;
      }
      iterations++;
    }

    const clampedMargin = Math.max(0.0001, Math.min(2000, low));
    setSliderValue(clampedMargin);
    updateUtilityFormula(clampedMargin);
  };"""

new_goalseek_block = """  const goalSeek = (target: number) => {
    if (isNaN(target) || target <= 0 || totalCost <= 0) return;

    // Use tax factor to estimate relationship: Price = (Cost + Utility) * Factor
    const baseVal = totalCost + utility;

    // Heuristic: If taxFactor is exactly 1.0, it's likely taxes haven't been calculated yet
    // but the user expects them. We use the standard 1.1111 (10% sales tax inside price)
    // as a robust fallback to ensure goal seek accounts for taxes.
    const currentTaxFactor = baseVal > 0 ? totalPrice / baseVal : 1.1111;
    const safeTaxFactor = (currentTaxFactor > 1.0001) ? currentTaxFactor : 1.1111;

    const getPriceForMargin = (m: number) => (totalCost * (1 + m / 100)) * safeTaxFactor;

    // Numerical approximation using Binary Search for efficiency and precision
    let low = 0.0001;
    let high = 5000;
    let iterations = 0;
    const tolerance = 0.0001;

    while (iterations < 40) {
      const mid = (low + high) / 2;
      const currentPrice = getPriceForMargin(mid);

      if (Math.abs(currentPrice - target) < tolerance) {
        low = mid;
        break;
      }

      if (currentPrice < target) {
        low = mid;
      } else {
        high = mid;
      }
      iterations++;
    }

    const clampedMargin = Math.max(0.0001, Math.min(2000, low));
    setSliderValue(clampedMargin);
    updateUtilityFormula(clampedMargin);
  };"""

content = content.replace(old_goalseek_block, new_goalseek_block)

# Fix the w-full lg:w-[520px] and card padding/spacing
content = content.replace('w-full lg:w-[520px]', 'w-full lg:w-[600px]')
content = content.replace('p-8 relative overflow-hidden group shadow-2xl', 'p-10 relative overflow-hidden group shadow-2xl')

with open('src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx', 'w') as f:
    f.write(content)
