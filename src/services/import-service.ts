import Papa from 'papaparse';
import { z } from 'zod';

export interface ImportError {
  row: number;
  message: string;
}

export const importService = {
  /**
   * Parses a CSV file, normalizes headers based on aliases, and validates each row against a Zod schema.
   */
  async parseCSV<T>(
    file: File,
    headerAliases: Record<string, string[]>,
    rowSchema: z.ZodType<T>,
    requiredHeaders: string[] = []
  ): Promise<{ data: { rowData: T; rowNumber: number }[]; errors: ImportError[] }> {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rawData = results.data as any[];
          const fileHeaders = (results.meta.fields || []).map(h => h.trim());
          const headerMapping: Record<string, string> = {};
          const missingRequiredHeaders: string[] = [];

          // Determine which file headers map to our canonical headers
          for (const canonicalHeader in headerAliases) {
            const aliases = headerAliases[canonicalHeader];
            const foundAlias = fileHeaders.find((header) =>
              aliases.includes(header)
            );

            if (foundAlias) {
              headerMapping[canonicalHeader] = foundAlias;
            } else if (requiredHeaders.includes(canonicalHeader)) {
              missingRequiredHeaders.push(canonicalHeader);
            }
          }

          if (missingRequiredHeaders.length > 0) {
            resolve({
              data: [],
              errors: [
                {
                  row: 0,
                  message: `Faltan las siguientes columnas requeridas: ${missingRequiredHeaders.join(', ')}`,
                },
              ],
            });
            return;
          }

          const validatedData: { rowData: T; rowNumber: number }[] = [];
          const errors: ImportError[] = [];

          rawData.forEach((row, index) => {
            const rowNum = index + 2; // +1 for 1-based index, +1 for header row
            const normalizedRow: any = {};

            // Map file values to canonical headers
            for (const canonicalHeader in headerMapping) {
              normalizedRow[canonicalHeader] = row[headerMapping[canonicalHeader]];
            }

            const result = rowSchema.safeParse(normalizedRow);
            if (result.success) {
              validatedData.push({ rowData: result.data, rowNumber: rowNum });
            } else {
              result.error.issues.forEach((issue) => {
                const path = issue.path.join('.');
                errors.push({
                  row: rowNum,
                  message: `${path ? path + ': ' : ''}${issue.message}`,
                });
              });
            }
          });

          resolve({ data: validatedData, errors });
        },
        error: (error) => {
          resolve({
            data: [],
            errors: [{ row: 0, message: `Error al procesar el CSV: ${error.message}` }],
          });
        }
      });
    });
  },
};
