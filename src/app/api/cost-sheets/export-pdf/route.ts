import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { createSafeParser } from '@/lib/cost-engine/parser-factory';
import { rateLimit } from '@/lib/rate-limit';
import { mergeScenarioValues } from '@/store/scenario-store';
import { withTracing } from '@/lib/observability';

export const runtime = 'nodejs';

function safeParseNum(val: unknown): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (val === null || val === undefined) return 0;
  const str = String(val).trim();
  const direct = parseFloat(str);
  if (!isNaN(direct)) return direct;
  const normalized = str.replace(/\./g, '').replace(/,/g, '.');
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

const handler = withAuth(async (req, session) => {
  try {
    // FIX-SEC-015: Rate-limit by user ID after auth, not by IP before auth
    const clientId = session.user.id;
    const { allowed, remaining, resetAt } = await rateLimit(clientId, { windowMs: 60_000, maxRequests: 30 });

    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 });
    }

    const body = await req.json();
    // FIX-SEC-006: Basic body shape validation
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Cuerpo de solicitud inválido' }, { status: 400 });
    }
    let result = body.result || body;
    const exportOptions = body.exportOptions || {};
    const scenarioId = body.scenarioId;
    const exportMode = body.exportMode || 'single';

    // If scenarioId is provided, we assume result is already calculated for that scenario
    // (passed from frontend after mergeScenarioValues + useCostSheetCalculator)

    const doc = await createPDFDocument(exportMode === 'comparison' ? 'l' : 'p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const timestamp = new Date().toLocaleString();

    const isPro = exportOptions.pdfFormat === 'pro';
    const primaryColor: [number, number, number] = isPro ? [26, 82, 118] : [0, 0, 0];

    const parser = createSafeParser();

    const safeLocale = (val: any) => {
      const n = parseFloat(String(val));
      return isNaN(n) ? val : n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const addHeader = (pdf: any, title: string) => {
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(...primaryColor);
      pdf.text(title, 14, 20);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(100);
      pdf.text(`Generado: ${timestamp}`, pageWidth - 14, 20, { align: 'right' });
      return 30;
    };

    if (exportMode === 'comparison' && body.comparisonData) {
      const { sections, scenarios, calcs, baseId } = body.comparisonData;
      let currentY = addHeader(doc, "COMPARATIVA DE ESCENARIOS");

      const activeScenarios = scenarios.filter((s: any) => (body.activeScenarioIds || []).includes(s.id));

      const headRows: string[][] = [];
      const mainHeader = ['No.', 'Concepto', 'UM'];
      const subHeader = ['', '', ''];

      activeScenarios.forEach((s: any) => {
        const isBase = s.id === baseId;
        mainHeader.push(s.label, '');
        subHeader.push('VH', 'TOTAL');
        if (!isBase) {
          mainHeader.push('DIFF', '');
          subHeader.push('ABS', '%');
        }
      });
      headRows.push(mainHeader, subHeader);

      const tableBody: any[] = [];
      sections.forEach((section: any) => {
        tableBody.push([{ content: section.label, colSpan: mainHeader.length, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }]);

        const processRows = (rows: any[]) => {
          rows.forEach(row => {
            const rowData = [row.id, row.label, row.um || row.unit || '-'];

            activeScenarios.forEach((s: any) => {
              const calc = calcs[s.id]?.calculatedValues?.[row.id] || { total: 0, valorHistorico: 0 };
              rowData.push(safeLocale(calc.valorHistorico), safeLocale(calc.total));

              if (s.id !== baseId) {
                const baseCalc = calcs[baseId]?.calculatedValues?.[row.id] || { total: 0 };
                const diff = calc.total - baseCalc.total;
                const percent = baseCalc.total !== 0 ? (diff / baseCalc.total) * 100 : 0;
                rowData.push(safeLocale(diff), `${percent.toFixed(1)}%`);
              }
            });
            tableBody.push(rowData);
            if (row.children) processRows(row.children);
          });
        };
        processRows(section.rows);
      });

      (doc as any).autoTable({
        startY: currentY,
        head: headRows,
        body: tableBody,
        theme: 'grid',
        styles: { fontSize: 6, cellPadding: 1 },
        headStyles: { fillColor: primaryColor, textColor: 255, halign: 'center' },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 40 }
        }
      });

    } else {
      // Logic for single scenario (already present in the system, but we ensure it works with result passed)
      let currentY = addHeader(doc, scenarioId ? `ESCENARIO: ${result.scenarioLabel || scenarioId}` : "FICHA DE COSTO");

      const h = result.metadata?.header || result.header || {};
      const headerRows = [
        ['Código:', h.code || '-', 'Producto:', h.name || '-'],
        ['Entidad:', h.company || '-', 'Fecha:', h.date || '-'],
        ['Unidad:', h.unit || '-', 'Cantidad:', h.quantity || '1']
      ];

      (doc as any).autoTable({
        startY: currentY,
        body: headerRows,
        theme: 'plain',
        styles: { fontSize: 8, cellPadding: 1 },
      });

      currentY = (doc as any).lastAutoTable?.finalY ?? 50 + 10;

      const rows = result.rows || [];
      const tableData = rows.map((r: any) => [
        r.id, r.label, r.um || r.unit || '-', safeLocale(r.valorHistorico), safeLocale(r.total)
      ]);

      (doc as any).autoTable({
        startY: currentY,
        head: [['No.', 'Concepto', 'UM', 'V. Histórico', 'Total']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: primaryColor, textColor: 255 },
        styles: { fontSize: 8 },
      });
    }

    const pdfBuffer = doc.output('arraybuffer');
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="ficha-costo.pdf"'
      }
    });

  } catch (error: any) {
    console.error('PDF Export Error:', error);
    return NextResponse.json({ error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? error.message : 'Error interno del servidor' }, { status: 500 });
  }
});

async function postHandler(req: NextRequest) {
  return handler(req);
}

export const POST = withTracing(postHandler, 'POST /api/cost-sheets/export-pdf');
