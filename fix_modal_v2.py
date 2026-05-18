import re

with open('src/components/views/terminal/views/cost_sheet/CostSheetExportModal.tsx', 'r') as f:
    content = f.read()

# Fix PDFFormat type
type_def = """export type PDFFormat =
  | 'standard'
  | 'pro'
  | 'res148'
  | 'ejecutivo'
  | 'contabilidad'
  | 'auditoria'
  | 'simplificado'
  | 'bilingue'
  | 'comparativo'
  | 'exportacion';"""

content = re.sub(r'export type PDFFormat =.*?;', type_def, content, flags=re.DOTALL)

# Fix ExportOptions interface
interface_def = """export interface ExportOptions {
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
}"""

content = re.sub(r'export interface ExportOptions {.*?}', interface_def, content, flags=re.DOTALL)

with open('src/components/views/terminal/views/cost_sheet/CostSheetExportModal.tsx', 'w') as f:
    f.write(content)
