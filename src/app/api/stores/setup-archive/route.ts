import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/stores/setup-archive
 * One-time setup: adds is_archived, archived_at, archived_by columns to stores table.
 * Uses service_role key (server-side only) to run DDL.
 */
export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Verificar si la columna ya existe
  const { data: checkData, error: checkError } = await supabase
    .from('stores')
    .select('is_archived')
    .limit(1);

  if (!checkError) {
    return NextResponse.json({ message: 'Archive columns already exist', alreadySetup: true });
  }

  // Si hay error de columna, intentar crearla via RPC
  // Pero PostgREST no soporta DDL... necesitamos otra via.
  // Alternativa: crear una tabla de metadatos separada para archivado.

  // Plan B: usar una tabla separada 'store_archive_meta'
  const { error: createError } = await supabase.rpc('create_store_archive_table');

  if (createError) {
    // Si la RPC no existe, crear la tabla via insert directo (truco: usar supabase.from con tabla que no existe da error 42P01)
    // Mejor: devolver instrucciones para ejecutar manualmente
    return NextResponse.json({
      error: 'Could not auto-create columns. Run this SQL in Supabase SQL Editor:',
      sql: `
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS archived_by UUID;
CREATE INDEX IF NOT EXISTS idx_stores_is_archived ON public.stores(is_archived);
      `.trim(),
    }, { status: 500 });
  }

  return NextResponse.json({ message: 'Archive columns created successfully' });
}
