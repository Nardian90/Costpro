import re

with open('src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx', 'r') as f:
    content = f.read()

# 1. Decouple localCoef and remove the effect that resets it
content = content.replace(
    "const [localCoef, setLocalCoef] = useState(indirectCoef);",
    "const [localCoef, setLocalCoef] = useState(1.0);"
)
content = re.sub(
    r"useEffect\(\(\) => \{\s*setLocalCoef\(indirectCoef\);\s*\}, \[indirectCoef\]\);",
    "// Decoupled from indirectCoef to allow manual multiplier setting",
    content
)

# 2. Fix Price Card Layout
price_card_search = """                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-light text-muted-foreground">$</span>
                    <input
                      type="number"
                      value={localPrice}
                      onFocus={() => setIsEditingPrice(true)}
                      onBlur={() => setIsEditingPrice(false)}
                      onChange={handlePriceChange}
                      className="bg-transparent border-none text-left font-display text-4xl font-bold tracking-tight focus:ring-0 p-0 text-foreground w-full"
                    />
                  </div>"""

price_card_replace = """                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-3xl font-light text-muted-foreground shrink-0">$</span>
                    <input
                      type="number"
                      value={localPrice}
                      onFocus={() => setIsEditingPrice(true)}
                      onBlur={() => setIsEditingPrice(false)}
                      onChange={handlePriceChange}
                      className="bg-transparent border-none text-left font-display text-5xl font-bold tracking-tight focus:ring-0 p-0 text-foreground w-full min-w-0"
                    />
                  </div>"""

content = content.replace(price_card_search, price_card_replace)

# 3. Implement iterative algorithm in handlePriceChange
handle_price_search = """  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalPrice(val);

    const numericPrice = parseFloat(val);
    // If totalCost is 0, we fallback to simple margin calculation
    if (isNaN(numericPrice) || numericPrice <= 0 || totalCost <= 0) return;

    let neededMargin = 0;
    if (totalPrice > 0) {
        // Enterprise formula: accounts for tax proportions relative to total cost
        neededMargin = (((numericPrice / totalPrice) * (totalCost + utility) - totalCost) / totalCost) * 100;
    } else {
        // Fallback for zero price scenario
        neededMargin = ((numericPrice - totalCost) / totalCost) * 100;
    }

    const clampedMargin = Math.max(0, Math.min(500, neededMargin));

    setSliderValue(clampedMargin);
    updateUtilityFormula(clampedMargin);
  };"""

handle_price_replace = """  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalPrice(val);

    const targetPrice = parseFloat(val);
    if (isNaN(targetPrice) || targetPrice <= 0 || totalCost <= 0) return;

    // Use tax factor to estimate relationship: Price = (Cost + Utility) * Factor
    const taxFactor = totalPrice / (totalCost + utility);

    // Iterative refinement for exact price match (step 0.01%)
    // Starting with algebraic estimate for speed
    let currentMargin = (((targetPrice / totalPrice) * (totalCost + utility) - totalCost) / totalCost) * 100;
    currentMargin = Math.max(0, currentMargin - 1); // Start slightly below

    const getPriceForMargin = (m: number) => (totalCost * (1 + m / 100)) * taxFactor;

    // Increment 0.01 until we hit or exceed target
    let bestMargin = currentMargin;
    for (let m = currentMargin; m <= 500; m += 0.01) {
        if (getPriceForMargin(m) >= targetPrice) {
            bestMargin = m;
            break;
        }
        bestMargin = m;
    }

    const clampedMargin = Math.max(0, Math.min(500, bestMargin));
    setSliderValue(clampedMargin);
    updateUtilityFormula(clampedMargin);
  };"""

content = content.replace(handle_price_search, handle_price_replace)

# 4. Update Coeficiente UI
coef_ui_search = """              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <label className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Coeficiente</label>
                  <span className="text-primary font-display font-bold">{localCoef.toFixed(2)}</span>
                </div>
                <Slider
                  value={[localCoef]}
                  min={0}
                  max={4}
                  step={0.01}
                  onValueChange={(val) => handleCoefChange(val[0])}
                  className="w-full"
                />
                <div className="flex justify-between text-[9px] text-muted-foreground uppercase font-bold tracking-tighter">
                  <span>mín 0.0</span>
                  <span>máx 4.0</span>
                </div>
              </div>"""

coef_ui_replace = """              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <label className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Coeficiente</label>
                  <span className="text-primary font-display font-bold">{localCoef.toFixed(2)}</span>
                </div>
                <Slider
                  value={[localCoef]}
                  min={0}
                  max={4}
                  step={0.01}
                  onValueChange={(val) => handleCoefChange(val[0])}
                  className="w-full"
                />
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-[9px] text-muted-foreground uppercase font-bold tracking-tighter">
                    <span>mín 0.0</span>
                    <span>máx 4.0</span>
                  </div>
                  <div className="mt-3 p-3 rounded-xl bg-primary/5 border border-primary/10 shadow-[inner_0_1px_2px_rgba(0,0,0,0.1)]">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-[0.1em] leading-relaxed flex justify-between items-center">
                      <span>Relación Actual (4+6+7)/2:</span>
                      <span className="text-primary font-black text-xs">{indirectCoef.toFixed(2)}</span>
                    </p>
                  </div>
                </div>
              </div>"""

content = content.replace(coef_ui_search, coef_ui_replace)

with open('src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx', 'w') as f:
    f.write(content)
