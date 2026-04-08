import sys

with open('src/lib/ipv/engine.ts', 'r') as f:
    content = f.read()

# 1. Update Regex
content = content.replace(
    "private readonly ORIGIN_WHITELIST = /^(TRX|BANK)-[A-Z0-9\\-_]+$/;",
    "private readonly ORIGIN_WHITELIST = /^[A-Z0-9\\-_]{5,64}$/;"
)

# 2. Increase default daily limit (1,000,000 -> 10,000,000)
content = content.replace(
    '{ id: "cash-fill", tipo: "CASH_FILL", prioridad: 5, activo: true, meta: { daily_limit: 1000000 }, descripcion: "Inyección de Efectivo" }',
    '{ id: "cash-fill", tipo: "CASH_FILL", prioridad: 5, activo: true, meta: { daily_limit: 10000000 }, descripcion: "Inyección de Efectivo" }'
)

with open('src/lib/ipv/engine.ts', 'w') as f:
    f.write(content)
print("Regex and Limit updated in engine.ts")
