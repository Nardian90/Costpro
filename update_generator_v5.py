import re

with open('src/lib/export/pdf-generator.ts', 'r') as f:
    content = f.read()

# Improved Res 148 layout replacement
res148_full = r"""  // --- 3. Res 148 ---
  else if (pdfFormat === 'res148') {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('MINISTERIO DE FINANZAS Y PRECIOS', pageWidth / 2, 10, { align: 'center' });
    doc.setFontSize(7);
    doc.text('FICHA DE COSTOS Y GASTOS DE PRODUCTOS Y SERVICIOS PARA LA EVALUACIÓN DE PRECIOS Y TARIFAS', pageWidth / 2, 14, { align: 'center' });
    doc.text('(RES 148/2023)', pageWidth / 2, 18, { align: 'center' });

    let y = 22;
    // FC Logo simulation
    doc.setFontSize(24);
    doc.text('FC', 25, y + 10, { align: 'center' });

    doc.setFontSize(7);
    doc.setTextColor(40);

    // Organismo, Union, Empresa block
    doc.text(`ORGANISMO: -`, 60, y + 5);
    doc.text(`UNION: -`, 60, y + 10);
    doc.text(`EMPRESA: -`, 60, y + 15);
    doc.text(`CODIGO EMPRESA: -`, 60, y + 20);

    // Right block
    const rightCol = pageWidth - 80;
    doc.text(`ID: ${header.id || '-'}`, rightCol, y + 5);
    doc.text(`COD. PROD: ${header.code || '-'}`, rightCol, y + 10);
    doc.text(`PRODUCTO: ${header.name || '-'}`, rightCol, y + 15);
    doc.text(`UM: ${header.unit || '-'}`, rightCol, y + 20);

    y += 25;

    // Cantidad & Precio row
    doc.text(`Cantidad: ${header.quantity || '1'}`, rightCol, y + 5);
    doc.setFillColor(240, 240, 240);
    doc.rect(rightCol, y + 7, 60, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text(`PRECIO:`, rightCol + 2, y + 11.5);
    doc.text(`${safeLocale(header.salePrice || 0)}`, rightCol + 58, y + 11.5, { align: 'right' });

    y += 15;

    const res148Rows: any[] = [];
    sections.forEach((section: any) => {
      res148Rows.push([{
        content: section.label || section.id,
        colSpan: 5,
        styles: { fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0] }
      }]);
      const processRows = (rows: any[], depth = 0) => {
        rows.forEach((row: any) => {
          if (shouldSkipRow(row, calculatedValues, skipZeros)) return;
          const calc = calculatedValues[row.id] || {};
          const indent = '  '.repeat(depth);
          res148Rows.push([
            `${indent}${row.label || ''}`,
            row.id || '',
            row.um || row.unit || '-',
            safeLocale(row.coefficient || row.coeficiente || 1, 4),
            safeLocale(calc.total || 0),
          ]);
          if (row.children) processRows(row.children, depth + 1);
        });
      };
      processRows(section.rows || []);
    });

    if (calculatedHeader) {
      const cost = calculatedHeader.totalCost || 0;
      const price = calculatedHeader.salePrice || 0;
      res148Rows.push([{ content: `COSTO TOTAL UNITARIO:`, colSpan: 4, styles: { fontStyle: 'bold' } }, { content: safeLocale(cost), styles: { fontStyle: 'bold' } }]);
      res148Rows.push([{ content: `PRECIO TOTAL:`, colSpan: 4, styles: { fontStyle: 'bold' } }, { content: safeLocale(price), styles: { fontStyle: 'bold' } }]);
      res148Rows.push([{ content: `UTILIDAD (%):`, colSpan: 4, styles: { fontStyle: 'bold' } }, { content: safeLocale(calculatedHeader.utilityPercent || 0, 4), styles: { fontStyle: 'bold' } }]);
    }

    autoTable(doc, {
      startY: y,
      head: [['CONCEPTOS DE GASTOS', 'FILA', 'UM', 'INDICE', 'TOTAL']],
      body: res148Rows,
      theme: 'grid',
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontSize: 7, fontStyle: 'bold', lineWidth: 0.1 },
      styles: { fontSize: 7, cellPadding: 1.2, textColor: [0, 0, 0] },
      margin: { left: 14, right: 14 },
    });
  }"""

# Use a marker-based replacement to be safer
content = re.sub(r'  // --- 3. Res 148 ---.*?margin: { left: 14, right: 14 },\s+ \}\); \s+ \}', res148_full, content, flags=re.DOTALL)

# Let's try a direct string replace if regex fails due to character variety
if "  // --- 3. Res 148 ---" in content and "autoTable(doc, {" in content:
    start_idx = content.find("  // --- 3. Res 148 ---")
    # Find the end of the autoTable block following it
    end_marker = "margin: { left: 14, right: 14 },"
    end_idx = content.find(end_marker, start_idx)
    if end_idx != -1:
        # Find the next closing brackets }); }
        end_idx = content.find("});", end_idx)
        end_idx = content.find("}", end_idx + 3) + 1
        content = content[:start_idx] + res148_full + content[end_idx:]

with open('src/lib/export/pdf-generator.ts', 'w') as f:
    f.write(content)
