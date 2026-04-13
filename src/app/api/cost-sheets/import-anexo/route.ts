import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const clientId = req.headers.get('x-forwarded-for') || 'anonymous';
    const { allowed, remaining, resetAt } = rateLimit(clientId, { windowMs: 60_000, maxRequests: 30 });

    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': resetAt.toISOString(),
          'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
        },
      });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const anexoId = formData.get('anexoId') as string;

    if (!file || !anexoId) {
      return NextResponse.json({ ok: false, error: 'File and anexoId are required' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    let data: any[] = [];

    if (file.name.endsWith('.csv')) {
      const text = new TextDecoder().decode(buffer);
      const result = Papa.parse(text, { header: true, dynamicTyping: true });
      data = result.data;
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      data = XLSX.utils.sheet_to_json(worksheet);
    } else {
        return NextResponse.json({ ok: false, error: 'Unsupported file format' }, { status: 400 });
    }

    // Normalization
    const rows = data.map((row: any) => ({
      classification: String(row.classification || row.Clasificación || ''),
      importe: parseFloat(row.importe || row.Importe || row.Total || row.total || 0),
      ...row
    })).filter(r => r.classification);

    const sumByClassification: Record<string, number> = {};
    rows.forEach(r => {
      sumByClassification[r.classification] = (sumByClassification[r.classification] || 0) + r.importe;
    });

    return NextResponse.json({
      ok: true,
      anexoId,
      summary: {
        rowCount: rows.length,
        sumByClassification,
        totalImporte: rows.reduce((acc, r) => acc + r.importe, 0)
      },
      rows
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
