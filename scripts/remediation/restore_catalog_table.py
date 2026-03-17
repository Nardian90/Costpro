import sys

with open('src/components/views/terminal/views/ipv/CatalogTable.tsx', 'r') as f:
    lines = f.readlines()

# 1. Fix Imports
new_lines = []
inserted_action_menu = False
for line in lines:
    if 'import ActionMenu' in line:
        continue
    new_lines.append(line)
    if 'import { recalculateIPVReportsChain }' in line and not inserted_action_menu:
        new_lines.append('import ActionMenu, { Action } from "@/components/ui/ActionMenu";\n')
        inserted_action_menu = True

lines = new_lines

# 2. Update inventoryStats logic
start_stats = -1
end_stats = -1
for i, line in enumerate(lines):
    if 'const inventoryStats = React.useMemo(() => {' in line:
        start_stats = i
    if '}, [products, reports, reconciliationLines]);' in line and i > start_stats and start_stats != -1:
        end_stats = i + 1
        break

if start_stats != -1 and end_stats != -1:
    lines[start_stats:end_stats] = [
        '  const inventoryStats = React.useMemo(() => {\n',
        '    if (!products || !reports || !reconciliationLines) return {};\n',
        '    const stats: Record<string, { initial: number; sales: number; final: number }> = {};\n',
        '    \n',
        '    // 1. Encontrar el primer reporte IPV para el saldo inicial global\n',
        '    const firstReport = reports.length > 0 ? reports[reports.length - 1] : null;\n',
        '    \n',
        '    products.forEach(p => {\n',
        '        // Saldo Inicial: Si hay reportes, el inicial es el del primer reporte. \n',
        '        // Si no hay reportes, es el stock_inicial_manual del catálogo.\n',
        '        let initial = p.stock_inicial_manual || 0;\n',
        '        if (firstReport) {\n',
        '            const firstRow = firstReport.filas.find(f => f.cod === p.cod);\n',
        '            if (firstRow) initial = firstRow.saldo_inicial_qty;\n',
        '        }\n',
        '\n',
        '        // Ventas: Todas las líneas de reconciliación desde el inicio\n',
        '        const sales = reconciliationLines\n',
        '            .filter(l => l.product_cod === p.cod)\n',
        '            .reduce((sum, l) => sum + (l.cantidad || 0), 0);\n',
        '\n',
        '        // Saldo Final: Inicial - Ventas\n',
        '        stats[p.cod] = { initial, sales, final: initial - sales };\n',
        '    });\n',
        '    return stats;\n',
        '  }, [products, reports, reconciliationLines]);\n'
    ]

# 3. Update handleRecalculateReportsChain logic
start_recon = -1
end_recon = -1
for i, line in enumerate(lines):
    if 'const handleRecalculateReportsChain = async () => {' in line:
        start_recon = i
    if '};' in line and i > start_recon and start_recon != -1:
        # Check if it's really the end of the function
        nesting = 0
        curr = start_recon
        while curr < len(lines):
            nesting += lines[curr].count('{')
            nesting -= lines[curr].count('}')
            if nesting == 0:
                end_recon = curr + 1
                break
            curr += 1
        break

if start_recon != -1 and end_recon != -1:
    lines[start_recon:end_recon] = [
        '  const handleRecalculateReportsChain = async () => {\n',
        '    askConfirmation(\'Actualizar Datos\', \'¿Sincronizar existencias del catálogo con el primer reporte IPV y recalcular cadena?\', async () => {\n',
        '        try {\n',
        '            const allReports = await db.ipv_reports.orderBy(\'fecha_reporte\').toArray();\n',
        '            if (allReports.length > 0) {\n',
        '                const firstReport = allReports[0];\n',
        '                // Sincronizar stock inicial del catálogo con el saldo inicial del primer reporte\n',
        '                for (const fila of firstReport.filas) {\n',
        '                    await db.products.update(fila.cod, { stock_inicial_manual: fila.saldo_inicial_qty });\n',
        '                }\n',
        '            }\n',
        '            await recalculateIPVReportsChain(db);\n',
        '            toast.success(\'Sincronización y recalculo completado\');\n',
        '        } catch (error) {\n',
        '            console.error(error);\n',
        '            toast.error(\'Error al actualizar los datos\');\n',
        '        }\n',
        '    });\n',
        '  };\n'
    ]

# 4. Insert catalogActions and Update UI
# Find where handleImportCatalog ends to insert catalogActions
insert_actions_idx = -1
for i, line in enumerate(lines):
    if 'reader.readAsArrayBuffer(file);' in line:
        insert_actions_idx = i + 2
        break

