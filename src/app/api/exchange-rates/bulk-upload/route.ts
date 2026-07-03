import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { logger } from '@/lib/logger';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import * as XLSX from '@e965/xlsx';

/**
 * IC-EXCEL-BULK-UPLOAD: Carga masiva de tasas por Excel (admin only).
 *
 * Contexto:
 *   - El scraping de eltoque.com no funciona (publican imágenes).
 *   - El scraping de solucionescuba.com funciona pero solo para HOY.
 *   - Para análisis de tendencias se necesitan datos históricos.
 *
 * El Excel debe tener 3 columnas (case-insensitive, flexible):
 *   - fecha   (o date, día)           — YYYY-MM-DD o DD/MM/YYYY
 *   - bcc     (o oficial, tasa_oficial) — número
 *   - informal (o eltoque, tasa_informal, mercado) — número
 *
 * Para cada fila:
 *   - Upsert a exchange_rates (source='BCC', segment='3', currency='USD', rate=bcc, capture_method='real')
 *   - Upsert a exchange_rates (source='elToque', segment='3', currency='USD', rate=informal, capture_method='real')
 *
 * Límites:
 *   - Máximo 1000 filas por upload (prevenir abuso)
 *   - Solo admins (session.user.role === 'admin')
 *
 * Si la columna capture_method no existe aún en BD (migración pendiente),
 * reintenta sin ella — mismo patrón que /api/exchange-rates/manual.
 */

const MAX_ROWS = 1000;

// Mapeo flexible de nombres de columna → clave canónica.
const COLUMN_ALIASES: Record<'fecha' | 'bcc' | 'informal', string[]> = {
  fecha: ['fecha', 'date', 'día', 'dia', 'fechaprocesada'],
  bcc: ['bcc', 'oficial', 'tasa_oficial', 'tasaoficial', 'tasa_bcc', 'tasabcc'],
  informal: ['informal', 'eltoque', 'el_toque', 'tasa_informal', 'tasainformal', 'mercado', 'paralelo'],
};

type RowError = { row: number; error: string; raw?: unknown };

interface ParsedRow {
  fecha: string; // YYYY-MM-DD
  bcc: number | null;
  informal: number | null;
}

/**
 * Normaliza un nombre de columna a su clave canónica.
 * 'Fecha' → 'fecha', 'TASA_OFICIAL' → 'bcc', etc.
 */
function resolveColumnKey(header: string): 'fecha' | 'bcc' | 'informal' | null {
  const normalized = String(header || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '')
    .replace(/_/g, '');
  for (const key of Object.keys(COLUMN_ALIASES) as Array<'fecha' | 'bcc' | 'informal'>) {
    const aliases = COLUMN_ALIASES[key].map(a => a.toLowerCase().replace(/\s+/g, '').replace(/_/g, ''));
    if (aliases.includes(normalized)) return key;
  }
  return null;
}

/**
 * Parsea una fecha en formato YYYY-MM-DD o DD/MM/YYYY (también YYYY/MM/DD).
 * También maneja números serial de Excel (44197 = 2021-01-01) y objetos Date.
 * Retorna null si no es parseable.
 */
function parseDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null;

  // Excel serial date: 25569 = 1970-01-01, 44197 = 2021-01-01, ~60000 ≈ 2064.
  if (typeof raw === 'number' && raw > 25569 && raw < 60000) {
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  }

  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return raw.toISOString().split('T')[0];
  }

  const s = String(raw).trim();
  if (!s) return null;

  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD/MM/YYYY o DD-MM-YYYY
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // YYYY/MM/DD
  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return null;
}

function parseNumber(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;
  // Quitar separadores de miles (comas o puntos seguidos de 3 dígitos).
  s = s.replace(/\.(?=\d{3}\b)/g, '').replace(/,(?=\d{3}\b)/g, '');
  // Aceptar coma decimal europea: "650,50" → "650.50"
  s = s.replace(',', '.');
  // Qitar espacios sobrantes.
  s = s.replace(/\s/g, '');
  const n = Number(s);
  return isFinite(n) && n > 0 ? n : null;
}

