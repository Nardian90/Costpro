import { Product } from '../dexie';

export interface ValidationError {
  code: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  normalizedCount: number;
  duplicateCount: number;
}

export interface NormalizedProduct extends Partial<Product> {
  cod: string;
  descripcion: string;
}

export class ImportValidator {
  /**
   * Normaliza datos de importación
   */
  static normalizeProduct(row: any): NormalizedProduct {
    const cod = (row['Código'] || row['cod'] || row['COD'] || '').toString().trim().toUpperCase();
    const id_grupo = (row['id_grupo'] || row['Grupo'] || row['GRUPO'] || '').toString().trim().toUpperCase();
    const cod_hijo = (row['cod_hijo'] || row['Hijo'] || row['HIJO'] || '').toString().trim().toUpperCase() || undefined;
    const descripcion = (row['Descripción'] || row['descripcion'] || row['DESCRIPCION'] || '').toString().trim();
    const precio_cents = parseInt(row['Precio'] || row['precio'] || row['PRECIO'] || '0') || 0;
    const stock_inicial_manual = parseInt(row['Stock'] || row['stock'] || row['STOCK'] || row['Existencia'] || '0') || 0;
    const um = (row['UM'] || row['um'] || 'U').toString().trim();

    // Validaciones básicas
    if (!cod) throw new Error('Código (cod) es obligatorio');
    if (!descripcion) throw new Error('Descripción es obligatoria');

    return {
      cod,
      id_grupo: id_grupo || cod, // Default group to self if not specified
      cod_hijo: cod_hijo === cod ? undefined : cod_hijo,
      descripcion,
      precio_cents,
      stock_inicial_manual,
      um,
      activo: true,
      prioridad_algoritmo: 3,
      created_at: new Date().toISOString()
    };
  }

  /**
   * Detecta duplicados y conflictos en importación
   */
  static async validateImport(
    products: NormalizedProduct[],
    existingCatalog: Product[]
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const duplicates: Map<string, NormalizedProduct[]> = new Map();

    // 1. Detectar duplicados dentro del import
    products.forEach(p => {
      const key = p.cod;
      if (!duplicates.has(key)) {
        duplicates.set(key, []);
      }
      duplicates.get(key)!.push(p);
    });

    duplicates.forEach((prods, cod) => {
      if (prods.length > 1) {
        errors.push({
          code: 'DUPLICATE_COD',
          message: `Código duplicado en archivo: ${cod} aparece ${prods.length} veces`,
          severity: 'ERROR'
        });
      }
    });

    // 2. Detectar conflictos con catálogo existente
    products.forEach(p => {
      const existing = existingCatalog.find(e => e.cod === p.cod);
      if (existing) {
        if (existing.descripcion !== p.descripcion) {
          warnings.push({
            code: 'DESCRIPTION_MISMATCH',
            message: `${p.cod}: descripción cambió. Era "${existing.descripcion}", ahora es "${p.descripcion}"`,
            severity: 'WARNING'
          });
        }

        if (existing.precio_cents !== p.precio_cents) {
          warnings.push({
            code: 'PRICE_CHANGE',
            message: `${p.cod}: precio cambió de ${existing.precio_cents} a ${p.precio_cents}`,
            severity: 'WARNING'
          });
        }
      }
    });

    // 3. Validar jerarquía
    products.forEach(p => {
      if (p.cod_hijo) {
        const childExists = products.find(pp => pp.cod === p.cod_hijo) ||
                           existingCatalog.find(e => e.cod === p.cod_hijo);
        if (!childExists) {
          errors.push({
            code: 'MISSING_CHILD',
            message: `${p.cod}: el hijo configurado (${p.cod_hijo}) no existe en el catálogo`,
            severity: 'ERROR'
          });
        }
      }

      if (p.id_grupo && p.id_grupo !== p.cod) {
        const parentExists = products.find(pp => pp.cod === p.id_grupo) ||
                            existingCatalog.find(e => e.cod === p.id_grupo);
        if (!parentExists) {
          warnings.push({
            code: 'MISSING_PARENT',
            message: `${p.cod}: el grupo/padre (${p.id_grupo}) no existe como producto independiente`,
            severity: 'WARNING'
          });
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      normalizedCount: products.length,
      duplicateCount: duplicates.size
    };
  }
}
