import sys

with open('src/lib/cost-engine/validations.ts', 'r') as f:
    content = f.read()

insertion_point = "    const passedCount ="
new_validations = """    // 4. Global Negativity Check
    Object.entries(calculatedValues).forEach(([id, val]) => {
        if (val.total < 0) {
            results.push({
                type: 'CRITICAL',
                category: 'Integridad Matemática',
                title: 'Valor Negativo Detectado',
                message: `El concepto con ID ${id} tiene un valor negativo (${val.total.toFixed(2)}), lo cual es inconsistente para una ficha de costo.`,
                rowId: id
            });
        }
    });

    // 5. Quantity vs Cost Validation
    const quantity = parseFloat(String(calculatedHeader?.quantity || 0));
    const totalCost = calculatedValues['12']?.total || calculatedValues['12.1']?.total || 0;
    if (quantity === 0 && totalCost > 0) {
        results.push({
            type: 'WARNING',
            category: 'Consistencia de Datos',
            title: 'Cantidad es Cero',
            message: 'La cantidad a producir es 0, pero se han detectado costos asociados. Esto afectará el costo unitario.',
        });
    }

    // 6. Annex Reference Integrity
    if (data.annexes && data.sections) {
        const checkAnnexRefs = (rows: any[]) => {
            rows.forEach(row => {
                const formula = row.formula || row.totalFormula || '';
                const annexMatches = formula.match(/Anexo\s*['"]?([^'"]+)['"]?/g);
                if (annexMatches) {
                    annexMatches.forEach((m: str) => {
                        const id = m.replace(/Anexo\s*['"]?/, '').replace(/['"]?$/, '');
                        if (!data.annexes.find((a: any) => a.id === id)) {
                            results.push({
                                type: 'CRITICAL',
                                category: 'Integridad Matemática',
                                title: 'Referencia a Anexo Inexistente',
                                message: `La fórmula de '${row.label}' referencia al Anexo '${id}', que no existe en esta ficha.`,
                                rowId: row.id
                            });
                        }
                    });
                }
                if (row.children) checkAnnexRefs(row.children);
            });
        };
        data.sections.forEach((s: any) => checkAnnexRefs(s.rows));
    }

"""

if insertion_point in content:
    content = content.replace(insertion_point, new_validations + insertion_point)
    with open('src/lib/cost-engine/validations.ts', 'w') as f:
        f.write(content)
    print("Validations enhanced successfully")
else:
    print("Insertion point not found")
