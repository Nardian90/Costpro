import { MVTTemplate, FieldConfig, MVTSection } from "./types";
import { evaluateExpression, resolveDynamicValue } from "./evaluator";

export interface MVTExportContext {
  global: {
    numero: number;
    fecha: string;
    almacen: string;
    centro: string;
    concepto: string;
    cuenta_mn: string;
  };
  products: any[];
  movements: any[];
}

/**
 * Generates the .mvt file content using CRLF for Windows compatibility (Versat)
 */
export function generateMVTContent(template: MVTTemplate, context: MVTExportContext): string {
  let output = "";
  const CRLF = "\r\n";

  for (const section of template.sections) {
    output += `${section.title}` + CRLF;

    const sectionContext = {
      ...context,
      ...context.global,
      numero: context.global.numero
    };

    if (section.type === 'single') {
      const mode = section.renderMode || (section.title === '[Documento]' ? 'key_value' : 'pipe_separated');

      if (mode === 'key_value') {
        section.fields.forEach(field => {
          output += `${field.key}=${resolveField(field, sectionContext)}` + CRLF;
        });
      } else {
        const line = section.fields.map(field => resolveField(field, sectionContext)).join('|');
        output += line + CRLF;
      }
      output += CRLF;
    } else if (section.type === 'repeatable') {
      const data = section.dataSource === 'products' ? context.products : context.movements;

      // Special handling for [Ubicacion] header as per requirement
      if (section.title === '[Ubicacion]') {
         output += "CODIGO|DESCRIPCION|UM|CUENTA|||||EXISTENCIA|" + CRLF;
      }

      data.forEach(item => {
        const itemContext = {
          ...sectionContext,
          product: section.dataSource === 'products' ? item : item.product,
          movement: section.dataSource === 'movements' ? item : undefined,
          // Extract calculated or raw values for expressions
          cantidad: item.cantidad ?? 0,
          costo: item.costo_unitario_cents ? item.costo_unitario_cents / 100 : (item.product?.costo_unitario_cents ? item.product.costo_unitario_cents / 100 : 0),
        };

        const line = section.fields.map(field => resolveField(field, itemContext)).join('|');
        output += line + CRLF;
      });
      output += CRLF;
    }
  }

  return output.trim() + CRLF;
}

function resolveField(field: FieldConfig, context: any): string {
  switch (field.source) {
    case 'static':
      return field.value;
    case 'dynamic':
      return resolveDynamicValue(field.value, context);
    case 'template':
    case 'expression':
      return evaluateExpression(field.value, context);
    default:
      return '';
  }
}

/**
 * Downloads the content as a UTF-8 file.
 * Most Cuban ERPs (Versat) expect UTF-8 or Windows-1252.
 * We use standard UTF-8.
 */
export function downloadMVT(content: string, fileName: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