if insert_actions_idx != -1:
    catalog_actions_code = [
        '\n',
        '  const catalogActions: Action[] = React.useMemo(() => [\n',
        '    { id: "add", label: "Nuevo", icon: Plus, onClick: handleAddNew },\n',
        '    { id: "update", label: "Actualizar", icon: RefreshCw, onClick: handleRecalculateReportsChain, variant: "primary" },\n',
        '    { id: "sync-real", label: "Catálogo Real", icon: LayoutGrid, onClick: syncWithSystemCatalog, disabled: isSyncing },\n',
        '    { id: "intel", label: "Inteligencia", icon: Brain, onClick: handleRecalculateIntelligence, disabled: isSyncing, variant: "outline", className: "text-purple-500" },\n',
        '    { id: "normalize", label: "Normalizar", icon: AlertTriangle, onClick: handleNormalizeNegatives, variant: "danger" },\n',
        '    { id: "export", label: "Exportar", icon: Download, onClick: handleExportCatalog },\n',
        '    { id: "import", label: "Importar", icon: Upload, onClick: () => document.getElementById("catalog-import-input")?.click() },\n',
        '    { id: "clear", label: "Vaciar", icon: Trash2, onClick: clearCatalog, variant: "danger" }\n',
        '  ], [isSyncing, handleAddNew, syncWithSystemCatalog, handleRecalculateReportsChain, handleRecalculateIntelligence, handleNormalizeNegatives, handleExportCatalog, clearCatalog]);\n'
    ]
    lines[insert_actions_idx:insert_actions_idx] = catalog_actions_code

# 5. Update the UI block
start_ui = -1
end_ui = -1
for i, line in enumerate(lines):
    if 'return (' in line and i > insert_actions_idx:
        start_ui = i + 1
    if 'layoutMode === \'table\' ? (' in line:
        end_ui = i
        break

if start_ui != -1 and end_ui != -1:
    new_ui = [
        '    <>\n',
        '      <div className="space-y-4">\n',
        '        <ActionMenu\n',
        '            actions={catalogActions}\n',
        '            sticky={true}\n',
        '            topOffset="sticky top-[60px] sm:top-[92px]"\n',
        '            className="mb-2 !-mx-4 px-4 py-2"\n',
        '        />\n',
        '\n',
        '        <div className="p-3 sm:p-4 flex flex-col lg:flex-row gap-4 bg-background/50 border-b items-center justify-between">\n',
        '          <div className="flex flex-col sm:flex-row gap-4 flex-1 w-full lg:max-w-3xl items-center">\n',
        '              <div className="relative w-full sm:w-64">\n',
        '                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />\n',
        '                  <Input placeholder="Buscar..." className="pl-10 h-10 text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />\n',
        '              </div>\n',
        '              <div className="flex bg-muted/50 p-1 rounded-xl border w-full sm:w-auto overflow-x-auto no-scrollbar">\n',
        '                  {[{ id: \'all\', label: \'Todos\' }, { id: \'with_stock\', label: \'Con Stock\' }, { id: \'without_stock\', label: \'Sin Stock\' }].map((f) => (\n',
        '                      <button key={f.id} onClick={() => setStockFilter(f.id as any)} className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-tighter transition-all whitespace-nowrap flex-1 sm:flex-none ${stockFilter === f.id ? \'bg-background text-primary shadow-sm\' : \'text-muted-foreground hover:text-foreground\'}`}>{f.label}</button>\n',
        '                  ))}\n',
        '              </div>\n',
        '          </div>\n',
        '          <div className="flex flex-wrap gap-2 w-full lg:w-auto justify-end">\n',
        '              <div className="flex gap-2 mr-auto lg:mr-0">\n',
        '                  <Button variant="outline" size="icon" onClick={() => setLayoutMode(\'table\')} className={`h-10 w-10 ${layoutMode === \'table\' ? \'bg-primary/10 text-primary border-primary/20\' : \'\'}`}><List className="w-4 h-4" /></Button>\n',
        '                  <Button variant="outline" size="icon" onClick={() => setLayoutMode(\'cards\')} className={`h-10 w-10 ${layoutMode === \'cards\' ? \'bg-primary/10 text-primary border-primary/20\' : \'\'}`}><LayoutGrid className="w-4 h-4" /></Button>\n',
        '              </div>\n',
        '              <Tooltip>\n',
        '                  <TooltipTrigger asChild><Button variant="outline" size="icon" className="rounded-full h-10 w-10"><HelpCircle className="w-4 h-4" /></Button></TooltipTrigger>\n',
        '                  <TooltipContent className="max-w-xs p-4 bg-popover text-popover-foreground border shadow-xl"><p className="font-bold text-primary mb-2">Ayuda de Columnas:</p><ul className="text-xs space-y-1 list-disc pl-4 uppercase font-bold"><li><strong>cod:</strong> Identificador único.</li><li><strong>Precio:</strong> Valor unitario en centavos.</li><li><strong>Prioridad:</strong> 1-5.</li><li><strong>Stock Inicial:</strong> Punto de partida.</li></ul></TooltipContent>\n',
        '              </Tooltip>\n',
        '              <input type="file" accept=".xlsx, .xls" onChange={handleImportCatalog} className="hidden" id="catalog-import-input" />\n',
        '          </div>\n',
        '        </div>\n'
    ]
    lines[start_ui:end_ui] = new_ui

with open('src/components/views/terminal/views/ipv/CatalogTable.tsx', 'w') as f:
    f.writelines(lines)
