
import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { CostSheetPDF } from '@/components/pdf/CostSheetPDF';
import React from 'react';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = body;
    const exportOptions = body.exportOptions || {
        includeFC: true,
        includeAudit: true,
        includeAnnexes: [],
        consolidated: true,
        skipZeros: false,
        includeFinancialSummary: true
    };

    const pdfBuffer = await renderToBuffer(
        <CostSheetPDF result={result} exportOptions={exportOptions} /> as any
    );

    return new NextResponse(pdfBuffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="ficha-${result.fichaId || 'export'}.pdf"`
      }
    });

  } catch (error: any) {
    console.error('PDF Export Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
