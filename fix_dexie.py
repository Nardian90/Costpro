import sys

with open('src/lib/dexie.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    new_lines.append(line)
    if 'reconciliation_hash: string;' in line:
        new_lines.append('  purchase_order_id?: number;\n')
        new_lines.append('  adjustment_type?: "REBAJA" | "PROPINA";\n')
        new_lines.append('  is_price_change?: boolean;\n')

# Add ProductPriceChange interface before the class
final_lines = []
added_interface = False
for line in new_lines:
    if 'export class IPVDatabase' in line and not added_interface:
        final_lines.append('export interface ProductPriceChange {\n')
        final_lines.append('  id: string;\n')
        final_lines.append('  product_cod: string;\n')
        final_lines.append('  old_price_cents: number;\n')
        final_lines.append('  new_price_cents: number;\n')
        final_lines.append('  fecha: string;\n')
        final_lines.append('  transaction_ref?: string;\n')
        final_lines.append('  created_at: string;\n')
        final_lines.append('}\n\n')
        added_interface = True
    final_lines.append(line)

# Add table to the class
class_lines = []
added_table = False
for line in final_lines:
    class_lines.append(line)
    if 'mvt_exports_log!: Table<MVTExportLog>;' in line and not added_table:
        class_lines.append('  product_price_changes!: Table<ProductPriceChange>;\n')
        added_table = True

# Add version 32
version_lines = []
found_v31 = False
for line in class_lines:
    version_lines.append(line)
    if 'this.version(31).stores({' in line:
        found_v31 = True
    if found_v31 and '    });' in line:
        # We need to find the END of the version 31 block.
        # It has an upgrade function too.
        pass

# Let's try a different approach for the version block insertion.
content = "".join(class_lines)
v31_end = content.find('      await tx.table(\'products\').toCollection().modify({ isEligibleForCashFill: true });\n    });')
# Wait, let's just find the closing brace of the constructor or the last version.

v32_block = """
    this.version(32).stores({
      product_price_changes: "&id, product_cod, fecha"
    });
"""

if 'this.version(31)' in content:
    # Find the end of version 31 upgrade block
    marker = '    }).upgrade(async tx => {\n      await tx.table(\'products\').toCollection().modify({ isEligibleForCashFill: true });\n    });'
    # Actually let's just find where constructor ends.
    # No, better find the end of v31.

    parts = content.split('    }).upgrade(async tx => {\n      await tx.table(\'products\').toCollection().modify({ isEligibleForCashFill: true });\n    });')
    if len(parts) > 1:
        new_content = parts[0] + '    }).upgrade(async tx => {\n      await tx.table(\'products\').toCollection().modify({ isEligibleForCashFill: true });\n    });' + v32_block + parts[1]
    else:
        # Fallback
        new_content = content.replace('    });\n  }\n}', '    });' + v32_block + '  }\n}')
else:
    new_content = content.replace('    });\n  }\n}', '    });' + v32_block + '  }\n}')

with open('src/lib/dexie.ts', 'w') as f:
    f.write(new_content)