interface ParsedSheet {
  headers: Record<'fecha' | 'bcc' | 'informal', string>;
  rows: Array<Record<string, unknown>>;
}

/**
 * Mapea las columnas del primer sheet a claves canónicas y parsea las filas.
 * Usa sheet_to_json con header:1 (matriz) para preservar el orden y los headers
 * tal como están en el archivo (sin normalización agresiva).
 */
function parseSheet(workbook: XLSX.WorkBook): ParsedSheet {
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return { headers: {} as ParsedSheet['headers'], rows: [] };
  const worksheet = workbook.Sheets[firstSheetName];

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: false,
  });

  if (matrix.length === 0) return { headers: {} as ParsedSheet['headers'], rows: [] };

  const rawHeaders = (matrix[0] as unknown[]).map(h => String(h ?? '').trim());
  const headerMap = {} as ParsedSheet['headers'];
  rawHeaders.forEach(h => {
    const canonical = resolveColumnKey(h);
    if (canonical && !headerMap[canonical]) {
      headerMap[canonical] = h;
    }
  });

  // Convertir filas restantes a objetos usando los headers originales.
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 1; i < matrix.length; i++) {
    const arr = matrix[i] as unknown[];
    if (!arr || arr.every(v => v === '' || v == null)) continue;
    const rowObj: Record<string, unknown> = {};
    rawHeaders.forEach((h, idx) => {
      rowObj[h] = arr[idx];
    });
    rows.push(rowObj);
  }

  return { headers: headerMap, rows };
}

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdminSafe>>;

