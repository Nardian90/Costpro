import { MVTTemplate, MVTSettings, FieldConfig } from "./types";
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

export function generateMVTContent(template: MVTTemplate, context: MVTExportContext): string {
  let output = "";

  for (const section of template.sections) {
    output += `${section.title}\n`;

    // Section context includes global variables for all fields
    const sectionContext = {
      ...context,
      ...context.global,
      numero: context.global.numero // Explicitly ensure numero is available
    };

    if (section.type === 'single') {
      if (section.title === '[Documento]') {
        section.fields.forEach(field => {
          output += `${field.key}=${resolveField(field, sectionContext)}\n`;
        });
      } else {
        const line = section.fields.map(field => resolveField(field, sectionContext)).join('|');
        output += line + '\n';
      }
      output += '\n';
    } else if (section.type === 'repeatable') {
      const data = section.dataSource === 'products' ? context.products : context.movements;

      if (section.title === '[Ubicacion]') {
         output += "CODIGO|DESCRIPCION|UM|CUENTA|||||EXISTENCIA|\n";
      }

      data.forEach(item => {
        const itemContext = {
          ...sectionContext,
          product: section.dataSource === 'products' ? item : item.product,
          movement: section.dataSource === 'movements' ? item : undefined,
          cantidad: item.cantidad ?? item.ventas_qty ?? 0,
          costo: item.costo_unitario ?? item.product?.costo_unitario ?? 0,
        };

        const line = section.fields.map(field => resolveField(field, itemContext)).join('|');
        output += line + '\n';
      });
      output += '\n';
    }
  }

  return output.trim();
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
