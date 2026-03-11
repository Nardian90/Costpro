import sys

file_path = 'src/components/views/terminal/views/ipv/CatalogTable.tsx'

with open(file_path, 'r') as f:
    content = f.read()

# 1. Update lucide-react imports
content = content.replace(
    "ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';",
    "ArrowUpDown, ArrowUp, ArrowDown, Download, Upload } from 'lucide-react';"
)

# 2. Add papaparse import
if "import Papa from 'papaparse';" not in content:
    content = content.replace(
        "import { recalculateIPVReportsChain } from '@/lib/ipv/utils';",
        "import { recalculateIPVReportsChain } from '@/lib/ipv/utils';\nimport Papa from 'papaparse';"
    )

# 3. Add handlers
handlers = """
  const handleExportCatalog = () => {
    const exportData = (products && products.length > 0)
        ? products.map(p => ({
            cod: p.cod,
            descripcion: p.descripcion,
            um: p.um,
            precio_cents: p.precio_cents,
            prioridad_algoritmo: p.prioridad_algoritmo,
            stock_inicial_manual: p.stock_inicial_manual,
            es_paquete: p.es_paquete ? 'S' : 'N',
            contenido_paquete: p.contenido_paquete
          }))
        : [{
            cod: 'EJEMPLO-001',
            descripcion: 'Producto de Ejemplo',
            um: 'UNIDADES',
            precio_cents: 100.00,
            prioridad_algoritmo: 3,
            stock_inicial_manual: 10,
            es_paquete: 'N',
            contenido_paquete: 1
          }];

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `catalogo_ipv_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(products && products.length > 0 ? 'Catálogo exportado' : 'Plantilla de catálogo exportada');
  };

  const handleImportCatalog = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
            const data = results.data as any[];
            if (!data || data.length === 0) {
                toast.error('El archivo está vacío');
                return;
            }

            const validProducts: Product[] = [];
            const now = new Date().toISOString();

            for (const row of data) {
                if (!row.cod || !row.descripcion) continue;

                validProducts.push({
                    cod: String(row.cod).toUpperCase(),
                    descripcion: String(row.descripcion),
                    um: String(row.um || 'UNIDADES').toUpperCase(),
                    precio_cents: parseFloat(row.precio_cents) || 0,
                    prioridad_algoritmo: parseInt(row.prioridad_algoritmo) || 3,
                    stock_inicial_manual: parseFloat(row.stock_inicial_manual) || 0,
                    es_paquete: String(row.es_paquete).toUpperCase() === 'S',
                    contenido_paquete: parseInt(row.contenido_paquete) || 1,
                    activo: true,
                    created_at: now,
                    priorityMode: 'manual',
                    isWildcardCandidate: False
                });
            }

            if (validProducts.length > 0) {
                try {
                    await db.products.bulkPut(validProducts);
                    toast.success(`Se importaron ${validProducts.length} productos correctamente`);
                    // Reset input
                    event.target.value = '';
                } catch (error) {
                    toast.error('Error al guardar los productos en la base de datos');
                }
            } else {
                toast.error('No se encontraron productos válidos en el archivo. Verifique que tengan código y descripción.');
            }
        },
        error: (error) => {
            toast.error('Error al procesar el archivo CSV');
            console.error(error);
        }
    });
  };
"""

# Insertion point for handlers after handleRecalculateReportsChain
if "const handleExportCatalog" not in content:
    insertion_marker = "    });\n  };"
    # Find the one after handleRecalculateReportsChain
    marker_index = content.find("const handleRecalculateReportsChain")
    if marker_index != -1:
        insertion_pos = content.find(insertion_marker, marker_index) + len(insertion_marker)
        content = content[:insertion_pos] + handlers + content[insertion_pos:]

# 4. Add buttons
buttons = """
              <Button variant="outline" size="sm" onClick={handleExportCatalog} className="h-12 sm:h-10 text-xs uppercase font-black tracking-widest gap-2 flex-1 sm:flex-none"><Download className="w-4 h-4" /> Exportar</Button>
              <div className="relative flex-1 sm:flex-none">
                  <input type="file" accept=".csv" onChange={handleImportCatalog} className="hidden" id="catalog-import-input" />
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('catalog-import-input')?.click()} className="h-12 sm:h-10 text-xs uppercase font-black tracking-widest gap-2 w-full"><Upload className="w-4 h-4" /> Importar</Button>
              </div>
"""

if "handleExportCatalog" in content and "onClick={handleExportCatalog}" not in content:
    content = content.replace(
        'onClick={handleRecalculateIntelligence} disabled={isSyncing} className="h-12 sm:h-10 text-xs uppercase font-black tracking-widest gap-2 text-purple-500 border-purple-200 hover:bg-purple-50 flex-1 sm:flex-none"><Brain className={`w-4 h-4 ${isSyncing ? \'animate-pulse\' : \'\'}`} />Inteligencia</Button>',
        'onClick={handleRecalculateIntelligence} disabled={isSyncing} className="h-12 sm:h-10 text-xs uppercase font-black tracking-widest gap-2 text-purple-500 border-purple-200 hover:bg-purple-50 flex-1 sm:flex-none"><Brain className={`w-4 h-4 ${isSyncing ? \'animate-pulse\' : \'\'}`} />Inteligencia</Button>' + buttons
    )

with open(file_path, 'w') as f:
    f.write(content)
