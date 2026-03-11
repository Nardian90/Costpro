import sys

with open('src/components/views/terminal/views/ipv/BankIngestion.tsx', 'r') as f:
    lines = f.readlines()

start_index = -1
end_index = -1

for i, line in enumerate(lines):
    if 'const processCatalogData = async (data: any[]) => {' in line:
        start_index = i
        break

if start_index != -1:
    nesting = 0
    for i in range(start_index, len(lines)):
        nesting += lines[i].count('{')
        nesting -= lines[i].count('}')
        if nesting == 0:
            end_index = i + 1
            break

if start_index != -1 and end_index != -1:
    new_logic = [
        '  const processCatalogData = async (data: any[]) => {\n',
        '    try {\n',
        '        let imported = 0;\n',
        '        const now = new Date().toISOString();\n',
        '        for (const row of data) {\n',
        '            const cod = String(row["Código"] || row.cod || row.COD || "").trim();\n',
        '            if (!cod) continue;\n',
        '            \n',
        '            const precio = parseFloat(String(row["Precio ($)"] || row.precio_cents || row.precio || 0).replace(",", "."));\n',
        '            const stock = parseFloat(String(row["Stock Inicial"] || row.stock_inicial_manual || row.stock || 0).replace(",", "."));\n',
        '            \n',
        '            const product = {\n',
        '                cod: cod.toUpperCase(),\n',
        '                descripcion: String(row["Descripción"] || row.descripcion || row.desc || ""),\n',
        '                um: String(row["UM"] || row.um || "Unidades").toUpperCase(),\n',
        '                precio_cents: precio,\n',
        '                prioridad_algoritmo: Number(row["Prioridad"] || row.prioridad_algoritmo || row.prioridad || 1),\n',
        '                activo: true,\n',
        '                es_paquete: String(row["Es Paquete (S/N)"] || row.es_paquete || "").toUpperCase() === "S",\n',
        '                contenido_paquete: Number(row["Contenido Paquete"] || row.contenido_paquete || 1),\n',
        '                stock_inicial_manual: stock,\n',
        '                created_at: now,\n',
        '                updated_at: now,\n',
        '                priorityMode: "manual",\n',
        '                isWildcardCandidate: false\n',
        '            };\n',
        '            await db.products.put(product as any);\n',
        '            imported++;\n',
        '        }\n',
        '        toast.success(`${imported} productos procesados`);\n',
        '    } catch (error) {\n',
        '        console.error(error);\n',
        '        toast.error("Error al procesar catálogo");\n',
        '    }\n',
        '  };\n'
    ]
    lines[start_index:end_index] = new_logic
    with open('src/components/views/terminal/views/ipv/BankIngestion.tsx', 'w') as f:
        f.writelines(lines)
    print("Successfully updated BankIngestion.tsx processCatalogData")
