import { db, type Product } from '../dexie';

export interface ValidationError {
  row?: number;
  code: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  normalizedCount: number;
  summary: {
    added: number;
    updated: number;
    duplicates: number;
    invalid: number;
  };
}

export interface NormalizedProduct extends Partial<Product> {
  cod: string;
  descripcion: string;
}

export class ImportValidator {
  private static HEADER_MAP: Record<string, string[]> = {
    cod: ['Código', 'cod', 'CODIGO', 'SKU', 'Ref', 'REF', 'Id', 'ID'],
    id_grupo: ['id_grupo', 'ID_GRUPO', 'Grupo', 'grupo', 'Group', 'GROUP'],
    cod_hijo: ['cod_hijo', 'COD_HIJO', 'Hijo', 'hijo', 'Child', 'CHILD', 'cod_padre', 'COD_PADRE', 'Padre', 'padre', 'Parent', 'PARENT'],
    descripcion: ['Descripción', 'descripcion', 'DESCRIPCION', 'Name', 'NAME', 'Nombre', 'nombre'],
    um: ['UM', 'um', 'UM', 'Unidad', 'unidad', 'Unit', 'UNIT'],
    precio_cents: ['Precio ($)', 'precio_cents', 'PRECIO', 'Price', 'PRICE'],
    var_perm: ['variacion_permisible_percent', 'VARIACION_PERMISIBLE', 'Variación %', 'Variacion %'],
    prioridad: ['Prioridad', 'prioridad_alg', 'prioridad_algoritmo', 'Priority', 'PRIORITY'],
    stock: ['Stock Inicial', 'stock_inicial_manual', 'Stock', 'STOCK', 'Existencia', 'EXISTENCIA'],
    es_pqt: ['Es Paquete (S/N)', 'es_paquete', 'ES_PAQUETE', 'Is Package', 'IS_PACKAGE'],
    activo: ['activo', 'Activo', 'ACTIVO', 'Active', 'ACTIVE'],
    cont_pqt: ['Contenido Paquete', 'contenido_paquete', 'CONTENIDO_PAQUETE', 'Package Content', 'PACKAGE_CONTENT'],
    cuenta: ['Cuenta Contable', 'cuenta_contable', 'CUENTA_CONTABLE', 'Account', 'ACCOUNT'],
    costo: ['Costo Unitario', 'costo_unitario', 'costo_unitario_cents', 'COSTO_UNITARIO', 'Unit Cost', 'UNIT_COST', 'COSTO', 'costo']
  };

  private static getHeader(row: any, field: string): any {
    const aliases = this.HEADER_MAP[field];
    if (!aliases) return undefined;
    for (const alias of aliases) {
      if (row[alias] !== undefined) return row[alias];
    }
    return undefined;
  }

  static normalizeProduct(row: any, rowIndex: number): { product: NormalizedProduct | null, errors: ValidationError[] } {
    const errors: ValidationError[] = [];
    const rawCod = this.getHeader(row, 'cod');
    const rawDesc = this.getHeader(row, 'descripcion');

    if (!rawCod) errors.push({ row: rowIndex, code: 'MISSING_COD', message: 'Código es obligatorio', severity: 'ERROR' });
    if (!rawDesc) errors.push({ row: rowIndex, code: 'MISSING_DESC', message: 'Descripción es obligatoria', severity: 'ERROR' });

    if (errors.some(e => e.severity === 'ERROR')) return { product: null, errors };

    const cod = String(rawCod).trim().toUpperCase();
    if (!cod) {
      errors.push({ row: rowIndex, code: 'EMPTY_COD', message: 'Código no puede estar vacío', severity: 'ERROR' });
      return { product: null, errors };
    }

    const product: NormalizedProduct = {
      cod,
      id_grupo: String(this.getHeader(row, 'id_grupo') || '').trim().toUpperCase() || undefined,
      cod_hijo: String(this.getHeader(row, 'cod_hijo') || '').trim().toUpperCase() || undefined,
      descripcion: String(rawDesc).trim(),
      um: String(this.getHeader(row, 'um') || 'UNIDADES').trim().toUpperCase(),
      precio_cents: Math.round((typeof this.getHeader(row, 'precio_cents') === 'number' ? this.getHeader(row, 'precio_cents') : parseFloat(String(this.getHeader(row, 'precio_cents') || 0).replace(',', '.'))) * 100),
      costo_unitario_cents: Math.round((typeof this.getHeader(row, 'costo') === 'number' ? this.getHeader(row, 'costo') : parseFloat(String(this.getHeader(row, 'costo') || 0).replace(',', '.'))) * 100),
      stock_inicial_manual: typeof this.getHeader(row, 'stock') === 'number' ? this.getHeader(row, 'stock') : parseFloat(String(this.getHeader(row, 'stock') || 0).replace(',', '.')),
      prioridad_algoritmo: parseInt(String(this.getHeader(row, 'prioridad') || 3)) || 3,
      es_paquete: String(this.getHeader(row, 'es_pqt')).toUpperCase() === 'S' || String(this.getHeader(row, 'es_pqt')).toUpperCase() === 'VERDADERO' || this.getHeader(row, 'es_pqt') === true,
      contenido_paquete: parseInt(String(this.getHeader(row, 'cont_pqt') || 1)) || 1,
      cuenta_contable: String(this.getHeader(row, 'cuenta') || '').trim(),
      activo: true,
      created_at: new Date().toISOString(),
      priorityMode: 'manual'
    };

    if (product.precio_cents! < 0) errors.push({ row: rowIndex, code: 'NEGATIVE_PRICE', message: `Precio negativo para ${cod}`, severity: 'ERROR' });
    if (product.stock_inicial_manual! < 0) errors.push({ row: rowIndex, code: 'NEGATIVE_STOCK', message: `Stock inicial negativo para ${cod}`, severity: 'WARNING' });

    return { product, errors };
  }

