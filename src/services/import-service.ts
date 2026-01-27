import Papa from 'papaparse';
import { z } from 'zod';

export interface ImportError {
  row: number;
  message: string;
}

export interface ValidatedRow<T> {
  row: number;
  item: T;
}

export interface ParseResult<T> {
  data: ValidatedRow<T>[];
  errors: ImportError[];
}

export const importService = {
  /**
   * Parses and validates a CSV file against a Zod schema with header normalization.
   * Preserves row numbers (index + 2) for precise feedback.
   */
  async parseAndValidate<T>(
    file: File,
    schema: z.ZodSchema<T>,
    headerAliases: Record<string, string[]>
  ): Promise<ParseResult<T>> {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rawData = results.data as Record<string, any>[];
          const fileHeaders = results.meta.fields || [];

          const headerMapping: Record<string, string> = {};

          // Map canonical headers to file headers based on aliases
          for (const [canonical, aliases] of Object.entries(headerAliases)) {
            const foundAlias = fileHeaders.find(h =>
              aliases.map(a => a.toLowerCase()).includes(h.trim().toLowerCase())
            );
            if (foundAlias) {
              headerMapping[canonical] = foundAlias.trim();
            }
          }

          const validatedData: ValidatedRow<T>[] = [];
          const errors: ImportError[] = [];

          rawData.forEach((row, index) => {
            const rowNum = index + 2; // 1-based + header row
            const normalizedRow: Record<string, any> = {};

            // Fill normalized row using mapping
            for (const [canonical, fileHeader] of Object.entries(headerMapping)) {
              normalizedRow[canonical] = row[fileHeader];
            }

            const validation = schema.safeParse(normalizedRow);
            if (validation.success) {
              validatedData.push({
                row: rowNum,
                item: validation.data
              });
            } else {
              validation.error.issues.forEach((issue) => {
                errors.push({
                  row: rowNum,
                  message: issue.message
                });
              });
            }
          });

          resolve({ data: validatedData, errors });
        },
        error: (err) => {
          resolve({ data: [], errors: [{ row: 0, message: `Error de lectura: ${err.message}` }] });
        }
      });
    });
  }
};
