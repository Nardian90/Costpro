import sys

with open('src/components/views/terminal/views/cost_sheet/CostSheetView.tsx', 'r') as f:
    content = f.read()

old_code = """    if (rows.length > 1) {
        setQuickModeProducts(rows.map(r => ({
            name: r.product,
            sku: `QM-${r.id}`,
            unit_of_measure: r.um,
            price: r.cost,
            quantity: r.quantity
        })));
        setActiveSection("massive-gen");
        console.log("Setting activeSection to massive-gen and viewMode to expert");
        setViewMode("expert");
        toast.info(`Iniciando generación masiva para ${rows.length} productos`);
        return;
    }"""

new_code = """    if (rows.length > 1) {
        try {
            console.log("Starting massive generation prep for", rows.length, "rows");
            const mapped = rows.map(r => ({
                name: r.product,
                sku: `QM-${r.id}`,
                unit_of_measure: r.um,
                price: r.cost,
                quantity: r.quantity
            }));
            console.log("Mapped products successfully");
            setQuickModeProducts(mapped);
            setActiveSection("massive-gen");
            setViewMode("expert");
            console.log("Switched to expert and massive-gen");
            toast.info(`Iniciando generación masiva para ${rows.length} productos`);
        } catch (err) {
            console.error("Error in handleQuickGenerate:", err);
            toast.error("Error al procesar los productos");
        }
        return;
    }"""

# Use replace but be careful with escaping if needed. Since I use triple quotes it should be fine.
if old_code in content:
    new_content = content.replace(old_code, new_code)
    with open('src/components/views/terminal/views/cost_sheet/CostSheetView.tsx', 'w') as f:
        f.write(new_content)
    print("Success")
else:
    print("Old code not found exactly")