  static async validateImport(rawRows: any[]): Promise<{ products: NormalizedProduct[], result: ValidationResult }> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const normalizedProducts: NormalizedProduct[] = [];
    const existingCatalog = await db.products.toArray();
    const codMap = new Map<string, number>();
    const summary = { added: 0, updated: 0, duplicates: 0, invalid: 0 };

    rawRows.forEach((row, index) => {
      const { product, errors: rowErrors } = this.normalizeProduct(row, index + 1);
      if (product) {
        if (codMap.has(product.cod)) {
          errors.push({ row: index + 1, code: 'DUPLICATE_FILE', message: `Código duplicado: ${product.cod}`, severity: 'ERROR' });
          summary.duplicates++;
        } else {
          codMap.set(product.cod, index);
          normalizedProducts.push(product);
          const existing = existingCatalog.find(e => e.cod === product.cod);
          if (existing) {
            summary.updated++;
            if (existing.precio_cents !== product.precio_cents) warnings.push({ row: index + 1, code: 'PRICE_CHANGE', message: `${product.cod}: El precio cambiará de ${existing.precio_cents} a ${product.precio_cents}`, severity: 'WARNING' });
            if (existing.descripcion !== product.descripcion) warnings.push({ row: index + 1, code: 'DESC_CHANGE', message: `${product.cod}: Descripción cambiará de "${existing.descripcion}" a "${product.descripcion}"`, severity: 'WARNING' });
          } else summary.added++;
        }
      } else summary.invalid++;
      errors.push(...rowErrors.filter(e => e.severity === 'ERROR'));
      warnings.push(...rowErrors.filter(e => e.severity === 'WARNING'));
    });

    const validationResult = { valid: errors.length === 0, errors, warnings, normalizedCount: normalizedProducts.length, summary };

    // Validar huérfanos
    const orphanErrors = this.validateOrphanProducts(normalizedProducts, existingCatalog);
    validationResult.errors.push(...orphanErrors);
    if (orphanErrors.length > 0) validationResult.valid = false;

    return { products: normalizedProducts, result: validationResult };
  }

  private static validateOrphanProducts(newProducts: NormalizedProduct[], existingCatalog: Product[]): ValidationError[] {
    const errors: ValidationError[] = [];
    const allCods = new Set([
      ...newProducts.map(p => p.cod),
      ...existingCatalog.map(p => p.cod)
    ]);

    newProducts.forEach((p, index) => {
      if (p.cod_hijo && !allCods.has(p.cod_hijo)) {
        errors.push({
          row: index + 1,
          code: 'ORPHAN_CHILD',
          message: `El producto ${p.cod} referencia a un hijo inexistente: ${p.cod_hijo}`,
          severity: 'ERROR'
        });
      }
    });

    return errors;
  }
}
