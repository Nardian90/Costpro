import { NextRequest, NextResponse } from 'next/server';

/**
 * Admin migration endpoint — adds missing columns to the stores table.
 *
 * Security: Requires SUPABASE_SERVICE_ROLE_KEY in .env OR as a header
 * (X-Service-Role-Key). In dev mode (ENABLE_DEV_BYPASS=true), allows
 * execution without auth for setup convenience.
 */
export async function POST(req: NextRequest) {
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      || req.headers.get('X-Service-Role-Key');

    // SECURITY: Dev bypass is blocked in production even if env var is set
    const devBypass = process.env.ENABLE_DEV_BYPASS === 'true' && process.env.NODE_ENV !== 'production';

    if (!serviceKey && !devBypass) {
      return NextResponse.json(
        {
          error: 'Se requiere SUPABASE_SERVICE_ROLE_KEY para ejecutar migraciones',
          hint: 'Agrega SUPABASE_SERVICE_ROLE_KEY a tu .env o pásalo en el header X-Service-Role-Key',
        },
        { status: 403 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_SUPABASE_URL no configurado' }, { status: 500 });
    }

    // Use service role key if available, otherwise try with anon key (dev bypass)
    const effectiveKey = serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(url, effectiveKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const migrationSQL = `
      ALTER TABLE stores
        ADD COLUMN IF NOT EXISTS nit TEXT,
        ADD COLUMN IF NOT EXISTS signature_url TEXT,
        ADD COLUMN IF NOT EXISTS stamp_url TEXT,
        ADD COLUMN IF NOT EXISTS plantilla TEXT DEFAULT 'construccion',
        ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
    `;

    // Try to execute via RPC first
    const { error: rpcError } = await admin.rpc('exec_sql', { sql: migrationSQL });

    if (rpcError) {
      // If exec_sql RPC doesn't exist, try alternative approach
      // Check if columns already exist by querying
      const { error: testError } = await admin
        .from('stores')
        .select('id, nit, signature_url, stamp_url, plantilla, latitude, longitude')
        .limit(1);

      if (!testError) {
        return NextResponse.json({
          success: true,
          message: 'Las columnas ya existen en la tabla stores',
          columns: ['nit', 'signature_url', 'stamp_url', 'plantilla', 'latitude', 'longitude'],
        });
      }

      // Columns don't exist and we can't add them without service role
      if (!serviceKey) {
        return NextResponse.json(
          {
            error: 'No se pudieron agregar las columnas automáticamente',
            hint: 'Ejecuta el siguiente SQL en el SQL Editor de Supabase Dashboard:',
            sql: migrationSQL.trim(),
            dashboard_url: `${url.replace('.supabase.co', '')}.supabase.co/project/wthkddeleylijmonclxg/sql`,
          },
          { status: 501 }
        );
      }

      // With service role key, try using management API
      return NextResponse.json(
        {
          error: 'No se pudo ejecutar la migración vía RPC',
          details: rpcError.message,
          hint: 'Ejecuta el SQL manualmente en Supabase Dashboard → SQL Editor',
          sql: migrationSQL.trim(),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Migración aplicada correctamente',
      columns: ['nit', 'signature_url', 'stamp_url', 'plantilla', 'latitude', 'longitude'],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET — Check migration status
 */
export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(url, key);

    const missingColumns: string[] = [];
    const existingColumns: string[] = [];

    // Check each column individually
    const columnsToCheck = ['nit', 'signature_url', 'stamp_url', 'plantilla', 'latitude', 'longitude'];

    for (const col of columnsToCheck) {
      const { error } = await client.from('stores').select(col).limit(1);
      if (error && error.code === '42703') {
        missingColumns.push(col);
      } else {
        existingColumns.push(col);
      }
    }

    return NextResponse.json({
      status: missingColumns.length === 0 ? 'complete' : 'pending',
      existing_columns: existingColumns,
      missing_columns: missingColumns,
      needs_migration: missingColumns.length > 0,
      service_key_configured: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
