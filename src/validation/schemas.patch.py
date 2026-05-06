import sys
import re

content = open('src/validation/schemas.ts').read()

# 1. Fix plan in profileSchema
content = re.sub(
    r'plan: z\.string\(\)\.catch\("free"\),',
    'plan: z.preprocess((val) => (typeof val === "object" && val !== null ? (val as any).name || "free" : val), z.string()).catch("free"),',
    content
)

# 2. Fix status in userStoreMembershipSchema to match 'active' | 'revoked'
content = re.sub(
    r'status: z\.string\(\)\.optional\(\),',
    'status: z.enum(["active", "revoked"]).catch("active"),',
    content
)

# 3. Add 'price' to productSchema if missing, and ensure it matches interface
# Product interface: id, name, description, sku, price, cost_price, image_url, category, unit_of_measure, supplier, created_at, updated_at, stock_current, cost_average, min_stock, store_id, public_image_url, is_active, has_movements
# I'll update productSchema to be more robust.

product_schema_match = re.search(r'export const productSchema = z\.object\({(.*?)}\);', content, re.DOTALL)
if product_schema_match:
    inner = product_schema_match.group(1)
    if 'price:' not in inner:
        # If price is missing, add it. But earlier grep showed it might be there.
        pass

# 4. Add missing export AuditLog if it's missing but referenced
if 'export type AuditLog =' not in content:
    content += "\nexport type AuditLog = z.infer<typeof auditLogSchema>;\n"

with open('src/validation/schemas.ts', 'w') as f:
    f.write(content)
