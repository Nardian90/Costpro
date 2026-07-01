import { MappingRule, MappingStats, ReportType } from './mapping.types';
import { TransformationRegistry } from './mapping.registry';

export class MappingEngine {
  static apply(
    dataset: any[],
    rules: MappingRule[],
    reportType: ReportType
  ): { mappedData: any[]; stats: MappingStats } {
    const activeRules = rules
      .filter((r) => r.active && r.reportType === reportType)
      .sort((a, b) => b.priority - a.priority || b.updatedAt - a.updatedAt);

    const stats: MappingStats = {
      totalRows: dataset.length,
      mappedRows: 0,
      failedRows: 0,
      successRate: 0,
      unmappedColumns: [],
      errors: [],
    };

    if (dataset.length > 0) {
      const sourceColumns = Object.keys(dataset[0]);
      const mappedSourceCols = new Set(activeRules.map((r) => r.sourceColumn));
      stats.unmappedColumns = sourceColumns.filter((col) => !mappedSourceCols.has(col));
    }

    const mappedData = dataset.map((row, index) => {
      const mappedRow: any = { ...row };
      let rowMappedCorrectly = true;

      for (const rule of activeRules) {
        const rawValue = row[rule.sourceColumn];

        if (rawValue !== undefined) {
          try {
            let transformedValue = rawValue;
            if (rule.transform && TransformationRegistry[rule.transform]) {
              transformedValue = TransformationRegistry[rule.transform](rawValue);
            }

            mappedRow[rule.targetField] = transformedValue;
          } catch (err: any) {
            rowMappedCorrectly = false;
            stats.errors.push(`Row ${index + 1}: Error mapping ${rule.sourceColumn} to ${rule.targetField} - ${err.message}`);
          }
        }
      }

      if (rowMappedCorrectly) {
        stats.mappedRows++;
      } else {
        stats.failedRows++;
      }

      return mappedRow;
    });

    stats.successRate = stats.totalRows > 0 ? (stats.mappedRows / stats.totalRows) * 100 : 0;

    return { mappedData, stats };
  }
}
