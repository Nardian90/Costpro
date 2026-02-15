import sys

def apply_diff(file_path, diff):
    with open(file_path, 'r') as f:
        content = f.read()

    blocks = diff.split('<<<<<<< SEARCH\n')
    for block in blocks[1:]:
        search_part, replace_part = block.split('=======\n')
        replace_part = replace_part.split('>>>>>>> REPLACE')[0]
        if search_part in content:
            content = content.replace(search_part, replace_part)
        else:
            print(f'Warning: Search part not found')
            # Print a bit of search part to debug
            print(f'Search part (first 50 chars): {search_part[:50]}...')

    with open(file_path, 'w') as f:
        f.write(content)

file_path = 'src/app/api/cost-sheets/export-pdf/route.ts'
diff = """<<<<<<< SEARCH
    const exportOptions = body.exportOptions || {
        includeFC: true,
        includeAudit: true,
        includeAnnexes: [],
        consolidated: true,
        skipZeros: false,
        includeFinancialSummary: true
    };
=======
    const exportOptions = body.exportOptions || {
        includeFC: true,
        includeAudit: true,
        includeAnnexes: [],
        consolidated: true,
        skipZeros: false,
        includeFinancialSummary: true,
        includeUtilityNote: false
    };
>>>>>>> REPLACE
<<<<<<< SEARCH
    // 1. Export FC
    if (exportOptions.includeFC) {
        pageTitle = "FICHA DE COSTO";
        addHeader(doc, pageTitle);
        currentY = addDataSheetHeader(doc, 38);

        // Main Rows Table
        const rowHeaders = ['Clasif.', 'Concepto', 'Método', 'V. Histórico', 'Total'];

        // Skip Zeros logic for children
        const filterRows = (rows: any[]) => {
            return rows.filter(r => {
                const hasChildren = result.rows.some(child => child.classification.startsWith(r.classification + '.'));
                if (!hasChildren && exportOptions.skipZeros && r.total === 0) return false;
                return true;
            });
        };

        const filteredRows = filterRows(result.rows);
        const row12Total = result.rows.find(r => r.classification === '12')?.total || 0;

        const rowData = filteredRows.map(r => {
            let label = r.label.toUpperCase();
            if (r.classification === '13' && row12Total > 0) {
                const p = (r.total / row12Total) * 100;
                label += ` (${p.toFixed(1)}% S/ COSTO)`;
            }

            return [
                r.classification,
                label,
                r.formaCalculo,
                safeLocale(r.valorHistorico),
                safeLocale(r.total)
            ];
        });

        autoTable(doc, {
            startY: currentY + 10,
            head: [rowHeaders],
            body: rowData,
            theme: 'striped',
            headStyles: { fillColor: [80, 80, 80], textColor: 255, fontSize: 7 },
            styles: { fontSize: 7, cellPadding: 1.5 },
            columnStyles: {
                0: { cellWidth: 20 },
                3: { halign: 'right' },
                4: { halign: 'right', fontStyle: 'bold' }
            },
            margin: { top: 35, bottom: 20 },
            didDrawPage: () => addHeader(doc, pageTitle)
        });
        currentY = (doc as any).lastAutoTable.finalY;
        isFirstPage = false;
    }
=======
    // 1. Export FC
    if (exportOptions.includeFC) {
        pageTitle = "FICHA DE COSTO";
        addHeader(doc, pageTitle);
        currentY = addDataSheetHeader(doc, 38);

        // Main Rows Table
        const rowHeaders = ['Clasif.', 'Concepto', 'Método', 'V. Histórico', 'Total'];

        // Skip Zeros logic for children
        const filterRows = (rows: any[]) => {
            return rows.filter(r => {
                const hasChildren = result.rows.some(child => child.classification.startsWith(r.classification + '.'));
                if (!hasChildren && exportOptions.skipZeros && r.total === 0) return false;
                return true;
            });
        };

        const filteredRows = filterRows(result.rows);
        const row12Total = result.rows.find(r => r.classification === '12')?.total || 0;

        const rowData = filteredRows.map(r => {
            let label = r.label.toUpperCase();
            if (r.classification === '13' && row12Total > 0) {
                const p = (r.total / row12Total) * 100;
                label += ` (${p.toFixed(1)}% S/ COSTO)`;
            }

            return [
                r.classification,
                label,
                r.formaCalculo,
                safeLocale(r.valorHistorico),
                safeLocale(r.total)
            ];
        });

        autoTable(doc, {
            startY: currentY + 10,
            head: [rowHeaders],
            body: rowData,
            theme: 'plain',
            headStyles: { fillColor: [60, 60, 60], textColor: 255, fontSize: 7, fontStyle: 'bold' },
            styles: { fontSize: 7, cellPadding: 1.5, lineColor: [200, 200, 200], lineWidth: 0.1 },
            columnStyles: {
                0: { cellWidth: 20 },
                3: { halign: 'right' },
                4: { halign: 'right' }
            },
            margin: { top: 35, bottom: 20 },
            didParseCell: (data) => {
                if (data.section === 'body') {
                    const rowIndex = data.row.index;
                    const r = filteredRows[rowIndex];
                    if (r) {
                        const labelLower = r.label.toLowerCase();
                        const isVenta = labelLower.includes('venta');
                        const isCosto = labelLower.includes('costo');
                        const hasChildren = result.rows.some(child => child.classification.startsWith(r.classification + '.'));

                        if (hasChildren || isVenta || isCosto) {
                            data.cell.styles.fontStyle = 'bold';
                        }
                        if (isVenta) {
                            data.cell.styles.textColor = [180, 0, 0];
                        }
                    }
                }
            },
            didDrawPage: () => addHeader(doc, pageTitle)
        });
        currentY = (doc as any).lastAutoTable.finalY;

        // Utility Note logic
        if (exportOptions.includeUtilityNote) {
            const r12 = result.rows.find(r => r.classification === '12' || r.classification === '12.1');
            const r13 = result.rows.find(r => r.classification === '13.1' || r.classification === '13');

            if (r12 && r13 && r12.total > 0) {
                const ratio = (r13.total / r12.total);
                const percent = (ratio - 1) * 100;

                doc.setFontSize(7.5);
                doc.setFont("helvetica", "bold");
                const noteTitle = "NOTA SOBRE EL MARGEN DE UTILIDAD:";
                doc.text(noteTitle, 14, currentY + 8);

                doc.setFont("helvetica", "normal");
                const noteContent = `El % de utilidad con respecto al costo es del ${percent.toFixed(2)}%, resultado de la relación entre el Precio (${safeLocale(r13.total)}) y el Total de Costos (${safeLocale(r12.total)}).`;
                const splitNote = doc.splitTextToSize(noteContent, pageWidth - 28);
                doc.text(splitNote, 14, currentY + 12);
                currentY += 15 + (splitNote.length * 3.5);
            }
        }

        isFirstPage = false;
    }
>>>>>>> REPLACE
<<<<<<< SEARCH
    // 2. Export Annexes
    const selectedAnnexes = result.anexos.filter(a => exportOptions.includeAnnexes.includes(a.id));
    for (const annex of selectedAnnexes) {
        // Skip Zeros logic for annexes
        const totalImporte = annex.rows.reduce((sum, r) => sum + (r.importe || 0), 0);
        if (exportOptions.skipZeros && totalImporte === 0) continue;

        const needsNewPage = !exportOptions.consolidated || isFirstPage || (currentY > pageHeight - 60);

        if (needsNewPage) {
            if (!isFirstPage) doc.addPage();
            pageTitle = `ANEXO ${annex.id}`;
            addHeader(doc, pageTitle);
            currentY = 38;
        } else {
            currentY += 12; // Spacing between sections
        }
=======
    // 2. Export Annexes
    const selectedAnnexes = result.anexos.filter(a => exportOptions.includeAnnexes.includes(a.id));
    for (const annex of selectedAnnexes) {
        // Skip Zeros logic for annexes
        const totalImporte = annex.rows.reduce((sum, r) => sum + (r.importe || 0), 0);
        if (exportOptions.skipZeros && totalImporte === 0) continue;

        // Annexes ALWAYS start on a new page if consolidated, as requested
        const needsNewPage = !isFirstPage;

        if (needsNewPage) {
            doc.addPage();
            pageTitle = `ANEXO ${annex.id}`;
            addHeader(doc, pageTitle);
            currentY = 38;
        } else {
            if (isFirstPage) {
                addHeader(doc, `ANEXO ${annex.id}`);
                currentY = 38;
            } else {
                currentY += 12;
            }
        }
>>>>>>> REPLACE
<<<<<<< SEARCH
    const pdfBuffer = doc.output('arraybuffer');

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="ficha-${result.fichaId || 'export'}.pdf"`
      }
    });
=======
    const pdfBuffer = doc.output('arraybuffer');

    const h = result.metadata?.header || {};
    const evalCode = h.code || result.fichaId || 'export';
    const evalName = h.name || result.fichaName || 'ficha';
    const safeFilename = `ficha-${evalCode}-${evalName}.pdf`.replace(/[/\\?%*:|"<>]/g, '-');

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeFilename}"`
      }
    });
>>>>>>> REPLACE"""
apply_diff(file_path, diff)
