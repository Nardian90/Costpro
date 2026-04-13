import sys

with open('src/lib/dexie.ts', 'r') as f:
    content = f.read()

v32_code = """
    this.version(32).stores({
      product_price_changes: "&id, product_cod, fecha"
    });"""

# Find the end of version 31 block
# It ends with }); followed by }; of the class or other version
if 'this.version(31)' in content:
    # Look for the upgrade function end
    search_str = "await tx.table('products').toCollection().modify({ isEligibleForCashFill: true });\n    });"
    if search_str in content:
        content = content.replace(search_str, search_str + v32_code)
    else:
        # Fallback: find the last version block
        content = content.replace("this.version(31).stores({\n      products: 'cod, id_grupo, activo, isEligibleForCashFill'\n    });", "this.version(31).stores({\n      products: 'cod, id_grupo, activo, isEligibleForCashFill'\n    });" + v32_code)

with open('src/lib/dexie.ts', 'w') as f:
    f.write(content)
