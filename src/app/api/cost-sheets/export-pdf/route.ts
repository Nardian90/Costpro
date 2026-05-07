import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { createSafeParser } from '@/lib/cost-engine/parser-factory';
import { rateLimit } from '@/lib/rate-limit';
import { withTracing } from '@/lib/observability';

export const runtime = 'nodejs';

const MAX_SECTIONS = 50;
const MAX_ROWS_PER_SECTION = 200;
const MAX_SCENARIOS = 5;

function validateComparisonData(data: any): { ok: boolean; error?: string } {
    if (!data || typeof data !== 'object') return { ok: false, error: 'comparisonData inválido' };
    if (!Array.isArray(data.sections)) return { ok: false, error: 'sections debe ser array' };
    if (data.sections.length > MAX_SECTIONS) return { ok: false, error: `Máximo ${MAX_SECTIONS} secciones` };
    if (Array.isArray(data.scenarios) && data.scenarios.length > MAX_SCENARIOS)
        return { ok: false, error: `Máximo ${MAX_SCENARIOS} escenarios en comparativa` };
    for (const section of data.sections) {
        if (Array.isArray(section.rows) && section.rows.length > MAX_ROWS_PER_SECTION)
            return { ok: false, error: `Máximo ${MAX_ROWS_PER_SECTION} filas por sección` };
    }
    return { ok: true };
}

function safeLocale(val: any) {
  const n = parseFloat(String(val));
  return isNaN(n) ? val : n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const handler = withAuth(async (req, session) => {
  try {
    const clientId = session.user.id;
    const { allowed } = await rateLimit(clientId, { windowMs: 60_000, maxRequests: 30 });
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const body = await req.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Cuerpo de solicitud inválido' }, { status: 400 });
    }

    const exportMode = body.exportMode || 'single';
    if (exportMode === 'comparison' && body.comparisonData) {
        const validation = validateComparisonData(body.comparisonData);
        if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const doc = await createPDFDocument(exportMode === 'comparison' ? 'l' : 'p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const timestamp = new Date().toLocaleString();
    const exportOptions = body.exportOptions || {};
    const primaryColor: [number, number, number] = exportOptions.pdfFormat === 'pro' ? [26, 82, 118] : [0, 0, 0];

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
      const headRows: string[][] = [['No.', 'Concepto', 'UM'], ['', '', '']];

      activeScenarios.forEach((s: any) => {
        headRows[0].push(s.label, '');
        headRows[1].push('VH', 'TOTAL');
        if (s.id !== baseId) {
          headRows[0].push('DIFF', '');
          headRows[1].push('ABS', '%');
        }
      });

      const tableBody: any[] = [];
      sections.forEach((section: any) => {
        tableBody.push([{ content: section.label, colSpan: headRows[0].length, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }]);
        const processRows = (rows: any[], depth = 0) => {
          if (depth > 5) return; // Prevent excessive recursion
          rows.forEach(row => {
            const rowData = [row.id, row.label, row.um || row.unit || '-'];
            activeScenarios.forEach((s: any) => {
              const calc = calcs[s.id]?.calculatedValues?.[row.id] || { total: 0, valorHistorico: 0 };
              rowData.push(safeLocale(calc.valorHistorico), safeLocale(calc.total));
              if (s.id !== baseId) {
                const baseCalc = calcs[baseId]?.calculatedValues?.[row.id] || { total: 0 };
                const diff = calc.total - baseCalc.total;
                rowData.push(safeLocale(diff), `${baseCalc.total !== 0 ? ((diff / baseCalc.total) * 100).toFixed(1) : '0.0'}%`);
              }
            });
            tableBody.push(rowData);
            if (row.children) processRows(row.children, depth + 1);
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
      });
    } else {
      const result = body.result || body;
      let currentY = addHeader(doc, "FICHA DE COSTO");
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

export const POST = withTracing((req: NextRequest) => handler(req), 'POST /api/cost-sheets/export-pdf');