async function upsertRate(
  admin: AdminClient,
  payload: Record<string, unknown>,
): Promise<{ data: unknown; error: { message: string } | null }> {
  const result = await admin
    .from('exchange_rates')
    .upsert(payload, { onConflict: 'rate_date,source,currency,segment' })
    .select()
    .single();
  return { data: result.data, error: result.error as { message: string } | null };
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  // 1) Authorization: admin only.
  if (session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden — solo admin puede cargar Excel masivo' },
      { status: 403 },
    );
  }

  // 2) Config check (defense in depth).
  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json(
      { error: 'CONFIG_ERROR — Supabase service role no configurado' },
      { status: 500 },
    );
  }

  try {
    // 3) Parse multipart/form-data.
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { error: 'Se requiere multipart/form-data con un archivo "file"' },
        { status: 400 },
      );
    }

    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'No se encontró el archivo. Campo esperado: "file"' },
        { status: 400 },
      );
    }

    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
      return NextResponse.json(
        { error: 'Formato no soportado. Use .xlsx, .xls o .csv' },
        { status: 400 },
      );
    }

    // 4) Parse Excel/CSV con xlsx.
    const buffer = await file.arrayBuffer();
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    } catch (parseErr) {
      logger.error('DATABASE', 'EXCHANGE_RATES_BULK_PARSE_ERROR', {
        error: parseErr instanceof Error ? parseErr.message : 'Unknown',
        filename: file.name,
      });
      return NextResponse.json(
        { error: 'No se pudo leer el archivo. Verifique que sea un Excel/CSV válido' },
        { status: 400 },
      );
    }

    const { headers, rows } = parseSheet(workbook);

    // 5) Validar columnas requeridas.
    const missing: string[] = [];
    if (!headers.fecha) missing.push('fecha (o date, día)');
    if (!headers.bcc) missing.push('bcc (o oficial, tasa_oficial)');
    if (!headers.informal) missing.push('informal (o eltoque, tasa_informal, mercado)');
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `Faltan columnas requeridas: ${missing.join(', ')}`,
          found_headers: Object.keys(headers),
        },
        { status: 400 },
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'El archivo no contiene filas de datos (solo encabezado)' },
        { status: 400 },
      );
    }

    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        {
          error: `El archivo tiene ${rows.length} filas. El máximo es ${MAX_ROWS}. Divida el archivo en lotes más pequeños.`,
          received: rows.length,
          max: MAX_ROWS,
        },
        { status: 413 },
      );
    }

    // 6) Parsear filas → {fecha, bcc, informal}.
    const errors: RowError[] = [];
    const parsedRows: Array<ParsedRow & { __rowNum: number }> = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 2; // +1 por header, +1 porque idx es 0-based
      const rawFecha = row[headers.fecha];
      const fecha = parseDate(rawFecha);
      if (!fecha) {
        errors.push({ row: rowNum, error: `Fecha inválida: "${rawFecha}"`, raw: rawFecha });
        return;
      }
      const bcc = parseNumber(row[headers.bcc]);
      const informal = parseNumber(row[headers.informal]);
      if (bcc === null && informal === null) {
        errors.push({
          row: rowNum,
          error: `Ni bcc ni informal tienen valores numéricos válidos`,
          raw: { bcc: row[headers.bcc], informal: row[headers.informal] },
        });
        return;
      }
      parsedRows.push({ fecha, bcc, informal, __rowNum: rowNum });
    });

    // 7) Upsert a Supabase.
    const now = new Date().toISOString();
    let processed = 0;
    let captureMethodMissing = false;
    const dbErrors: RowError[] = [];

    for (const { fecha, bcc, informal, __rowNum } of parsedRows) {
      // BCC
      if (bcc !== null) {
        const payload: Record<string, unknown> = {
          rate_date: fecha,
          captured_at: now,
          currency: 'USD',
          source: 'BCC',
          segment: '3',
          rate: bcc,
          capture_method: 'real',
        };
        let result = await upsertRate(admin, payload);
        // Retry sin capture_method si la columna no existe (migración pendiente).
        if (result.error && /capture_method/.test(result.error.message)) {
          captureMethodMissing = true;
          const { capture_method, ...payloadNoMethod } = payload;
          void capture_method;
          result = await upsertRate(admin, payloadNoMethod);
        }
        if (result.error) {
          dbErrors.push({ row: __rowNum, error: `BCC: ${result.error.message}` });
        } else {
          processed++;
        }
      }
      // elToque
      if (informal !== null) {
        const payload: Record<string, unknown> = {
          rate_date: fecha,
          captured_at: now,
          currency: 'USD',
          source: 'elToque',
          segment: '3',
          rate: informal,
          capture_method: 'real',
        };
        let result = await upsertRate(admin, payload);
        if (result.error && /capture_method/.test(result.error.message)) {
          captureMethodMissing = true;
          const { capture_method, ...payloadNoMethod } = payload;
          void capture_method;
          result = await upsertRate(admin, payloadNoMethod);
        }
        if (result.error) {
          dbErrors.push({ row: __rowNum, error: `elToque: ${result.error.message}` });
        } else {
          processed++;
        }
      }
    }

    if (captureMethodMissing) {
      logger.warn('DATABASE', 'EXCHANGE_RATES_BULK_CAPTURE_METHOD_MISSING', {
        hint: 'Aplica la migración 20260703000004_exchange_rates_capture_method.sql en Supabase Dashboard',
      });
    }

    logger.info('DATABASE', 'EXCHANGE_RATES_BULK_UPLOAD_OK', {
      processed,
      rows: parsedRows.length,
      parse_errors: errors.length,
      db_errors: dbErrors.length,
      triggered_by: session.user.id,
    });

    return NextResponse.json({
      success: true,
      processed,
      total_rows: parsedRows.length,
      errors: [...errors, ...dbErrors],
      capture_method_missing: captureMethodMissing || undefined,
    });
  } catch (error: unknown) {
    logger.error('DATABASE', 'EXCHANGE_RATES_BULK_FATAL', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export const POST = withAuth(postHandler);
