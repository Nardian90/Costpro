import re

with open('src/components/views/terminal/views/cost_sheet/CostSheetExportModal.tsx', 'r') as f:
    lines = f.readlines()

new_lines = []
skip = False
type_done = False
interface_done = False

for line in lines:
    if line.startswith("export type PDFFormat ="):
        if not type_done:
            new_lines.append("export type PDFFormat = \n  | 'standard' \n  | 'pro' \n  | 'res148' \n  | 'ejecutivo' \n  | 'contabilidad' \n  | 'auditoria' \n  | 'simplificado' \n  | 'bilingue' \n  | 'comparativo' \n  | 'exportacion';\n")
            type_done = True
        skip = True
        continue
    if line.startswith("export interface ExportOptions {"):
        if not interface_done:
            new_lines.append("""export interface ExportOptions {
  // Documents
  includeFC: boolean;
  includeAudit: boolean;
  includeAnnexes: string[];

  // Format
  pdfFormat: PDFFormat;
  logo?: string;

  // Advanced
  consolidated: boolean;
  skipZeros: boolean;
  includeFinancialSummary: boolean;
  includeUtilityNote: boolean;
  showDateTime: boolean;
  alwaysZip: boolean;

  // Comparison
  includeComparison?: boolean;
  scenarioId?: string;
}\n""")
            interface_done = True
        skip = True
        continue

    if skip:
        if line.strip() == "" or line.strip().startswith("|") or line.strip().startswith("//") or line.strip().startswith("include") or line.strip().startswith("pdfFormat") or line.strip().startswith("logo") or line.strip().startswith("consolidated") or line.strip().startswith("skipZeros") or line.strip().startswith("showDateTime") or line.strip().startswith("alwaysZip") or line.strip().startswith("scenarioId") or line.strip() == "}":
            continue
        else:
            skip = False

    new_lines.append(line)

with open('src/components/views/terminal/views/cost_sheet/CostSheetExportModal.tsx', 'w') as f:
    f.writelines(new_lines)
