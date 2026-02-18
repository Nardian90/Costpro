import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CalculationResult } from '@/lib/cost-engine/types';
import { format } from 'date-fns';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result: CalculationResult = body;
    const exportOptions = body.exportOptions || {
        includeFC: true,
        includeAudit: true,
        includeAnnexes: [],
        consolidated: true,
        skipZeros: false,
        includeFinancialSummary: true,
        includeUtilityNote: false,
        showDateTime: true,
        pdfFormat: 'standard'
    };

    const isPro = exportOptions.pdfFormat === 'pro';
    const primaryColor: [number, number, number] = isPro ? [26, 82, 118] : [60, 60, 60];

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const timestamp = format(new Date(), "dd/MM/yyyy HH:mm");

    let pageTitle = "FICHA DE COSTO";
    let lastHeaderPage = 0;

    const addHeader = (doc: jsPDF, title: string) => {
        const pageNum = doc.getNumberOfPages();
        if (lastHeaderPage === pageNum) return;
        lastHeaderPage = pageNum;

        if (isPro) {
            // PRO Header: Minimalist, Ink-Saving
            doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.setLineWidth(0.5);
            doc.rect(14, 10, 15, 15, 'S'); // Outline Logo

            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text("FC", 21.5, 20, { align: "center" });

            doc.setTextColor(100, 100, 100);
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.text("REPORTE CORPORATIVO DE COSTOS", pageWidth - 14, 15, { align: "right" });
            doc.setFont("helvetica", "normal");
            doc.text(`Generado: ${timestamp}`, pageWidth - 14, 19, { align: "right" });

            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text(title.toUpperCase(), 35, 20);

            doc.setDrawColor(230, 230, 230);
            doc.setLineWidth(0.2);
            doc.line(14, 28, pageWidth - 14, 28);
        } else {
            // Standard Logo Box
            doc.setFillColor(40, 40, 40);
            doc.rect(14, 10, 20, 20, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(16);
            doc.setFont("helvetica", "bold");
            doc.text("FC", 24, 23, { align: "center" });

            doc.setTextColor(0, 0, 0);
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.text("MINISTERIO DE FINANZAS Y PRECIOS", pageWidth / 2 + 10, 15, { align: "center" });
            doc.setFontSize(8);
            doc.text("FICHA DE COSTOS Y GASTOS DE PRODUCTOS Y SERVICIOS", pageWidth / 2 + 10, 20, { align: "center" });
            doc.setFont("helvetica", "normal");
            doc.text(title, pageWidth / 2 + 10, 24, { align: "center" });
            doc.line(14, 32, pageWidth - 14, 32);
        }
    };

    const safeLocale = (val: any) => {
        if (val === null || val === undefined || isNaN(Number(val))) return '0,00';
        return Number(val).toLocaleString('es-ES', { minimumFractionDigits: 2 });
    };

    const translationMap: Record<string, string> = {
        'no': 'No.',
        'classification': 'Clasificación',
        'code': 'Código',
        'description': 'Descripción',
        'um': 'UM',
        'consumption_norm': 'Norma Consumo',
        'price': 'Precio Unitario',
        'total': 'Total',
        'quantity': 'Cantidad',
        'amount': 'Importe',
        'cost': 'Costo',
        'unit_cost': 'Costo Unitario',
        'time_norm': 'Norma Tiempo',
        'hourly_rate': 'Tarifa Horaria',
        'worker_count': 'Cant. Obreros',
        'name': 'Nombre/Descripción',
        'initial_value': 'Valor Inicial',
        'useful_life': 'Vida Útil (%)',
        'time': 'Tiempo',
        'value': 'Valor',
        'depreciation': 'Depreciación',
        'diet': 'Dieta',
        'category': 'Categoría',
        'salary': 'Salario',
        'total_salary': 'Salario Total',
        'coefficient': 'Coeficiente',
        'provider': 'Proveedor',
        'supplier': 'Proveedor',
        'observation': 'Observación',
        'observations': 'Observaciones',
        'note': 'Nota',
        'notes': 'Notas',
        'date': 'Fecha',
        'currency': 'Moneda',
        'status': 'Estado',
        'type': 'Tipo',
        'category_name': 'Categoría',
        'unit_price': 'Precio Unitario',
        'total_price': 'Precio Total',
        'subtotal': 'Subtotal',
        'tax': 'Impuesto',
        'discount': 'Descuento',
        'concept': 'Concepto',
        'unit': 'UM',
    };

    const translate = (key: string) => {
        const normalized = key.toLowerCase().trim().replace(/ /g, '_');
        return translationMap[normalized] || translationMap[key.toLowerCase()] || key;
    };

    const addDataSheetHeader = (doc: jsPDF, y: number) => {
        const h = result.metadata?.header || {};

        if (isPro) {
            const salePrice = h.sale_price || result.summary?.grandTotal || 0;
            const labels = [
                { l: 'PRODUCTO / SERVICIO', v: h.name || 'N/A' },
                { l: 'CÓDIGO', v: h.code || 'N/A' },
                { l: 'UNIDAD DE MEDIDA', v: h.unit || 'N/A' },
                { l: 'CANTIDAD', v: h.quantity || 1 },
                { l: 'EMPRESA', v: h.company || 'N/A' },
                { l: 'DESTINO', v: h.destination || 'N/A' },
                { l: 'MONEDA', v: h.currency || 'CUP' },
                { l: 'PRECIO VENTA', v: safeLocale(salePrice) }
            ];

            let curX = 14;
            let curY = y;
            const colWidth = (pageWidth - 28) / 4;

            labels.forEach((item, i) => {
                doc.setFontSize(8);
                doc.setFont("helvetica", "bold");
                doc.setTextColor(130, 130, 130);
                doc.text(item.l.toUpperCase(), curX, curY);

                doc.setFontSize(10);
                doc.setTextColor(0, 0, 0);
                doc.text(String(item.v), curX, curY + 4.5);

                if ((i + 1) % 4 === 0) {
                    curX = 14;
                    curY += 12;
                } else {
                    curX += colWidth;
                }
            });

            // Status Badge (Outlined)
            const status = "VIGENTE";
            doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.setLineWidth(0.3);
            doc.rect(pageWidth - 34, y - 6, 20, 6, 'S');
            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.text(status, pageWidth - 24, y - 1.5, { align: "center" });

            // Cost Mix Chart (Micro Donut/Bar)
            const getRowTotal = (id: string) => result.rows.find(r => r.classification === id)?.total || 0;
            const mat = getRowTotal('1');
            const labor = getRowTotal('2') + getRowTotal('3');
            const indirect = getRowTotal('4') + getRowTotal('6') + getRowTotal('7') + getRowTotal('9');
            const r12 = result.rows.find(r => r.classification === '12' || r.classification === '12.1')?.total || result.summary?.totalCost || 0;
            const others = Math.max(0, r12 - (mat + labor + indirect));
            const totalCost = r12 || 1;

            const mixData = [
                { l: 'Materiales', v: mat, c: [26, 82, 118] },
                { l: 'Labor', v: labor, c: [41, 128, 185] },
                { l: 'Indirectos', v: indirect, c: [52, 152, 219] },
                { l: 'Otros', v: others, c: [127, 179, 213] }
            ].filter(d => d.v > 0);

            const chartX = pageWidth - 90;
            const chartY = curY - 5;
            const barW = 76;
            const barH = 3.5;

            doc.setFontSize(6);
            doc.setTextColor(150, 150, 150);
            doc.text("ESTRUCTURA DE COSTOS (COST MIX)", chartX, chartY - 2);

            let currentX = chartX;
            mixData.forEach(d => {
                const w = (d.v / totalCost) * barW;
                if (w > 0.5) {
                    doc.setFillColor(d.c[0], d.c[1], d.c[2]);
                    doc.rect(currentX, chartY, w, barH, 'F');
                    currentX += w;
                }
            });

            // Mini Legend
            let legX = chartX;
            mixData.forEach(d => {
                doc.setFillColor(d.c[0], d.c[1], d.c[2]);
                doc.rect(legX, chartY + barH + 1.5, 1.5, 1.5, 'F');
                doc.setTextColor(100, 100, 100);
                doc.text(`${d.l}: ${((d.v/totalCost)*100).toFixed(0)}%`, legX + 2.5, chartY + barH + 3);
                legX += 19;
            });

            return curY + 10;
        }

        const data = [
            [`PRODUCTO: ${h.name || 'N/A'}`, `CÓDIGO: ${h.code || 'N/A'}`, `FECHA: ${h.date || format(new Date(), "yyyy-MM-dd")}`],
            [`UM: ${h.unit || 'N/A'}`, `Cantidad: ${h.quantity || 1}`, `EMPRESA: ${h.company || 'N/A'}`],
            [`ORGANISMO: ${h.organism || 'N/A'}`, `UNION: ${h.union || 'N/A'}`, `Destino: ${h.destination || 'N/A'}`],
            [`Nivel de Producción: ${h.production_level || 'N/A'}`, `% Utilización capacidad: ${h.capacity_utilization || 0}%`, `Precio de Venta: ${safeLocale(h.sale_price)}`],
            [`Cliente: ${h.client || 'N/A'}`, `Moneda: ${h.currency || 'CUP'}`, `Fecha: ${h.date || format(new Date(), "yyyy-MM-dd")}`]
        ];

        autoTable(doc, {
            startY: y + 2,
            body: data,
            theme: 'plain',
            styles: { fontSize: 7, cellPadding: 1 },
            columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 60 }, 2: { cellWidth: 60 } },
            margin: { top: 35 },
            didDrawPage: () => addHeader(doc, pageTitle)
        });

        return (doc as any).lastAutoTable.finalY;
    };

    let isFirstPage = true;
    let currentY = 0;

    // 1. Export FC
    if (exportOptions.includeFC) {
        pageTitle = "FICHA DE COSTO";
        addHeader(doc, pageTitle);
        currentY = addDataSheetHeader(doc, isPro ? 35 : 38);

        const rowHeaders = ['Clasif.', 'Concepto', 'Método', 'V. Histórico', 'Total'];

        const filterRows = (rows: any[]) => {
            return rows.filter(r => {
                const hasChildren = result.rows.some(child => child.classification.startsWith(r.classification + '.'));
                if (!hasChildren && exportOptions.skipZeros && r.total === 0) return false;
                return true;
            });
        };

        const filteredRows = filterRows(result.rows);
        const row12Total = result.rows.find(r => r.classification === '12' || r.classification === '12.1')?.total || result.summary?.totalCost || 0;

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
            startY: currentY + 5,
            head: [rowHeaders],
            body: rowData,
            theme: isPro ? 'striped' : 'plain',
            headStyles: {
                fillColor: isPro ? [255, 255, 255] : [60, 60, 60],
                textColor: isPro ? primaryColor : [255, 255, 255],
                fontSize: 7,
                fontStyle: 'bold',
                lineWidth: isPro ? { bottom: 0.5 } : 0,
                lineColor: isPro ? primaryColor : [0,0,0]
            },
            styles: {
                fontSize: 7,
                cellPadding: 1.5,
                lineColor: [220, 220, 220],
                lineWidth: isPro ? { bottom: 0.2 } : 0.1
            },
            alternateRowStyles: isPro ? { fillColor: [247, 247, 247] } : {},
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
                            if (isPro) data.cell.styles.textColor = primaryColor;
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

        // Utility Note
        if (exportOptions.includeUtilityNote) {
            const r12 = result.rows.find(r => r.classification === '12' || r.classification === '12.1');
            const r13 = result.rows.find(r => r.classification === '13');
            const r13_1 = result.rows.find(r => r.classification === '13.1');

            if (r12 && r12.total > 0) {
                let percent = 0;
                let valForNote = 0;
                let labelForNote = "";

                if (r13) {
                    const isPrice = r13.label.toLowerCase().includes("precio");
                    percent = (r13.total / r12.total) * 100;
                    if (isPrice) percent -= 100;
                    valForNote = r13.total;
                    labelForNote = isPrice ? "Precio" : "Utilidad";
                } else if (r13_1) {
                    const isPrice = r13_1.label.toLowerCase().includes("precio");
                    percent = (r13_1.total / r12.total) * 100;
                    if (isPrice) percent -= 100;
                    valForNote = r13_1.total;
                    labelForNote = isPrice ? "Precio" : "Utilidad";
                }

                if (labelForNote) {
                    doc.setFontSize(7.5);
                    doc.setFont("helvetica", "bold");
                    doc.setTextColor(isPro ? primaryColor[0] : 0, isPro ? primaryColor[1] : 0, isPro ? primaryColor[2] : 0);
                    const noteTitle = "NOTA SOBRE EL MARGEN DE UTILIDAD:";
                    doc.text(noteTitle, 14, currentY + 8);

                    doc.setFont("helvetica", "normal");
                    doc.setTextColor(100, 100, 100);
                    const noteContent = `El % de utilidad con respecto al costo es del ${percent.toFixed(2)}%, resultado de la relación entre la ${labelForNote} (${safeLocale(valForNote)}) y el Total de Costos (${safeLocale(r12.total)}).`;
                    const splitNote = doc.splitTextToSize(noteContent, pageWidth - 28);
                    doc.text(splitNote, 14, currentY + 12);
                    currentY += 15 + (splitNote.length * 3.5);
                }
            }
        }

        isFirstPage = false;
    }

    // 2. Export Annexes
    const selectedAnnexes = result.anexos.filter(a => exportOptions.includeAnnexes.includes(a.id));
    let isFirstAnnex = true;
    for (const annex of selectedAnnexes) {
        const totalImporte = annex.rows.reduce((sum, r) => sum + (r.importe || 0), 0);
        if (exportOptions.skipZeros && totalImporte === 0) continue;

        const needsNewPage = isFirstAnnex || (currentY > pageHeight - 60);

        if (needsNewPage) {
            doc.addPage();
            pageTitle = `ANEXO ${annex.id}`;
            addHeader(doc, pageTitle);
            currentY = isPro ? 35 : 38;
        } else {
            currentY += 12;
        }
        isFirstAnnex = false;

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(isPro ? primaryColor[0] : 0, isPro ? primaryColor[1] : 0, isPro ? primaryColor[2] : 0);
        doc.text((annex.name || annex.id).toUpperCase(), 14, currentY);
        currentY += 4;

        const headers = Object.keys(annex.rows[0] || {}).filter(k => k !== 'importe');
        const body = annex.rows.map(r => headers.map(h => r[h]));

        autoTable(doc, {
            startY: currentY,
            head: [headers.map(h => translate(h.toLowerCase()).toUpperCase())],
            body: body,
            theme: isPro ? 'striped' : 'grid',
            headStyles: {
                fillColor: isPro ? [255, 255, 255] : [100, 100, 100],
                textColor: isPro ? primaryColor : 255,
                fontSize: 7,
                lineWidth: isPro ? { bottom: 0.5 } : 0,
                lineColor: isPro ? primaryColor : [0,0,0]
            },
            styles: {
                fontSize: 6.5,
                cellPadding: 1,
                lineColor: [230, 230, 230],
                lineWidth: isPro ? { bottom: 0.2 } : 0.1
            },
            alternateRowStyles: isPro ? { fillColor: [247, 247, 247] } : {},
            margin: { top: 35, bottom: 20 },
            didDrawPage: () => addHeader(doc, pageTitle)
        });
        currentY = (doc as any).lastAutoTable.finalY;
        isFirstPage = false;
    }

    // 3. Export Audit
    if (exportOptions.includeAudit) {
        const needsNewPage = !exportOptions.consolidated || isFirstPage || (currentY > pageHeight - 40);

        if (needsNewPage) {
            if (!isFirstPage) doc.addPage();
            pageTitle = "TRAZABILIDAD DE CÁLCULO (AUDITORÍA)";
            addHeader(doc, pageTitle);
            currentY = isPro ? 35 : 38;
        } else {
            currentY += 12;
        }

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(isPro ? primaryColor[0] : 0, isPro ? primaryColor[1] : 0, isPro ? primaryColor[2] : 0);
        doc.text("TRAZABILIDAD DE CÁLCULO (AUDITORÍA)", 14, currentY);
        currentY += 4;

        const auditData = result.audits.map(a => [
            a.rowId || '-',
            a.type,
            a.note,
            `${a.prev || '0'} -> ${a.now || '0'}`
        ]);

        autoTable(doc, {
            startY: currentY,
            head: [['Fila', 'Tipo', 'Nota', 'Cambio']],
            body: auditData,
            theme: isPro ? 'striped' : 'plain',
            styles: { fontSize: 6, lineColor: [230, 230, 230], lineWidth: isPro ? { bottom: 0.2 } : 0.1 },
            headStyles: {
                fontStyle: 'bold',
                fillColor: isPro ? [255, 255, 255] : [240, 240, 240],
                textColor: isPro ? primaryColor : 0,
                lineWidth: isPro ? { bottom: 0.5 } : 0,
                lineColor: isPro ? primaryColor : [0,0,0]
            },
            alternateRowStyles: isPro ? { fillColor: [247, 247, 247] } : {},
            margin: { top: 35, bottom: 20 },
            didDrawPage: () => addHeader(doc, pageTitle)
        });
        currentY = (doc as any).lastAutoTable.finalY;
    }

    // Footer
    const pageCount = doc.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        const footerText = exportOptions.showDateTime
            ? `Generado el: ${timestamp} - Página ${i} de ${pageCount}`
            : `Página ${i} de ${pageCount}`;
        doc.text(footerText, 14, 285);

        if (isPro) {
            doc.setFontSize(6);
            doc.text("VALIDACIÓN CORPORATIVA - DOCUMENTO OFICIAL", pageWidth - 14, 285, { align: "right" });
        }
    }

    const pdfBuffer = doc.output('arraybuffer');

    const h = result.metadata?.header || {};
    const evalCode = h.code || result.fichaId || 'export';
    const evalName = h.name || result.fichaName || 'ficha';
    const safeFilename = `ficha-${evalCode}-${evalName}.pdf`.replace(/[\\/\?%*:|"<>]/g, '-');

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeFilename}"`
      }
    });

  } catch (error: any) {
    console.error('PDF Export Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
