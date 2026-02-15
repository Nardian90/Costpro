import sys

def apply_diff(file_path, diff):
    with open(file_path, 'r') as f:
        content = f.read()

    blocks = diff.split('<<<<<<< SEARCH\n')
    for block in blocks[1:]:
        search_part, replace_part = block.split('=======\n')
        replace_part = replace_part.split('>>>>>>> REPLACE')[0]
        if search_part in content:
            content = content.replace(search_part, replace_part)
        else:
            print(f'Warning: Search part not found')

    with open(file_path, 'w') as f:
        f.write(content)

file_path = 'src/components/views/terminal/views/cost_sheet/CostSheetExportModal.tsx'
diff = """<<<<<<< SEARCH
export interface ExportOptions {
  includeFC: boolean;
  includeAudit: boolean;
  includeAnnexes: string[]; // IDs of annexes to include
  consolidated: boolean;
  skipZeros: boolean;
  includeFinancialSummary: boolean;
}
=======
export interface ExportOptions {
  includeFC: boolean;
  includeAudit: boolean;
  includeAnnexes: string[]; // IDs of annexes to include
  consolidated: boolean;
  skipZeros: boolean;
  includeFinancialSummary: boolean;
  includeUtilityNote: boolean;
}
>>>>>>> REPLACE
<<<<<<< SEARCH
  const [options, setOptions] = useState<ExportOptions>({
    includeFC: true,
    includeAudit: false,
    includeAnnexes: annexes.map(a => a.id),
    consolidated: true,
    skipZeros: true,
    includeFinancialSummary: true
  });
=======
  const [options, setOptions] = useState<ExportOptions>({
    includeFC: true,
    includeAudit: false,
    includeAnnexes: annexes.map(a => a.id),
    consolidated: true,
    skipZeros: true,
    includeFinancialSummary: true,
    includeUtilityNote: true
  });
>>>>>>> REPLACE
<<<<<<< SEARCH
                        <div className="flex items-center justify-between p-3 rounded-2xl bg-sidebar/40 border border-sidebar-border/50">
                            <div>
                                <Label htmlFor="skipZeros" className="font-bold text-sm block">Omitir Ceros</Label>
                                <span className="text-xs text-muted-foreground uppercase font-medium">No exportar filas o anexos en cero</span>
                            </div>
                            <Switch
                                id="skipZeros"
                                checked={options.skipZeros}
                                onCheckedChange={(checked) => setOptions(prev => ({ ...prev, skipZeros: checked }))}
                            />
                        </div>

                    </div>
=======
                        <div className="flex items-center justify-between p-3 rounded-2xl bg-sidebar/40 border border-sidebar-border/50">
                            <div>
                                <Label htmlFor="skipZeros" className="font-bold text-sm block">Omitir Ceros</Label>
                                <span className="text-xs text-muted-foreground uppercase font-medium">No exportar filas o anexos en cero</span>
                            </div>
                            <Switch
                                id="skipZeros"
                                checked={options.skipZeros}
                                onCheckedChange={(checked) => setOptions(prev => ({ ...prev, skipZeros: checked }))}
                            />
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-2xl bg-sidebar/40 border border-sidebar-border/50">
                            <div>
                                <Label htmlFor="includeUtilityNote" className="font-bold text-sm block">Nota de Utilidad</Label>
                                <span className="text-xs text-muted-foreground uppercase font-medium">Incluir desglose del % de utilidad</span>
                            </div>
                            <Switch
                                id="includeUtilityNote"
                                checked={options.includeUtilityNote}
                                onCheckedChange={(checked) => setOptions(prev => ({ ...prev, includeUtilityNote: checked }))}
                            />
                        </div>

                    </div>
>>>>>>> REPLACE"""
apply_diff(file_path, diff)
