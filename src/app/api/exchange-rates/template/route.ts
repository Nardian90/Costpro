import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { logger } from '@/lib/logger';
import * as XLSX from '@e965/xlsx';

/**
 * IC-EXCEL-BULK-UPLOAD: Plantilla Excel para carga masiva de tasas.
 *
 * GET /api/exchange-rates/template
 *
 * Genera y devuelve un archivo .xlsx con:
 *   - Columnas: fecha, bcc, informal
 *   - Filas con fechas hábiles (lunes-viernes) desde 2021-01-01 hasta hoy
 *   - Columnas bcc e informal VACÍAS para que el usuario las llene
 *
 * El BCC no publica tasas fines de semana, así que solo se incluyen
 * lunes-viernes. El usuario llena las tasas que recuerde o tenga anotadas;
 * las filas vacías serán rechazadas por el endpoint /bulk-upload
 * ("Ni bcc ni informal tienen valores numéricos válidos").
 *
 * Auth: cualquier usuario autenticado puede descargar la plantilla (withAuth).
 */

const BCC_START_DATE = '2021-01-01'; // El BCC empezó a publicar tasas en 2021.

/**
 * Genera un array de strings YYYY-MM-DD desde start hasta end (inclusive),
 * solo lunes-viernes (day 1-5 en Date.getDay(), donde 0=domingo, 6=sábado).
 */
function generateBusinessDays(start: string, end: Date): string[] {
  const dates: string[] = [];
  const startMs = new Date(start + 'T00:00:00Z').getTime();
  const endMs = end.getTime();
  if (startMs > endMs) return dates;
  for (let ms = startMs; ms <= endMs; ms += 24 * 60 * 60 * 1000) {
    const d = new Date(ms);
    const day = d.getUTCDay(); // 0=domingo, 6=sábado
    if (day !== 0 && day !== 6) {
      dates.push(d.toISOString().split('T')[0]);
    }
  }
  return dates;
}

async function getHandler() {
  try {
    const dates = generateBusinessDays(BCC_START_DATE, new Date());
    const rows = dates.map(fecha => ({ fecha, bcc: '', informal: '' }));
    const ws = XLSX.utils.json_to_sheet(rows, {
      header: ['fecha', 'bcc', 'informal'],
    });

    // Anchos de columna para mejor legibilidad.
    ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 12 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tasas');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    logger.info('DATABASE', 'EXCHANGE_RATES_TEMPLATE_GENERATED', {
      rows: rows.length,
      from: dates[0],
      to: dates[dates.length - 1],
    });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="plantilla-tasas-cuba.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    logger.error('DATABASE', 'EXCHANGE_RATES_TEMPLATE_FATAL', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export const GET = withAuth(getHandler);
