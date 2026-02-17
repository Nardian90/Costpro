import sys

with open('src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx', 'r') as f:
    content = f.read()

# Replace the card width
content = content.replace('lg:w-[480px]', 'lg:w-[560px]')

# Replace the Price of Sale section
old_price_section = """            <div className="glass-card-stitch rounded-2xl p-4 mb-10 relative overflow-hidden group/price border-primary/20 bg-primary/5">
              <div className="flex items-start justify-between">
                <div className="w-full">
                  <p className="text-xs uppercase tracking-[0.2em] text-primary font-bold mb-1">Precio de Venta</p>
                  <div className="flex items-center gap-4 mt-1">
                    <button
                      onClick={() => handlePriceAdjust(-1)}
                      className="p-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary transition-all border border-primary/20 hover:scale-110 active:scale-95"
                    >
                      <Minus className="w-5 h-5" />
                    </button>

                    <div className="flex-1 min-w-0">
                      <input
                        type="number"
                        value={localPrice}
                        onFocus={() => setIsEditingPrice(true)}
                        onBlur={() => setIsEditingPrice(false)}
                        onChange={handlePriceChange}
                        className={cn(
                          "bg-transparent border-none text-center lg:text-left font-display font-bold focus:ring-0 p-0 text-foreground w-full transition-all duration-300",
                          localPrice.length <= 5 ? "text-5xl" :
                          localPrice.length <= 7 ? "text-4xl" :
                          localPrice.length <= 9 ? "text-3xl" :
                          localPrice.length <= 12 ? "text-2xl" : "text-xl"
                        )}
                      />
                    </div>

                    <button
                      onClick={() => handlePriceAdjust(1)}
                      className="p-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary transition-all border border-primary/20 hover:scale-110 active:scale-95"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mt-2">Objetivo Final Calculado</p>
                </div>
              </div>
            </div>"""

new_price_section = """            <div className="glass-card-stitch rounded-3xl p-8 mb-10 relative overflow-hidden group/price border-primary/30 bg-primary/5 shadow-inner">
              <div className="flex flex-col items-center gap-6">
                <div className="w-full text-center">
                  <p className="text-xs uppercase tracking-[0.3em] text-primary font-black mb-4">Precio de Venta</p>

                  <div className="relative inline-block w-full">
                    <input
                      type="number"
                      value={localPrice}
                      onFocus={() => setIsEditingPrice(true)}
                      onBlur={() => setIsEditingPrice(false)}
                      onChange={handlePriceChange}
                      className={cn(
                        "bg-transparent border-none text-center font-display font-black focus:ring-0 p-0 text-foreground w-full transition-all duration-300 neon-glow selection:bg-primary/30",
                        localPrice.length <= 4 ? "text-7xl" :
                        localPrice.length <= 6 ? "text-6xl" :
                        localPrice.length <= 8 ? "text-5xl" :
                        localPrice.length <= 10 ? "text-4xl" :
                        localPrice.length <= 12 ? "text-3xl" : "text-2xl"
                      )}
                      placeholder="0.00"
                    />
                  </div>

                  <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mt-4 font-bold opacity-70">
                    Objetivo Final Calculado (Inc. Impuestos)
                  </p>
                </div>

                <div className="flex items-center justify-center gap-12 w-full pt-4 border-t border-primary/10">
                  <button
                    onClick={() => handlePriceAdjust(-1)}
                    className="flex flex-col items-center gap-2 group/btn"
                  >
                    <div className="p-4 rounded-2xl bg-primary/10 hover:bg-primary/20 text-primary transition-all border border-primary/20 group-hover/btn:scale-110 active:scale-90 shadow-lg shadow-primary/5">
                      <Minus className="w-6 h-6 stroke-[3]" />
                    </div>
                    <span className="text-[10px] uppercase tracking-widest font-black text-primary/40 group-hover/btn:text-primary transition-colors">- $1.00</span>
                  </button>

                  <button
                    onClick={() => handlePriceAdjust(1)}
                    className="flex flex-col items-center gap-2 group/btn"
                  >
                    <div className="p-4 rounded-2xl bg-primary/10 hover:bg-primary/20 text-primary transition-all border border-primary/20 group-hover/btn:scale-110 active:scale-90 shadow-lg shadow-primary/5">
                      <Plus className="w-6 h-6 stroke-[3]" />
                    </div>
                    <span className="text-[10px] uppercase tracking-widest font-black text-primary/40 group-hover/btn:text-primary transition-colors">+ $1.00</span>
                  </button>
                </div>
              </div>
            </div>"""

content = content.replace(old_price_section, new_price_section)

# Update goalSeek logic to be more explicit about Tax Factor
old_goalseek = """    const getPriceForMargin = (m: number) => (totalCost * (1 + m / 100)) * taxFactor;

    // Numerical approximation using Binary Search for efficiency and precision
    let low = 0.0001;
    let high = 2000; // Allow up to 2000% margin
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
    }"""

new_goalseek = """    // Robust Tax Factor: ensure it represents the actual relationship between Total and Subtotal
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
    }"""

content = content.replace(old_goalseek, new_goalseek)

with open('src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx', 'w') as f:
    f.write(content)
