with open('src/lib/cost-engine/index.ts', 'r') as f:
    content = f.read()

content = content.replace(
    "parser.functions.REDONDEO = (val: number, decimals: number = 2) => {",
    "parser.functions.valor = (x: any) => x;\n  parser.functions.REDONDEO = (val: number, decimals: number = 2) => {"
)

with open('src/lib/cost-engine/index.ts', 'w') as f:
    f.write(content)
